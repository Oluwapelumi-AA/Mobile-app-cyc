import uuid

import pytest
from sqlalchemy import func, select

from app.models import AccountRole, Reaction

CHAPTERS = "/api/v1/chapters"


@pytest.fixture
def world(api):
    """A Chapter with a Coordinator ("owner") and two Members, an app
    moderator ("mod"), plus an outsider who belongs to another Chapter."""
    ids = {name: api.add_user(name) for name in ("owner", "alice", "bob", "outsider")}
    ids["mod"] = api.add_user("mod", AccountRole.MODERATOR)
    cid = api.add_chapter("Abuja")
    other = api.add_chapter("Lagos")
    api.add_staff(ids["owner"], cid, "coordinator")
    for name in ("alice", "bob"):
        api.add_member(ids[name], cid, name.title())
    api.add_member(ids["outsider"], other, "Outsider")
    return {"chapter_id": str(cid), "other_chapter_id": str(other), **ids}


def post_as(api, user_id, chapter_id, body="Hello church"):
    api.act_as(user_id)
    return api.client.post(f"{CHAPTERS}/{chapter_id}/posts", json={"body": body})


def comment_as(api, user_id, post_id, body="Amen"):
    api.act_as(user_id)
    return api.client.post(f"/api/v1/posts/{post_id}/comments", json={"body": body})


# Posts


def test_member_creates_post(api, world):
    response = post_as(api, world["alice"], world["chapter_id"], "  Praise report  ")
    assert response.status_code == 201
    body = response.json()
    assert body["body"] == "Praise report"
    assert body["author_id"] == str(world["alice"])
    assert body["chapter_id"] == world["chapter_id"]
    assert body["comment_count"] == 0
    assert body["edited_at"] is None


def test_non_member_cannot_post(api, world):
    response = post_as(api, world["outsider"], world["chapter_id"])
    assert response.status_code == 403
    assert response.json()["detail"]["code"] == "membership_required"


@pytest.mark.parametrize("body", ["", "   ", "x" * 5001])
def test_post_body_is_validated(api, world, body):
    assert post_as(api, world["alice"], world["chapter_id"], body).status_code == 422


def test_feed_is_newest_first_and_paginates(api, world):
    for number in range(5):
        post_as(api, world["alice"], world["chapter_id"], f"Post {number}")

    api.act_as(world["bob"])
    url = f"{CHAPTERS}/{world['chapter_id']}/posts"
    first = api.client.get(url, params={"limit": 3}).json()
    second = api.client.get(url, params={"limit": 3, "cursor": first["next_cursor"]}).json()

    bodies = [p["body"] for p in first["items"] + second["items"]]
    assert bodies == ["Post 4", "Post 3", "Post 2", "Post 1", "Post 0"]
    assert second["next_cursor"] is None


def test_feed_only_shows_that_chapter(api, world):
    post_as(api, world["alice"], world["chapter_id"], "Here")
    post_as(api, world["outsider"], world["other_chapter_id"], "Elsewhere")

    api.act_as(world["alice"])
    items = api.client.get(f"{CHAPTERS}/{world['chapter_id']}/posts").json()["items"]
    assert [p["body"] for p in items] == ["Here"]


def test_other_chapters_posts_are_hidden(api, world):
    post = post_as(api, world["alice"], world["chapter_id"]).json()

    api.act_as(world["outsider"])
    assert api.client.get(f"{CHAPTERS}/{world['chapter_id']}/posts").json()["items"] == []
    response = api.client.get(f"/api/v1/posts/{post['id']}")
    assert response.status_code == 404
    assert response.json()["detail"]["code"] == "post_not_found"
    assert api.client.get(f"/api/v1/posts/{post['id']}/comments").status_code == 404


def test_get_post_includes_comment_count(api, world):
    post = post_as(api, world["alice"], world["chapter_id"]).json()
    comment_as(api, world["bob"], post["id"])
    comment_as(api, world["alice"], post["id"])

    body = api.client.get(f"/api/v1/posts/{post['id']}").json()
    assert body["comment_count"] == 2
    feed = api.client.get(f"{CHAPTERS}/{world['chapter_id']}/posts").json()
    assert feed["items"][0]["comment_count"] == 2


def test_unknown_post_is_404(api, world):
    api.act_as(world["alice"])
    assert api.client.get(f"/api/v1/posts/{uuid.uuid4()}").status_code == 404


def test_only_author_edits_post(api, world):
    post = post_as(api, world["alice"], world["chapter_id"]).json()

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


@pytest.mark.parametrize("deleter", ["alice", "mod", "owner"])  # owner = Coordinator
def test_author_and_moderators_delete_post(api, world, deleter):
    post = post_as(api, world["alice"], world["chapter_id"]).json()
    api.act_as(world[deleter])
    assert api.client.delete(f"/api/v1/posts/{post['id']}").status_code == 204
    assert api.client.get(f"/api/v1/posts/{post['id']}").status_code == 404


