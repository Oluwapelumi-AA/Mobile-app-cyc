import uuid
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import select

from app.models import (
    AccountRole,
    Notification,
    NotificationDelivery,
    NotificationDevice,
    User,
)
from app.services.object_storage import InMemoryObjectStorage, get_object_storage
from app.services.video_provider import FakeVideoProvider, get_video_provider

COMMUNITIES = "/api/v1/communities"
EVENTS = "/api/v1/events"
MEETINGS = "/api/v1/meetings"
RESOURCES = "/api/v1/resources"
PROFILE = "/api/v1/profiles/me"
NOTIFICATIONS = "/api/v1/notifications"
PREFERENCES = f"{NOTIFICATIONS}/preferences"
DEVICES = f"{NOTIFICATIONS}/devices"


@pytest.fixture
def world(api):
    """A public community with an owner, a moderator and two members.

    The moderator's promotion notification is cleared so tests start empty.
    """
    from app.core.config import settings
    from app.main import app

    app.dependency_overrides[get_video_provider] = lambda: FakeVideoProvider(settings)
    app.dependency_overrides[get_object_storage] = lambda: InMemoryObjectStorage()

    ids = {name: api.add_user(name) for name in ("owner", "mod", "alice", "bob", "outsider")}
    ids["staff"] = api.add_user("staff", AccountRole.MODERATOR)
    for name in ("owner", "alice", "bob"):
        api.act_as(ids[name])
        api.client.post(PROFILE, json={"display_name": name.title()})
    api.act_as(ids["owner"])
    cid = api.client.post(COMMUNITIES, json={"name": "Abuja Fellowship"}).json()["id"]
    for name in ("mod", "alice", "bob"):
        api.act_as(ids[name])
        api.client.post(f"{COMMUNITIES}/{cid}/join")
    api.act_as(ids["owner"])
    api.client.patch(f"{COMMUNITIES}/{cid}/members/{ids['mod']}", json={"role": "moderator"})
    with api.session_factory() as db:
        db.execute(Notification.__table__.delete())
        db.commit()
    try:
        yield {"community_id": cid, **ids}
    finally:
        app.dependency_overrides.pop(get_video_provider, None)
        app.dependency_overrides.pop(get_object_storage, None)


def inbox(api, user_id, **params):
    api.act_as(user_id)
    response = api.client.get(NOTIFICATIONS, params=params)
    assert response.status_code == 200, response.text
    return response.json()["items"]


def unread(api, user_id):
    api.act_as(user_id)
    return api.client.get(f"{NOTIFICATIONS}/unread-count").json()["count"]


def post(api, user_id, world, body="Pray for our outreach on Saturday"):
    api.act_as(user_id)
    response = api.client.post(f"{COMMUNITIES}/{world['community_id']}/posts", json={"body": body})
    assert response.status_code == 201, response.text
    return response.json()


def comment(api, user_id, post_id, body="Amen, praying with you!"):
    api.act_as(user_id)
    response = api.client.post(f"/api/v1/posts/{post_id}/comments", json={"body": body})
    assert response.status_code == 201, response.text
    return response.json()


def register_device(api, user_id, token="ExponentPushToken[alice-phone]", platform="ios"):
    api.act_as(user_id)
    return api.client.post(DEVICES, json={"token": token, "platform": platform})


def deliveries(api, notification_id=None):
    with api.session_factory() as db:
        statement = select(NotificationDelivery.channel)
        if notification_id:
            statement = statement.where(
                NotificationDelivery.notification_id == uuid.UUID(notification_id)
            )
        return sorted(db.scalars(statement))


def create_event(api, user_id, world, capacity=None, days=3):
    api.act_as(user_id)
    starts = (datetime.now(UTC) + timedelta(days=days)).replace(microsecond=0)
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


def sign_up(api, user_id, event_id):
    api.act_as(user_id)
    response = api.client.post(f"{EVENTS}/{event_id}/registrations")
    assert response.status_code == 201, response.text
    return response.json()


# Comments


