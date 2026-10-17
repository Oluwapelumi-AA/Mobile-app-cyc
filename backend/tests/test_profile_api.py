import uuid
from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.api.deps import get_avatar_storage, get_current_user_id
from app.core.config import settings
from app.core.security import create_access_token
from app.db.session import Base, get_db
from app.main import app
from app.models import User, UserProfile
from app.schemas.avatar import AvatarUploadIntent
from app.services.avatar_storage import (
    AvatarObjectInvalid,
    build_avatar_object_key,
)

PROFILE = "/api/v1/profiles/me"
ONBOARDING = "/api/v1/onboarding/me"


class FakeAvatarStorage:
    def __init__(self):
        self.uploaded: set[str] = set()

    def create_upload_intent(self, user_id, content_type, size_bytes):
        key = build_avatar_object_key(user_id, content_type)
        return AvatarUploadIntent(
            upload_url=f"https://storage.test/{key}",
            method="PUT",
            headers={"Content-Type": content_type},
            object_key=key,
            expires_at=datetime.now(UTC) + timedelta(minutes=10),
            max_size_bytes=settings.avatar_max_upload_bytes,
        )

    def resolve_uploaded_avatar(self, user_id, object_key):
        if object_key not in self.uploaded:
            raise AvatarObjectInvalid("object not found")
        return f"https://cdn.test/{object_key}"


@pytest.fixture
def session_factory():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )

    @event.listens_for(engine, "connect")
    def enable_foreign_keys(dbapi_connection, _record):
        dbapi_connection.execute("PRAGMA foreign_keys=ON")

    Base.metadata.create_all(bind=engine)
    factory = sessionmaker(bind=engine, autoflush=False, autocommit=False)

    def override_get_db():
        db = factory()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    yield factory
    app.dependency_overrides.clear()
    engine.dispose()


def create_user(session_factory, email="profile-user@example.com"):
    with session_factory() as db:
        user = User(email=email, password_hash="test-password-hash")
        db.add(user)
        db.commit()
        return user.id


@pytest.fixture
def user_id(session_factory):
    return create_user(session_factory)


@pytest.fixture
def client(session_factory, user_id):
    app.dependency_overrides[get_current_user_id] = lambda: user_id
    return TestClient(app)


@pytest.fixture
def fake_storage():
    storage = FakeAvatarStorage()
    app.dependency_overrides[get_avatar_storage] = lambda: storage
    return storage


@pytest.fixture
def profile(client):
    response = client.post(PROFILE, json={"display_name": "Grace", "language_code": "en-gb"})
    assert response.status_code == 201
    return response.json()


def test_requests_without_auth_are_rejected(session_factory):
    response = TestClient(app).get(PROFILE)

    assert response.status_code == 401
    assert response.json()["detail"]["code"] == "not_authenticated"


def test_create_and_get_profile(client, user_id, profile):
    assert profile["user_id"] == str(user_id)
    assert profile["language_code"] == "en-GB"
    assert profile["avatar_url"] is None

    response = client.get(PROFILE)
    assert response.status_code == 200
    assert response.json() == profile


def test_get_profile_before_creation_returns_404(client):
    response = client.get(PROFILE)

    assert response.status_code == 404
    assert response.json()["detail"]["code"] == "profile_not_found"


def test_create_profile_twice_conflicts(client, profile):
    response = client.post(PROFILE, json={"display_name": "Again"})

    assert response.status_code == 409


def test_create_profile_with_invalid_input_returns_422(client):
    response = client.post(PROFILE, json={"display_name": "", "country_code": "ZZ"})

    assert response.status_code == 422
    fields = {tuple(e["loc"]) for e in response.json()["detail"]}
    assert ("body", "display_name") in fields
    assert ("body", "country_code") in fields


def test_update_profile(client, profile):
    response = client.patch(PROFILE, json={"bio": "Hello", "timezone": "Africa/Lagos"})

    assert response.status_code == 200
    body = response.json()
    assert body["bio"] == "Hello"
    assert body["timezone"] == "Africa/Lagos"
    assert body["display_name"] == "Grace"

    cleared = client.patch(PROFILE, json={"bio": None}).json()
    assert cleared["bio"] is None


@pytest.mark.parametrize(
    "payload",
    [{}, {"display_name": None}, {"avatar_url": "https://evil.test/x.png"}, {"timezone": "Nowhere"}],
)
def test_invalid_updates_return_422(client, profile, payload):
    assert client.patch(PROFILE, json=payload).status_code == 422


def test_onboarding_requires_profile(client):
    assert client.get(ONBOARDING).status_code == 404


def test_onboarding_flow(client, profile):
    status = client.get(ONBOARDING).json()
    assert status["next_step"] == "profile_basics"

    assert client.post(f"{ONBOARDING}/steps/profile_basics/complete").status_code == 200
    assert client.post(f"{ONBOARDING}/steps/avatar/skip").status_code == 200

    early = client.post(f"{ONBOARDING}/complete")
    assert early.status_code == 422
    assert early.json()["detail"]["code"] == "required_steps_incomplete"

    assert client.post(f"{ONBOARDING}/steps/language/complete").status_code == 200
    done = client.post(f"{ONBOARDING}/complete")
    assert done.status_code == 200
    assert done.json()["is_complete"] is True

    again = client.post(f"{ONBOARDING}/steps/timezone/skip")
    assert again.status_code == 409
    assert again.json()["detail"]["code"] == "onboarding_already_completed"


