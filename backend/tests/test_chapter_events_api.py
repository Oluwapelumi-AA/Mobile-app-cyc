
"""Tests for Chapter event visibility, creation and registration."""

import uuid
from datetime import datetime, timedelta, timezone

from app.models.chapter import Chapter
from app.models.chapter_access_grant import (
    ChapterAccessGrant,
    ChapterAccessGrantItem,
)
from app.models.chapter_management import ChapterStaff
from app.models.user import MembershipStatus, User
from app.models.user_profile import UserProfile

EVENTS = "/api/v1/events"


def create_chapter(api, name="Test Chapter"):
    with api.session_factory() as db:
        chapter = Chapter(
            slug=f"test-{uuid.uuid4().hex[:12]}",
            name=name,
            country_code="NG",
            timezone="Africa/Lagos",
            is_active=True,
        )
        db.add(chapter)
        db.commit()
        db.refresh(chapter)
        return chapter.id


def create_profile(api, user_id, name="Test User", chapter_id=None):
    with api.session_factory() as db:
        profile = UserProfile(
            user_id=user_id,
            display_name=name,
            onboarding_steps={},
            chapter_id=chapter_id,
        )
        db.add(profile)
        db.commit()


def make_official_member(api, user_id, chapter_id):
    with api.session_factory() as db:
        user = db.get(User, user_id)
        user.membership_status = MembershipStatus.MEMBER.value
        db.commit()

    create_profile(
        api,
        user_id,
        name="Chapter Member",
        chapter_id=chapter_id,
    )


def assign_coordinator(api, chapter_id, user_id):
    with api.session_factory() as db:
        assignment = ChapterStaff(
            role="coordinator",
            chapter_id=chapter_id,
            user_id=user_id,
        )
        db.add(assignment)
        db.commit()


def create_chapter_event(api, chapter_id, creator_id, title="Chapter Event"):
    api.act_as(creator_id)

    starts_at = datetime.now(timezone.utc) + timedelta(days=3)
    ends_at = starts_at + timedelta(hours=2)

    response = api.client.post(
        EVENTS,
        json={
            "chapter_id": str(chapter_id),
            "title": title,
            "description": "Chapter event test",
            "starts_at": starts_at.isoformat(),
            "ends_at": ends_at.isoformat(),
            "timezone": "Africa/Lagos",
            "capacity": 20,
        },
    )

    assert response.status_code == 201, response.text
    return response.json()


def grant_event_to_guest(api, chapter_id, guest_id, event_id):
    with api.session_factory() as db:
        grant = ChapterAccessGrant(
            chapter_id=chapter_id,
            user_id=guest_id,
        )
        db.add(grant)
        db.flush()

        item = ChapterAccessGrantItem(
            grant_id=grant.id,
            event_id=event_id,
        )
        db.add(item)
        db.commit()


def test_coordinator_can_create_chapter_event(api):
    coordinator = api.add_user("coordinator")
    chapter_id = create_chapter(api)
    assign_coordinator(api, chapter_id, coordinator)

    event = create_chapter_event(api, chapter_id, coordinator)

    assert event["chapter_id"] == str(chapter_id)
    assert event["can_manage"] is True


def test_non_coordinator_cannot_create_chapter_event(api):
    user = api.add_user("ordinary-user")
    chapter_id = create_chapter(api)

    api.act_as(user)

    starts_at = datetime.now(timezone.utc) + timedelta(days=3)
    ends_at = starts_at + timedelta(hours=2)

    response = api.client.post(
        EVENTS,
        json={
            "chapter_id": str(chapter_id),
            "title": "Unauthorized Event",
            "starts_at": starts_at.isoformat(),
            "ends_at": ends_at.isoformat(),
            "timezone": "Africa/Lagos",
        },
    )

    assert response.status_code == 403


def test_official_member_can_view_and_register_for_chapter_event(api):
    coordinator = api.add_user("event-coordinator")
    member = api.add_user("official-member")

    chapter_id = create_chapter(api)
    assign_coordinator(api, chapter_id, coordinator)
    make_official_member(api, member, chapter_id)

    event = create_chapter_event(api, chapter_id, coordinator)

    api.act_as(member)

    response = api.client.get(f"{EVENTS}/{event['id']}")
    assert response.status_code == 200
    assert response.json()["chapter_id"] == str(chapter_id)
    assert response.json()["can_manage"] is False

    registration = api.client.post(
        f"{EVENTS}/{event['id']}/registrations"
    )

    assert registration.status_code == 201
    assert registration.json()["status"] == "registered"


