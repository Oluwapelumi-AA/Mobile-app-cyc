
import json
import time
import uuid
from datetime import datetime, timedelta, timezone

import pytest

from app.core.config import settings
from app.models import AccountRole, Meeting, MeetingRecording, User
from app.models.branch import Chapter
from app.models.chapter_management import ChapterCoordinator
from app.models.user_profile import UserProfile
from app.models.user import MembershipStatus
from app.services.object_storage import InMemoryObjectStorage, get_object_storage
from app.services.video_provider import (
    FakeVideoProvider,
    get_video_provider,
    sign_webhook,
)

@pytest.fixture
def video(api):
    """The fake video provider and in-memory storage, wired into the app."""
    from app.main import app

    provider = FakeVideoProvider(
        settings.model_copy(
            update={"video_webhook_secret": "test-webhook-secret"}
        )
    )
    storage = InMemoryObjectStorage()

    app.dependency_overrides[get_video_provider] = lambda: provider
    app.dependency_overrides[get_object_storage] = lambda: storage

    try:
        yield provider, storage
    finally:
        app.dependency_overrides.pop(get_video_provider, None)
        app.dependency_overrides.pop(get_object_storage, None)


MEETINGS = "/api/v1/meetings"


def create_chapter(api, name="Nigeria Chapter"):
    suffix = uuid.uuid4().hex[:8]

    with api.session_factory() as db:
        chapter = Chapter(
            slug=f"{name.lower().replace(' ', '-')}-{suffix}",
            name=f"{name} {suffix}",
            country_code="NG",
            timezone="Africa/Lagos",
        )
        db.add(chapter)
        db.commit()
        db.refresh(chapter)
        return chapter.id


def create_chapter_event(api, chapter_id, coordinator_id, *, capacity=20):
    api.act_as(coordinator_id)
    starts_at = datetime.now(timezone.utc) + timedelta(days=3)
    ends_at = starts_at + timedelta(hours=2)

    response = api.client.post(
        "/api/v1/events",
        json={
            "chapter_id": str(chapter_id),
            "title": "Chapter Event",
            "description": "Event-linked meeting test",
            "starts_at": starts_at.isoformat(),
            "ends_at": ends_at.isoformat(),
            "timezone": "Africa/Lagos",
            "capacity": capacity,
        },
    )

    assert response.status_code == 201, response.text
    return response.json()


def create_profile(api, user_id, display_name="Test User"):
    with api.session_factory() as db:
        profile = UserProfile(
            user_id=user_id,
            display_name=display_name,
            onboarding_steps={},
        )
        db.add(profile)
        db.commit()


def assign_coordinator(api, chapter_id, coordinator_id):
    with api.session_factory() as db:
        db.add(
            ChapterCoordinator(
                branch_id=chapter_id,
                user_id=coordinator_id,
            )
        )
        db.commit()


def assign_official_member(api, chapter_id, user_id):
    create_profile(api, user_id)

    with api.session_factory() as db:
        user = db.get(User, user_id)
        profile = db.get(UserProfile, user_id)

        user.membership_status = MembershipStatus.MEMBER
        profile.branch_id = chapter_id

        db.commit()


def create_chapter_meeting(api, coordinator_id, chapter_id, **overrides):
    api.act_as(coordinator_id)

    payload = {
        "chapter_id": str(chapter_id),
        "title": "Chapter Bible Study",
    }
    payload.update(overrides)

    response = api.client.post(MEETINGS, json=payload)

    assert response.status_code == 201, response.text
    return response.json()


def submit_guest_request(api, guest_id, chapter_id):
    create_profile(api, guest_id)

    api.act_as(guest_id)
    response = api.client.post(
        f"/api/v1/chapters/{chapter_id}/access-requests"
    )

    assert response.status_code == 201, response.text
    return response.json()["id"]


def approve_guest_request(api, coordinator_id, request_id):
    api.act_as(coordinator_id)

    response = api.client.post(
        f"/api/v1/chapter-access-requests/{request_id}/review",
        json={"status": "approved"},
    )

    assert response.status_code == 200, response.text


def grant_meeting_access(
    api,
    coordinator_id,
    chapter_id,
    guest_id,
    meeting_id,
):
    api.act_as(coordinator_id)

    response = api.client.post(
        f"/api/v1/chapters/{chapter_id}/access-grants",
        json={
            "user_id": str(guest_id),
            "items": [
                {"meeting_id": str(meeting_id)}
            ],
        },
    )

    assert response.status_code in (200, 201), response.text
    return response.json()