def test_onboarding_step_errors(client, profile):
    skip_required = client.post(f"{ONBOARDING}/steps/language/skip")
    assert skip_required.status_code == 409
    assert skip_required.json()["detail"]["code"] == "required_step_not_skippable"

    missing_data = client.post(f"{ONBOARDING}/steps/region/complete")
    assert missing_data.status_code == 422
    assert missing_data.json()["detail"]["code"] == "step_requirement_not_met"

    assert client.post(f"{ONBOARDING}/steps/not_a_step/complete").status_code == 422


def test_avatar_upload_unavailable_without_storage(client, profile):
    response = client.post(
        f"{PROFILE}/avatar/upload-intent", json={"content_type": "image/png", "size_bytes": 1000}
    )

    assert response.status_code == 503
    assert response.json()["detail"]["code"] == "avatar_storage_unavailable"


@pytest.mark.parametrize(
    "payload",
    [
        {"content_type": "image/gif", "size_bytes": 1000},
        {"content_type": "application/pdf", "size_bytes": 1000},
        {"content_type": "image/png", "size_bytes": 0},
        {"content_type": "image/png", "size_bytes": settings.avatar_max_upload_bytes + 1},
    ],
)
def test_avatar_upload_request_validation(client, profile, payload):
    assert client.post(f"{PROFILE}/avatar/upload-intent", json=payload).status_code == 422


def test_avatar_upload_confirm_and_remove(client, profile, fake_storage, user_id):
    intent = client.post(
        f"{PROFILE}/avatar/upload-intent", json={"content_type": "image/jpeg", "size_bytes": 2048}
    ).json()
    key = intent["object_key"]
    assert key.startswith(f"avatars/{user_id}/") and key.endswith(".jpg")

    not_uploaded = client.post(f"{PROFILE}/avatar/confirm", json={"object_key": key})
    assert not_uploaded.status_code == 422

    fake_storage.uploaded.add(key)
    confirmed = client.post(f"{PROFILE}/avatar/confirm", json={"object_key": key})
    assert confirmed.status_code == 200
    assert confirmed.json()["avatar_url"] == f"https://cdn.test/{key}"

    assert client.post(f"{ONBOARDING}/steps/avatar/complete").status_code == 200

    assert client.delete(f"{PROFILE}/avatar").status_code == 204
    assert client.get(PROFILE).json()["avatar_url"] is None


@pytest.mark.parametrize("key", [f"avatars/{uuid.uuid4()}/x.jpg", "other/x.jpg"])
def test_avatar_confirm_rejects_other_users_keys(client, profile, fake_storage, key):
    fake_storage.uploaded.add(key)
    response = client.post(f"{PROFILE}/avatar/confirm", json={"object_key": key})

    assert response.status_code == 422
    assert response.json()["detail"]["code"] == "invalid_avatar_key"


def test_profile_routes_accept_a_real_access_token(session_factory, user_id):
    client = TestClient(app)
    headers = {"Authorization": f"Bearer {create_access_token(str(user_id))}"}

    created = client.post(PROFILE, json={"display_name": "Grace"}, headers=headers)
    assert created.status_code == 201
    assert created.json()["user_id"] == str(user_id)
    assert client.get(PROFILE, headers=headers).status_code == 200

    bad = client.get(PROFILE, headers={"Authorization": "Bearer not-a-token"})
    assert bad.status_code == 401


def test_profile_and_onboarding_are_stored_in_the_database(client, session_factory, user_id):
    client.post(PROFILE, json={"display_name": "Grace", "language_code": "yo", "country_code": "ng"})
    client.post(f"{ONBOARDING}/steps/profile_basics/complete")
    client.post(f"{ONBOARDING}/steps/language/complete")
    client.post(f"{ONBOARDING}/complete")

    with session_factory() as db:
        row = db.get(UserProfile, user_id)
        assert row.display_name == "Grace"
        assert row.country_code == "NG"
        assert row.onboarding_steps["language"] == "completed"
        assert row.onboarding_steps["avatar"] == "skipped"
        assert row.onboarding_completed_at is not None

    status = client.get(ONBOARDING).json()
    assert status["is_complete"] is True


def test_profiles_are_separate_per_user(client, session_factory, profile):
    other_id = create_user(session_factory, email="other@example.com")
    app.dependency_overrides[get_current_user_id] = lambda: other_id

    assert client.get(PROFILE).status_code == 404


def test_deleting_a_user_deletes_their_profile(client, session_factory, user_id, profile):
    with session_factory() as db:
        db.delete(db.get(User, user_id))
        db.commit()
        assert db.get(UserProfile, user_id) is None
