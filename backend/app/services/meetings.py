"""Video meetings, livestreams, join tokens, provider webhooks and replays.

- A meeting is either a ``meeting`` (everyone talks) or a ``livestream``
  (hosts broadcast, others watch). It belongs to a community, to an event
  (and so that event's community), or is app-wide.
- Hosts are community moderators and above, plus app moderators and admins
  (``users.account_role``). Hosts create, edit, start, end, cancel and
  delete meetings, and manage replays. Only app moderators and admins create
  app-wide meetings.
- Who can see a meeting follows its community, like events. Hidden meetings
  answer 404.
- Who can join: hosts always. For a meeting, members of its community (any
  user for app-wide ones), and when it is linked to an event only people
  with a confirmed spot. For a livestream, anyone who can see it.
- Status: scheduled -> live -> ended, or scheduled -> cancelled. The
  provider room is opened when a host starts the meeting, and join tokens
  are only handed out while it is live. Each token is short-lived
  (``VIDEO_TOKEN_TTL_SECONDS``) and names one user, one room and one role.
- Provider webhooks can also start and end a meeting, and report
  recordings. Each webhook id is applied once.
- Replays are stored in object storage. Ready, published replays are seen by
  anyone who can see the meeting, through short-lived links. Hosts also see
  processing, failed and hidden ones.
"""

import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.identity import UserId
from app.models.community import (
    Community,
    CommunityMembership,
    CommunityRole,
    CommunityVisibility,
)
from app.models.event import Event, EventRegistration, EventStatus, RegistrationStatus
from app.models.meeting import (
    Meeting,
    MeetingKind,
    MeetingRecording,
    MeetingStatus,
    RecordingStatus,
    VideoWebhookReceipt,
)
from app.models.user_profile import UserProfile
from app.schemas.meeting import (
    JoinTokenRead,
    MeetingCreate,
    MeetingRead,
    MeetingUpdate,
    RecordingPlayback,
    RecordingRead,
)
from app.services import pagination
from app.services.communities import (
    get_visible_community,
    is_platform_moderator,
    rank,
    require_role,
)
from app.services.errors import (
    Conflict,
    Forbidden,
    InvalidInput,
    NotFound,
    ServiceUnavailable,
)
from app.services.object_storage import ObjectStorage, StorageUnavailable
from app.services.video_provider import (
    ParticipantRole,
    VideoProvider,
    VideoUnavailable,
    VideoWebhookEvent,
    WebhookEventType,
)

MEETING_NOT_FOUND = NotFound("meeting_not_found", "Meeting not found.")
RECORDING_NOT_FOUND = NotFound("recording_not_found", "Replay not found.")
MEETING_ENDED = Conflict("meeting_ended", "This meeting has ended.")
MEETING_CANCELLED = Conflict("meeting_cancelled", "This meeting has been cancelled.")
NOT_LIVE = Conflict("not_live", "This meeting hasn't started yet.")
VIDEO_UNAVAILABLE = ServiceUnavailable(
    "video_unavailable", "Video meetings are not available right now."
)
STORAGE_UNAVAILABLE = ServiceUnavailable(
    "storage_unavailable", "Replays are not available right now."
)

SCHEDULED = MeetingStatus.SCHEDULED.value
LIVE = MeetingStatus.LIVE.value
ENDED = MeetingStatus.ENDED.value
CANCELLED = MeetingStatus.CANCELLED.value


def _now() -> datetime:
    return datetime.now(UTC)


def _utc(value: datetime) -> datetime:
    # SQLite drops tzinfo on read; stored values are always UTC.
    return value.replace(tzinfo=UTC) if value.tzinfo is None else value.astimezone(UTC)


def _ensure_not_over(meeting: Meeting) -> None:
    if meeting.status == ENDED:
        raise MEETING_ENDED
    if meeting.status == CANCELLED:
        raise MEETING_CANCELLED


# Access


