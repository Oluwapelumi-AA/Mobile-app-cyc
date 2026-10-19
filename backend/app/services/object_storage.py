"""Object storage boundary for uploaded files and replays.

Files never pass through the API. The API hands out short-lived presigned
links: the client uploads straight to storage with one, and plays private
files (such as replays) with another. Public files (such as avatars) are
served from ``STORAGE_PUBLIC_BASE_URL``, normally a CDN in front of the
bucket.

``STORAGE_BACKEND`` picks the implementation:

- ``none`` (default): no storage; features that need it answer 503.
- ``s3``: any S3-compatible service (AWS S3, Cloudflare R2, MinIO,
  DigitalOcean Spaces, ...), configured by the ``STORAGE_*`` settings.

``InMemoryObjectStorage`` is for tests.
"""

from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from functools import lru_cache
from typing import Protocol

from app.core.config import Settings, settings


class StorageUnavailable(Exception):
    """No object storage is configured."""


@dataclass(frozen=True)
class PresignedUpload:
    url: str
    method: str
    headers: dict[str, str]
    expires_at: datetime


@dataclass(frozen=True)
class StoredObject:
    content_type: str | None
    size_bytes: int


class ObjectStorage(Protocol):
    def presign_upload(
        self, key: str, content_type: str, expires_in: int
    ) -> PresignedUpload: ...

    def presign_download(self, key: str, expires_in: int) -> str:
        """A short-lived link to a private object."""
        ...

    def public_url(self, key: str) -> str:
        """The permanent public (CDN) link to an object."""
        ...

    def head(self, key: str) -> StoredObject | None:
        """The object's type and size, or None when it does not exist."""
        ...

    def delete(self, key: str) -> None: ...


def _expires_at(expires_in: int) -> datetime:
    return datetime.now(UTC) + timedelta(seconds=expires_in)


class UnconfiguredObjectStorage:
    def presign_upload(self, key: str, content_type: str, expires_in: int) -> PresignedUpload:
        raise StorageUnavailable("object storage is not configured")

    def presign_download(self, key: str, expires_in: int) -> str:
        raise StorageUnavailable("object storage is not configured")

    def public_url(self, key: str) -> str:
        raise StorageUnavailable("object storage is not configured")

    def head(self, key: str) -> StoredObject | None:
        raise StorageUnavailable("object storage is not configured")

    def delete(self, key: str) -> None:
        raise StorageUnavailable("object storage is not configured")


class S3ObjectStorage:
    """Any S3-compatible service, through boto3."""

    def __init__(self, config: Settings) -> None:
        # Imported here so the app runs without boto3 when storage is off.
        import boto3
        from botocore.config import Config

        self.bucket = config.storage_bucket
        self.public_base_url = config.storage_public_base_url.rstrip("/")
        self.client = boto3.client(
            "s3",
            region_name=config.storage_region,
            endpoint_url=config.storage_endpoint_url or None,
            aws_access_key_id=config.storage_access_key_id or None,
            aws_secret_access_key=config.storage_secret_access_key or None,
            config=Config(signature_version="s3v4"),
        )

    def presign_upload(self, key: str, content_type: str, expires_in: int) -> PresignedUpload:
        url = self.client.generate_presigned_url(
            "put_object",
            Params={"Bucket": self.bucket, "Key": key, "ContentType": content_type},
            ExpiresIn=expires_in,
        )
        return PresignedUpload(
            url=url,
            method="PUT",
            headers={"Content-Type": content_type},
            expires_at=_expires_at(expires_in),
        )

    def presign_download(self, key: str, expires_in: int) -> str:
        return self.client.generate_presigned_url(
            "get_object",
            Params={"Bucket": self.bucket, "Key": key},
            ExpiresIn=expires_in,
        )

    def public_url(self, key: str) -> str:
        if self.public_base_url:
            return f"{self.public_base_url}/{key}"
        endpoint = self.client.meta.endpoint_url.rstrip("/")
        return f"{endpoint}/{self.bucket}/{key}"

    def head(self, key: str) -> StoredObject | None:
        from botocore.exceptions import ClientError

        try:
            response = self.client.head_object(Bucket=self.bucket, Key=key)
        except ClientError as exc:
            if exc.response.get("Error", {}).get("Code") in {"404", "NoSuchKey", "NotFound"}:
                return None
            raise
        return StoredObject(
            content_type=response.get("ContentType"),
            size_bytes=response["ContentLength"],
        )

    def delete(self, key: str) -> None:
        self.client.delete_object(Bucket=self.bucket, Key=key)


class InMemoryObjectStorage:
    """Keeps object metadata in a dict. For tests."""

    def __init__(self, base_url: str = "https://storage.test") -> None:
        self.base_url = base_url
        self.objects: dict[str, StoredObject] = {}

    def put(self, key: str, content_type: str, size_bytes: int) -> None:
        """Pretend a client uploaded ``key``."""
        self.objects[key] = StoredObject(content_type=content_type, size_bytes=size_bytes)

    def presign_upload(self, key: str, content_type: str, expires_in: int) -> PresignedUpload:
        return PresignedUpload(
            url=f"{self.base_url}/upload/{key}?expires_in={expires_in}",
            method="PUT",
            headers={"Content-Type": content_type},
            expires_at=_expires_at(expires_in),
        )

    def presign_download(self, key: str, expires_in: int) -> str:
        return f"{self.base_url}/private/{key}?expires_in={expires_in}"

    def public_url(self, key: str) -> str:
        return f"{self.base_url}/public/{key}"

    def head(self, key: str) -> StoredObject | None:
        return self.objects.get(key)

    def delete(self, key: str) -> None:
        self.objects.pop(key, None)


def build_object_storage(config: Settings) -> ObjectStorage:
    if config.storage_backend == "s3":
        return S3ObjectStorage(config)
    if config.storage_backend == "none":
        return UnconfiguredObjectStorage()
    raise ValueError(f"Unknown STORAGE_BACKEND {config.storage_backend!r}")


@lru_cache
def get_object_storage() -> ObjectStorage:
    return build_object_storage(settings)
