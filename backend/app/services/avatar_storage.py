"""Avatar storage boundary.

Upload flow (no image bytes pass through the API or the profile record):
1. POST /api/v1/profiles/me/avatar/upload-intent with content type and size.
   The storage backend returns a short-lived upload target (e.g. presigned URL).
2. The client uploads the file directly to that target.
3. POST /api/v1/profiles/me/avatar/confirm with the object key. The backend
   checks the object exists, matches the declared type and size limit, and
   stores only the resulting public URL on the profile.

No storage provider is configured yet, so ``UnconfiguredAvatarStorage`` is the
default and the upload endpoints return 503. A provider implementation (S3,
Cloudflare R2, Cloudinary, ...) must read its credentials from environment
variables and implement ``AvatarStorage``.
"""

import uuid
from typing import Protocol

from app.core.identity import UserId
from app.schemas.avatar import AvatarContentType, AvatarUploadIntent

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
