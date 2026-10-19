"""Request and response schemas for notifications, preferences and devices."""

from typing import Annotated
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, model_validator

from app.models.notification import (
    DevicePlatform,
    NotificationCategory,
    NotificationType,
)
from app.schemas.common import UtcDatetime


class NotificationRead(BaseModel):
    id: UUID
    type: NotificationType
    category: NotificationCategory
    # Ready-to-show English text. The app can build its own from ``type`` and
    # ``data`` to translate it.
    title: str
    body: str | None
    # Ids for opening the right screen: post_id, comment_id, event_id,
    # meeting_id, resource_id, community_id, depending on the type.
    data: dict[str, str]
    actor_id: UUID | None
    read: bool
    read_at: UtcDatetime | None
    created_at: UtcDatetime


class UnreadCount(BaseModel):
    count: int


class MarkedRead(BaseModel):
    updated: int


class PreferenceRead(BaseModel):
    category: NotificationCategory
    push: bool
    email: bool


class PreferenceUpdate(BaseModel):
    """Leave ``push`` or ``email`` out to keep it as it is."""

    model_config = ConfigDict(extra="forbid")

    category: NotificationCategory
    push: bool | None = None
    email: bool | None = None


class PreferencesUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    preferences: list[PreferenceUpdate] = Field(min_length=1, max_length=20)

    @model_validator(mode="after")
    def one_change_per_category(self):
        categories = [item.category for item in self.preferences]
        if len(categories) != len(set(categories)):
            raise ValueError("each category can only appear once")
        return self


PushToken = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=8, max_length=500)
]


class DeviceRegister(BaseModel):
    model_config = ConfigDict(extra="forbid")

    # From the push SDK on the device, e.g. ExponentPushToken[...] or an FCM
    # registration token.
    token: PushToken
    platform: DevicePlatform
    app_version: Annotated[
        str, StringConstraints(strip_whitespace=True, max_length=50)
    ] | None = None


class DeviceRead(BaseModel):
    id: UUID
    platform: DevicePlatform
    app_version: str | None
    last_seen_at: UtcDatetime
    created_at: UtcDatetime
