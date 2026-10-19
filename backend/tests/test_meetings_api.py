import json
import time
import uuid
from datetime import UTC, datetime, timedelta

import jwt
import pytest

from app.core.config import settings
from app.models import AccountRole, Meeting, MeetingRecording
from app.services.object_storage import InMemoryObjectStorage, get_object_storage
from app.services.video_provider import FakeVideoProvider, get_video_provider, sign_webhook

COMMUNITIES = "/api/v1/communities"
EVENTS = "/api/v1/events"
MEETINGS = "/api/v1/meetings"
WEBHOOK = "/api/v1/webhooks/video"
WEBHOOK_SECRET = "test-webhook-secret"


@pytest.fixture
def video(api):
    """The fake video provider and in-memory storage, wired into the app."""
    from app.main import app

    provider = FakeVideoProvider(settings.model_copy(update={"video_webhook_secret": WEBHOOK_SECRET}))
    storage = InMemoryObjectStorage()
    app.dependency_overrides[get_video_provider] = lambda: provider
    app.dependency_overrides[get_object_storage] = lambda: storage
    try:
        yield provider, storage
    finally:
        app.dependency_overrides.pop(get_video_provider, None)
        app.dependency_overrides.pop(get_object_storage, None)


@pytest.fixture
def world(api, video):
    """A public community with an owner, a moderator and two members."""
    ids = {name: api.add_user(name) for name in ("owner", "mod", "alice", "bob", "outsider")}
    ids["staff"] = api.add_user("staff", AccountRole.MODERATOR)
    api.act_as(ids["owner"])
    cid = api.client.post(COMMUNITIES, json={"name": "Abuja Fellowship"}).json()["id"]
    for name in ("mod", "alice", "bob"):
        api.act_as(ids[name])
        api.client.post(f"{COMMUNITIES}/{cid}/join")
    api.act_as(ids["owner"])
    api.client.patch(f"{COMMUNITIES}/{cid}/members/{ids['mod']}", json={"role": "moderator"})
    return {"community_id": cid, **ids}


def create_meeting(api, user_id, world=None, **overrides):
    api.act_as(user_id)
    payload = {"title": "Bible Study"}
    if world is not None:
        payload["community_id"] = world["community_id"]
    payload.update(overrides)
    response = api.client.post(MEETINGS, json=payload)
    assert response.status_code == 201, response.text
    return response.json()


def start(api, user_id, meeting_id):
    api.act_as(user_id)
    response = api.client.post(f"{MEETINGS}/{meeting_id}/start")
    assert response.status_code == 200, response.text
    return response.json()


def token(api, user_id, meeting_id):
    api.act_as(user_id)
    return api.client.post(f"{MEETINGS}/{meeting_id}/token")


def room_id(api, meeting_id):
    with api.session_factory() as db:
        return db.get(Meeting, uuid.UUID(meeting_id)).provider_room_id


def send_webhook(api, payload, secret=WEBHOOK_SECRET, timestamp=None):
    body = json.dumps(payload).encode()
    timestamp = int(time.time()) if timestamp is None else timestamp
    return api.client.post(
        WEBHOOK,
        content=body,
        headers={
            "Content-Type": "application/json",
            "X-Video-Timestamp": str(timestamp),
            "X-Video-Signature": sign_webhook(secret, body, timestamp),
        },
    )


