import uuid

import pytest
from sqlalchemy import func, select

from app.models import AccountRole, Reaction

COMMUNITIES = "/api/v1/communities"


@pytest.fixture
def world(api):
    """A public community with an owner, a moderator and two members."""
    ids = {name: api.add_user(name) for name in ("owner", "mod", "alice", "bob", "outsider")}
    api.act_as(ids["owner"])
    community = api.client.post(COMMUNITIES, json={"name": "Abuja Fellowship"}).json()
    cid = community["id"]
    for name in ("mod", "alice", "bob"):
        api.act_as(ids[name])
        api.client.post(f"{COMMUNITIES}/{cid}/join")
    api.act_as(ids["owner"])
    api.client.patch(f"{COMMUNITIES}/{cid}/members/{ids['mod']}", json={"role": "moderator"})
    return {"community_id": cid, **ids}


def post_as(api, user_id, community_id, body="Hello church"):
    api.act_as(user_id)
    return api.client.post(f"{COMMUNITIES}/{community_id}/posts", json={"body": body})


def comment_as(api, user_id, post_id, body="Amen"):
    api.act_as(user_id)
    return api.client.post(f"/api/v1/posts/{post_id}/comments", json={"body": body})


# Posts


def test_member_creates_post(api, world):
    response = post_as(api, world["alice"], world["community_id"], "  Praise report  ")
    assert response.status_code == 201
    body = response.json()
    assert body["body"] == "Praise report"
    assert body["author_id"] == str(world["alice"])
    assert body["community_id"] == world["community_id"]
    assert body["comment_count"] == 0
    assert body["edited_at"] is None


def test_non_member_cannot_post(api, world):
    response = post_as(api, world["outsider"], world["community_id"])
    assert response.status_code == 403
    assert response.json()["detail"]["code"] == "membership_required"


@pytest.mark.parametrize("body", ["", "   ", "x" * 5001])
def test_post_body_is_validated(api, world, body):
    assert post_as(api, world["alice"], world["community_id"], body).status_code == 422


def test_feed_is_newest_first_and_paginates(api, world):
    for number in range(5):
        post_as(api, world["alice"], world["community_id"], f"Post {number}")

    api.act_as(world["outsider"])  # Public community: readable by anyone.
    url = f"{COMMUNITIES}/{world['community_id']}/posts"
    first = api.client.get(url, params={"limit": 3}).json()
    second = api.client.get(url, params={"limit": 3, "cursor": first["next_cursor"]}).json()

    bodies = [p["body"] for p in first["items"] + second["items"]]
    assert bodies == ["Post 4", "Post 3", "Post 2", "Post 1", "Post 0"]
    assert second["next_cursor"] is None


def test_feed_only_shows_that_community(api, world):
    post_as(api, world["alice"], world["community_id"], "Here")
    api.act_as(world["bob"])
    other = api.client.post(COMMUNITIES, json={"name": "Other place"}).json()
    post_as(api, world["bob"], other["id"], "Elsewhere")

    items = api.client.get(f"{COMMUNITIES}/{world['community_id']}/posts").json()["items"]
    assert [p["body"] for p in items] == ["Here"]


def test_private_community_posts_hidden(api, world):
    api.act_as(world["owner"])
    secret = api.client.post(COMMUNITIES, json={"name": "Leaders", "visibility": "private"}).json()
    post = post_as(api, world["owner"], secret["id"]).json()

    api.act_as(world["outsider"])
    assert api.client.get(f"{COMMUNITIES}/{secret['id']}/posts").status_code == 404
    response = api.client.get(f"/api/v1/posts/{post['id']}")
    assert response.status_code == 404
    assert response.json()["detail"]["code"] == "post_not_found"
    assert api.client.get(f"/api/v1/posts/{post['id']}/comments").status_code == 404