def test_comment_notifies_the_post_author(api, world):
    created = post(api, world["alice"], world)
    reply = comment(api, world["bob"], created["id"])

    items = inbox(api, world["alice"])
    assert len(items) == 1
    item = items[0]
    assert item["type"] == "comment_on_post"
    assert item["category"] == "social"
    assert item["title"] == "Bob commented on your post"
    assert item["body"] == "Amen, praying with you!"
    assert item["actor_id"] == str(world["bob"])
    assert item["data"] == {
        "community_id": world["community_id"],
        "post_id": created["id"],
        "comment_id": reply["id"],
    }
    assert item["read"] is False and item["read_at"] is None
    assert unread(api, world["alice"]) == 1
    assert inbox(api, world["bob"]) == []


def test_commenting_on_your_own_post_notifies_nobody(api, world):
    created = post(api, world["alice"], world)
    comment(api, world["alice"], created["id"])
    assert inbox(api, world["alice"]) == []


def test_author_without_a_profile_is_someone(api, world):
    created = post(api, world["alice"], world)
    comment(api, world["mod"], created["id"])
    assert inbox(api, world["alice"])[0]["title"] == "Someone commented on your post"


def test_long_comments_are_shortened(api, world):
    created = post(api, world["alice"], world)
    comment(api, world["bob"], created["id"], body="Word " * 100)
    body = inbox(api, world["alice"])[0]["body"]
    assert len(body) == 140 and body.endswith("…")


def test_inactive_users_are_not_notified(api, world):
    created = post(api, world["alice"], world)
    with api.session_factory() as db:
        db.get(User, world["alice"]).is_active = False
        db.commit()
    comment(api, world["bob"], created["id"])
    with api.session_factory() as db:
        assert db.scalar(select(Notification)) is None


def test_failed_action_leaves_no_notification(api, world):
    created = post(api, world["alice"], world)
    api.act_as(world["outsider"])
    response = api.client.post(
        f"/api/v1/posts/{created['id']}/comments", json={"body": "Hello"}
    )
    assert response.status_code == 403
    assert inbox(api, world["alice"]) == []


# Inbox


def test_inbox_pages_newest_first_and_filters(api, world):
    created = post(api, world["alice"], world)
    for number in range(3):
        comment(api, world["bob"], created["id"], body=f"Comment {number}")
    event = create_event(api, world["owner"], world)
    sign_up(api, world["alice"], event["id"])
    api.act_as(world["owner"])
    api.client.post(f"{EVENTS}/{event['id']}/cancel")

    api.act_as(world["alice"])
    first = api.client.get(NOTIFICATIONS, params={"limit": 2}).json()
    assert [item["type"] for item in first["items"]] == ["event_cancelled", "comment_on_post"]
    assert first["items"][1]["body"] == "Comment 2"
    rest = api.client.get(
        NOTIFICATIONS, params={"limit": 2, "cursor": first["next_cursor"]}
    ).json()
    assert [item["body"] for item in rest["items"]] == ["Comment 1", "Comment 0"]
    assert rest["next_cursor"] is None

    events_only = inbox(api, world["alice"], category="events")
    assert [item["type"] for item in events_only] == ["event_cancelled"]


def test_read_unread_read_all_and_delete(api, world):
    created = post(api, world["alice"], world)
    for _ in range(3):
        comment(api, world["bob"], created["id"])
    first, second, third = (item["id"] for item in inbox(api, world["alice"]))

    api.act_as(world["alice"])
    read = api.client.post(f"{NOTIFICATIONS}/{first}/read").json()
    assert read["read"] is True and read["read_at"] is not None
    again = api.client.post(f"{NOTIFICATIONS}/{first}/read").json()
    assert again["read_at"] == read["read_at"]
    assert unread(api, world["alice"]) == 2
    assert [item["id"] for item in inbox(api, world["alice"], unread_only=True)] == [
        second,
        third,
    ]
    api.act_as(world["alice"])
    assert api.client.post(f"{NOTIFICATIONS}/{first}/unread").json()["read"] is False
    assert unread(api, world["alice"]) == 3

    api.act_as(world["alice"])
    assert api.client.post(f"{NOTIFICATIONS}/read-all").json() == {"updated": 3}
    assert unread(api, world["alice"]) == 0
    api.act_as(world["alice"])
    assert api.client.post(f"{NOTIFICATIONS}/read-all").json() == {"updated": 0}

    assert api.client.delete(f"{NOTIFICATIONS}/{first}").status_code == 204
    assert api.client.get(f"{NOTIFICATIONS}/{first}").status_code == 404
    assert len(inbox(api, world["alice"])) == 2


