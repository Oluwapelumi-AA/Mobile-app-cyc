import uuid

import pytest
from sqlalchemy import select

from app.models import AccountRole, AuditLog

BRANCHES = "/api/v1/branches"
COMMUNITIES = "/api/v1/communities"
PROFILE = "/api/v1/profiles/me"

LAGOS = {
    "name": "CYC Lagos",
    "country_code": "ng",
    "city": "Lagos",
    "timezone": "Africa/Lagos",
    "language_code": "en-NG",
    "contact_email": "lagos@cyc.example",
}


@pytest.fixture
def world(api):
    ids = {"alice": api.add_user("alice"), "bob": api.add_user("bob")}
    ids["staff"] = api.add_user("staff", AccountRole.MODERATOR)
    ids["admin"] = api.add_user("admin", AccountRole.ADMIN)
    api.act_as(ids["alice"])
    api.client.post(PROFILE, json={"display_name": "Alice"})
    return ids


def create(api, admin_id, **fields):
    api.act_as(admin_id)
    response = api.client.post(BRANCHES, json={**LAGOS, **fields})
    assert response.status_code == 201, response.text
    return response.json()


def test_admin_creates_and_edits_a_branch(api, world):
    branch = create(api, world["admin"])
    assert branch["slug"] == "cyc-lagos"
    assert branch["country_code"] == "NG"
    assert branch["language_code"] == "en-NG"
    assert branch["member_count"] == 0
    assert branch["is_mine"] is False

    response = api.client.patch(
        f"{BRANCHES}/{branch['id']}", json={"city": None, "name": "CYC Lagos Island"}
    )
    assert response.status_code == 200
    assert response.json()["city"] is None
    assert response.json()["name"] == "CYC Lagos Island"
    assert response.json()["slug"] == "cyc-lagos"
    # Required fields can't be cleared.
    response = api.client.patch(f"{BRANCHES}/{branch['id']}", json={"timezone": None})
    assert response.json()["timezone"] == "Africa/Lagos"

    with api.session_factory() as db:
        actions = list(db.scalars(select(AuditLog.action).order_by(AuditLog.created_at)))
    assert actions == ["branch.created", "branch.updated"]


@pytest.mark.parametrize("who", ["alice", "staff"])
def test_only_admins_manage_branches(api, world, who):
    api.act_as(world[who])
    response = api.client.post(BRANCHES, json=LAGOS)
    assert response.status_code == 403
    assert response.json()["detail"]["code"] == "admin_only"


@pytest.mark.parametrize(
    "fields",
    [
        {"country_code": "XX"},
        {"timezone": "Mars/Olympus"},
        {"language_code": "zz"},
        {"contact_email": "not-an-email"},
        {"slug": "Bad Slug"},
        {"name": "A"},
    ],
)
def test_bad_branches_are_rejected(api, world, fields):
    api.act_as(world["admin"])
    assert api.client.post(BRANCHES, json={**LAGOS, **fields}).status_code == 422


def test_duplicate_slug(api, world):
    create(api, world["admin"])
    response = api.client.post(BRANCHES, json=LAGOS)
    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "branch_exists"
    other = create(api, world["admin"], name="CYC Abuja", city="Abuja")
    response = api.client.patch(f"{BRANCHES}/{other['id']}", json={"slug": "cyc-lagos"})
    assert response.status_code == 409


def test_listing_filters_and_order(api, world):
    create(api, world["admin"])
    create(api, world["admin"], name="CYC Abuja", city="Abuja", timezone="Africa/Lagos")
    create(api, world["admin"], name="CYC London", country_code="GB", timezone="Europe/London")
    api.act_as(world["alice"])
    names = [b["name"] for b in api.client.get(BRANCHES).json()]
    assert names == ["CYC London", "CYC Abuja", "CYC Lagos"]
    names = [b["name"] for b in api.client.get(BRANCHES, params={"country_code": "ng"}).json()]
    assert names == ["CYC Abuja", "CYC Lagos"]
    names = [b["name"] for b in api.client.get(BRANCHES, params={"q": "lond"}).json()]
    assert names == ["CYC London"]