def test_guest_with_exact_event_grant_can_view_but_not_register(api):
    coordinator = api.add_user("grant-coordinator")
    guest = api.add_user("granted-guest")

    chapter_id = create_chapter(api)
    assign_coordinator(api, chapter_id, coordinator)

    event = create_chapter_event(api, chapter_id, coordinator)

    grant_event_to_guest(
        api,
        chapter_id,
        guest,
        uuid.UUID(event["id"]),
    )

    api.act_as(guest)

    response = api.client.get(f"{EVENTS}/{event['id']}")
    assert response.status_code == 200
    assert response.json()["chapter_id"] == str(chapter_id)
    assert response.json()["can_manage"] is False

    registration = api.client.post(
        f"{EVENTS}/{event['id']}/registrations"
    )

    assert registration.status_code == 403


def test_guest_without_event_grant_cannot_view_or_register(api):
    coordinator = api.add_user("private-event-coordinator")
    guest = api.add_user("ungranted-guest")

    chapter_id = create_chapter(api)
    assign_coordinator(api, chapter_id, coordinator)

    event = create_chapter_event(api, chapter_id, coordinator)

    api.act_as(guest)

    response = api.client.get(f"{EVENTS}/{event['id']}")
    assert response.status_code == 404

    registration = api.client.post(
        f"{EVENTS}/{event['id']}/registrations"
    )
    assert registration.status_code == 404


def test_guest_grant_does_not_expose_another_event(api):
    coordinator = api.add_user("two-event-coordinator")
    guest = api.add_user("single-event-guest")

    chapter_id = create_chapter(api)
    assign_coordinator(api, chapter_id, coordinator)

    granted_event = create_chapter_event(
        api,
        chapter_id,
        coordinator,
        title="Granted Event",
    )

    ungranted_event = create_chapter_event(
        api,
        chapter_id,
        coordinator,
        title="Another Event",
    )

    grant_event_to_guest(
        api,
        chapter_id,
        guest,
        uuid.UUID(granted_event["id"]),
    )

    api.act_as(guest)

    granted_response = api.client.get(
        f"{EVENTS}/{granted_event['id']}"
    )
    ungranted_response = api.client.get(
        f"{EVENTS}/{ungranted_event['id']}"
    )

    assert granted_response.status_code == 200
    assert ungranted_response.status_code == 404


def test_member_of_another_chapter_cannot_access_event(api):
    coordinator = api.add_user("first-coordinator")
    member = api.add_user("other-chapter-member")

    first_chapter = create_chapter(api, "First Chapter")
    second_chapter = create_chapter(api, "Second Chapter")

    assign_coordinator(api, first_chapter, coordinator)
    make_official_member(api, member, second_chapter)

    event = create_chapter_event(
        api,
        first_chapter,
        coordinator,
    )

    api.act_as(member)

    response = api.client.get(f"{EVENTS}/{event['id']}")
    assert response.status_code == 404


def test_coordinator_cannot_manage_another_chapters_event(api):
    first_coordinator = api.add_user("first-chapter-coordinator")
    second_coordinator = api.add_user("second-chapter-coordinator")

    first_chapter = create_chapter(api, "Chapter One")
    second_chapter = create_chapter(api, "Chapter Two")

    assign_coordinator(api, first_chapter, first_coordinator)
    assign_coordinator(api, second_chapter, second_coordinator)

    event = create_chapter_event(
        api,
        second_chapter,
        second_coordinator,
    )

    api.act_as(first_coordinator)

    response = api.client.patch(
        f"{EVENTS}/{event['id']}",
        json={"title": "Unauthorized Update"},
    )

    assert response.status_code == 404


def test_chapter_event_filter_only_returns_authorized_events(api):
    coordinator = api.add_user("filter-coordinator")
    member = api.add_user("filter-member")

    chapter_id = create_chapter(api)
    assign_coordinator(api, chapter_id, coordinator)
    make_official_member(api, member, chapter_id)

    event = create_chapter_event(
        api,
        chapter_id,
        coordinator,
    )

    api.act_as(member)

    response = api.client.get(
        EVENTS,
        params={"chapter_id": str(chapter_id)},
    )

    assert response.status_code == 200

    event_ids = [item["id"] for item in response.json()["items"]]
    assert event["id"] in event_ids