def test_get_post_includes_comment_count(api, world):
    post = post_as(api, world["alice"], world["community_id"]).json()
    comment_as(api, world["bob"], post["id"])
    comment_as(api, world["alice"], post["id"])

    body = api.client.get(f"/api/v1/posts/{post['id']}").json()
    assert body["comment_count"] == 2
    feed = api.client.get(f"{COMMUNITIES}/{world['community_id']}/posts").json()
    assert feed["items"][0]["comment_count"] == 2


def test_unknown_post_is_404(api, world):
    api.act_as(world["alice"])
    assert api.client.get(f"/api/v1/posts/{uuid.uuid4()}").status_code == 404


def test_only_author_edits_post(api, world):
    post = post_as(api, world["alice"], world["community_id"]).json()

    for name in ("bob", "owner"):
        api.act_as(world[name])
        response = api.client.patch(f"/api/v1/posts/{post['id']}", json={"body": "Changed"})
        assert response.status_code == 403
        assert response.json()["detail"]["code"] == "not_author"

    api.act_as(world["alice"])
    response = api.client.patch(f"/api/v1/posts/{post['id']}", json={"body": "Changed"})
    assert response.status_code == 200
    assert response.json()["body"] == "Changed"
    assert response.json()["edited_at"] is not None


@pytest.mark.parametrize("deleter", ["alice", "mod", "owner"])
def test_author_and_moderators_delete_post(api, world, deleter):
    post = post_as(api, world["alice"], world["community_id"]).json()
    api.act_as(world[deleter])
    assert api.client.delete(f"/api/v1/posts/{post['id']}").status_code == 204
    assert api.client.get(f"/api/v1/posts/{post['id']}").status_code == 404


def test_other_member_cannot_delete_post(api, world):
    post = post_as(api, world["alice"], world["community_id"]).json()
    api.act_as(world["bob"])
    response = api.client.delete(f"/api/v1/posts/{post['id']}")
    assert response.status_code == 403
    assert response.json()["detail"]["code"] == "not_allowed"


def test_platform_moderator_can_delete_post(api, world):
    staff = api.add_user("staff", AccountRole.MODERATOR)
    post = post_as(api, world["alice"], world["community_id"]).json()
    api.act_as(staff)
    assert api.client.delete(f"/api/v1/posts/{post['id']}").status_code == 204


def test_deleting_post_removes_comments_and_reactions(api, world):
    post = post_as(api, world["alice"], world["community_id"]).json()
    comment = comment_as(api, world["bob"], post["id"]).json()
    api.act_as(world["bob"])
    api.client.put(f"/api/v1/reactions/posts/{post['id']}", json={"reaction_type": "pray"})
    api.client.put(f"/api/v1/reactions/comments/{comment['id']}", json={"reaction_type": "love"})

    api.act_as(world["alice"])
    assert api.client.delete(f"/api/v1/posts/{post['id']}").status_code == 204

    with api.session_factory() as db:
        assert db.scalar(select(func.count()).select_from(Reaction)) == 0
    api.act_as(world["bob"])
    response = api.client.patch(f"/api/v1/comments/{comment['id']}", json={"body": "x"})
    assert response.status_code == 404


def test_deleting_community_removes_posts(api, world):
    post = post_as(api, world["alice"], world["community_id"]).json()
    comment_as(api, world["bob"], post["id"])
    api.act_as(world["owner"])
    assert api.client.delete(f"{COMMUNITIES}/{world['community_id']}").status_code == 204

    api.act_as(world["alice"])
    assert api.client.get(f"/api/v1/posts/{post['id']}").status_code == 404


# Comments


