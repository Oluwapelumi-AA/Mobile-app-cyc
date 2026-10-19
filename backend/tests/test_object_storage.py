from urllib.parse import parse_qs, urlparse

import pytest
from pydantic import ValidationError

from app.core.config import Settings
from app.services.avatar_storage import AvatarObjectInvalid, ObjectAvatarStorage
from app.services.object_storage import (
    InMemoryObjectStorage,
    UnconfiguredObjectStorage,
    build_object_storage,
)
from app.services.video_provider import (
    FakeVideoProvider,
    UnconfiguredVideoProvider,
    build_video_provider,
)


def s3_settings(**overrides) -> Settings:
    values = {
        "storage_backend": "s3",
        "storage_bucket": "light-media",
        "storage_region": "auto",
        "storage_endpoint_url": "https://account.r2.cloudflarestorage.com",
        "storage_access_key_id": "test-key",
        "storage_secret_access_key": "test-secret",
    }
    values.update(overrides)
    return Settings(**values)


# Settings


def test_storage_is_off_by_default():
    assert isinstance(build_object_storage(Settings()), UnconfiguredObjectStorage)


def test_s3_needs_a_bucket():
    with pytest.raises(ValidationError):
        Settings(storage_backend="s3")


def test_fake_video_is_refused_in_production():
    with pytest.raises(ValidationError):
        Settings(environment="production", secret_key="x" * 40, video_provider="fake")
    production = Settings(environment="production", secret_key="x" * 40, video_provider="none")
    assert isinstance(build_video_provider(production), UnconfiguredVideoProvider)
    assert isinstance(build_video_provider(Settings()), FakeVideoProvider)


def test_unknown_backends_are_rejected():
    with pytest.raises(ValueError):
        build_object_storage(Settings(storage_backend="ftp"))
    with pytest.raises(ValueError):
        build_video_provider(Settings(video_provider="skype"))


# S3 adapter (presigning runs offline, no bucket needed)


def test_s3_presigned_upload_targets_the_bucket():
    pytest.importorskip("boto3")
    storage = build_object_storage(s3_settings())
    upload = storage.presign_upload("avatars/u/a.png", "image/png", 600)
    url = urlparse(upload.url)
    assert url.netloc == "account.r2.cloudflarestorage.com"
    assert url.path == "/light-media/avatars/u/a.png"
    query = parse_qs(url.query)
    assert query["X-Amz-Expires"] == ["600"]
    assert "X-Amz-Signature" in query
    assert upload.method == "PUT"
    assert upload.headers == {"Content-Type": "image/png"}


def test_s3_presigned_download_expires():
    pytest.importorskip("boto3")
    storage = build_object_storage(s3_settings())
    query = parse_qs(urlparse(storage.presign_download("recordings/r.mp4", 900)).query)
    assert query["X-Amz-Expires"] == ["900"]


def test_s3_public_urls_use_the_cdn_when_set():
    pytest.importorskip("boto3")
    with_cdn = build_object_storage(s3_settings(storage_public_base_url="https://cdn.example.com/"))
    assert with_cdn.public_url("avatars/u/a.png") == "https://cdn.example.com/avatars/u/a.png"
    without = build_object_storage(s3_settings())
    assert without.public_url("avatars/u/a.png") == (
        "https://account.r2.cloudflarestorage.com/light-media/avatars/u/a.png"
    )


# Avatars on object storage


def test_avatar_upload_and_confirm(api):
    import uuid

    storage = InMemoryObjectStorage()
    avatars = ObjectAvatarStorage(storage)
    user_id = uuid.uuid4()
    intent = avatars.create_upload_intent(user_id, "image/png", 1000)
    assert intent.object_key.startswith(f"avatars/{user_id}/")
    assert intent.method == "PUT"

    with pytest.raises(AvatarObjectInvalid):
        avatars.resolve_uploaded_avatar(user_id, intent.object_key)
    storage.put(intent.object_key, "image/png", 1000)
    assert avatars.resolve_uploaded_avatar(user_id, intent.object_key) == (
        f"https://storage.test/public/{intent.object_key}"
    )


@pytest.mark.parametrize(
    ("content_type", "size"), [("application/pdf", 10), ("image/png", 50 * 1024 * 1024)]
)
def test_avatar_must_be_a_small_image(content_type, size):
    import uuid

    storage = InMemoryObjectStorage()
    avatars = ObjectAvatarStorage(storage)
    key = f"avatars/{uuid.uuid4()}/a.png"
    storage.put(key, content_type, size)
    with pytest.raises(AvatarObjectInvalid):
        avatars.resolve_uploaded_avatar(uuid.uuid4(), key)


def test_avatar_endpoints_use_object_storage(api):
    from app.main import app
    from app.services.object_storage import get_object_storage

    storage = InMemoryObjectStorage()
    app.dependency_overrides[get_object_storage] = lambda: storage
    try:
        api.act_as(api.add_user("grace"))
        api.client.post("/api/v1/profiles/me", json={"display_name": "Grace"})
        intent = api.client.post(
            "/api/v1/profiles/me/avatar/upload-intent",
            json={"content_type": "image/webp", "size_bytes": 2048},
        ).json()
        storage.put(intent["object_key"], "image/webp", 2048)
        response = api.client.post(
            "/api/v1/profiles/me/avatar/confirm", json={"object_key": intent["object_key"]}
        )
        assert response.status_code == 200
        assert response.json()["avatar_url"] == f"https://storage.test/public/{intent['object_key']}"
    finally:
        app.dependency_overrides.pop(get_object_storage, None)
