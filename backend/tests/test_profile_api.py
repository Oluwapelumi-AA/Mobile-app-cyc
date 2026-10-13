import uuid
from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient

from app.api.deps import get_avatar_storage, get_current_user_id, get_profile_repository
from app.core.config import settings
from app.main import app
from app.schemas.avatar import AvatarUploadIntent
from app.services.avatar_storage import (
    AvatarObjectInvalid,
    build_avatar_object_key,
)
from app.services.profiles import InMemoryProfileRepository

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
def user_id():
    return uuid.uuid4()


@pytest.fixture
def client(user_id):
    repository = InMemoryProfileRepository()
    app.dependency_overrides[get_current_user_id] = lambda: user_id
    app.dependency_overrides[get_profile_repository] = lambda: repository
    yield TestClient(app)
    app.dependency_overrides.clear()


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


def test_requests_without_auth_are_rejected():
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