def test_other_member_cannot_delete_post(api, world):
    post = post_as(api, world["alice"], world["chapter_id"]).json()
    api.act_as(world["bob"])
    response = api.client.delete(f"/api/v1/posts/{post['id']}")
    assert response.status_code == 403
    assert response.json()["detail"]["code"] == "not_allowed"


def test_platform_moderator_can_delete_post(api, world):
    staff = api.add_user("staff", AccountRole.MODERATOR)
    post = post_as(api, world["alice"], world["chapter_id"]).json()
    api.act_as(staff)
    assert api.client.delete(f"/api/v1/posts/{post['id']}").status_code == 204


def test_deleting_post_removes_comments_and_reactions(api, world):
    post = post_as(api, world["alice"], world["chapter_id"]).json()
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


def test_archived_chapter_hides_posts(api, world):
    post = post_as(api, world["alice"], world["chapter_id"]).json()
    admin = api.add_user("admin", AccountRole.ADMIN)
    api.act_as(admin)
    assert api.client.post(f"{CHAPTERS}/{world['chapter_id']}/archive").status_code == 200

    api.act_as(world["alice"])
    assert api.client.get(f"/api/v1/posts/{post['id']}").status_code == 404
    response = api.client.get(f"{CHAPTERS}/{world['chapter_id']}/posts")
    assert response.status_code == 404
    assert response.json()["detail"]["code"] == "chapter_not_found"
    # App staff still see it.
    api.act_as(admin)
    assert api.client.get(f"/api/v1/posts/{post['id']}").status_code == 200


def test_unknown_chapter_feed_is_404(api, world):
    api.act_as(world["alice"])
    response = api.client.get(f"{CHAPTERS}/{uuid.uuid4()}/posts")
    assert response.status_code == 404
    assert post_as(api, world["alice"], uuid.uuid4()).status_code == 404


# Comments


def test_member_comments_and_list_is_oldest_first(api, world):
    post = post_as(api, world["alice"], world["chapter_id"]).json()
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
    post = post_as(api, world["alice"], world["chapter_id"]).json()
    # Someone from another Chapter can't even see it.
    assert comment_as(api, world["outsider"], post["id"]).status_code == 404
    # A Guest granted the post can read but not comment.
    guest = api.add_user("guest")
    api.grant(guest, uuid.UUID(world["chapter_id"]), post_id=uuid.UUID(post["id"]))
    response = comment_as(api, guest, post["id"])
    assert response.status_code == 403
    assert response.json()["detail"]["code"] == "membership_required"


def test_comment_on_unknown_post_is_404(api, world):
    assert comment_as(api, world["alice"], uuid.uuid4()).status_code == 404


@pytest.mark.parametrize("body", ["", "x" * 2001])
def test_comment_body_is_validated(api, world, body):
    post = post_as(api, world["alice"], world["chapter_id"]).json()
    assert comment_as(api, world["bob"], post["id"], body).status_code == 422


def test_only_author_edits_comment(api, world):
    post = post_as(api, world["alice"], world["chapter_id"]).json()
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
    post = post_as(api, world["alice"], world["chapter_id"]).json()
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


def test_comments_stay_after_author_leaves_the_chapter(api, world):
    post = post_as(api, world["alice"], world["chapter_id"]).json()
    comment_as(api, world["bob"], post["id"])
    admin = api.add_user("admin", AccountRole.ADMIN)
    api.act_as(admin)
    assert api.client.delete(
        f"{CHAPTERS}/{world['chapter_id']}/members/{world['bob']}"
    ).status_code == 204

    api.act_as(world["alice"])
    items = api.client.get(f"/api/v1/posts/{post['id']}/comments").json()["items"]
    assert len(items) == 1


# Reactions hook


def test_ensure_can_react(api, world):
    from app.services.errors import Forbidden, NotFound
    from app.services.posts import ensure_can_react

    post = post_as(api, world["alice"], world["chapter_id"]).json()
    comment = comment_as(api, world["bob"], post["id"]).json()

    with api.session_factory() as db:
        ensure_can_react(db, world["bob"], "post", uuid.UUID(post["id"]))
        ensure_can_react(db, world["alice"], "comment", uuid.UUID(comment["id"]))
        with pytest.raises(NotFound):
            ensure_can_react(db, world["outsider"], "post", uuid.UUID(post["id"]))
        with pytest.raises(NotFound):
            ensure_can_react(db, world["bob"], "post", uuid.uuid4())
        with pytest.raises(NotFound):
            ensure_can_react(db, world["bob"], "comment", uuid.uuid4())