def _visible_meeting(
    db: Session, user_id: UserId, meeting_id: uuid.UUID
) -> tuple[Meeting, CommunityMembership | None]:
    meeting = db.get(Meeting, meeting_id)
    if meeting is None:
        raise MEETING_NOT_FOUND
    if meeting.community_id is None:
        return meeting, None
    try:
        _, membership = get_visible_community(db, meeting.community_id, user_id)
    except NotFound:
        raise MEETING_NOT_FOUND from None
    return meeting, membership


def _can_host(
    community_id: uuid.UUID | None, membership_role: str | None, platform_moderator: bool
) -> bool:
    if platform_moderator:
        return True
    return community_id is not None and rank(membership_role) >= rank(CommunityRole.MODERATOR)


def _require_host(
    db: Session, user_id: UserId, meeting: Meeting, membership: CommunityMembership | None
) -> None:
    if is_platform_moderator(db, user_id):
        return
    if meeting.community_id is None:
        raise Forbidden(
            "insufficient_role", "Only app moderators and admins host app-wide meetings."
        )
    require_role(membership, CommunityRole.MODERATOR)


def _has_event_spot(db: Session, event_id: uuid.UUID, user_id: UserId) -> bool:
    return (
        db.scalar(
            select(EventRegistration.id).where(
                EventRegistration.event_id == event_id,
                EventRegistration.user_id == user_id,
                EventRegistration.status == RegistrationStatus.REGISTERED.value,
            )
        )
        is not None
    )


def _join_refusal(
    db: Session,
    user_id: UserId,
    meeting: Meeting,
    membership_role: str | None,
    is_host: bool,
) -> Forbidden | None:
    """Why the user may not join, or None when they may."""
    if is_host or meeting.kind == MeetingKind.LIVESTREAM.value:
        return None
    if meeting.community_id is not None and membership_role is None:
        return Forbidden("membership_required", "Join this community first.")
    if meeting.event_id is not None and not _has_event_spot(db, meeting.event_id, user_id):
        return Forbidden(
            "registration_required", "Sign up for the event to join this meeting."
        )
    return None


def _lock_meeting(db: Session, meeting_id: uuid.UUID) -> Meeting:
    """Reload the meeting and lock its row until commit (PostgreSQL), so two
    hosts pressing start at once open one room."""
    return db.scalars(
        select(Meeting)
        .where(Meeting.id == meeting_id)
        .with_for_update()
        .execution_options(populate_existing=True)
    ).one()


# Reading


def _to_read(meeting: Meeting, can_host: bool, can_join: bool) -> MeetingRead:
    return MeetingRead.model_validate(
        {
            "id": meeting.id,
            "kind": meeting.kind,
            "community_id": meeting.community_id,
            "event_id": meeting.event_id,
            "created_by": meeting.created_by,
            "title": meeting.title,
            "description": meeting.description,
            "status": meeting.status,
            "scheduled_start_at": meeting.scheduled_start_at,
            "recording_enabled": meeting.recording_enabled,
            "started_at": meeting.started_at,
            "ended_at": meeting.ended_at,
            "can_host": can_host,
            "can_join": can_join,
            "created_at": meeting.created_at,
            "updated_at": meeting.updated_at,
        }
    )


def meeting_read(
    db: Session, user_id: UserId, meeting: Meeting, membership: CommunityMembership | None
) -> MeetingRead:
    role = membership.role if membership else None
    can_host = _can_host(meeting.community_id, role, is_platform_moderator(db, user_id))
    refusal = _join_refusal(db, user_id, meeting, role, can_host)
    return _to_read(meeting, can_host, refusal is None)


def get_meeting(db: Session, user_id: UserId, meeting_id: uuid.UUID) -> MeetingRead:
    meeting, membership = _visible_meeting(db, user_id, meeting_id)
    return meeting_read(db, user_id, meeting, membership)