def test_join_and_leave_a_branch(api, world):
    lagos = create(api, world["admin"])
    abuja = create(api, world["admin"], name="CYC Abuja")
    api.act_as(world["alice"])
    response = api.client.put(f"{BRANCHES}/{lagos['id']}/membership")
    assert response.status_code == 200
    assert response.json()["is_mine"] is True
    assert response.json()["member_count"] == 1
    assert api.client.get(PROFILE).json()["branch_id"] == lagos["id"]

    # Picking another replaces it.
    api.client.put(f"{BRANCHES}/{abuja['id']}/membership")
    assert api.client.get(f"{BRANCHES}/{lagos['id']}").json()["member_count"] == 0
    response = api.client.delete(f"{BRANCHES}/{lagos['id']}/membership")
    assert response.status_code == 404
    assert response.json()["detail"]["code"] == "not_branch_member"
    assert api.client.delete(f"{BRANCHES}/{abuja['id']}/membership").status_code == 204
    assert api.client.get(PROFILE).json()["branch_id"] is None

    # The profile endpoint doesn't set it.
    response = api.client.patch(PROFILE, json={"branch_id": lagos["id"]})
    assert response.status_code == 422


def test_joining_needs_a_profile_and_an_active_branch(api, world):
    lagos = create(api, world["admin"])
    api.act_as(world["bob"])
    response = api.client.put(f"{BRANCHES}/{lagos['id']}/membership")
    assert response.json()["detail"]["code"] == "profile_not_found"
    response = api.client.put(f"{BRANCHES}/{uuid.uuid4()}/membership")
    assert response.json()["detail"]["code"] == "branch_not_found"


def test_archiving_keeps_members_but_hides_the_branch(api, world):
    lagos = create(api, world["admin"])
    api.act_as(world["alice"])
    api.client.put(f"{BRANCHES}/{lagos['id']}/membership")

    api.act_as(world["admin"])
    response = api.client.post(f"{BRANCHES}/{lagos['id']}/archive")
    assert response.json()["is_active"] is False
    assert response.json()["member_count"] == 1

    api.act_as(world["bob"])
    assert api.client.get(BRANCHES).json() == []
    assert api.client.get(f"{BRANCHES}/{lagos['id']}").status_code == 200
    assert api.client.get(BRANCHES, params={"include_archived": True}).status_code == 403
    api.act_as(world["alice"])
    assert api.client.get(PROFILE).json()["branch_id"] == lagos["id"]
    response = api.client.post(COMMUNITIES, json={"name": "Lagos Youth", "branch_id": lagos["id"]})
    assert response.json()["detail"]["code"] == "branch_not_found"

    api.act_as(world["staff"])
    assert len(api.client.get(BRANCHES, params={"include_archived": True}).json()) == 1
    api.act_as(world["admin"])
    assert api.client.post(f"{BRANCHES}/{lagos['id']}/restore").json()["is_active"] is True


def test_communities_in_a_branch(api, world):
    lagos = create(api, world["admin"])
    api.act_as(world["alice"])
    response = api.client.post(COMMUNITIES, json={"name": "Lagos Youth", "branch_id": lagos["id"]})
    assert response.status_code == 201
    community = response.json()
    assert community["branch_id"] == lagos["id"]
    api.client.post(COMMUNITIES, json={"name": "Online Prayer"})

    names = [
        c["name"]
        for c in api.client.get(COMMUNITIES, params={"branch_id": lagos["id"]}).json()["items"]
    ]
    assert names == ["Lagos Youth"]
    assert api.client.get(f"{BRANCHES}/{lagos['id']}").json()["community_count"] == 1

    response = api.client.patch(f"{COMMUNITIES}/{community['id']}", json={"branch_id": None})
    assert response.json()["branch_id"] is None
    response = api.client.patch(
        f"{COMMUNITIES}/{community['id']}", json={"branch_id": str(uuid.uuid4())}
    )
    assert response.status_code == 404
