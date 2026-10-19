from datetime import UTC, datetime, timedelta

import pytest

from app.models import AccountRole

SEARCH = "/api/v1/search"
COMMUNITIES = "/api/v1/communities"
PROFILE = "/api/v1/profiles/me"


@pytest.fixture
def world(api):
    ids = {name: api.add_user(name) for name in ("owner", "alice", "outsider")}
    ids["admin"] = api.add_user("admin", AccountRole.ADMIN)
    for name, display in (("owner", "Grace Adeyemi"), ("alice", "Alice Grace")):
        api.act_as(ids[name])
        api.client.post(PROFILE, json={"display_name": display, "bio": "Loves worship"})
    api.act_as(ids["owner"])
    public = api.client.post(
        COMMUNITIES, json={"name": "Grace Fellowship", "description": "Weekly worship"}
    ).json()["id"]
    private = api.client.post(
        COMMUNITIES, json={"name": "Grace Leaders", "visibility": "private"}
    ).json()["id"]
    api.client.post(f"{COMMUNITIES}/{public}/posts", json={"body": "Amazing grace, how sweet"})
    api.client.post(f"{COMMUNITIES}/{private}/posts", json={"body": "Grace for the leaders"})
    starts = datetime.now(UTC) + timedelta(days=2)
    for community_id, title in ((public, "Grace Night"), (private, "Grace Retreat")):
        response = api.client.post(
            "/api/v1/events",
            json={
                "community_id": community_id,
                "title": title,
                "starts_at": starts.isoformat(),
                "ends_at": (starts + timedelta(hours=2)).isoformat(),
                "timezone": "Africa/Lagos",
            },
        )
        assert response.status_code == 201, response.text
    api.act_as(ids["alice"])
    api.client.post(f"{COMMUNITIES}/{public}/join")
    api.act_as(ids["admin"])
    api.client.post(
        "/api/v1/branches",
        json={"name": "CYC Grace Town", "country_code": "NG", "timezone": "Africa/Lagos"},
    )
    for title, publish in (("Grace Devotional", True), ("Grace Draft", False)):
        resource = api.client.post(
            "/api/v1/resources", json={"kind": "article", "title": title, "body": "Read this"}
        ).json()
        if publish:
            api.client.post(f"/api/v1/resources/{resource['id']}/publish")
    return {"public": public, "private": private, **ids}


def titles(hits):
    return sorted(hit["title"] for hit in hits)


def test_search_everything(api, world):
    api.act_as(world["outsider"])
    response = api.client.get(SEARCH, params={"q": "grace"})
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["query"] == "grace"
    assert titles(body["communities"]) == ["Grace Fellowship"]
    assert titles(body["people"]) == ["Alice Grace", "Grace Adeyemi"]
    assert titles(body["posts"]) == ["Amazing grace, how sweet"]
    assert titles(body["events"]) == ["Grace Night"]
    assert titles(body["resources"]) == ["Grace Devotional"]
    assert titles(body["branches"]) == ["CYC Grace Town"]
    assert body["events"][0]["starts_at"] is not None
    assert body["communities"][0]["snippet"] == "Weekly worship"


def test_members_find_their_private_communities(api, world):
    api.act_as(world["owner"])
    body = api.client.get(SEARCH, params={"q": "grace"}).json()
    assert titles(body["communities"]) == ["Grace Fellowship", "Grace Leaders"]
    assert len(body["posts"]) == 2
    assert titles(body["events"]) == ["Grace Night", "Grace Retreat"]


def test_page_through_one_type(api, world):
    api.act_as(world["owner"])
    for n in range(4):
        api.client.post(f"{COMMUNITIES}/{world['public']}/posts", json={"body": f"Grace note {n}"})
    first = api.client.get(f"{SEARCH}/posts", params={"q": "grace", "limit": 4}).json()
    assert len(first["items"]) == 4
    assert first["items"][0]["title"] == "Grace note 3"
    rest = api.client.get(
        f"{SEARCH}/posts", params={"q": "grace", "limit": 4, "cursor": first["next_cursor"]}
    ).json()
    assert len(rest["items"]) == 2
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
    assert all(body[key] == [] for key in ("communities", "people", "posts", "events"))


@pytest.mark.parametrize("params", [{}, {"q": "g"}, {"q": "x" * 101}, {"q": "grace", "limit": 11}])
def test_bad_searches_are_rejected(api, world, params):
    api.act_as(world["outsider"])
    assert api.client.get(SEARCH, params=params).status_code == 422


def test_unknown_type(api, world):
    api.act_as(world["outsider"])
    assert api.client.get(f"{SEARCH}/sermons", params={"q": "grace"}).status_code == 422
