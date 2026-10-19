"""Video meeting, livestream, join token and replay endpoints."""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Response, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user_id
from app.core.identity import UserId
from app.db.session import get_db
from app.models.meeting import MeetingKind, MeetingStatus
from app.schemas.common import Page
from app.schemas.meeting import (
    JoinTokenRead,
    MeetingCreate,
    MeetingRead,
    MeetingUpdate,
    RecordingPlayback,
    RecordingRead,
    RecordingUpdate,
)
from app.services import meetings
from app.services.object_storage import ObjectStorage, get_object_storage
from app.services.pagination import DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE
from app.services.video_provider import VideoProvider, get_video_provider

router = APIRouter(prefix="/meetings", tags=["Meetings"])

CurrentUserId = Annotated[UserId, Depends(get_current_user_id)]
DbSession = Annotated[Session, Depends(get_db)]
Provider = Annotated[VideoProvider, Depends(get_video_provider)]
Storage = Annotated[ObjectStorage, Depends(get_object_storage)]
Limit = Annotated[int, Query(ge=1, le=MAX_PAGE_SIZE)]
Cursor = Annotated[str | None, Query(max_length=200)]


@router.post("", response_model=MeetingRead, status_code=status.HTTP_201_CREATED)
def create_meeting(data: MeetingCreate, user_id: CurrentUserId, db: DbSession):
    return meetings.create_meeting(db, user_id, data)


@router.get("", response_model=Page[MeetingRead])
def list_meetings(
    user_id: CurrentUserId,
    db: DbSession,
    limit: Limit = DEFAULT_PAGE_SIZE,
    cursor: Cursor = None,
    community_id: UUID | None = None,
    event_id: UUID | None = None,
    status: MeetingStatus | None = None,
    kind: MeetingKind | None = None,
):
    """Meetings you can see, newest first. ``status=live`` shows what is on now."""
    items, next_cursor = meetings.list_meetings(
        db,
        user_id,
        limit,
        cursor,
        community_id=community_id,
        event_id=event_id,
        status=status,
        kind=kind,
    )
    return Page(items=items, next_cursor=next_cursor)


@router.get("/{meeting_id}", response_model=MeetingRead)
def get_meeting(meeting_id: UUID, user_id: CurrentUserId, db: DbSession):
    return meetings.get_meeting(db, user_id, meeting_id)


@router.patch("/{meeting_id}", response_model=MeetingRead)
def update_meeting(
    meeting_id: UUID, data: MeetingUpdate, user_id: CurrentUserId, db: DbSession
):
    return meetings.update_meeting(db, user_id, meeting_id, data)


@router.post("/{meeting_id}/start", response_model=MeetingRead)
def start_meeting(meeting_id: UUID, user_id: CurrentUserId, db: DbSession, provider: Provider):
    """Go live. Hosts only."""
    return meetings.start_meeting(db, user_id, meeting_id, provider)


@router.post("/{meeting_id}/end", response_model=MeetingRead)
def end_meeting(meeting_id: UUID, user_id: CurrentUserId, db: DbSession, provider: Provider):
    """End a live meeting for everyone. Hosts only."""
    return meetings.end_meeting(db, user_id, meeting_id, provider)


@router.post("/{meeting_id}/cancel", response_model=MeetingRead)
def cancel_meeting(meeting_id: UUID, user_id: CurrentUserId, db: DbSession):
    """Call off a meeting that hasn't started. Hosts only."""
    return meetings.cancel_meeting(db, user_id, meeting_id)


@router.delete("/{meeting_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_meeting(
    meeting_id: UUID,
    user_id: CurrentUserId,
    db: DbSession,
    provider: Provider,
    storage: Storage,
):
    meetings.delete_meeting(db, user_id, meeting_id, provider, storage)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/{meeting_id}/token", response_model=JoinTokenRead)
def issue_join_token(
    meeting_id: UUID, user_id: CurrentUserId, db: DbSession, provider: Provider
):
    """A short-lived token to join a live meeting with the video SDK."""
    return meetings.issue_join_token(db, user_id, meeting_id, provider)


@router.get("/{meeting_id}/recordings", response_model=list[RecordingRead])
def list_recordings(meeting_id: UUID, user_id: CurrentUserId, db: DbSession):
    return meetings.list_recordings(db, user_id, meeting_id)


@router.get("/{meeting_id}/recordings/{recording_id}", response_model=RecordingPlayback)
def get_recording(
    meeting_id: UUID,
    recording_id: UUID,
    user_id: CurrentUserId,
    db: DbSession,
    storage: Storage,
):
    """A replay with a short-lived ``playback_url``."""
    return meetings.get_recording_playback(db, user_id, meeting_id, recording_id, storage)


@router.patch("/{meeting_id}/recordings/{recording_id}", response_model=RecordingRead)
def update_recording(
    meeting_id: UUID,
    recording_id: UUID,
    data: RecordingUpdate,
    user_id: CurrentUserId,
    db: DbSession,
):
    """Show or hide a replay. Hosts only."""
    return meetings.set_recording_published(
        db, user_id, meeting_id, recording_id, data.published
    )


@router.delete(
    "/{meeting_id}/recordings/{recording_id}", status_code=status.HTTP_204_NO_CONTENT
)
def delete_recording(
    meeting_id: UUID,
    recording_id: UUID,
    user_id: CurrentUserId,
    db: DbSession,
    storage: Storage,
):
    meetings.delete_recording(db, user_id, meeting_id, recording_id, storage)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