def test_read_all_by_category(api, world):
    created = post(api, world["alice"], world)
    comment(api, world["bob"], created["id"])
    event = create_event(api, world["owner"], world)
    sign_up(api, world["alice"], event["id"])
    api.act_as(world["owner"])
    api.client.post(f"{EVENTS}/{event['id']}/cancel")

    api.act_as(world["alice"])
    response = api.client.post(f"{NOTIFICATIONS}/read-all", params={"category": "social"})
    assert response.json() == {"updated": 1}
    assert [item["type"] for item in inbox(api, world["alice"], unread_only=True)] == [
        "event_cancelled"
    ]


def test_other_peoples_notifications_are_not_found(api, world):
    created = post(api, world["alice"], world)
    comment(api, world["bob"], created["id"])
    notification_id = inbox(api, world["alice"])[0]["id"]

    api.act_as(world["bob"])
    assert api.client.get(f"{NOTIFICATIONS}/{notification_id}").status_code == 404
    response = api.client.post(f"{NOTIFICATIONS}/{notification_id}/read")
    assert response.status_code == 404
    assert response.json()["detail"]["code"] == "notification_not_found"
    assert api.client.delete(f"{NOTIFICATIONS}/{notification_id}").status_code == 404
    assert api.client.get(f"{NOTIFICATIONS}/{uuid.uuid4()}").status_code == 404
    assert unread(api, world["alice"]) == 1


def test_bad_cursor_is_rejected(api, world):
    api.act_as(world["alice"])
    response = api.client.get(NOTIFICATIONS, params={"cursor": "nope"})
    assert response.status_code == 400
    assert response.json()["detail"]["code"] == "invalid_cursor"


# Preferences


def test_default_preferences(api, world):
    api.act_as(world["alice"])
    assert api.client.get(PREFERENCES).json() == [
        {"category": "social", "push": True, "email": False},
        {"category": "community", "push": True, "email": False},
        {"category": "events", "push": True, "email": True},
        {"category": "meetings", "push": True, "email": False},
        {"category": "resources", "push": False, "email": False},
    ]


def test_update_preferences_changes_only_what_is_sent(api, world):
    api.act_as(world["alice"])
    response = api.client.patch(
        PREFERENCES,
        json={
            "preferences": [
                {"category": "events", "email": False},
                {"category": "resources", "push": True, "email": True},
            ]
        },
    )
    assert response.status_code == 200, response.text
    by_category = {item["category"]: item for item in response.json()}
    assert by_category["events"] == {"category": "events", "push": True, "email": False}
    assert by_category["resources"] == {"category": "resources", "push": True, "email": True}
    assert by_category["social"] == {"category": "social", "push": True, "email": False}

    api.client.patch(PREFERENCES, json={"preferences": [{"category": "events", "push": False}]})
    events = next(item for item in api.client.get(PREFERENCES).json() if item["category"] == "events")
    assert events == {"category": "events", "push": False, "email": False}

    # Someone else still has the defaults.
    api.act_as(world["bob"])
    events = next(item for item in api.client.get(PREFERENCES).json() if item["category"] == "events")
    assert events["email"] is True


@pytest.mark.parametrize(
    "payload",
    [
        {"preferences": []},
        {"preferences": [{"category": "gossip", "push": True}]},
        {"preferences": [{"category": "events"}, {"category": "events", "push": False}]},
        {"preferences": [{"category": "events", "sms": True}]},
    ],
)
def test_bad_preference_updates_are_rejected(api, world, payload):
    api.act_as(world["alice"])
    assert api.client.patch(PREFERENCES, json=payload).status_code == 422


