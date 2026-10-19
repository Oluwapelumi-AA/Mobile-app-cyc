"""Video provider boundary for meetings and livestreams.

No provider has been chosen yet, so the app talks to one through
``VideoProvider`` and never to a vendor SDK directly. Adding a real provider
(LiveKit, Daily, Agora, Mux, 100ms, ...) means writing one class with these
methods and naming it in ``build_video_provider``:

- ``create_room`` opens a room when a host goes live.
- ``end_room`` closes it.
- ``issue_join_token`` signs a short-lived token that lets one user into one
  room with one role. Clients pass it to the provider's SDK.
- ``parse_webhook`` checks a webhook's signature and turns the provider's
  payload into a ``VideoWebhookEvent``.

``FakeVideoProvider`` (``VIDEO_PROVIDER=fake``) is the built-in stand-in for
development and tests. Its tokens are HS256 JWTs (the same shape LiveKit
uses) and its webhooks are JSON signed with HMAC-SHA256:

    X-Video-Signature: sha256=<hex HMAC of "<timestamp>.<raw body>">
    X-Video-Timestamp: <unix seconds>

    {"id": "evt_1", "type": "recording_ready", "room_id": "...",
     "occurred_at": "2026-11-01T18:00:00Z",
     "recording": {"id": "rec_1", "storage_key": "recordings/...",
                   "content_type": "video/mp4", "size_bytes": 1234,
                   "duration_seconds": 3600}}
"""

import hashlib
import hmac
import json
import secrets
import time
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from enum import Enum
from functools import lru_cache
from typing import Protocol

import jwt

from app.core.config import Settings, settings

WEBHOOK_TOLERANCE_SECONDS = 300


class VideoUnavailable(Exception):
    """No video provider is configured."""


class InvalidWebhook(Exception):
    """The webhook's signature or body is not valid."""


class ParticipantRole(str, Enum):
    # Runs the room: publishes, mutes and removes others, ends the room.
    HOST = "host"
    # Meeting participant: publishes audio and video.
    PARTICIPANT = "participant"
    # Livestream viewer: watches only.
    VIEWER = "viewer"


class WebhookEventType(str, Enum):
    ROOM_STARTED = "room_started"
    ROOM_ENDED = "room_ended"
    RECORDING_STARTED = "recording_started"
    RECORDING_READY = "recording_ready"
    RECORDING_FAILED = "recording_failed"


@dataclass(frozen=True)
class ProviderRoom:
    room_id: str


@dataclass(frozen=True)
class JoinToken:
    token: str
    server_url: str
    expires_at: datetime


@dataclass(frozen=True)
class RecordingInfo:
    recording_id: str
    # Where the provider wrote the file in our bucket, once it is ready.
    storage_key: str | None = None
    content_type: str | None = None
    size_bytes: int | None = None
    duration_seconds: int | None = None


@dataclass(frozen=True)
class VideoWebhookEvent:
    event_id: str
    # A WebhookEventType value, or the provider's own name for anything else.
    type: str
    room_id: str
    occurred_at: datetime
    recording: RecordingInfo | None = None


class VideoProvider(Protocol):
    name: str

    def create_room(self, room_name: str, *, record: bool, livestream: bool) -> ProviderRoom: ...

    def end_room(self, room_id: str) -> None: ...

    def issue_join_token(
        self,
        room_id: str,
        user_id: uuid.UUID,
        display_name: str | None,
        role: ParticipantRole,
        expires_in: int,
    ) -> JoinToken: ...

    def parse_webhook(self, body: bytes, headers: dict[str, str]) -> VideoWebhookEvent: ...


class UnconfiguredVideoProvider:
    name = "none"

    def create_room(self, room_name: str, *, record: bool, livestream: bool) -> ProviderRoom:
        raise VideoUnavailable("video is not configured")

    def end_room(self, room_id: str) -> None:
        raise VideoUnavailable("video is not configured")

    def issue_join_token(self, room_id, user_id, display_name, role, expires_in) -> JoinToken:
        raise VideoUnavailable("video is not configured")

    def parse_webhook(self, body: bytes, headers: dict[str, str]) -> VideoWebhookEvent:
        raise VideoUnavailable("video is not configured")