def start_meeting(api, coordinator_id, meeting_id):
    api.act_as(coordinator_id)

    response = api.client.post(
        f"{MEETINGS}/{meeting_id}/start"
    )

    assert response.status_code == 200, response.text
    return response.json()


def get_token(api, user_id, meeting_id):
    api.act_as(user_id)
    return api.client.post(
        f"{MEETINGS}/{meeting_id}/token"
    )


def create_ready_recording(api, video, meeting_id):
    """Simulate the provider reporting a completed, published recording."""
    _, storage = video

    with api.session_factory() as db:
        meeting = db.get(Meeting, uuid.UUID(meeting_id))
        room_id = meeting.provider_room_id

    storage.put("recordings/chapter-replay.mp4", "video/mp4", 5_000)

    payload = {
        "id": f"chapter-recording-{uuid.uuid4().hex}",
        "type": "recording_ready",
        "room_id": room_id,
        "recording": {
            "id": f"recording-{uuid.uuid4().hex}",
            "storage_key": "recordings/chapter-replay.mp4",
            "content_type": "video/mp4",
            "size_bytes": 5_000,
            "duration_seconds": 120,
        },
    }
    body = json.dumps(payload).encode()
    timestamp = int(time.time())

    response = api.client.post(
        "/api/v1/webhooks/video",
        content=body,
        headers={
            "Content-Type": "application/json",
            "X-Video-Timestamp": str(timestamp),
            "X-Video-Signature": sign_webhook(
                "test-webhook-secret",
                body,
                timestamp,
            ),
        },
    )

    assert response.status_code == 200, response.text
    assert response.json()["status"] == "processed"

    with api.session_factory() as db:
        recording = db.query(MeetingRecording).filter_by(
            meeting_id=uuid.UUID(meeting_id)
        ).one()
        return str(recording.id)


# ---------------------------------------------------------
# Chapter meeting creation and management
# ---------------------------------------------------------


def test_chapter_coordinator_can_create_meeting(api):
    coordinator = api.add_user("coordinator")
    chapter_id = create_chapter(api)

    assign_coordinator(api, chapter_id, coordinator)

    meeting = create_chapter_meeting(
        api,
        coordinator,
        chapter_id,
    )

    assert meeting["chapter_id"] == str(chapter_id)
    assert meeting["community_id"] is None
    assert meeting["created_by"] == str(coordinator)


def test_non_coordinator_cannot_create_chapter_meeting(api):
    user_id = api.add_user("ordinary-user")
    chapter_id = create_chapter(api)

    api.act_as(user_id)

    response = api.client.post(
        MEETINGS,
        json={
            "chapter_id": str(chapter_id),
            "title": "Unauthorized Meeting",
        },
    )

    assert response.status_code == 403


def test_coordinator_can_start_own_chapter_meeting(api, video):
    coordinator = api.add_user("coordinator")
    chapter_id = create_chapter(api)

    assign_coordinator(api, chapter_id, coordinator)

    meeting = create_chapter_meeting(
        api,
        coordinator,
        chapter_id,
    )

    started = start_meeting(
        api,
        coordinator,
        meeting["id"],
    )

    assert started["status"] == "live"


def test_coordinator_cannot_manage_another_chapters_meeting(api):
    coordinator_a = api.add_user("coordinator-a")
    coordinator_b = api.add_user("coordinator-b")

    chapter_a = create_chapter(api, "Chapter A")
    chapter_b = create_chapter(api, "Chapter B")

    assign_coordinator(api, chapter_a, coordinator_a)
    assign_coordinator(api, chapter_b, coordinator_b)

    meeting = create_chapter_meeting(
        api,
        coordinator_a,
        chapter_a,
    )

    api.act_as(coordinator_b)

    response = api.client.get(
        f"{MEETINGS}/{meeting['id']}"
    )

    assert response.status_code == 404


# ---------------------------------------------------------
# Official Chapter Member access
# ---------------------------------------------------------


