import uuid
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import func, select

from app.models import AccountRole, Event, EventRegistration

COMMUNITIES = "/api/v1/communities"
EVENTS = "/api/v1/events"


@pytest.fixture
def world(api):
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


def iso(value: datetime) -> str:
    return value.isoformat().replace("+00:00", "Z")


def in_days(days: float, hours: float = 0) -> datetime:
    return (datetime.now(UTC) + timedelta(days=days, hours=hours)).replace(microsecond=0)


def event_payload(world=None, **overrides):
    payload = {
        "title": "Youth Prayer Night",
        "starts_at": iso(in_days(7)),
        "ends_at": iso(in_days(7, hours=2)),
        "timezone": "Africa/Lagos",
    }
    if world is not None:
        payload["community_id"] = world["community_id"]
    payload.update(overrides)
    return payload


def create_event(api, user_id, world=None, **overrides):
    api.act_as(user_id)
    response = api.client.post(EVENTS, json=event_payload(world, **overrides))
    assert response.status_code == 201, response.text
    return response.json()


def register(api, user_id, event_id):
    api.act_as(user_id)
    return api.client.post(f"{EVENTS}/{event_id}/registrations")


def move_event(api, event_id, starts_at, ends_at):
    """Reschedule straight in the database, e.g. into the past."""
    with api.session_factory() as db:
        event = db.get(Event, uuid.UUID(event_id))
        event.starts_at, event.ends_at = starts_at, ends_at
        db.commit()


# Creating


def test_moderator_creates_community_event(api, world):
    api.act_as(world["mod"])
    response = api.client.post(
        EVENTS,
        json=event_payload(
            world,
            title="  Youth Prayer Night ",
            description="Bring a friend",
            location="Wuse Zone 4",
            online_url="https://meet.example.com/prayer",
            capacity=50,
        ),
    )
    assert response.status_code == 201
    body = response.json()
    assert body["title"] == "Youth Prayer Night"
    assert body["community_id"] == world["community_id"]
    assert body["created_by"] == str(world["mod"])
    assert body["status"] == "scheduled"
    assert body["capacity"] == 50
    assert body["spots_left"] == 50
    assert body["registered_count"] == 0
    assert body["my_registration"] is None
    assert body["can_manage"] is True
    assert body["online_url"] == "https://meet.example.com/prayer"


@pytest.mark.parametrize("who", ["alice", "outsider"])
def test_members_and_outsiders_cannot_create_community_events(api, world, who):
    api.act_as(world[who])
    response = api.client.post(EVENTS, json=event_payload(world))
    assert response.status_code == 403
    expected = "membership_required" if who == "outsider" else "insufficient_role"
    assert response.json()["detail"]["code"] == expected


def test_app_moderator_creates_events_anywhere(api, world):
    community_event = create_event(api, world["staff"], world)
    app_event = create_event(api, world["staff"])
    assert community_event["community_id"] == world["community_id"]
    assert app_event["community_id"] is None


def test_only_app_moderators_create_app_wide_events(api, world):
    api.act_as(world["owner"])
    response = api.client.post(EVENTS, json=event_payload())
    assert response.status_code == 403
    assert response.json()["detail"]["code"] == "insufficient_role"


def test_cannot_create_event_in_unknown_community(api, world):
    api.act_as(world["staff"])
    response = api.client.post(EVENTS, json=event_payload(community_id=str(uuid.uuid4())))
    assert response.status_code == 404
    assert response.json()["detail"]["code"] == "community_not_found"


@pytest.mark.parametrize(
    "overrides, status_code, code",
    [
        ({"ends_at": iso(in_days(6))}, 400, "ends_before_start"),
        ({"starts_at": iso(in_days(-1)), "ends_at": iso(in_days(-1, 2))}, 400, "starts_in_past"),
        ({"timezone": "Mars/Olympus"}, 422, None),
        ({"capacity": 0}, 422, None),
        ({"title": "  "}, 422, None),
        ({"online_url": "ftp://files.example.com"}, 422, None),
        ({"unknown": "field"}, 422, None),
    ],
)
def test_event_input_is_validated(api, world, overrides, status_code, code):
    api.act_as(world["mod"])
    response = api.client.post(EVENTS, json=event_payload(world, **overrides))
    assert response.status_code == status_code
    if code:
        assert response.json()["detail"]["code"] == code