def list_meetings(
    db: Session,
    user_id: UserId,
    limit: int,
    cursor: str | None,
    *,
    community_id: uuid.UUID | None = None,
    event_id: uuid.UUID | None = None,
    status: MeetingStatus | None = None,
    kind: MeetingKind | None = None,
) -> tuple[list[MeetingRead], str | None]:
    """Meetings the user can see, newest first."""
    my_communities = select(CommunityMembership.community_id).where(
        CommunityMembership.user_id == user_id
    )
    public_communities = select(Community.id).where(
        Community.visibility == CommunityVisibility.PUBLIC.value
    )
    statement = select(Meeting)
    if community_id is not None:
        get_visible_community(db, community_id, user_id)
        statement = statement.where(Meeting.community_id == community_id)
    else:
        statement = statement.where(
            or_(
                Meeting.community_id.is_(None),
                Meeting.community_id.in_(public_communities),
                Meeting.community_id.in_(my_communities),
            )
        )
    if event_id is not None:
        statement = statement.where(Meeting.event_id == event_id)
    if status is not None:
        statement = statement.where(Meeting.status == status.value)
    if kind is not None:
        statement = statement.where(Meeting.kind == kind.value)
    if cursor:
        statement = statement.where(
            pagination.after_cursor(Meeting.created_at, Meeting.id, cursor, newest_first=True)
        )
    statement = statement.order_by(
        *pagination.order_by(Meeting.created_at, Meeting.id, newest_first=True)
    ).limit(limit + 1)

    rows, next_cursor = pagination.split_page(list(db.scalars(statement)), limit)
    community_ids = {row.community_id for row in rows if row.community_id is not None}
    my_roles = (
        dict(
            db.execute(
                select(CommunityMembership.community_id, CommunityMembership.role).where(
                    CommunityMembership.user_id == user_id,
                    CommunityMembership.community_id.in_(community_ids),
                )
            ).all()
        )
        if community_ids
        else {}
    )
    event_ids = {row.event_id for row in rows if row.event_id is not None}
    my_spots = (
        set(
            db.scalars(
                select(EventRegistration.event_id).where(
                    EventRegistration.user_id == user_id,
                    EventRegistration.status == RegistrationStatus.REGISTERED.value,
                    EventRegistration.event_id.in_(event_ids),
                )
            )
        )
        if event_ids
        else set()
    )
    platform_moderator = is_platform_moderator(db, user_id)
    items = []
    for row in rows:
        role = my_roles.get(row.community_id)
        can_host = _can_host(row.community_id, role, platform_moderator)
        can_join = (
            can_host
            or row.kind == MeetingKind.LIVESTREAM.value
            or (
                (row.community_id is None or role is not None)
                and (row.event_id is None or row.event_id in my_spots)
            )
        )
        items.append(_to_read(row, can_host, can_join))
    return items, next_cursor


# Managing meetings


def create_meeting(db: Session, user_id: UserId, data: MeetingCreate) -> MeetingRead:
    community_id = data.community_id
    scheduled_start_at = data.scheduled_start_at
    if data.event_id is not None:
        event = db.get(Event, data.event_id)
        if event is None:
            raise NotFound("event_not_found", "Event not found.")
        if event.community_id is not None:
            try:
                get_visible_community(db, event.community_id, user_id)
            except NotFound:
                raise NotFound("event_not_found", "Event not found.") from None
        if community_id is not None and community_id != event.community_id:
            raise InvalidInput(
                "community_mismatch", "The event belongs to a different community."
            )
        if event.status == EventStatus.CANCELLED.value:
            raise Conflict("event_cancelled", "This event has been cancelled.")
        community_id = event.community_id
        if scheduled_start_at is None:
            scheduled_start_at = event.starts_at

    if community_id is not None:
        _, membership = get_visible_community(db, community_id, user_id)
        if not is_platform_moderator(db, user_id):
            require_role(membership, CommunityRole.MODERATOR)
    elif not is_platform_moderator(db, user_id):
        raise Forbidden(
            "insufficient_role", "Only app moderators and admins create app-wide meetings."
        )

    meeting = Meeting(
        kind=data.kind.value,
        community_id=community_id,
        event_id=data.event_id,
        created_by=user_id,
        title=data.title,
        description=data.description or None,
        scheduled_start_at=_utc(scheduled_start_at) if scheduled_start_at else None,
        recording_enabled=data.recording_enabled,
    )
    db.add(meeting)
    db.commit()
    db.refresh(meeting)
    return _to_read(meeting, True, True)


