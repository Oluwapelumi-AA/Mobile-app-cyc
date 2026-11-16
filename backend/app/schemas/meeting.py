
"""Request and response schemas for meetings, livestreams and replays."""

from datetime import datetime
from typing import Annotated
from uuid import UUID

from pydantic import (
    BaseModel,
    ConfigDict,
    StringConstraints,
    model_validator,
)

from app.models.meeting import MeetingKind, MeetingStatus, RecordingStatus
from app.schemas.common import UtcDatetime
from app.services.video_provider import ParticipantRole


MeetingTitle = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=3, max_length=200)
]
MeetingDescription = Annotated[
    str, StringConstraints(strip_whitespace=True, max_length=5000)
]


class MeetingCreate(BaseModel):
    """Create a Community, Chapter, event-linked or app-wide meeting.

    For an event-linked meeting, ownership is inherited from the event.
    If community_id or chapter_id is supplied, it must match the event.

    A meeting cannot belong directly to both a Community and a Chapter.
    Leave out community_id, chapter_id and event_id for an app-wide meeting.
    """

    model_config = ConfigDict(extra="forbid")

    kind: MeetingKind = MeetingKind.MEETING
    title: MeetingTitle
    description: MeetingDescription | None = None
    community_id: UUID | None = None
    chapter_id: UUID | None = None
    event_id: UUID | None = None
    scheduled_start_at: datetime | None = None
    recording_enabled: bool = False

    @model_validator(mode="after")
    def validate_ownership(self):
        if self.community_id is not None and self.chapter_id is not None:
            raise ValueError(
                "A meeting cannot belong to both a Community and a Chapter."
            )
        return self


class MeetingUpdate(BaseModel):
    """Only the fields sent change. recording_enabled applies the next
    time the meeting goes live."""

    model_config = ConfigDict(extra="forbid")

    title: MeetingTitle | None = None
    description: MeetingDescription | None = None
    scheduled_start_at: datetime | None = None
    recording_enabled: bool | None = None


class MeetingRead(BaseModel):
    id: UUID
    kind: MeetingKind
    community_id: UUID | None
    chapter_id: UUID | None
    event_id: UUID | None
    created_by: UUID | None
    title: str
    description: str | None
    status: MeetingStatus
    scheduled_start_at: UtcDatetime | None
    recording_enabled: bool
    started_at: UtcDatetime | None
    ended_at: UtcDatetime | None
    can_host: bool
    # Whether you may ask for a join token once it is live.
    can_join: bool
    created_at: UtcDatetime
    updated_at: UtcDatetime


class JoinTokenRead(BaseModel):
    """Pass token and server_url to the video SDK. Ask again after
    expires_at to rejoin."""

    meeting_id: UUID
    provider: str
    room_id: str
    role: ParticipantRole
    token: str
    server_url: str
    expires_at: UtcDatetime


class RecordingRead(BaseModel):
    id: UUID
    meeting_id: UUID
    status: RecordingStatus
    content_type: str | None
    size_bytes: int | None
    duration_seconds: int | None
    published: bool
    created_at: UtcDatetime
    updated_at: UtcDatetime


class RecordingPlayback(RecordingRead):
    # A short-lived link to the file; ask again when it expires.
    playback_url: str
    playback_expires_at: UtcDatetime


class RecordingUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    published: bool