def test_official_chapter_member_can_view_and_join_meeting(api, video):
    coordinator = api.add_user("coordinator")
    member = api.add_user("member")

    chapter_id = create_chapter(api)

    assign_coordinator(api, chapter_id, coordinator)
    assign_official_member(api, chapter_id, member)

    meeting = create_chapter_meeting(
        api,
        coordinator,
        chapter_id,
    )

    api.act_as(member)

    response = api.client.get(
        f"{MEETINGS}/{meeting['id']}"
    )

    assert response.status_code == 200
    assert response.json()["can_join"] is True

    start_meeting(api, coordinator, meeting["id"])

    token_response = get_token(
        api,
        member,
        meeting["id"],
    )

    assert token_response.status_code == 200
    assert token_response.json()["role"] == "participant"


def test_member_of_another_chapter_cannot_view_meeting(api):
    coordinator = api.add_user("coordinator")
    member = api.add_user("member")

    chapter_a = create_chapter(api, "Chapter A")
    chapter_b = create_chapter(api, "Chapter B")

    assign_coordinator(api, chapter_a, coordinator)
    assign_official_member(api, chapter_b, member)

    meeting = create_chapter_meeting(
        api,
        coordinator,
        chapter_a,
    )

    api.act_as(member)

    response = api.client.get(
        f"{MEETINGS}/{meeting['id']}"
    )

    assert response.status_code == 404


# ---------------------------------------------------------
# Guest access through exact meeting grants
# ---------------------------------------------------------


def test_guest_without_meeting_grant_cannot_view_meeting(api):
    coordinator = api.add_user("coordinator")
    guest = api.add_user("guest")

    chapter_id = create_chapter(api)
    assign_coordinator(api, chapter_id, coordinator)

    meeting = create_chapter_meeting(
        api,
        coordinator,
        chapter_id,
    )

    api.act_as(guest)

    response = api.client.get(
        f"{MEETINGS}/{meeting['id']}"
    )

    assert response.status_code == 404


def test_guest_with_exact_grant_can_view_but_not_join_regular_meeting(
    api,
    video,
):
    coordinator = api.add_user("coordinator")
    guest = api.add_user("guest")

    chapter_id = create_chapter(api)
    assign_coordinator(api, chapter_id, coordinator)

    meeting = create_chapter_meeting(
        api,
        coordinator,
        chapter_id,
    )

    request_id = submit_guest_request(
        api,
        guest,
        chapter_id,
    )

    approve_guest_request(
        api,
        coordinator,
        request_id,
    )

    grant_meeting_access(
        api,
        coordinator,
        chapter_id,
        guest,
        meeting["id"],
    )

    api.act_as(guest)

    response = api.client.get(
        f"{MEETINGS}/{meeting['id']}"
    )

    assert response.status_code == 200
    assert response.json()["can_join"] is False

    # Start the meeting before testing token permissions.
    start_meeting(
        api,
        coordinator,
        meeting["id"],
    )

    token_response = get_token(
        api,
        guest,
        meeting["id"],
    )

    assert token_response.status_code == 403
    assert token_response.json()["detail"]["code"] == "membership_required"


def test_guest_grant_does_not_expose_another_meeting(
    api,
    video,
):

    coordinator = api.add_user("coordinator")
    guest = api.add_user("guest")

    chapter_id = create_chapter(api)
    assign_coordinator(api, chapter_id, coordinator)

    granted_meeting = create_chapter_meeting(
        api,
        coordinator,
        chapter_id,
        title="Granted Meeting",
    )

    other_meeting = create_chapter_meeting(
        api,
        coordinator,
        chapter_id,
        title="Private Meeting",
    )

    request_id = submit_guest_request(
        api,
        guest,
        chapter_id,
    )

    approve_guest_request(
        api,
        coordinator,
        request_id,
    )

    grant_meeting_access(
        api,
        coordinator,
        chapter_id,
        guest,
        granted_meeting["id"],
    )

    api.act_as(guest)

    granted_response = api.client.get(
        f"{MEETINGS}/{granted_meeting['id']}"
    )

    other_response = api.client.get(
        f"{MEETINGS}/{other_meeting['id']}"
    )

    assert granted_response.status_code == 200
    assert other_response.status_code == 404


def test_guest_with_livestream_grant_can_join_as_viewer(
    api,
    video,
):
    coordinator = api.add_user("coordinator")
    guest = api.add_user("guest")

    chapter_id = create_chapter(api)
    assign_coordinator(api, chapter_id, coordinator)

    meeting = create_chapter_meeting(
        api,
        coordinator,
        chapter_id,
        kind="livestream",
    )

    request_id = submit_guest_request(
        api,
        guest,
        chapter_id,
    )

    approve_guest_request(
        api,
        coordinator,
        request_id,
    )

    grant_meeting_access(
        api,
        coordinator,
        chapter_id,
        guest,
        meeting["id"],
    )

    start_meeting(
        api,
        coordinator,
        meeting["id"],
    )

    response = get_token(
        api,
        guest,
        meeting["id"],
    )

    assert response.status_code == 200
    assert response.json()["role"] == "viewer"