def update_meeting(
    db: Session, user_id: UserId, meeting_id: uuid.UUID, data: MeetingUpdate
) -> MeetingRead:
    meeting, membership = _visible_meeting(db, user_id, meeting_id)
    _require_host(db, user_id, meeting, membership)
    _ensure_not_over(meeting)
    changes = data.model_dump(exclude_unset=True)
    if changes.get("title") is not None:
        meeting.title = changes["title"]
    if "description" in changes:
        meeting.description = changes["description"] or None
    if "scheduled_start_at" in changes:
        value = changes["scheduled_start_at"]
        meeting.scheduled_start_at = _utc(value) if value else None
    if changes.get("recording_enabled") is not None:
        meeting.recording_enabled = changes["recording_enabled"]
    db.commit()
    db.refresh(meeting)
    return meeting_read(db, user_id, meeting, membership)


def start_meeting(
    db: Session, user_id: UserId, meeting_id: uuid.UUID, provider: VideoProvider
) -> MeetingRead:
    """Open the provider room and go live. Starting a live meeting is a no-op."""
    meeting, membership = _visible_meeting(db, user_id, meeting_id)
    _require_host(db, user_id, meeting, membership)
    meeting = _lock_meeting(db, meeting.id)
    _ensure_not_over(meeting)
    if meeting.status == SCHEDULED:
        try:
            room = provider.create_room(
                f"meeting-{meeting.id}",
                record=meeting.recording_enabled,
                livestream=meeting.kind == MeetingKind.LIVESTREAM.value,
            )
        except VideoUnavailable:
            raise VIDEO_UNAVAILABLE from None
        meeting.provider = provider.name
        meeting.provider_room_id = room.room_id
        meeting.status = LIVE
        meeting.started_at = _now()
        db.commit()
        db.refresh(meeting)
    return meeting_read(db, user_id, meeting, membership)


def _close_room(meeting: Meeting, provider: VideoProvider) -> None:
    if meeting.provider_room_id and meeting.provider == provider.name:
        try:
            provider.end_room(meeting.provider_room_id)
        except VideoUnavailable:
            raise VIDEO_UNAVAILABLE from None


def end_meeting(
    db: Session, user_id: UserId, meeting_id: uuid.UUID, provider: VideoProvider
) -> MeetingRead:
    meeting, membership = _visible_meeting(db, user_id, meeting_id)
    _require_host(db, user_id, meeting, membership)
    meeting = _lock_meeting(db, meeting.id)
    _ensure_not_over(meeting)
    if meeting.status != LIVE:
        raise NOT_LIVE
    _close_room(meeting, provider)
    meeting.status = ENDED
    meeting.ended_at = _now()
    db.commit()
    db.refresh(meeting)
    return meeting_read(db, user_id, meeting, membership)


def cancel_meeting(db: Session, user_id: UserId, meeting_id: uuid.UUID) -> MeetingRead:
    meeting, membership = _visible_meeting(db, user_id, meeting_id)
    _require_host(db, user_id, meeting, membership)
    meeting = _lock_meeting(db, meeting.id)
    _ensure_not_over(meeting)
    if meeting.status == LIVE:
        raise Conflict("meeting_live", "This meeting is live. End it instead.")
    meeting.status = CANCELLED
    db.commit()
    db.refresh(meeting)
    return meeting_read(db, user_id, meeting, membership)


def delete_meeting(
    db: Session,
    user_id: UserId,
    meeting_id: uuid.UUID,
    provider: VideoProvider,
    storage: ObjectStorage,
) -> None:
    """Delete the meeting and its replays (files included). A live meeting's
    room is closed first."""
    meeting, membership = _visible_meeting(db, user_id, meeting_id)
    _require_host(db, user_id, meeting, membership)
    if meeting.status == LIVE:
        _close_room(meeting, provider)
    recordings = list(
        db.scalars(select(MeetingRecording).where(MeetingRecording.meeting_id == meeting.id))
    )
    for recording in recordings:
        _delete_file(storage, recording)
    db.execute(
        MeetingRecording.__table__.delete().where(MeetingRecording.meeting_id == meeting.id)
    )
    db.delete(meeting)
    db.commit()


