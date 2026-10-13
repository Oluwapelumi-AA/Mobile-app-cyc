from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints

from app.core.config import settings

AvatarContentType = Literal["image/jpeg", "image/png", "image/webp"]


class AvatarUploadRequest(BaseModel):
    """Client declares the file before uploading it straight to storage."""

    model_config = ConfigDict(extra="forbid")

    content_type: AvatarContentType
    size_bytes: int = Field(gt=0, le=settings.avatar_max_upload_bytes)


class AvatarUploadIntent(BaseModel):
    """Where and how the client uploads the file (e.g. a presigned URL)."""

    upload_url: str
    method: Literal["PUT", "POST"]
    headers: dict[str, str]
    object_key: str
    expires_at: datetime
    max_size_bytes: int


class AvatarConfirmRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    object_key: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=255)]