def sign_webhook(secret: str, body: bytes, timestamp: int) -> str:
    digest = hmac.new(secret.encode(), f"{timestamp}.".encode() + body, hashlib.sha256)
    return f"sha256={digest.hexdigest()}"


def _parse_time(value: object) -> datetime:
    if not isinstance(value, str):
        return datetime.now(UTC)
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    return parsed.replace(tzinfo=UTC) if parsed.tzinfo is None else parsed.astimezone(UTC)


class FakeVideoProvider:
    """A provider that needs no outside service. Development and tests only."""

    name = "fake"

    def __init__(self, config: Settings) -> None:
        self.server_url = config.video_server_url
        # Tokens are checked only by clients talking to the fake server, so
        # the app secret is good enough here.
        self.token_secret = config.secret_key or "fake-video-token-secret"
        self.webhook_secret = config.video_webhook_secret
        self.rooms: dict[str, dict] = {}

    def create_room(self, room_name: str, *, record: bool, livestream: bool) -> ProviderRoom:
        room_id = f"fake-{secrets.token_hex(8)}"
        self.rooms[room_id] = {
            "name": room_name,
            "record": record,
            "livestream": livestream,
            "open": True,
        }
        return ProviderRoom(room_id=room_id)

    def end_room(self, room_id: str) -> None:
        if room_id in self.rooms:
            self.rooms[room_id]["open"] = False

    def issue_join_token(
        self,
        room_id: str,
        user_id: uuid.UUID,
        display_name: str | None,
        role: ParticipantRole,
        expires_in: int,
    ) -> JoinToken:
        now = datetime.now(UTC)
        expires_at = now + timedelta(seconds=expires_in)
        claims = {
            "iss": "the-light-app",
            "sub": str(user_id),
            "name": display_name,
            "room": room_id,
            "role": role.value,
            "can_publish": role != ParticipantRole.VIEWER,
            "can_moderate": role == ParticipantRole.HOST,
            "iat": int(now.timestamp()),
            "exp": int(expires_at.timestamp()),
        }
        return JoinToken(
            token=jwt.encode(claims, self.token_secret, algorithm="HS256"),
            server_url=self.server_url,
            expires_at=expires_at,
        )

    def parse_webhook(self, body: bytes, headers: dict[str, str]) -> VideoWebhookEvent:
        if not self.webhook_secret:
            raise InvalidWebhook("VIDEO_WEBHOOK_SECRET is not set")
        headers = {name.lower(): value for name, value in headers.items()}
        try:
            timestamp = int(headers.get("x-video-timestamp", ""))
        except ValueError:
            raise InvalidWebhook("missing or bad timestamp") from None
        if abs(time.time() - timestamp) > WEBHOOK_TOLERANCE_SECONDS:
            raise InvalidWebhook("timestamp too old")
        expected = sign_webhook(self.webhook_secret, body, timestamp)
        if not hmac.compare_digest(expected, headers.get("x-video-signature", "")):
            raise InvalidWebhook("bad signature")
        try:
            payload = json.loads(body)
            recording = payload.get("recording")
            return VideoWebhookEvent(
                event_id=str(payload["id"]),
                type=str(payload["type"]),
                room_id=str(payload["room_id"]),
                occurred_at=_parse_time(payload.get("occurred_at")),
                recording=RecordingInfo(
                    recording_id=str(recording["id"]),
                    storage_key=recording.get("storage_key"),
                    content_type=recording.get("content_type"),
                    size_bytes=recording.get("size_bytes"),
                    duration_seconds=recording.get("duration_seconds"),
                )
                if recording
                else None,
            )
        except (ValueError, KeyError, TypeError, AttributeError):
            raise InvalidWebhook("malformed body") from None


def build_video_provider(config: Settings) -> VideoProvider:
    if config.video_provider == "fake":
        return FakeVideoProvider(config)
    if config.video_provider == "none":
        return UnconfiguredVideoProvider()
    raise ValueError(f"Unknown VIDEO_PROVIDER {config.video_provider!r}")


@lru_cache
def get_video_provider() -> VideoProvider:
    return build_video_provider(settings)