def create_event(api, user_id, world, capacity=None):
    api.act_as(user_id)
    starts = (datetime.now(UTC) + timedelta(days=3)).replace(microsecond=0)
    response = api.client.post(
        EVENTS,
        json={
            "community_id": world["community_id"],
            "title": "Youth Prayer Night",
            "starts_at": starts.isoformat(),
            "ends_at": (starts + timedelta(hours=2)).isoformat(),
            "timezone": "Africa/Lagos",
            "capacity": capacity,
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


# Creating


def test_moderator_creates_community_meeting(api, world):
    api.act_as(world["mod"])
    response = api.client.post(
        MEETINGS,
        json={
            "community_id": world["community_id"],
            "title": "  Bible Study ",
            "description": "John 3",
            "recording_enabled": True,
        },
    )
    assert response.status_code == 201
    body = response.json()
    assert body["title"] == "Bible Study"
    assert body["kind"] == "meeting"
    assert body["status"] == "scheduled"
    assert body["recording_enabled"] is True
    assert body["created_by"] == str(world["mod"])
    assert body["can_host"] is True
    assert body["started_at"] is None


@pytest.mark.parametrize(
    ("who", "code"), [("alice", "insufficient_role"), ("outsider", "membership_required")]
)
def test_members_and_outsiders_cannot_create_meetings(api, world, who, code):
    api.act_as(world[who])
    response = api.client.post(
        MEETINGS, json={"community_id": world["community_id"], "title": "Bible Study"}
    )
    assert response.status_code == 403
    assert response.json()["detail"]["code"] == code


def test_only_app_moderators_create_app_wide_meetings(api, world):
    api.act_as(world["owner"])
    response = api.client.post(MEETINGS, json={"title": "Global Prayer", "kind": "livestream"})
    assert response.status_code == 403
    app_wide = create_meeting(api, world["staff"], title="Global Prayer", kind="livestream")
    assert app_wide["community_id"] is None
    assert app_wide["kind"] == "livestream"


def test_meeting_for_event_takes_its_community_and_start(api, world):
    event = create_event(api, world["mod"], world)
    meeting = create_meeting(api, world["mod"], event_id=event["id"])
    assert meeting["community_id"] == world["community_id"]
    assert meeting["event_id"] == event["id"]
    assert meeting["scheduled_start_at"] == event["starts_at"]


def test_meeting_for_event_rejects_other_community(api, world):
    event = create_event(api, world["mod"], world)
    api.act_as(world["outsider"])
    other = api.client.post(COMMUNITIES, json={"name": "Other Fellowship"}).json()["id"]
    response = api.client.post(
        MEETINGS, json={"title": "Bible Study", "event_id": event["id"], "community_id": other}
    )
    assert response.status_code == 400
    assert response.json()["detail"]["code"] == "community_mismatch"


def test_meeting_for_event_needs_event_organizer(api, world):
    event = create_event(api, world["mod"], world)
    api.act_as(world["alice"])
    response = api.client.post(MEETINGS, json={"title": "Bible Study", "event_id": event["id"]})
    assert response.status_code == 403


def test_meeting_for_cancelled_event_is_refused(api, world):
    event = create_event(api, world["mod"], world)
    api.client.post(f"{EVENTS}/{event['id']}/cancel")
    response = api.client.post(MEETINGS, json={"title": "Bible Study", "event_id": event["id"]})
    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "event_cancelled"


def test_unknown_event_is_404(api, world):
    api.act_as(world["mod"])
    response = api.client.post(MEETINGS, json={"title": "Bible Study", "event_id": str(uuid.uuid4())})
    assert response.status_code == 404


# Seeing


def test_private_community_meetings_are_hidden(api, world):
    api.act_as(world["owner"])
    private = api.client.post(
        COMMUNITIES, json={"name": "Leaders", "visibility": "private"}
    ).json()["id"]
    meeting = create_meeting(api, world["owner"], community_id=private)
    api.act_as(world["outsider"])
    assert api.client.get(f"{MEETINGS}/{meeting['id']}").status_code == 404
    listed = api.client.get(MEETINGS).json()["items"]
    assert meeting["id"] not in [item["id"] for item in listed]
    api.act_as(world["owner"])
    assert api.client.get(f"{MEETINGS}/{meeting['id']}").status_code == 200


def test_list_filters_and_pages(api, world):
    first = create_meeting(api, world["mod"], world, title="First meeting")
    second = create_meeting(api, world["mod"], world, title="Second stream", kind="livestream")
    start(api, world["mod"], second["id"])
    api.act_as(world["alice"])

    page = api.client.get(MEETINGS, params={"limit": 1}).json()
    assert [item["id"] for item in page["items"]] == [second["id"]]
    rest = api.client.get(MEETINGS, params={"limit": 1, "cursor": page["next_cursor"]}).json()
    assert [item["id"] for item in rest["items"]] == [first["id"]]

    live = api.client.get(MEETINGS, params={"status": "live"}).json()["items"]
    assert [item["id"] for item in live] == [second["id"]]
    meetings_only = api.client.get(MEETINGS, params={"kind": "meeting"}).json()["items"]
    assert [item["id"] for item in meetings_only] == [first["id"]]
    by_community = api.client.get(
        MEETINGS, params={"community_id": world["community_id"]}
    ).json()["items"]
    assert len(by_community) == 2


def test_list_shows_can_join_per_event_spot(api, world):
    event = create_event(api, world["mod"], world)
    meeting = create_meeting(api, world["mod"], event_id=event["id"])
    api.act_as(world["alice"])
    api.client.post(f"{EVENTS}/{event['id']}/registrations")
    listed = api.client.get(MEETINGS, params={"event_id": event["id"]}).json()["items"]
    assert listed[0]["can_join"] is True
    api.act_as(world["bob"])
    listed = api.client.get(MEETINGS, params={"event_id": event["id"]}).json()["items"]
    assert listed[0]["can_join"] is False
    assert listed[0]["id"] == meeting["id"]


# Going live and joining


def test_start_opens_a_provider_room(api, world, video):
    provider, _ = video
    meeting = create_meeting(api, world["mod"], world, recording_enabled=True)
    live = start(api, world["mod"], meeting["id"])
    assert live["status"] == "live"
    assert live["started_at"] is not None
    room = room_id(api, meeting["id"])
    assert provider.rooms[room]["record"] is True
    assert provider.rooms[room]["open"] is True
    # Starting again is harmless and keeps the same room.
    start(api, world["mod"], meeting["id"])
    assert room_id(api, meeting["id"]) == room
    assert len(provider.rooms) == 1


def test_members_cannot_start(api, world):
    meeting = create_meeting(api, world["mod"], world)
    api.act_as(world["alice"])
    assert api.client.post(f"{MEETINGS}/{meeting['id']}/start").status_code == 403


def test_no_tokens_before_live(api, world):
    meeting = create_meeting(api, world["mod"], world)
    response = token(api, world["alice"], meeting["id"])
    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "not_live"


def test_join_tokens_are_short_lived_and_scoped(api, world):
    meeting = create_meeting(api, world["mod"], world)
    start(api, world["mod"], meeting["id"])
    api.act_as(world["alice"])
    api.client.post("/api/v1/profiles/me", json={"display_name": "Alice"})

    response = token(api, world["alice"], meeting["id"])
    assert response.status_code == 200
    body = response.json()
    assert body["role"] == "participant"
    assert body["provider"] == "fake"
    assert body["room_id"] == room_id(api, meeting["id"])
    assert body["server_url"] == settings.video_server_url
    claims = jwt.decode(body["token"], settings.secret_key, algorithms=["HS256"])
    assert claims["sub"] == str(world["alice"])
    assert claims["room"] == body["room_id"]
    assert claims["name"] == "Alice"
    assert claims["can_publish"] is True
    assert claims["can_moderate"] is False
    assert claims["exp"] - claims["iat"] == settings.video_token_ttl_seconds


def test_hosts_get_host_tokens(api, world):
    meeting = create_meeting(api, world["mod"], world)
    start(api, world["mod"], meeting["id"])
    for who in ("mod", "owner", "staff"):
        body = token(api, world[who], meeting["id"]).json()
        assert body["role"] == "host"
        claims = jwt.decode(body["token"], settings.secret_key, algorithms=["HS256"])
        assert claims["can_moderate"] is True


def test_meeting_needs_membership(api, world):
    meeting = create_meeting(api, world["mod"], world)
    start(api, world["mod"], meeting["id"])
    response = token(api, world["outsider"], meeting["id"])
    assert response.status_code == 403
    assert response.json()["detail"]["code"] == "membership_required"
    api.act_as(world["outsider"])
    assert api.client.get(f"{MEETINGS}/{meeting['id']}").json()["can_join"] is False


def test_livestream_viewers_can_watch_without_joining(api, world):
    meeting = create_meeting(api, world["mod"], world, kind="livestream")
    start(api, world["mod"], meeting["id"])
    response = token(api, world["outsider"], meeting["id"])
    assert response.status_code == 200
    body = response.json()
    assert body["role"] == "viewer"
    claims = jwt.decode(body["token"], settings.secret_key, algorithms=["HS256"])
    assert claims["can_publish"] is False


def test_event_meeting_needs_a_confirmed_spot(api, world):
    event = create_event(api, world["mod"], world, capacity=1)
    meeting = create_meeting(api, world["mod"], event_id=event["id"])
    start(api, world["mod"], meeting["id"])
    api.act_as(world["alice"])
    api.client.post(f"{EVENTS}/{event['id']}/registrations")
    api.act_as(world["bob"])
    assert api.client.post(f"{EVENTS}/{event['id']}/registrations").json()["status"] == "waitlisted"

    assert token(api, world["alice"], meeting["id"]).status_code == 200
    waitlisted = token(api, world["bob"], meeting["id"])
    assert waitlisted.status_code == 403
    assert waitlisted.json()["detail"]["code"] == "registration_required"
    assert token(api, world["mod"], meeting["id"]).json()["role"] == "host"


def test_app_wide_meeting_is_open_to_everyone(api, world):
    meeting = create_meeting(api, world["staff"], title="Global Prayer")
    start(api, world["staff"], meeting["id"])
    assert token(api, world["outsider"], meeting["id"]).json()["role"] == "participant"


def test_video_off_answers_503(api, world):
    from app.main import app
    from app.services.video_provider import UnconfiguredVideoProvider

    app.dependency_overrides[get_video_provider] = UnconfiguredVideoProvider
    meeting = create_meeting(api, world["mod"], world)
    api.act_as(world["mod"])
    response = api.client.post(f"{MEETINGS}/{meeting['id']}/start")
    assert response.status_code == 503
    assert response.json()["detail"]["code"] == "video_unavailable"


# Ending, cancelling, editing, deleting


def test_end_closes_the_room_and_stops_tokens(api, world, video):
    provider, _ = video
    meeting = create_meeting(api, world["mod"], world)
    start(api, world["mod"], meeting["id"])
    room = room_id(api, meeting["id"])
    response = api.client.post(f"{MEETINGS}/{meeting['id']}/end")
    assert response.status_code == 200
    assert response.json()["status"] == "ended"
    assert response.json()["ended_at"] is not None
    assert provider.rooms[room]["open"] is False

    assert token(api, world["alice"], meeting["id"]).json()["detail"]["code"] == "meeting_ended"
    api.act_as(world["mod"])
    assert api.client.post(f"{MEETINGS}/{meeting['id']}/start").status_code == 409


def test_end_needs_live(api, world):
    meeting = create_meeting(api, world["mod"], world)
    response = api.client.post(f"{MEETINGS}/{meeting['id']}/end")
    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "not_live"


def test_cancel_only_before_live(api, world):
    scheduled = create_meeting(api, world["mod"], world)
    response = api.client.post(f"{MEETINGS}/{scheduled['id']}/cancel")
    assert response.json()["status"] == "cancelled"
    assert api.client.post(f"{MEETINGS}/{scheduled['id']}/start").json()["detail"]["code"] == (
        "meeting_cancelled"
    )

    live = create_meeting(api, world["mod"], world)
    start(api, world["mod"], live["id"])
    response = api.client.post(f"{MEETINGS}/{live['id']}/cancel")
    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "meeting_live"


def test_hosts_edit_meetings(api, world):
    meeting = create_meeting(api, world["mod"], world)
    response = api.client.patch(
        f"{MEETINGS}/{meeting['id']}",
        json={"title": "Bible Study (John)", "description": "", "recording_enabled": True},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["title"] == "Bible Study (John)"
    assert body["description"] is None
    assert body["recording_enabled"] is True
    api.act_as(world["alice"])
    assert api.client.patch(f"{MEETINGS}/{meeting['id']}", json={"title": "Mine"}).status_code == 403


def test_delete_closes_live_room_and_removes_replays(api, world, video):
    provider, storage = video
    meeting = create_meeting(api, world["mod"], world)
    start(api, world["mod"], meeting["id"])
    room = room_id(api, meeting["id"])
    storage.put("recordings/one.mp4", "video/mp4", 100)
    send_webhook(
        api,
        {
            "id": "evt_ready",
            "type": "recording_ready",
            "room_id": room,
            "recording": {"id": "rec_1", "storage_key": "recordings/one.mp4"},
        },
    )
    api.act_as(world["mod"])
    assert api.client.delete(f"{MEETINGS}/{meeting['id']}").status_code == 204
    assert provider.rooms[room]["open"] is False
    assert "recordings/one.mp4" not in storage.objects
    with api.session_factory() as db:
        assert db.query(MeetingRecording).count() == 0
    assert api.client.get(f"{MEETINGS}/{meeting['id']}").status_code == 404


def test_deleting_the_event_keeps_the_meeting(api, world):
    event = create_event(api, world["mod"], world)
    meeting = create_meeting(api, world["mod"], event_id=event["id"])
    assert api.client.delete(f"{EVENTS}/{event['id']}").status_code == 204
    body = api.client.get(f"{MEETINGS}/{meeting['id']}").json()
    assert body["event_id"] is None
    assert body["community_id"] == world["community_id"]


def test_deleting_the_community_deletes_its_meetings(api, world):
    meeting = create_meeting(api, world["mod"], world)
    api.act_as(world["owner"])
    assert api.client.delete(f"{COMMUNITIES}/{world['community_id']}").status_code == 204
    with api.session_factory() as db:
        assert db.get(Meeting, uuid.UUID(meeting["id"])) is None


# Webhooks


def test_webhooks_track_room_status(api, world):
    meeting = create_meeting(api, world["mod"], world)
    start(api, world["mod"], meeting["id"])
    room = room_id(api, meeting["id"])
    response = send_webhook(
        api,
        {"id": "evt_end", "type": "room_ended", "room_id": room, "occurred_at": "2026-11-01T19:00:00Z"},
    )
    assert response.status_code == 200
    assert response.json() == {"status": "processed"}
    api.act_as(world["alice"])
    body = api.client.get(f"{MEETINGS}/{meeting['id']}").json()
    assert body["status"] == "ended"
    assert body["ended_at"] == "2026-11-01T19:00:00Z"


def test_webhook_retries_apply_once(api, world):
    meeting = create_meeting(api, world["mod"], world)
    start(api, world["mod"], meeting["id"])
    payload = {"id": "evt_1", "type": "room_ended", "room_id": room_id(api, meeting["id"])}
    assert send_webhook(api, payload).json() == {"status": "processed"}
    assert send_webhook(api, payload).json() == {"status": "duplicate"}


def test_webhooks_for_unknown_rooms_are_ignored(api, world):
    response = send_webhook(api, {"id": "evt_x", "type": "room_ended", "room_id": "nope"})
    assert response.json() == {"status": "ignored"}


@pytest.mark.parametrize(
    ("secret", "age"), [("wrong-secret", 0), (WEBHOOK_SECRET, 3600)]
)
def test_webhooks_need_a_fresh_valid_signature(api, world, secret, age):
    response = send_webhook(
        api,
        {"id": "evt_1", "type": "room_ended", "room_id": "x"},
        secret=secret,
        timestamp=int(time.time()) - age,
    )
    assert response.status_code == 401
    assert response.json()["detail"]["code"] == "invalid_webhook"


def test_malformed_webhook_is_rejected(api, world):
    body = b"not json"
    timestamp = int(time.time())
    response = api.client.post(
        WEBHOOK,
        content=body,
        headers={
            "X-Video-Timestamp": str(timestamp),
            "X-Video-Signature": sign_webhook(WEBHOOK_SECRET, body, timestamp),
        },
    )
    assert response.status_code == 401


# Replays


@pytest.fixture
def replay(api, world, video):
    """A live meeting whose recording has been reported ready."""
    _, storage = video
    meeting = create_meeting(api, world["mod"], world, recording_enabled=True)
    start(api, world["mod"], meeting["id"])
    room = room_id(api, meeting["id"])
    send_webhook(api, {"id": "evt_s", "type": "recording_started", "room_id": room, "recording": {"id": "rec_1"}})
    storage.put("recordings/rec_1.mp4", "video/mp4", 5_000)
    send_webhook(
        api,
        {
            "id": "evt_r",
            "type": "recording_ready",
            "room_id": room,
            "recording": {
                "id": "rec_1",
                "storage_key": "recordings/rec_1.mp4",
                "content_type": "video/mp4",
                "size_bytes": 5_000,
                "duration_seconds": 3600,
            },
        },
    )
    api.act_as(world["alice"])
    recordings = api.client.get(f"{MEETINGS}/{meeting['id']}/recordings").json()
    assert len(recordings) == 1
    return {"meeting": meeting, "recording": recordings[0], "room": room}


def test_ready_replay_plays_through_a_short_lived_link(api, world, replay):
    recording = replay["recording"]
    assert recording["status"] == "ready"
    assert recording["duration_seconds"] == 3600
    assert recording["size_bytes"] == 5_000
    response = api.client.get(f"{MEETINGS}/{replay['meeting']['id']}/recordings/{recording['id']}")
    assert response.status_code == 200
    body = response.json()
    assert body["playback_url"] == (
        f"https://storage.test/private/recordings/rec_1.mp4"
        f"?expires_in={settings.storage_presign_ttl_seconds}"
    )
    assert body["playback_expires_at"] is not None


def test_replays_follow_meeting_visibility(api, world):
    api.act_as(world["owner"])
    private = api.client.post(
        COMMUNITIES, json={"name": "Leaders", "visibility": "private"}
    ).json()["id"]
    meeting = create_meeting(api, world["owner"], community_id=private)
    api.act_as(world["outsider"])
    assert api.client.get(f"{MEETINGS}/{meeting['id']}/recordings").status_code == 404


def test_late_failure_does_not_hide_a_ready_replay(api, world, replay):
    send_webhook(
        api,
        {"id": "evt_f", "type": "recording_failed", "room_id": replay["room"], "recording": {"id": "rec_1"}},
    )
    api.act_as(world["alice"])
    recordings = api.client.get(f"{MEETINGS}/{replay['meeting']['id']}/recordings").json()
    assert recordings[0]["status"] == "ready"


def test_unfinished_replays_are_for_hosts_only(api, world):
    meeting = create_meeting(api, world["mod"], world, recording_enabled=True)
    start(api, world["mod"], meeting["id"])
    room = room_id(api, meeting["id"])
    send_webhook(api, {"id": "e1", "type": "recording_started", "room_id": room, "recording": {"id": "r1"}})
    send_webhook(api, {"id": "e2", "type": "recording_started", "room_id": room, "recording": {"id": "r2"}})
    send_webhook(api, {"id": "e3", "type": "recording_failed", "room_id": room, "recording": {"id": "r2"}})

    api.act_as(world["alice"])
    assert api.client.get(f"{MEETINGS}/{meeting['id']}/recordings").json() == []
    api.act_as(world["mod"])
    statuses = [r["status"] for r in api.client.get(f"{MEETINGS}/{meeting['id']}/recordings").json()]
    assert sorted(statuses) == ["failed", "processing"]
    recording_id = api.client.get(f"{MEETINGS}/{meeting['id']}/recordings").json()[0]["id"]
    response = api.client.get(f"{MEETINGS}/{meeting['id']}/recordings/{recording_id}")
    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "recording_not_ready"


def test_hosts_hide_and_show_replays(api, world, replay):
    meeting_id, recording_id = replay["meeting"]["id"], replay["recording"]["id"]
    url = f"{MEETINGS}/{meeting_id}/recordings/{recording_id}"
    api.act_as(world["alice"])
    assert api.client.patch(url, json={"published": False}).status_code == 403

    api.act_as(world["mod"])
    assert api.client.patch(url, json={"published": False}).json()["published"] is False
    api.act_as(world["alice"])
    assert api.client.get(url).status_code == 404
    assert api.client.get(f"{MEETINGS}/{meeting_id}/recordings").json() == []
    api.act_as(world["mod"])
    assert api.client.get(url).status_code == 200


def test_hosts_delete_replays_and_their_files(api, world, video, replay):
    _, storage = video
    url = f"{MEETINGS}/{replay['meeting']['id']}/recordings/{replay['recording']['id']}"
    api.act_as(world["alice"])
    assert api.client.delete(url).status_code == 403
    api.act_as(world["mod"])
    assert api.client.delete(url).status_code == 204
    assert "recordings/rec_1.mp4" not in storage.objects
    assert api.client.get(url).status_code == 404


def test_storage_off_answers_503_for_playback(api, world, replay):
    from app.main import app
    from app.services.object_storage import UnconfiguredObjectStorage

    app.dependency_overrides[get_object_storage] = UnconfiguredObjectStorage
    url = f"{MEETINGS}/{replay['meeting']['id']}/recordings/{replay['recording']['id']}"
    response = api.client.get(url)
    assert response.status_code == 503
    assert response.json()["detail"]["code"] == "storage_unavailable"
