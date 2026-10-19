"""Avatar storage boundary.

Upload flow (no image bytes pass through the API or the profile record):
1. POST /api/v1/profiles/me/avatar/upload-intent with content type and size.
   The storage backend returns a short-lived upload target (e.g. presigned URL).
2. The client uploads the file directly to that target.
3. POST /api/v1/profiles/me/avatar/confirm with the object key. The backend
   checks the object exists, matches the declared type and size limit, and
   stores only the resulting public URL on the profile.

``ObjectAvatarStorage`` keeps avatars in the app's object storage
(app/services/object_storage.py). While ``STORAGE_BACKEND`` is ``none`` the
upload endpoints return 503.
"""

import uuid
from typing import Protocol

from app.core.config import settings
from app.core.identity import UserId
from app.schemas.avatar import AvatarContentType, AvatarUploadIntent
from app.services.object_storage import ObjectStorage, StorageUnavailable

_EXTENSIONS: dict[str, str] = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
}


class AvatarStorageUnavailable(Exception):
    pass


class AvatarObjectInvalid(Exception):
    """The uploaded object is missing, too large or not an allowed image."""


def avatar_key_prefix(user_id: UserId) -> str:
    return f"avatars/{user_id}/"


def build_avatar_object_key(user_id: UserId, content_type: AvatarContentType) -> str:
    return f"{avatar_key_prefix(user_id)}{uuid.uuid4().hex}.{_EXTENSIONS[content_type]}"


class AvatarStorage(Protocol):
    def create_upload_intent(
        self, user_id: UserId, content_type: AvatarContentType, size_bytes: int
    ) -> AvatarUploadIntent: ...

    def resolve_uploaded_avatar(self, user_id: UserId, object_key: str) -> str:
        """Verify the uploaded object and return its public URL.

        Raises AvatarObjectInvalid if it is missing or fails validation.
        """
        ...


class UnconfiguredAvatarStorage:
    def create_upload_intent(
        self, user_id: UserId, content_type: AvatarContentType, size_bytes: int
    ) -> AvatarUploadIntent:
        raise AvatarStorageUnavailable("avatar storage is not configured")

    def resolve_uploaded_avatar(self, user_id: UserId, object_key: str) -> str:
        raise AvatarStorageUnavailable("avatar storage is not configured")


class ObjectAvatarStorage:
    """Avatars in object storage, served from the public (CDN) URL."""

    def __init__(self, storage: ObjectStorage) -> None:
        self.storage = storage

    def create_upload_intent(
        self, user_id: UserId, content_type: AvatarContentType, size_bytes: int
    ) -> AvatarUploadIntent:
        key = build_avatar_object_key(user_id, content_type)
        try:
            upload = self.storage.presign_upload(
                key, content_type, settings.storage_presign_ttl_seconds
            )
        except StorageUnavailable:
            raise AvatarStorageUnavailable("avatar storage is not configured") from None
        return AvatarUploadIntent(
            upload_url=upload.url,
            method="PUT",
            headers=upload.headers,
            object_key=key,
            expires_at=upload.expires_at,
            max_size_bytes=settings.avatar_max_upload_bytes,
        )

    def resolve_uploaded_avatar(self, user_id: UserId, object_key: str) -> str:
        try:
            stored = self.storage.head(object_key)
        except StorageUnavailable:
            raise AvatarStorageUnavailable("avatar storage is not configured") from None
        if stored is None:
            raise AvatarObjectInvalid("The uploaded file was not found.")
        if stored.content_type not in _EXTENSIONS:
            raise AvatarObjectInvalid("The avatar must be a JPEG, PNG or WebP image.")
        if stored.size_bytes > settings.avatar_max_upload_bytes:
            self.storage.delete(object_key)
            raise AvatarObjectInvalid("The avatar file is too large.")
        return self.storage.public_url(object_key)