# Joining


def issue_join_token(
    db: Session, user_id: UserId, meeting_id: uuid.UUID, provider: VideoProvider
) -> JoinTokenRead:
    meeting, membership = _visible_meeting(db, user_id, meeting_id)
    _ensure_not_over(meeting)
    if meeting.status != LIVE:
        raise NOT_LIVE
    role_name = membership.role if membership else None
    is_host = _can_host(meeting.community_id, role_name, is_platform_moderator(db, user_id))
    refusal = _join_refusal(db, user_id, meeting, role_name, is_host)
    if refusal is not None:
        raise refusal
    if meeting.provider != provider.name or not meeting.provider_room_id:
        # The meeting went live on a provider this server no longer uses.
        raise VIDEO_UNAVAILABLE

    if is_host:
        role = ParticipantRole.HOST
    elif meeting.kind == MeetingKind.LIVESTREAM.value:
        role = ParticipantRole.VIEWER
    else:
        role = ParticipantRole.PARTICIPANT
    display_name = db.scalar(
        select(UserProfile.display_name).where(UserProfile.user_id == user_id)
    )
    try:
        token = provider.issue_join_token(
            meeting.provider_room_id,
            user_id,
            display_name,
            role,
            settings.video_token_ttl_seconds,
        )
    except VideoUnavailable:
        raise VIDEO_UNAVAILABLE from None
    return JoinTokenRead(
        meeting_id=meeting.id,
        provider=provider.name,
        room_id=meeting.provider_room_id,
        role=role,
        token=token.token,
        server_url=token.server_url,
        expires_at=token.expires_at,
    )


# Replays


def _recording_read(recording: MeetingRecording) -> RecordingRead:
    return RecordingRead.model_validate(recording, from_attributes=True)


def _host_for(
    db: Session, user_id: UserId, meeting: Meeting, membership: CommunityMembership | None
) -> bool:
    return _can_host(
        meeting.community_id,
        membership.role if membership else None,
        is_platform_moderator(db, user_id),
    )


def _is_watchable(recording: MeetingRecording) -> bool:
    return recording.status == RecordingStatus.READY.value and recording.published


def list_recordings(
    db: Session, user_id: UserId, meeting_id: uuid.UUID
) -> list[RecordingRead]:
    """A meeting's replays, oldest first. Hosts also see unfinished and
    hidden ones."""
    meeting, membership = _visible_meeting(db, user_id, meeting_id)
    is_host = _host_for(db, user_id, meeting, membership)
    rows = db.scalars(
        select(MeetingRecording)
        .where(MeetingRecording.meeting_id == meeting.id)
        .order_by(MeetingRecording.created_at, MeetingRecording.id)
    )
    return [_recording_read(row) for row in rows if is_host or _is_watchable(row)]


def _visible_recording(
    db: Session, user_id: UserId, meeting_id: uuid.UUID, recording_id: uuid.UUID
) -> tuple[MeetingRecording, Meeting, CommunityMembership | None, bool]:
    meeting, membership = _visible_meeting(db, user_id, meeting_id)
    recording = db.get(MeetingRecording, recording_id)
    if recording is None or recording.meeting_id != meeting.id:
        raise RECORDING_NOT_FOUND
    is_host = _host_for(db, user_id, meeting, membership)
    if not is_host and not _is_watchable(recording):
        raise RECORDING_NOT_FOUND
    return recording, meeting, membership, is_host