def test_member_comments_and_list_is_oldest_first(api, world):
    post = post_as(api, world["alice"], world["community_id"]).json()
    for number in range(3):
        response = comment_as(api, world["bob"], post["id"], f"Comment {number}")
        assert response.status_code == 201

    url = f"/api/v1/posts/{post['id']}/comments"
    first = api.client.get(url, params={"limit": 2}).json()
    second = api.client.get(url, params={"limit": 2, "cursor": first["next_cursor"]}).json()

    assert [c["body"] for c in first["items"] + second["items"]] == [
        "Comment 0",
        "Comment 1",
        "Comment 2",
    ]
    assert first["items"][0]["author_id"] == str(world["bob"])
    assert second["next_cursor"] is None


def test_non_member_cannot_comment(api, world):
    post = post_as(api, world["alice"], world["community_id"]).json()
    response = comment_as(api, world["outsider"], post["id"])
    assert response.status_code == 403
    assert response.json()["detail"]["code"] == "membership_required"


def test_comment_on_unknown_post_is_404(api, world):
    assert comment_as(api, world["alice"], uuid.uuid4()).status_code == 404


@pytest.mark.parametrize("body", ["", "x" * 2001])
def test_comment_body_is_validated(api, world, body):
    post = post_as(api, world["alice"], world["community_id"]).json()
    assert comment_as(api, world["bob"], post["id"], body).status_code == 422


def test_only_author_edits_comment(api, world):
    post = post_as(api, world["alice"], world["community_id"]).json()
    comment = comment_as(api, world["bob"], post["id"]).json()

    api.act_as(world["alice"])
    url = f"/api/v1/comments/{comment['id']}"
    assert api.client.patch(url, json={"body": "Edited"}).status_code == 403

    api.act_as(world["bob"])
    response = api.client.patch(url, json={"body": "Edited"})
    assert response.status_code == 200
    assert response.json()["body"] == "Edited"
    assert response.json()["edited_at"] is not None


def test_comment_delete_permissions(api, world):
    post = post_as(api, world["alice"], world["community_id"]).json()
    first = comment_as(api, world["bob"], post["id"]).json()
    second = comment_as(api, world["bob"], post["id"]).json()
    api.act_as(world["bob"])
    api.client.put(f"/api/v1/reactions/comments/{first['id']}", json={"reaction_type": "like"})

    # The post author is not a moderator.
    api.act_as(world["alice"])
    assert api.client.delete(f"/api/v1/comments/{first['id']}").status_code == 403

    api.act_as(world["bob"])
    assert api.client.delete(f"/api/v1/comments/{first['id']}").status_code == 204
    api.act_as(world["mod"])
    assert api.client.delete(f"/api/v1/comments/{second['id']}").status_code == 204

    assert api.client.get(f"/api/v1/posts/{post['id']}/comments").json()["items"] == []
    with api.session_factory() as db:
        assert db.scalar(select(func.count()).select_from(Reaction)) == 0


def test_comments_stay_after_author_leaves(api, world):
    post = post_as(api, world["alice"], world["community_id"]).json()
    comment_as(api, world["bob"], post["id"])
    api.act_as(world["bob"])
    api.client.post(f"{COMMUNITIES}/{world['community_id']}/leave")

    items = api.client.get(f"/api/v1/posts/{post['id']}/comments").json()["items"]
    assert len(items) == 1


# Reactions hook


def test_ensure_can_react(api, world):
    from app.services.errors import Forbidden, NotFound
    from app.services.posts import ensure_can_react

    post = post_as(api, world["alice"], world["community_id"]).json()
    comment = comment_as(api, world["bob"], post["id"]).json()

    with api.session_factory() as db:
        ensure_can_react(db, world["bob"], "post", uuid.UUID(post["id"]))
        ensure_can_react(db, world["alice"], "comment", uuid.UUID(comment["id"]))
        with pytest.raises(Forbidden):
            ensure_can_react(db, world["outsider"], "post", uuid.UUID(post["id"]))
        with pytest.raises(NotFound):
            ensure_can_react(db, world["bob"], "post", uuid.uuid4())
        with pytest.raises(NotFound):
            ensure_can_react(db, world["bob"], "comment", uuid.uuid4())