# Time zones


def test_local_times_are_read_in_the_event_time_zone(api, world):
    year = datetime.now(UTC).year + 1
    event = create_event(
        api,
        world["mod"],
        world,
        starts_at=f"{year}-03-01T18:00:00",
        ends_at=f"{year}-03-01T20:30:00",
        timezone="Africa/Lagos",
    )
    assert event["starts_at"] == f"{year}-03-01T17:00:00Z"
    assert event["ends_at"] == f"{year}-03-01T19:30:00Z"
    assert event["starts_at_local"] == f"{year}-03-01T18:00:00+01:00"
    assert event["timezone"] == "Africa/Lagos"


def test_times_with_offsets_are_kept_as_given(api, world):
    year = datetime.now(UTC).year + 1
    event = create_event(
        api,
        world["mod"],
        world,
        starts_at=f"{year}-07-04T10:00:00-04:00",
        ends_at=f"{year}-07-04T12:00:00-04:00",
        timezone="Europe/London",
    )
    assert event["starts_at"] == f"{year}-07-04T14:00:00Z"
    # London is on summer time (UTC+1) in July.
    assert event["starts_at_local"] == f"{year}-07-04T15:00:00+01:00"


def test_daylight_saving_offset_follows_the_date(api, world):
    year = datetime.now(UTC).year + 1
    winter = create_event(
        api, world["mod"], world,
        starts_at=f"{year}-01-15T19:00:00", ends_at=f"{year}-01-15T21:00:00",
        timezone="America/New_York",
    )
    summer = create_event(
        api, world["mod"], world,
        starts_at=f"{year}-07-15T19:00:00", ends_at=f"{year}-07-15T21:00:00",
        timezone="America/New_York",
    )
    assert winter["starts_at"] == f"{year}-01-16T00:00:00Z"
    assert summer["starts_at"] == f"{year}-07-15T23:00:00Z"


def test_local_time_skipped_by_clock_change_is_rejected(api, world):
    # In New York, clocks jump from 02:00 to 03:00 on the second Sunday of March.
    year = datetime.now(UTC).year + 1
    march_first = datetime(year, 3, 1)
    second_sunday = 1 + (6 - march_first.weekday()) % 7 + 7
    api.act_as(world["mod"])
    response = api.client.post(
        EVENTS,
        json=event_payload(
            world,
            starts_at=f"{year}-03-{second_sunday:02d}T02:30:00",
            ends_at=f"{year}-03-{second_sunday:02d}T04:00:00",
            timezone="America/New_York",
        ),
    )
    assert response.status_code == 400
    assert response.json()["detail"]["code"] == "nonexistent_local_time"


# Seeing events


def test_events_follow_community_visibility(api, world):
    api.act_as(world["owner"])
    private = api.client.post(
        COMMUNITIES, json={"name": "Leaders Circle", "visibility": "private"}
    ).json()
    hidden = create_event(api, world["owner"], community_id=private["id"])
    public = create_event(api, world["mod"], world)
    app_wide = create_event(api, world["staff"])

    api.act_as(world["outsider"])
    assert api.client.get(f"{EVENTS}/{hidden['id']}").status_code == 404
    assert api.client.get(f"{EVENTS}/{public['id']}").status_code == 200
    listed = [e["id"] for e in api.client.get(EVENTS).json()["items"]]
    assert set(listed) == {public["id"], app_wide["id"]}

    api.act_as(world["owner"])
    listed = [e["id"] for e in api.client.get(EVENTS).json()["items"]]
    assert set(listed) == {hidden["id"], public["id"], app_wide["id"]}