def test_jobs_follow_preferences_and_devices(api, world):
    created = post(api, world["alice"], world)
    comment(api, world["bob"], created["id"])
    # Social: push on but no device yet, email off by default.
    assert deliveries(api) == []

    register_device(api, world["alice"])
    comment(api, world["bob"], created["id"])
    assert deliveries(api) == ["push"]

    api.act_as(world["alice"])
    api.client.patch(
        PREFERENCES,
        json={"preferences": [{"category": "social", "push": False, "email": True}]},
    )
    newest = comment(api, world["bob"], created["id"])
    newest_notification = inbox(api, world["alice"])[0]
    assert newest_notification["data"]["comment_id"] == newest["id"]
    assert deliveries(api, newest_notification["id"]) == ["email"]
    # The inbox still gets everything.
    assert len(inbox(api, world["alice"])) == 3


# Devices


def test_register_device_is_an_upsert(api, world):
    first = register_device(api, world["alice"])
    assert first.status_code == 201, first.text
    device = first.json()
    assert device["platform"] == "ios"
    assert "token" not in device

    api.act_as(world["alice"])
    again = api.client.post(
        DEVICES,
        json={
            "token": "ExponentPushToken[alice-phone]",
            "platform": "ios",
            "app_version": "1.2.0",
        },
    )
    assert again.status_code == 200
    assert again.json()["id"] == device["id"]
    assert again.json()["app_version"] == "1.2.0"
    assert [item["id"] for item in api.client.get(DEVICES).json()] == [device["id"]]


def test_a_token_moves_to_whoever_signs_in(api, world):
    register_device(api, world["alice"], token="shared-tablet-token")
    moved = register_device(api, world["bob"], token="shared-tablet-token", platform="android")
    assert moved.status_code == 200

    api.act_as(world["alice"])
    assert api.client.get(DEVICES).json() == []
    api.act_as(world["bob"])
    assert [item["platform"] for item in api.client.get(DEVICES).json()] == ["android"]


def test_remove_device_by_id_or_token(api, world):
    phone = register_device(api, world["alice"], token="alice-phone-token").json()
    register_device(api, world["alice"], token="alice-browser-token", platform="web")

    api.act_as(world["bob"])
    assert api.client.delete(f"{DEVICES}/{phone['id']}").status_code == 404
    assert (
        api.client.delete(DEVICES, params={"token": "alice-browser-token"}).status_code == 404
    )

    api.act_as(world["alice"])
    assert api.client.delete(f"{DEVICES}/{phone['id']}").status_code == 204
    assert api.client.delete(DEVICES, params={"token": "alice-browser-token"}).status_code == 204
    assert api.client.get(DEVICES).json() == []
    response = api.client.delete(DEVICES, params={"token": "alice-browser-token"})
    assert response.status_code == 404
    assert response.json()["detail"]["code"] == "device_not_found"


def test_only_the_most_recent_devices_are_kept(api, world):
    for number in range(12):
        assert register_device(api, world["alice"], token=f"alice-token-{number:02}").status_code == 201
    with api.session_factory() as db:
        tokens = set(
            db.scalars(
                select(NotificationDevice.token).where(
                    NotificationDevice.user_id == world["alice"]
                )
            )
        )
    assert len(tokens) == 10
    assert "alice-token-11" in tokens and "alice-token-00" not in tokens


@pytest.mark.parametrize(
    "payload",
    [
        {"token": "short", "platform": "ios"},
        {"token": "ExponentPushToken[x]", "platform": "blackberry"},
        {"token": "ExponentPushToken[x]"},
        {"token": "x" * 501, "platform": "web"},
    ],
)
def test_bad_device_registrations_are_rejected(api, world, payload):
    api.act_as(world["alice"])
    assert api.client.post(DEVICES, json=payload).status_code == 422


def test_notifications_need_sign_in(api):
    from app.api.deps import get_current_user_id
    from app.main import app

    app.dependency_overrides.pop(get_current_user_id, None)
    assert api.client.get(NOTIFICATIONS).status_code == 401
    assert api.client.post(DEVICES, json={"token": "abcdefghij", "platform": "ios"}).status_code == 401


# Communities


