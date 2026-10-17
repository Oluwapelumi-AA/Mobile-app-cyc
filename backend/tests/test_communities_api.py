import uuid

import pytest

BASE = "/api/v1/communities"


@pytest.fixture
def people(api):
    ids = {name: api.add_user(name) for name in ("owner", "alice", "bob", "carol")}
    api.act_as(ids["owner"])
    return ids


def create(api, name="Lagos Youth", **extra):
    response = api.client.post(BASE, json={"name": name, **extra})
    assert response.status_code == 201, response.text
    return response.json()


def join(api, user_id, community_id):
    api.act_as(user_id)
    response = api.client.post(f"{BASE}/{community_id}/join")
    assert response.status_code == 201, response.text


def set_role(api, community_id, user_id, role):
    return api.client.patch(f"{BASE}/{community_id}/members/{user_id}", json={"role": role})


def test_create_makes_creator_owner(api, people):
    body = create(api, description="  Weekly prayer  ")

    assert body["name"] == "Lagos Youth"
    assert body["description"] == "Weekly prayer"
    assert body["visibility"] == "public"
    assert body["created_by"] == str(people["owner"])
    assert body["member_count"] == 1
    assert body["my_role"] == "owner"
    assert body["created_at"].endswith("Z")


@pytest.mark.parametrize(
    "payload",
    [{"name": "ab"}, {"name": "x" * 101}, {"name": "Ok name", "visibility": "secret"},
     {"name": "Ok name", "unknown": 1}],
)
def test_create_validates_input(api, people, payload):
    assert api.client.post(BASE, json=payload).status_code == 422


def test_get_shows_my_role_and_count(api, people):
    community = create(api)
    join(api, people["alice"], community["id"])

    body = api.client.get(f"{BASE}/{community['id']}").json()
    assert body["my_role"] == "member"
    assert body["member_count"] == 2

    api.act_as(people["bob"])
    body = api.client.get(f"{BASE}/{community['id']}").json()
    assert body["my_role"] is None


def test_get_unknown_community_is_404(api, people):
    response = api.client.get(f"{BASE}/{uuid.uuid4()}")
    assert response.status_code == 404
    assert response.json()["detail"]["code"] == "community_not_found"


def test_private_community_hidden_from_non_members(api, people):
    community = create(api, visibility="private")

    api.act_as(people["alice"])
    assert api.client.get(f"{BASE}/{community['id']}").status_code == 404
    assert api.client.post(f"{BASE}/{community['id']}/join").status_code == 404
    assert api.client.get(BASE).json()["items"] == []


def test_list_shows_public_and_my_private(api, people):
    public = create(api, "Public one")
    private = create(api, "Private one", visibility="private")

    names = [c["name"] for c in api.client.get(BASE).json()["items"]]
    assert names == ["Private one", "Public one"]

    api.act_as(people["alice"])
    items = api.client.get(BASE).json()["items"]
    assert [c["id"] for c in items] == [public["id"]]
    assert api.client.get(BASE, params={"mine": True}).json()["items"] == []
    assert private["id"] not in [c["id"] for c in items]


def test_list_paginates(api, people):
    for number in range(5):
        create(api, f"Community {number}")

    first = api.client.get(BASE, params={"limit": 2}).json()
    second = api.client.get(BASE, params={"limit": 2, "cursor": first["next_cursor"]}).json()
    third = api.client.get(BASE, params={"limit": 2, "cursor": second["next_cursor"]}).json()

    names = [c["name"] for page in (first, second, third) for c in page["items"]]
    assert names == [f"Community {n}" for n in (4, 3, 2, 1, 0)]
    assert third["next_cursor"] is None


@pytest.mark.parametrize("cursor", ["not-a-cursor", "W10", "WyJ4IiwgInkiXQ"])
def test_bad_cursor_is_400(api, people, cursor):
    response = api.client.get(BASE, params={"cursor": cursor})
    assert response.status_code == 400
    assert response.json()["detail"]["code"] == "invalid_cursor"


def test_limit_is_bounded(api, people):
    assert api.client.get(BASE, params={"limit": 0}).status_code == 422
    assert api.client.get(BASE, params={"limit": 51}).status_code == 422


def test_join_and_leave(api, people):
    community = create(api)
    api.act_as(people["alice"])

    response = api.client.post(f"{BASE}/{community['id']}/join")
    assert response.status_code == 201
    assert response.json()["role"] == "member"

    again = api.client.post(f"{BASE}/{community['id']}/join")
    assert again.status_code == 409
    assert again.json()["detail"]["code"] == "already_member"

    assert api.client.post(f"{BASE}/{community['id']}/leave").status_code == 204
    left_again = api.client.post(f"{BASE}/{community['id']}/leave")
    assert left_again.status_code == 404
    assert left_again.json()["detail"]["code"] == "not_member"


def test_owner_joining_own_private_community_is_conflict(api, people):
    community = create(api, visibility="private")
    assert api.client.post(f"{BASE}/{community['id']}/join").status_code == 409


def test_last_owner_cannot_leave(api, people):
    community = create(api)
    response = api.client.post(f"{BASE}/{community['id']}/leave")
    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "last_owner"