def test_upcoming_list_is_soonest_first_and_paginates(api, world):
    for days in (5, 2, 9, 1, 3):
        create_event(
            api, world["mod"], world,
            title=f"In {days} days",
            starts_at=iso(in_days(days)), ends_at=iso(in_days(days, 1)),
        )
    api.act_as(world["alice"])
    first = api.client.get(EVENTS, params={"limit": 3}).json()
    second = api.client.get(EVENTS, params={"limit": 3, "cursor": first["next_cursor"]}).json()
    titles = [e["title"] for e in first["items"] + second["items"]]
    assert titles == ["In 1 days", "In 2 days", "In 3 days", "In 5 days", "In 9 days"]
    assert second["next_cursor"] is None


def test_past_events_are_listed_separately_most_recent_first(api, world):
    old = create_event(api, world["mod"], world, title="Old")
    older = create_event(api, world["mod"], world, title="Older")
    ongoing = create_event(api, world["mod"], world, title="Ongoing")
    create_event(api, world["mod"], world, title="Upcoming")
    move_event(api, old["id"], in_days(-2), in_days(-2, 2))
    move_event(api, older["id"], in_days(-9), in_days(-9, 2))
    move_event(api, ongoing["id"], in_days(0, -1), in_days(0, 1))

    api.act_as(world["alice"])
    upcoming = [e["title"] for e in api.client.get(EVENTS).json()["items"]]
    past = [e["title"] for e in api.client.get(EVENTS, params={"past": True}).json()["items"]]
    assert upcoming == ["Ongoing", "Upcoming"]
    assert past == ["Old", "Older"]


def test_filter_by_community_and_mine(api, world):
    here = create_event(api, world["mod"], world, title="Here")
    create_event(api, world["staff"], title="App wide")
    api.act_as(world["bob"])
    other = api.client.post(COMMUNITIES, json={"name": "Other place"}).json()
    create_event(api, world["bob"], community_id=other["id"], title="Elsewhere")
    register(api, world["alice"], here["id"])

    by_community = api.client.get(EVENTS, params={"community_id": world["community_id"]}).json()
    assert [e["title"] for e in by_community["items"]] == ["Here"]
    mine = api.client.get(EVENTS, params={"mine": True}).json()
    assert [e["title"] for e in mine["items"]] == ["Here"]
    assert mine["items"][0]["my_registration"] == "registered"


def test_filter_by_hidden_community_is_404(api, world):
    api.act_as(world["owner"])
    private = api.client.post(
        COMMUNITIES, json={"name": "Leaders Circle", "visibility": "private"}
    ).json()
    api.act_as(world["outsider"])
    response = api.client.get(EVENTS, params={"community_id": private["id"]})
    assert response.status_code == 404


def test_can_manage_flag(api, world):
    event = create_event(api, world["mod"], world)
    for name, expected in (("owner", True), ("mod", True), ("alice", False), ("staff", True)):
        api.act_as(world[name])
        assert api.client.get(f"{EVENTS}/{event['id']}").json()["can_manage"] is expected
        listed = api.client.get(EVENTS).json()["items"][0]
        assert listed["can_manage"] is expected


# Editing, cancelling, deleting