def test_role_change_and_removal_notify_the_member(api, world):
    api.act_as(world["owner"])
    cid = world["community_id"]
    api.client.patch(f"{COMMUNITIES}/{cid}/members/{world['alice']}", json={"role": "admin"})
    # Same role again changes nothing, so no second notification.
    api.client.patch(f"{COMMUNITIES}/{cid}/members/{world['alice']}", json={"role": "admin"})
    api.client.delete(f"{COMMUNITIES}/{cid}/members/{world['bob']}")

    alice = inbox(api, world["alice"])
    assert [item["title"] for item in alice] == ["You are now an admin of Abuja Fellowship"]
    assert alice[0]["data"] == {"community_id": cid, "role": "admin"}
    bob = inbox(api, world["bob"])
    assert [item["type"] for item in bob] == ["community_removed"]
    assert bob[0]["title"] == "You were removed from Abuja Fellowship"


def test_leaving_notifies_nobody(api, world):
    api.act_as(world["alice"])
    api.client.post(f"{COMMUNITIES}/{world['community_id']}/leave")
    with api.session_factory() as db:
        assert db.scalar(select(Notification)) is None


# Events


def test_freed_spot_notifies_the_promoted_person(api, world):
    event = create_event(api, world["owner"], world, capacity=1)
    sign_up(api, world["alice"], event["id"])
    sign_up(api, world["bob"], event["id"])

    api.act_as(world["alice"])
    api.client.delete(f"{EVENTS}/{event['id']}/registrations/me")

    bob = inbox(api, world["bob"])
    assert [item["type"] for item in bob] == ["event_spot_confirmed"]
    assert bob[0]["title"] == "You have a spot at Youth Prayer Night"
    assert bob[0]["data"] == {"event_id": event["id"], "community_id": world["community_id"]}
    assert inbox(api, world["alice"]) == []


def test_raising_capacity_notifies_the_promoted_people(api, world):
    event = create_event(api, world["owner"], world, capacity=1)
    for name in ("alice", "bob", "mod"):
        sign_up(api, world[name], event["id"])
    api.act_as(world["owner"])
    api.client.patch(f"{EVENTS}/{event['id']}", json={"capacity": 2})

    assert [item["type"] for item in inbox(api, world["bob"])] == ["event_spot_confirmed"]
    assert inbox(api, world["mod"]) == []
    assert inbox(api, world["alice"]) == []


def test_new_time_notifies_everyone_signed_up(api, world):
    event = create_event(api, world["owner"], world, capacity=1)
    sign_up(api, world["alice"], event["id"])
    sign_up(api, world["bob"], event["id"])

    api.act_as(world["owner"])
    api.client.patch(f"{EVENTS}/{event['id']}", json={"title": "Prayer Night"})
    assert inbox(api, world["alice"]) == []

    new_start = (datetime.now(UTC) + timedelta(days=5)).replace(
        hour=17, minute=0, second=0, microsecond=0
    )
    api.act_as(world["owner"])
    response = api.client.patch(
        f"{EVENTS}/{event['id']}",
        json={
            "starts_at": new_start.isoformat(),
            "ends_at": (new_start + timedelta(hours=2)).isoformat(),
        },
    )
    assert response.status_code == 200, response.text
    for name in ("alice", "bob"):
        items = inbox(api, world[name])
        assert [item["type"] for item in items] == ["event_rescheduled"]
        assert items[0]["title"] == "Prayer Night has a new time"
        # 17:00 UTC is 18:00 in Lagos.
        assert "18:00 (Africa/Lagos)" in items[0]["body"]
    assert inbox(api, world["owner"]) == []


def test_cancelling_notifies_everyone_signed_up(api, world):
    event = create_event(api, world["owner"], world, capacity=1)
    sign_up(api, world["alice"], event["id"])
    sign_up(api, world["bob"], event["id"])
    sign_up(api, world["owner"], event["id"])

    api.act_as(world["owner"])
    api.client.post(f"{EVENTS}/{event['id']}/cancel")
    for name in ("alice", "bob"):
        assert [item["title"] for item in inbox(api, world[name])] == [
            "Youth Prayer Night was cancelled"
        ]
    assert inbox(api, world["owner"]) == []
    assert inbox(api, world["mod"]) == []


