
import uuid

import pytest
from sqlalchemy import func, select

from app.models import Reaction


COMMUNITIES = "/api/v1/communities"


@pytest.fixture
def world(api):
    """Create a public community with members and one outsider."""
    ids = {
        name: api.add_user(name)
        for name in ("owner", "alice", "bob", "outsider")
    }

    api.act_as(ids["owner"])
    response = api.client.post(
        COMMUNITIES,
        json={"name": "Reaction Test Community"},
    )
    assert response.status_code == 201
    community_id = response.json()["id"]

    for name in ("alice", "bob"):
        api.act_as(ids[name])
        response = api.client.post(
            f"{COMMUNITIES}/{community_id}/join"
        )
        assert response.status_code in (200, 201)

    return {"community_id": community_id, **ids}


def create_post(api, world):
    """Create a real post as a community member."""
    api.act_as(world["alice"])
    response = api.client.post(
        f"{COMMUNITIES}/{world['community_id']}/posts",
        json={"body": "A post for reaction testing"},
    )
    assert response.status_code == 201
    return response.json()


def create_comment(api, world, post_id):
    """Create a real comment on an existing post."""
    api.act_as(world["bob"])
    response = api.client.post(
        f"/api/v1/posts/{post_id}/comments",
        json={"body": "A comment for reaction testing"},
    )
    assert response.status_code == 201
    return response.json()


def test_create_post_reaction(api, world):
    post = create_post(api, world)
    api.act_as(world["alice"])

    response = api.client.put(
        f"/api/v1/reactions/posts/{post['id']}",
        json={"reaction_type": "like"},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["reaction_type"] == "like"
    assert body["target_type"] == "post"
    assert body["target_id"] == post["id"]
    assert body["user_id"] == str(world["alice"])


def test_changing_reaction_updates_existing_record(api, world):
    post = create_post(api, world)
    api.act_as(world["alice"])
    url = f"/api/v1/reactions/posts/{post['id']}"

    first_response = api.client.put(
        url,
        json={"reaction_type": "like"},
    )
    assert first_response.status_code == 200

    second_response = api.client.put(
        url,
        json={"reaction_type": "love"},
    )
    assert second_response.status_code == 200
    assert second_response.json()["reaction_type"] == "love"

    with api.session_factory() as db:
        count = db.scalar(
            select(func.count())
            .select_from(Reaction)
            .where(
                Reaction.target_type == "post",
                Reaction.target_id == uuid.UUID(post["id"]),
                Reaction.user_id == world["alice"],
            )
        )

    assert count == 1


def test_create_comment_reaction(api, world):
    post = create_post(api, world)
    comment = create_comment(api, world, post["id"])
    api.act_as(world["alice"])

    response = api.client.put(
        f"/api/v1/reactions/comments/{comment['id']}",
        json={"reaction_type": "pray"},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["reaction_type"] == "pray"
    assert body["target_type"] == "comment"
    assert body["target_id"] == comment["id"]
    assert body["user_id"] == str(world["alice"])


def test_remove_own_reaction(api, world):
    post = create_post(api, world)
    api.act_as(world["alice"])
    url = f"/api/v1/reactions/posts/{post['id']}"

    create_response = api.client.put(
        url,
        json={"reaction_type": "celebrate"},
    )
    assert create_response.status_code == 200

    delete_response = api.client.delete(url)
    assert delete_response.status_code == 204

    with api.session_factory() as db:
        remaining = db.scalar(
            select(Reaction).where(
                Reaction.target_type == "post",
                Reaction.target_id == uuid.UUID(post["id"]),
                Reaction.user_id == world["alice"],
            )
        )

    assert remaining is None


def test_cannot_remove_another_users_reaction(api, world):
    post = create_post(api, world)
    api.act_as(world["alice"])
    url = f"/api/v1/reactions/posts/{post['id']}"

    create_response = api.client.put(
        url,
        json={"reaction_type": "love"},
    )
    assert create_response.status_code == 200

    # Bob is a member and can see the post, but cannot remove Alice's reaction.
    api.act_as(world["bob"])
    delete_response = api.client.delete(url)
    assert delete_response.status_code == 404

    with api.session_factory() as db:
        remaining = db.scalar(
            select(Reaction).where(
                Reaction.target_type == "post",
                Reaction.target_id == uuid.UUID(post["id"]),
                Reaction.user_id == world["alice"],
            )
        )

    assert remaining is not None
    assert remaining.reaction_type == "love"


def test_invalid_reaction_type_is_rejected(api, world):
    post = create_post(api, world)
    api.act_as(world["alice"])

    response = api.client.put(
        f"/api/v1/reactions/posts/{post['id']}",
        json={"reaction_type": "dislike"},
    )

    assert response.status_code == 422


def test_removing_nonexistent_reaction_returns_404(api, world):
    post = create_post(api, world)
    api.act_as(world["alice"])

    response = api.client.delete(
        f"/api/v1/reactions/posts/{post['id']}"
    )

    assert response.status_code == 404


def test_cannot_react_to_nonexistent_post(api, world):
    api.act_as(world["alice"])

    response = api.client.put(
        f"/api/v1/reactions/posts/{uuid.uuid4()}",
        json={"reaction_type": "like"},
    )

    assert response.status_code == 404


def test_non_member_cannot_react_to_post(api, world):
    post = create_post(api, world)
    api.act_as(world["outsider"])

    response = api.client.put(
        f"/api/v1/reactions/posts/{post['id']}",
        json={"reaction_type": "like"},
    )

    assert response.status_code == 403
    assert response.json()["detail"]["code"] == "membership_required"


def test_non_member_cannot_react_to_comment(api, world):
    post = create_post(api, world)
    comment = create_comment(api, world, post["id"])
    api.act_as(world["outsider"])

    response = api.client.put(
        f"/api/v1/reactions/comments/{comment['id']}",
        json={"reaction_type": "love"},
    )

    assert response.status_code == 403
    assert response.json()["detail"]["code"] == "membership_required"