def test_organizer_edits_event(api, world):
    event = create_event(api, world["mod"], world, description="Old", capacity=10)
    api.act_as(world["owner"])
    response = api.client.patch(
        f"{EVENTS}/{event['id']}",
        json={"title": "Worship Night", "description": None, "capacity": None},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["title"] == "Worship Night"
    assert body["description"] is None
    assert body["capacity"] is None
    assert body["spots_left"] is None


def test_members_cannot_edit_event(api, world):
    event = create_event(api, world["mod"], world)
    api.act_as(world["alice"])
    response = api.client.patch(f"{EVENTS}/{event['id']}", json={"title": "Mine now"})
    assert response.status_code == 403
    assert response.json()["detail"]["code"] == "insufficient_role"


def test_changing_time_zone_alone_keeps_the_moment(api, world):
    event = create_event(api, world["mod"], world)
    api.act_as(world["mod"])
    body = api.client.patch(f"{EVENTS}/{event['id']}", json={"timezone": "Asia/Tokyo"}).json()
    assert body["starts_at"] == event["starts_at"]
    assert body["starts_at_local"].endswith("+09:00")


def test_rescheduling_reads_local_times_in_the_new_zone(api, world):
    year = datetime.now(UTC).year + 1
    event = create_event(api, world["mod"], world)
    api.act_as(world["mod"])
    body = api.client.patch(
        f"{EVENTS}/{event['id']}",
        json={
            "starts_at": f"{year}-02-01T09:00:00",
            "ends_at": f"{year}-02-01T11:00:00",
            "timezone": "Asia/Tokyo",
        },
    ).json()
    assert body["starts_at"] == f"{year}-02-01T00:00:00Z"


def test_reschedule_must_end_after_start(api, world):
    event = create_event(api, world["mod"], world)
    api.act_as(world["mod"])
    response = api.client.patch(
        f"{EVENTS}/{event['id']}", json={"ends_at": iso(in_days(1))}
    )
    assert response.status_code == 400
    assert response.json()["detail"]["code"] == "ends_before_start"


def test_capacity_cannot_drop_below_registered(api, world):
    event = create_event(api, world["mod"], world, capacity=5)
    register(api, world["alice"], event["id"])
    register(api, world["bob"], event["id"])
    api.act_as(world["mod"])
    response = api.client.patch(f"{EVENTS}/{event['id']}", json={"capacity": 1})
    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "capacity_below_registered"
    assert api.client.patch(f"{EVENTS}/{event['id']}", json={"capacity": 2}).status_code == 200


def test_cancel_event(api, world):
    event = create_event(api, world["mod"], world)
    register(api, world["alice"], event["id"])
    api.act_as(world["mod"])
    response = api.client.post(f"{EVENTS}/{event['id']}/cancel")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "cancelled"
    assert body["cancelled_at"] is not None
    assert body["registered_count"] == 1  # Kept so people can see it.

    again = api.client.post(f"{EVENTS}/{event['id']}/cancel")
    assert again.status_code == 409
    assert again.json()["detail"]["code"] == "event_cancelled"
    edit = api.client.patch(f"{EVENTS}/{event['id']}", json={"title": "Back on"})
    assert edit.status_code == 409

    response = register(api, world["bob"], event["id"])
    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "event_cancelled"


def test_delete_event_removes_registrations(api, world):
    event = create_event(api, world["mod"], world)
    register(api, world["alice"], event["id"])
    api.act_as(world["alice"])
    assert api.client.delete(f"{EVENTS}/{event['id']}").status_code == 403
    api.act_as(world["mod"])
    assert api.client.delete(f"{EVENTS}/{event['id']}").status_code == 204
    assert api.client.get(f"{EVENTS}/{event['id']}").status_code == 404
    with api.session_factory() as db:
        assert db.scalar(select(func.count()).select_from(EventRegistration)) == 0


def test_deleting_community_deletes_its_events(api, world):
    event = create_event(api, world["mod"], world)
    register(api, world["alice"], event["id"])
    api.act_as(world["owner"])
    assert api.client.delete(f"{COMMUNITIES}/{world['community_id']}").status_code == 204
    with api.session_factory() as db:
        assert db.scalar(select(func.count()).select_from(Event)) == 0
        assert db.scalar(select(func.count()).select_from(EventRegistration)) == 0


def test_app_wide_events_are_managed_by_app_moderators_only(api, world):
    event = create_event(api, world["staff"])
    api.act_as(world["owner"])
    response = api.client.patch(f"{EVENTS}/{event['id']}", json={"title": "Taken over"})
    assert response.status_code == 403
    api.act_as(world["staff"])
    assert api.client.post(f"{EVENTS}/{event['id']}/cancel").status_code == 200


# Registration and capacity


def test_member_registers(api, world):
    event = create_event(api, world["mod"], world, capacity=10)
    response = register(api, world["alice"], event["id"])
    assert response.status_code == 201
    body = response.json()
    assert body["status"] == "registered"
    assert body["user_id"] == str(world["alice"])
    assert body["waitlist_position"] is None

    detail = api.client.get(f"{EVENTS}/{event['id']}").json()
    assert detail["registered_count"] == 1
    assert detail["spots_left"] == 9
    assert detail["my_registration"] == "registered"


def test_cannot_register_twice(api, world):
    event = create_event(api, world["mod"], world)
    register(api, world["alice"], event["id"])
    response = register(api, world["alice"], event["id"])
    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "already_registered"


def test_non_member_cannot_register_for_community_event(api, world):
    event = create_event(api, world["mod"], world)
    response = register(api, world["outsider"], event["id"])
    assert response.status_code == 403
    assert response.json()["detail"]["code"] == "membership_required"


def test_anyone_can_register_for_app_wide_event(api, world):
    event = create_event(api, world["staff"])
    assert register(api, world["outsider"], event["id"]).status_code == 201


def test_full_event_puts_people_on_waitlist_in_order(api, world):
    event = create_event(api, world["mod"], world, capacity=1)
    assert register(api, world["alice"], event["id"]).json()["status"] == "registered"
    bob = register(api, world["bob"], event["id"]).json()
    owner = register(api, world["owner"], event["id"]).json()
    assert (bob["status"], bob["waitlist_position"]) == ("waitlisted", 1)
    assert (owner["status"], owner["waitlist_position"]) == ("waitlisted", 2)

    detail = api.client.get(f"{EVENTS}/{event['id']}").json()
    assert detail["registered_count"] == 1
    assert detail["waitlist_count"] == 2
    assert detail["spots_left"] == 0


def test_cancelling_frees_spot_for_next_on_waitlist(api, world):
    event = create_event(api, world["mod"], world, capacity=1)
    register(api, world["alice"], event["id"])
    register(api, world["bob"], event["id"])
    register(api, world["owner"], event["id"])

    api.act_as(world["alice"])
    assert api.client.delete(f"{EVENTS}/{event['id']}/registrations/me").status_code == 204
    assert api.client.get(f"{EVENTS}/{event['id']}/registrations/me").status_code == 404

    api.act_as(world["bob"])
    bob = api.client.get(f"{EVENTS}/{event['id']}/registrations/me").json()
    assert bob["status"] == "registered"
    api.act_as(world["owner"])
    owner = api.client.get(f"{EVENTS}/{event['id']}/registrations/me").json()
    assert (owner["status"], owner["waitlist_position"]) == ("waitlisted", 1)


def test_leaving_the_waitlist_frees_no_spot(api, world):
    event = create_event(api, world["mod"], world, capacity=1)
    register(api, world["alice"], event["id"])
    register(api, world["bob"], event["id"])
    register(api, world["owner"], event["id"])
    api.act_as(world["bob"])
    api.client.delete(f"{EVENTS}/{event['id']}/registrations/me")
    api.act_as(world["owner"])
    owner = api.client.get(f"{EVENTS}/{event['id']}/registrations/me").json()
    assert (owner["status"], owner["waitlist_position"]) == ("waitlisted", 1)


def test_raising_capacity_moves_waitlist_up(api, world):
    event = create_event(api, world["mod"], world, capacity=1)
    for name in ("alice", "bob", "owner"):
        register(api, world[name], event["id"])
    api.act_as(world["mod"])
    body = api.client.patch(f"{EVENTS}/{event['id']}", json={"capacity": 2}).json()
    assert (body["registered_count"], body["waitlist_count"]) == (2, 1)
    body = api.client.patch(f"{EVENTS}/{event['id']}", json={"capacity": None}).json()
    assert (body["registered_count"], body["waitlist_count"]) == (3, 0)


def test_cancel_registration_when_not_registered(api, world):
    event = create_event(api, world["mod"], world)
    api.act_as(world["alice"])
    response = api.client.delete(f"{EVENTS}/{event['id']}/registrations/me")
    assert response.status_code == 404
    assert response.json()["detail"]["code"] == "not_registered"


def test_registration_closes_when_event_starts(api, world):
    event = create_event(api, world["mod"], world)
    register(api, world["alice"], event["id"])
    move_event(api, event["id"], in_days(0, -1), in_days(0, 1))

    response = register(api, world["bob"], event["id"])
    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "registration_closed"
    api.act_as(world["alice"])
    response = api.client.delete(f"{EVENTS}/{event['id']}/registrations/me")
    assert response.status_code == 409


def test_hidden_event_registration_is_404(api, world):
    api.act_as(world["owner"])
    private = api.client.post(
        COMMUNITIES, json={"name": "Leaders Circle", "visibility": "private"}
    ).json()
    event = create_event(api, world["owner"], community_id=private["id"])
    response = register(api, world["outsider"], event["id"])
    assert response.status_code == 404
    assert response.json()["detail"]["code"] == "event_not_found"


def test_organizers_list_registrations(api, world):
    event = create_event(api, world["mod"], world, capacity=2)
    for name in ("alice", "bob", "owner"):
        register(api, world[name], event["id"])

    api.act_as(world["alice"])
    assert api.client.get(f"{EVENTS}/{event['id']}/registrations").status_code == 403

    api.act_as(world["mod"])
    url = f"{EVENTS}/{event['id']}/registrations"
    first = api.client.get(url, params={"limit": 2}).json()
    second = api.client.get(url, params={"limit": 2, "cursor": first["next_cursor"]}).json()
    rows = first["items"] + second["items"]
    assert [r["user_id"] for r in rows] == [str(world[n]) for n in ("alice", "bob", "owner")]
    assert [r["status"] for r in rows] == ["registered", "registered", "waitlisted"]
    assert rows[2]["waitlist_position"] == 1

    waitlisted = api.client.get(url, params={"status": "waitlisted"}).json()["items"]
    assert [r["user_id"] for r in waitlisted] == [str(world["owner"])]


# Attendance


def test_organizer_marks_attendance_once_event_starts(api, world):
    event = create_event(api, world["mod"], world)
    register(api, world["alice"], event["id"])
    url = f"{EVENTS}/{event['id']}/registrations/{world['alice']}/attendance"

    api.act_as(world["mod"])
    early = api.client.put(url, json={"attended": True})
    assert early.status_code == 409
    assert early.json()["detail"]["code"] == "check_in_not_open"

    move_event(api, event["id"], in_days(0, hours=0.5), in_days(0, hours=2))
    marked = api.client.put(url, json={"attended": True})
    assert marked.status_code == 200
    assert marked.json()["attended_at"] is not None
    assert marked.json()["checked_in_by"] == str(world["mod"])

    undone = api.client.put(url, json={"attended": False}).json()
    assert undone["attended_at"] is None
    assert undone["checked_in_by"] is None


def test_members_cannot_mark_attendance(api, world):
    event = create_event(api, world["mod"], world)
    register(api, world["alice"], event["id"])
    move_event(api, event["id"], in_days(0, -1), in_days(0, 1))
    api.act_as(world["alice"])
    response = api.client.put(
        f"{EVENTS}/{event['id']}/registrations/{world['alice']}/attendance",
        json={"attended": True},
    )
    assert response.status_code == 403


def test_attendance_needs_a_confirmed_spot(api, world):
    event = create_event(api, world["mod"], world, capacity=1)
    register(api, world["alice"], event["id"])
    register(api, world["bob"], event["id"])
    move_event(api, event["id"], in_days(0, -1), in_days(0, 1))
    api.act_as(world["mod"])

    waitlisted = api.client.put(
        f"{EVENTS}/{event['id']}/registrations/{world['bob']}/attendance",
        json={"attended": True},
    )
    assert waitlisted.status_code == 409
    assert waitlisted.json()["detail"]["code"] == "not_confirmed"

    stranger = api.client.put(
        f"{EVENTS}/{event['id']}/registrations/{world['owner']}/attendance",
        json={"attended": True},
    )
    assert stranger.status_code == 404
    assert stranger.json()["detail"]["code"] == "not_registered"