# ---------------------------------------------------------
# Chapter meeting list isolation
# ---------------------------------------------------------


def test_chapter_meeting_list_only_returns_authorized_meetings(api):
    coordinator = api.add_user("coordinator")
    member = api.add_user("member")
    outsider = api.add_user("outsider")

    chapter_a = create_chapter(api, "Chapter A")
    chapter_b = create_chapter(api, "Chapter B")

    assign_coordinator(api, chapter_a, coordinator)
    assign_official_member(api, chapter_a, member)

    meeting_a = create_chapter_meeting(
        api,
        coordinator,
        chapter_a,
    )

    meeting_b = create_chapter_meeting(
        api,
        coordinator,
        chapter_a,
        title="Second Meeting",
    )

    api.act_as(member)

    response = api.client.get(
        MEETINGS,
        params={"chapter_id": str(chapter_a)},
    )

    assert response.status_code == 200

    returned_ids = {
        item["id"] for item in response.json()["items"]
    }

    assert meeting_a["id"] in returned_ids
    assert meeting_b["id"] in returned_ids

    api.act_as(outsider)

    response = api.client.get(
        MEETINGS,
        params={"chapter_id": str(chapter_a)},
    )

    assert response.status_code == 200
    assert response.json()["items"] == []


# ---------------------------------------------------------
# Event-linked Chapter Meetings
# ---------------------------------------------------------


def test_chapter_event_meeting_inherits_chapter_and_event_start(api):
    coordinator = api.add_user("event-coordinator")
    chapter_id = create_chapter(api)
    assign_coordinator(api, chapter_id, coordinator)

    event = create_chapter_event(api, chapter_id, coordinator)
    meeting = create_chapter_meeting(
        api,
        coordinator,
        chapter_id,
        event_id=event["id"],
    )

    assert meeting["chapter_id"] == str(chapter_id)
    assert meeting["community_id"] is None
    assert meeting["event_id"] == event["id"]
    assert meeting["scheduled_start_at"] == event["starts_at"]


def test_event_linked_chapter_meeting_requires_confirmed_registration(api, video):
    coordinator = api.add_user("event-coordinator")
    registered_member = api.add_user("registered-member")
    waitlisted_member = api.add_user("waitlisted-member")

    chapter_id = create_chapter(api)
    assign_coordinator(api, chapter_id, coordinator)
    assign_official_member(api, chapter_id, registered_member)
    assign_official_member(api, chapter_id, waitlisted_member)

    event = create_chapter_event(
        api,
        chapter_id,
        coordinator,
        capacity=1,
    )
    meeting = create_chapter_meeting(
        api,
        coordinator,
        chapter_id,
        event_id=event["id"],
    )

    start_meeting(api, coordinator, meeting["id"])

    api.act_as(registered_member)
    registered = api.client.post(
        f"/api/v1/events/{event['id']}/registrations"
    )
    assert registered.status_code == 201, registered.text
    assert registered.json()["status"] == "registered"

    api.act_as(waitlisted_member)
    waitlisted = api.client.post(
        f"/api/v1/events/{event['id']}/registrations"
    )
    assert waitlisted.status_code == 201, waitlisted.text
    assert waitlisted.json()["status"] == "waitlisted"

    registered_token = get_token(api, registered_member, meeting["id"])
    assert registered_token.status_code == 200, registered_token.text
    assert registered_token.json()["role"] == "participant"

    waitlisted_token = get_token(api, waitlisted_member, meeting["id"])
    assert waitlisted_token.status_code == 403
    assert waitlisted_token.json()["detail"]["code"] == "registration_required"

    host_token = get_token(api, coordinator, meeting["id"])
    assert host_token.status_code == 200, host_token.text
    assert host_token.json()["role"] == "host"



# ---------------------------------------------------------
# Chapter Meeting recordings and replay access
# ---------------------------------------------------------


