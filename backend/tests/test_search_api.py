from datetime import UTC, datetime, timedelta

import pytest

from app.models import AccountRole

SEARCH = "/api/v1/search"
CHAPTERS = "/api/v1/chapters"
PROFILE = "/api/v1/profiles/me"


@pytest.fixture
def world(api):
    """Two Chapters: Grace Fellowship (Coordinator "owner", Member "alice")
    and Grace Leaders (Coordinator "leader"). "outsider" is a Guest."""
    ids = {name: api.add_user(name) for name in ("owner", "alice", "leader", "outsider")}
    ids["admin"] = api.add_user("admin", AccountRole.ADMIN)
    for name, display in (("owner", "Grace Adeyemi"), ("alice", "Alice Grace")):
        api.act_as(ids[name])
        api.client.post(PROFILE, json={"display_name": display, "bio": "Loves worship"})
    api.act_as(ids["admin"])
    fellowship = api.client.post(
        CHAPTERS,
        json={
            "name": "Grace Fellowship",
            "description": "Weekly worship",
            "country_code": "NG",
            "timezone": "Africa/Lagos",
        },
    ).json()["id"]
    leaders = api.client.post(
        CHAPTERS,
        json={"name": "Grace Leaders", "country_code": "NG", "timezone": "Africa/Lagos"},
    ).json()["id"]
    archived = api.client.post(
        CHAPTERS,
        json={"name": "Grace Old Town", "country_code": "NG", "timezone": "Africa/Lagos"},
    ).json()["id"]
    api.client.post(f"{CHAPTERS}/{archived}/archive")
    api.add_staff(ids["owner"], fellowship, "coordinator")
    api.add_staff(ids["leader"], leaders, "coordinator")
    api.add_member(ids["alice"], fellowship)

    starts = datetime.now(UTC) + timedelta(days=2)
    for user, chapter_id, body, title in (
        ("owner", fellowship, "Amazing grace, how sweet", "Grace Night"),
        ("leader", leaders, "Grace for the leaders", "Grace Retreat"),
    ):
        api.act_as(ids[user])
        assert api.client.post(
            f"{CHAPTERS}/{chapter_id}/posts", json={"body": body}
        ).status_code == 201
        response = api.client.post(
            "/api/v1/events",
            json={
                "chapter_id": chapter_id,
                "title": title,
                "starts_at": starts.isoformat(),
                "ends_at": (starts + timedelta(hours=2)).isoformat(),
                "timezone": "Africa/Lagos",
            },
        )
        assert response.status_code == 201, response.text

    api.act_as(ids["admin"])
    for title, publish in (("Grace Devotional", True), ("Grace Draft", False)):
        resource = api.client.post(
            "/api/v1/resources", json={"kind": "article", "title": title, "body": "Read this"}
        ).json()
        if publish:
            api.client.post(f"/api/v1/resources/{resource['id']}/publish")
    return {"fellowship": fellowship, "leaders": leaders, **ids}


def titles(hits):
    return sorted(hit["title"] for hit in hits)


def test_search_everything(api, world):
    api.act_as(world["alice"])
    response = api.client.get(SEARCH, params={"q": "grace"})
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["query"] == "grace"
    # Every active Chapter is listed; archived ones aren't.
    assert titles(body["chapters"]) == ["Grace Fellowship", "Grace Leaders"]
    assert titles(body["people"]) == ["Alice Grace", "Grace Adeyemi"]
    # Content only from your own Chapter.
    assert titles(body["posts"]) == ["Amazing grace, how sweet"]
    assert titles(body["events"]) == ["Grace Night"]
    assert titles(body["resources"]) == ["Grace Devotional"]
    assert body["events"][0]["starts_at"] is not None
    assert body["events"][0]["chapter_id"] == world["fellowship"]
    fellowship = next(hit for hit in body["chapters"] if hit["title"] == "Grace Fellowship")
    assert fellowship["snippet"] == "Weekly worship"
    assert fellowship["chapter_id"] == fellowship["id"]


def test_guests_find_only_app_wide_content(api, world):
    api.act_as(world["outsider"])
    body = api.client.get(SEARCH, params={"q": "grace"}).json()
    assert body["posts"] == []
    assert body["events"] == []
    assert titles(body["resources"]) == ["Grace Devotional"]


def test_app_staff_find_every_chapters_content(api, world):
    api.act_as(world["admin"])
    body = api.client.get(SEARCH, params={"q": "grace"}).json()
    assert len(body["posts"]) == 2
    assert titles(body["events"]) == ["Grace Night", "Grace Retreat"]


def test_page_through_one_type(api, world):
    api.act_as(world["owner"])
    for n in range(4):
        api.client.post(
            f"{CHAPTERS}/{world['fellowship']}/posts", json={"body": f"Grace note {n}"}
        )
    first = api.client.get(f"{SEARCH}/posts", params={"q": "grace", "limit": 4}).json()
    assert len(first["items"]) == 4
    assert first["items"][0]["title"] == "Grace note 3"
    rest = api.client.get(
        f"{SEARCH}/posts", params={"q": "grace", "limit": 4, "cursor": first["next_cursor"]}
    ).json()
    assert len(rest["items"]) == 1
    assert rest["next_cursor"] is None


def test_suspended_people_are_not_found(api, world):
    api.act_as(world["admin"])
    api.client.post(f"/api/v1/admin/users/{world['alice']}/suspend", json={"reason": "Spam"})
    api.act_as(world["outsider"])
    hits = api.client.get(f"{SEARCH}/people", params={"q": "grace"}).json()["items"]
    assert titles(hits) == ["Grace Adeyemi"]


def test_wildcards_are_literal(api, world):
    api.act_as(world["outsider"])
    body = api.client.get(SEARCH, params={"q": "%_"}).json()
    assert all(body[key] == [] for key in ("chapters", "people", "posts", "events"))


@pytest.mark.parametrize("params", [{}, {"q": "g"}, {"q": "x" * 101}, {"q": "grace", "limit": 11}])
def test_bad_searches_are_rejected(api, world, params):
    api.act_as(world["outsider"])
    assert api.client.get(SEARCH, params=params).status_code == 422


@pytest.mark.parametrize("kind", ["sermons", "communities", "branches"])
def test_unknown_type(api, world, kind):
    api.act_as(world["outsider"])
    assert api.client.get(f"{SEARCH}/{kind}", params={"q": "grace"}).status_code == 422
