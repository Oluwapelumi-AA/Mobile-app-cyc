import uuid

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, func, select
from sqlalchemy.orm import sessionmaker

from app.api.deps import get_current_user_id
from app.db.session import Base, get_db
from app.main import app
from app.models import Reaction, User


@pytest.fixture
def reaction_context(tmp_path):
    # Use a fresh, temporary database for each test.
    database_file = tmp_path / "reactions_test.db"
    engine = create_engine(
        f"sqlite:///{database_file}",
        connect_args={"check_same_thread": False},
    )
    TestSessionLocal = sessionmaker(
        bind=engine,
        autoflush=False,
        autocommit=False,
    )

    Base.metadata.create_all(bind=engine)

    # Create two real users because reactions reference users.id.
    with TestSessionLocal() as db:
        user_one = User(
            email="reaction-user-one@example.com",
            password_hash="test-password-hash",
        )
        user_two = User(
            email="reaction-user-two@example.com",
            password_hash="test-password-hash",
        )
        db.add_all([user_one, user_two])
        db.commit()
        db.refresh(user_one)
        db.refresh(user_two)

        user_one_id = user_one.id
        user_two_id = user_two.id

    current_user = {"id": user_one_id}

    def override_get_db():
        db = TestSessionLocal()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_current_user_id] = (
        lambda: current_user["id"]
    )

    try:
        with TestClient(app) as client:
            yield {
                "client": client,
                "session_factory": TestSessionLocal,
                "current_user": current_user,
                "user_one_id": user_one_id,
                "user_two_id": user_two_id,
            }
    finally:
        app.dependency_overrides.pop(get_db, None)
        app.dependency_overrides.pop(get_current_user_id, None)
        engine.dispose()


def test_create_post_reaction(reaction_context):
    client = reaction_context["client"]
    user_id = reaction_context["user_one_id"]
    post_id = uuid.uuid4()

    response = client.put(
        f"/api/v1/reactions/posts/{post_id}",
        json={"reaction_type": "like"},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["reaction_type"] == "like"
    assert body["target_type"] == "post"
    assert body["target_id"] == str(post_id)
    assert body["user_id"] == str(user_id)


def test_changing_reaction_updates_existing_record(reaction_context):
    client = reaction_context["client"]
    post_id = uuid.uuid4()

    first_response = client.put(
        f"/api/v1/reactions/posts/{post_id}",
        json={"reaction_type": "like"},
    )
    assert first_response.status_code == 200

    second_response = client.put(
        f"/api/v1/reactions/posts/{post_id}",
        json={"reaction_type": "love"},
    )
    assert second_response.status_code == 200
    assert second_response.json()["reaction_type"] == "love"

    with reaction_context["session_factory"]() as db:
        count = db.scalar(
            select(func.count())
            .select_from(Reaction)
            .where(
                Reaction.target_type == "post",
                Reaction.target_id == post_id,
            )
        )

    assert count == 1


def test_create_comment_reaction(reaction_context):
    client = reaction_context["client"]
    comment_id = uuid.uuid4()

    response = client.put(
        f"/api/v1/reactions/comments/{comment_id}",
        json={"reaction_type": "pray"},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["reaction_type"] == "pray"
    assert body["target_type"] == "comment"
    assert body["target_id"] == str(comment_id)


def test_remove_own_reaction(reaction_context):
    client = reaction_context["client"]
    post_id = uuid.uuid4()

    create_response = client.put(
        f"/api/v1/reactions/posts/{post_id}",
        json={"reaction_type": "celebrate"},
    )
    assert create_response.status_code == 200

    delete_response = client.delete(
        f"/api/v1/reactions/posts/{post_id}"
    )
    assert delete_response.status_code == 204

    with reaction_context["session_factory"]() as db:
        remaining = db.scalar(
            select(Reaction).where(
                Reaction.target_type == "post",
                Reaction.target_id == post_id,
                Reaction.user_id == reaction_context["user_one_id"],
            )
        )

    assert remaining is None


def test_cannot_remove_another_users_reaction(reaction_context):
    client = reaction_context["client"]
    post_id = uuid.uuid4()

    create_response = client.put(
        f"/api/v1/reactions/posts/{post_id}",
        json={"reaction_type": "love"},
    )
    assert create_response.status_code == 200

    # Switch the test identity to the second user.
    reaction_context["current_user"]["id"] = (
        reaction_context["user_two_id"]
    )

    delete_response = client.delete(
        f"/api/v1/reactions/posts/{post_id}"
    )
    assert delete_response.status_code == 404

    # The first user's reaction must still exist.
    with reaction_context["session_factory"]() as db:
        remaining = db.scalar(
            select(Reaction).where(
                Reaction.target_type == "post",
                Reaction.target_id == post_id,
                Reaction.user_id == reaction_context["user_one_id"],
            )
        )

    assert remaining is not None
    assert remaining.reaction_type == "love"


def test_invalid_reaction_type_is_rejected(reaction_context):
    client = reaction_context["client"]
    post_id = uuid.uuid4()

    response = client.put(
        f"/api/v1/reactions/posts/{post_id}",
        json={"reaction_type": "dislike"},
    )

    assert response.status_code == 422


def test_removing_nonexistent_reaction_returns_404(reaction_context):
    client = reaction_context["client"]
    post_id = uuid.uuid4()

    response = client.delete(
        f"/api/v1/reactions/posts/{post_id}"
    )

    assert response.status_code == 404