def test_owner_can_leave_after_making_another_owner(api, people):
    community = create(api)
    join(api, people["alice"], community["id"])
    api.act_as(people["owner"])
    assert set_role(api, community["id"], people["alice"], "owner").status_code == 200

    assert api.client.post(f"{BASE}/{community['id']}/leave").status_code == 204


def test_update_needs_admin(api, people):
    community = create(api)
    join(api, people["alice"], community["id"])

    response = api.client.patch(f"{BASE}/{community['id']}", json={"name": "Renamed"})
    assert response.status_code == 403
    assert response.json()["detail"]["code"] == "insufficient_role"

    api.act_as(people["bob"])
    response = api.client.patch(f"{BASE}/{community['id']}", json={"name": "Renamed"})
    assert response.json()["detail"]["code"] == "membership_required"

    api.act_as(people["owner"])
    set_role(api, community["id"], people["alice"], "admin")
    api.act_as(people["alice"])
    response = api.client.patch(
        f"{BASE}/{community['id']}",
        json={"name": "Renamed", "description": "", "visibility": "private"},
    )
    assert response.status_code == 200
    body = response.json()
    assert (body["name"], body["description"], body["visibility"]) == ("Renamed", None, "private")


def test_delete_needs_owner(api, people):
    community = create(api)
    join(api, people["alice"], community["id"])
    api.act_as(people["owner"])
    set_role(api, community["id"], people["alice"], "admin")

    api.act_as(people["alice"])
    assert api.client.delete(f"{BASE}/{community['id']}").status_code == 403

    api.act_as(people["owner"])
    assert api.client.delete(f"{BASE}/{community['id']}").status_code == 204
    assert api.client.get(f"{BASE}/{community['id']}").status_code == 404


def test_members_list_in_join_order(api, people):
    community = create(api)
    join(api, people["alice"], community["id"])
    join(api, people["bob"], community["id"])

    first = api.client.get(f"{BASE}/{community['id']}/members", params={"limit": 2}).json()
    rest = api.client.get(
        f"{BASE}/{community['id']}/members", params={"cursor": first["next_cursor"]}
    ).json()

    members = [(m["user_id"], m["role"]) for m in first["items"] + rest["items"]]
    assert members == [
        (str(people["owner"]), "owner"),
        (str(people["alice"]), "member"),
        (str(people["bob"]), "member"),
    ]
    assert rest["next_cursor"] is None


def test_role_changes_follow_rank(api, people):
    community = create(api)
    cid = community["id"]
    for name in ("alice", "bob", "carol"):
        join(api, people[name], cid)
    api.act_as(people["owner"])
    assert set_role(api, cid, people["alice"], "admin").json()["role"] == "admin"
    assert set_role(api, cid, people["bob"], "moderator").status_code == 200

    # A moderator cannot change roles.
    api.act_as(people["bob"])
    assert set_role(api, cid, people["carol"], "moderator").status_code == 403

    # An admin can grant roles below admin, to members ranked below them.
    api.act_as(people["alice"])
    assert set_role(api, cid, people["carol"], "moderator").status_code == 200
    assert set_role(api, cid, people["carol"], "admin").status_code == 403
    assert set_role(api, cid, people["owner"], "member").status_code == 403

    # Nobody can demote the last owner, including themselves.
    api.act_as(people["owner"])
    response = set_role(api, cid, people["owner"], "member")
    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "last_owner"


def test_role_change_for_non_member_is_404(api, people):
    community = create(api)
    response = set_role(api, community["id"], people["alice"], "admin")
    assert response.status_code == 404
    assert response.json()["detail"]["code"] == "member_not_found"


def test_remove_member_follows_rank(api, people):
    community = create(api)
    cid = community["id"]
    for name in ("alice", "bob", "carol"):
        join(api, people[name], cid)
    api.act_as(people["owner"])
    set_role(api, cid, people["alice"], "moderator")
    set_role(api, cid, people["bob"], "moderator")

    api.act_as(people["carol"])
    assert api.client.delete(f"{BASE}/{cid}/members/{people['bob']}").status_code == 403

    api.act_as(people["alice"])
    assert api.client.delete(f"{BASE}/{cid}/members/{people['bob']}").status_code == 403
    assert api.client.delete(f"{BASE}/{cid}/members/{people['carol']}").status_code == 204

    # Removing yourself is leaving.
    assert api.client.delete(f"{BASE}/{cid}/members/{people['alice']}").status_code == 204

    api.act_as(people["owner"])
    remaining = api.client.get(f"{BASE}/{cid}/members").json()["items"]
    assert [m["user_id"] for m in remaining] == [str(people["owner"]), str(people["bob"])]


def test_deleted_creator_keeps_community(api, people):
    from app.models import User

    community = create(api)
    join(api, people["alice"], community["id"])
    api.act_as(people["owner"])
    set_role(api, community["id"], people["alice"], "owner")

    with api.session_factory() as db:
        db.delete(db.get(User, people["owner"]))
        db.commit()

    api.act_as(people["alice"])
    body = api.client.get(f"{BASE}/{community['id']}").json()
    assert body["created_by"] is None
    assert body["member_count"] == 1