def get_recording_playback(
    db: Session,
    user_id: UserId,
    meeting_id: uuid.UUID,
    recording_id: uuid.UUID,
    storage: ObjectStorage,
) -> RecordingPlayback:
    recording, *_ = _visible_recording(db, user_id, meeting_id, recording_id)
    if recording.status != RecordingStatus.READY.value or not recording.storage_key:
        raise Conflict("recording_not_ready", "This replay isn't ready yet.")
    expires_in = settings.storage_presign_ttl_seconds
    try:
        url = storage.presign_download(recording.storage_key, expires_in)
    except StorageUnavailable:
        raise STORAGE_UNAVAILABLE from None
    return RecordingPlayback.model_validate(
        {
            **_recording_read(recording).model_dump(),
            "playback_url": url,
            "playback_expires_at": _now() + timedelta(seconds=expires_in),
        }
    )


def set_recording_published(
    db: Session,
    user_id: UserId,
    meeting_id: uuid.UUID,
    recording_id: uuid.UUID,
    published: bool,
) -> RecordingRead:
    recording, meeting, membership, _ = _visible_recording(
        db, user_id, meeting_id, recording_id
    )
    _require_host(db, user_id, meeting, membership)
    recording.published = published
    db.commit()
    db.refresh(recording)
    return _recording_read(recording)


def _delete_file(storage: ObjectStorage, recording: MeetingRecording) -> None:
    if not recording.storage_key:
        return
    try:
        storage.delete(recording.storage_key)
    except StorageUnavailable:
        # Nothing to delete from when storage is off.
        pass


def delete_recording(
    db: Session,
    user_id: UserId,
    meeting_id: uuid.UUID,
    recording_id: uuid.UUID,
    storage: ObjectStorage,
) -> None:
    recording, meeting, membership, _ = _visible_recording(
        db, user_id, meeting_id, recording_id
    )
    _require_host(db, user_id, meeting, membership)
    _delete_file(storage, recording)
    db.delete(recording)
    db.commit()


# Provider webhooks


def _upsert_recording(
    db: Session, meeting: Meeting, provider_name: str, event: VideoWebhookEvent
) -> None:
    info = event.recording
    if info is None:
        return
    recording = db.scalar(
        select(MeetingRecording).where(
            MeetingRecording.provider == provider_name,
            MeetingRecording.provider_recording_id == info.recording_id,
        )
    )
    if recording is None:
        recording = MeetingRecording(
            meeting_id=meeting.id,
            provider=provider_name,
            provider_recording_id=info.recording_id,
            status=RecordingStatus.PROCESSING.value,
        )
        db.add(recording)

    if event.type == WebhookEventType.RECORDING_READY.value:
        recording.status = RecordingStatus.READY.value
    elif event.type == WebhookEventType.RECORDING_FAILED.value:
        # A late failure report never hides a replay that is already ready.
        if recording.status != RecordingStatus.READY.value:
            recording.status = RecordingStatus.FAILED.value
    for name in ("storage_key", "content_type", "size_bytes", "duration_seconds"):
        value = getattr(info, name)
        if value is not None:
            setattr(recording, name, value)


def handle_webhook(db: Session, provider: VideoProvider, event: VideoWebhookEvent) -> str:
    """Apply one provider event. Returns ``processed``, ``duplicate`` or
    ``ignored`` (an unknown room or event type)."""
    db.add(
        VideoWebhookReceipt(provider=provider.name, event_id=event.event_id, event_type=event.type)
    )
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        return "duplicate"

    meeting = db.scalar(
        select(Meeting)
        .where(Meeting.provider == provider.name, Meeting.provider_room_id == event.room_id)
        .with_for_update()
    )
    known_types = {item.value for item in WebhookEventType}
    if meeting is None or event.type not in known_types:
        db.commit()
        return "ignored"

    if event.type == WebhookEventType.ROOM_STARTED.value:
        if meeting.status == SCHEDULED:
            meeting.status = LIVE
        if meeting.started_at is None:
            meeting.started_at = event.occurred_at
    elif event.type == WebhookEventType.ROOM_ENDED.value:
        if meeting.status == LIVE:
            meeting.status = ENDED
            meeting.ended_at = event.occurred_at
    else:
        _upsert_recording(db, meeting, provider.name, event)
    try:
        db.commit()
    except IntegrityError:
        # The same retried webhook was applied by another worker meanwhile.
        db.rollback()
        return "duplicate"
    return "processed"