def test_event_emails_are_on_by_default(api, world):
    event = create_event(api, world["owner"], world)
    sign_up(api, world["alice"], event["id"])
    api.act_as(world["owner"])
    api.client.post(f"{EVENTS}/{event['id']}/cancel")
    assert deliveries(api) == ["email"]


# Meetings


def test_going_live_notifies_community_members(api, world):
    api.act_as(world["mod"])
    meeting = api.client.post(
        MEETINGS,
        json={"title": "Midweek Bible Study", "community_id": world["community_id"]},
    ).json()
    api.client.post(f"{MEETINGS}/{meeting['id']}/start")
    api.client.post(f"{MEETINGS}/{meeting['id']}/start")

    for name in ("owner", "alice", "bob"):
        items = inbox(api, world[name])
        assert [item["title"] for item in items] == ["Midweek Bible Study is live"]
        assert items[0]["body"] == "The meeting has started. Join now."
        assert items[0]["data"]["meeting_id"] == meeting["id"]
    assert inbox(api, world["mod"]) == []
    assert inbox(api, world["outsider"]) == []


def test_event_meeting_notifies_only_people_with_a_spot(api, world):
    event = create_event(api, world["owner"], world, capacity=1)
    sign_up(api, world["alice"], event["id"])
    sign_up(api, world["bob"], event["id"])
    api.act_as(world["owner"])
    meeting = api.client.post(
        MEETINGS, json={"title": "Prayer Night Stream", "kind": "livestream", "event_id": event["id"]}
    ).json()
    api.client.post(f"{MEETINGS}/{meeting['id']}/start")

    items = inbox(api, world["alice"])
    assert [item["body"] for item in items] == ["The livestream has started. Join now."]
    assert items[0]["data"]["event_id"] == event["id"]
    assert inbox(api, world["bob"]) == []
    assert inbox(api, world["mod"]) == []


def test_app_wide_meeting_notifies_nobody(api, world):
    api.act_as(world["staff"])
    meeting = api.client.post(MEETINGS, json={"title": "Global Prayer Hour"}).json()
    api.client.post(f"{MEETINGS}/{meeting['id']}/start")
    with api.session_factory() as db:
        assert db.scalar(select(Notification)) is None


# Resources


def test_publishing_a_resource_notifies_members_once(api, world):
    api.act_as(world["mod"])
    resource = api.client.post(
        RESOURCES,
        json={
            "kind": "article",
            "title": "Morning Devotional",
            "summary": "Start the day with Psalm 23",
            "body": "The Lord is my shepherd ...",
            "community_id": world["community_id"],
        },
    ).json()
    api.client.post(f"{RESOURCES}/{resource['id']}/publish")
    api.client.post(f"{RESOURCES}/{resource['id']}/unpublish")
    api.client.post(f"{RESOURCES}/{resource['id']}/publish")

    items = inbox(api, world["alice"])
    assert [item["title"] for item in items] == ["New in Abuja Fellowship: Morning Devotional"]
    assert items[0]["body"] == "Start the day with Psalm 23"
    assert items[0]["data"]["resource_id"] == resource["id"]
    assert inbox(api, world["mod"]) == []
    # Push and email are off for resources by default.
    register_device(api, world["bob"])
    assert deliveries(api) == []


def test_app_wide_resource_notifies_nobody(api, world):
    api.act_as(world["staff"])
    resource = api.client.post(
        RESOURCES, json={"kind": "article", "title": "Welcome to CYC", "body": "Hello"}
    ).json()
    api.client.post(f"{RESOURCES}/{resource['id']}/publish")
    with api.session_factory() as db:
        assert db.scalar(select(Notification)) is None


# Deleting


def test_deleting_a_user_deletes_their_notifications(api, world):
    created = post(api, world["alice"], world)
    register_device(api, world["alice"])
    comment(api, world["bob"], created["id"])
    with api.session_factory() as db:
        db.delete(db.get(User, world["alice"]))
        db.commit()
        assert db.scalar(select(Notification)) is None
        assert db.scalar(select(NotificationDelivery)) is None
        assert db.scalar(select(NotificationDevice)) is None