def test_official_chapter_member_can_view_ready_recording(api, video):
    coordinator = api.add_user("recording-coordinator")
    member = api.add_user("recording-member")

    chapter_id = create_chapter(api)
    assign_coordinator(api, chapter_id, coordinator)
    assign_official_member(api, chapter_id, member)

    meeting = create_chapter_meeting(
        api,
        coordinator,
        chapter_id,
        recording_enabled=True,
    )
    start_meeting(api, coordinator, meeting["id"])
    recording_id = create_ready_recording(api, video, meeting["id"])

    api.act_as(member)
    recordings = api.client.get(
        f"{MEETINGS}/{meeting['id']}/recordings"
    )
    assert recordings.status_code == 200, recordings.text
    assert [item["id"] for item in recordings.json()] == [recording_id]

    playback = api.client.get(
        f"{MEETINGS}/{meeting['id']}/recordings/{recording_id}"
    )
    assert playback.status_code == 200, playback.text
    assert playback.json()["playback_url"]


def test_user_outside_chapter_cannot_access_recording(api, video):
    coordinator = api.add_user("recording-coordinator")
    outsider = api.add_user("recording-outsider")

    chapter_id = create_chapter(api)
    assign_coordinator(api, chapter_id, coordinator)

    meeting = create_chapter_meeting(
        api,
        coordinator,
        chapter_id,
        recording_enabled=True,
    )
    start_meeting(api, coordinator, meeting["id"])
    recording_id = create_ready_recording(api, video, meeting["id"])

    api.act_as(outsider)
    recordings = api.client.get(
        f"{MEETINGS}/{meeting['id']}/recordings"
    )
    assert recordings.status_code == 404

    playback = api.client.get(
        f"{MEETINGS}/{meeting['id']}/recordings/{recording_id}"
    )
    assert playback.status_code == 404


def test_chapter_coordinator_can_hide_and_republish_recording(api, video):
    coordinator = api.add_user("recording-coordinator")
    member = api.add_user("recording-member")

    chapter_id = create_chapter(api)
    assign_coordinator(api, chapter_id, coordinator)
    assign_official_member(api, chapter_id, member)

    meeting = create_chapter_meeting(
        api,
        coordinator,
        chapter_id,
        recording_enabled=True,
    )
    start_meeting(api, coordinator, meeting["id"])
    recording_id = create_ready_recording(api, video, meeting["id"])
    recording_url = (
        f"{MEETINGS}/{meeting['id']}/recordings/{recording_id}"
    )

    api.act_as(coordinator)
    hidden = api.client.patch(
        recording_url,
        json={"published": False},
    )
    assert hidden.status_code == 200, hidden.text
    assert hidden.json()["published"] is False

    api.act_as(member)
    assert api.client.get(
        f"{MEETINGS}/{meeting['id']}/recordings"
    ).json() == []
    assert api.client.get(recording_url).status_code == 404

    api.act_as(coordinator)
    visible_to_host = api.client.get(
        f"{MEETINGS}/{meeting['id']}/recordings"
    )
    assert visible_to_host.status_code == 200
    assert len(visible_to_host.json()) == 1

    republished = api.client.patch(
        recording_url,
        json={"published": True},
    )
    assert republished.status_code == 200, republished.text
    assert republished.json()["published"] is True

    api.act_as(member)
    assert len(api.client.get(
        f"{MEETINGS}/{meeting['id']}/recordings"
    ).json()) == 1


def test_guest_with_exact_meeting_grant_can_view_published_recording(api, video):
    coordinator = api.add_user("recording-coordinator")
    guest = api.add_user("recording-guest")

    chapter_id = create_chapter(api)
    assign_coordinator(api, chapter_id, coordinator)

    meeting = create_chapter_meeting(
        api,
        coordinator,
        chapter_id,
        recording_enabled=True,
    )
    start_meeting(api, coordinator, meeting["id"])
    recording_id = create_ready_recording(api, video, meeting["id"])

    request_id = submit_guest_request(api, guest, chapter_id)
    approve_guest_request(api, coordinator, request_id)
    grant_meeting_access(
        api,
        coordinator,
        chapter_id,
        guest,
        meeting["id"],
    )

    api.act_as(guest)
    recordings = api.client.get(
        f"{MEETINGS}/{meeting['id']}/recordings"
    )
    assert recordings.status_code == 200, recordings.text
    assert [item["id"] for item in recordings.json()] == [recording_id]

    playback = api.client.get(
        f"{MEETINGS}/{meeting['id']}/recordings/{recording_id}"
    )
    assert playback.status_code == 200, playback.text
