import uuid
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import func, select

from app.core.config import settings
from app.models import AccountRole, Resource, ResourceBookmark, ResourceProgress
from app.services.object_storage import InMemoryObjectStorage, get_object_storage

COMMUNITIES = "/api/v1/communities"
CATEGORIES = "/api/v1/resource-categories"
RESOURCES = "/api/v1/resources"


@pytest.fixture
def storage(api):
    """In-memory object storage, wired into the app."""
    from app.main import app

    store = InMemoryObjectStorage()
    app.dependency_overrides[get_object_storage] = lambda: store
    try:
        yield store
    finally:
        app.dependency_overrides.pop(get_object_storage, None)


@pytest.fixture
def world(api):
    """A public community with an owner, a moderator and a member, a private
    community, and an app moderator."""
    ids = {name: api.add_user(name) for name in ("owner", "mod", "alice", "outsider")}
    ids["staff"] = api.add_user("staff", AccountRole.MODERATOR)
    api.act_as(ids["owner"])
    cid = api.client.post(COMMUNITIES, json={"name": "Abuja Fellowship"}).json()["id"]
    private_id = api.client.post(
        COMMUNITIES, json={"name": "Leaders Circle", "visibility": "private"}
    ).json()["id"]
    for name in ("mod", "alice"):
        api.act_as(ids[name])
        api.client.post(f"{COMMUNITIES}/{cid}/join")
    api.act_as(ids["owner"])
    api.client.patch(f"{COMMUNITIES}/{cid}/members/{ids['mod']}", json={"role": "moderator"})
    return {"community_id": cid, "private_id": private_id, **ids}


def create(api, user_id, **fields):
    api.act_as(user_id)
    payload = {"kind": "article", "title": "Morning Devotional", "body": "Psalm 23 ..."}
    payload.update(fields)
    response = api.client.post(RESOURCES, json=payload)
    assert response.status_code == 201, response.text
    return response.json()


def publish(api, user_id, resource_id):
    api.act_as(user_id)
    response = api.client.post(f"{RESOURCES}/{resource_id}/publish")
    assert response.status_code == 200, response.text
    return response.json()


def published(api, user_id, **fields):
    resource = create(api, user_id, **fields)
    return publish(api, user_id, resource["id"])


def titles(response):
    assert response.status_code == 200, response.text
    return [item["title"] for item in response.json()["items"]]


def upload(api, storage, resource_id, content_type="audio/mpeg", size=1_000):
    intent = api.client.post(
        f"{RESOURCES}/{resource_id}/file/upload-intent",
        json={"content_type": content_type, "size_bytes": size},
    )
    assert intent.status_code == 200, intent.text
    key = intent.json()["object_key"]
    storage.put(key, content_type, size)
    return key, api.client.post(f"{RESOURCES}/{resource_id}/file/confirm", json={"object_key": key})


# Categories


def test_app_moderator_manages_categories(api, world):
    api.act_as(world["staff"])
    response = api.client.post(
        CATEGORIES, json={"name": "Bible Study & Prayer", "description": "Go deeper"}
    )
    assert response.status_code == 201
    body = response.json()
    assert body["slug"] == "bible-study-prayer"
    assert body["description"] == "Go deeper"

    response = api.client.patch(
        f"{CATEGORIES}/{body['id']}", json={"name": "Bible Study", "sort_order": 2}
    )
    assert response.status_code == 200
    assert response.json()["name"] == "Bible Study"
    assert response.json()["slug"] == "bible-study-prayer"

    assert api.client.delete(f"{CATEGORIES}/{body['id']}").status_code == 204
    assert api.client.get(CATEGORIES).json() == []


def test_categories_are_listed_in_display_order(api, world):
    api.act_as(world["staff"])
    for name, order in (("Sermons", 2), ("Devotionals", 1), ("Audio Bible", 2)):
        api.client.post(CATEGORIES, json={"name": name, "sort_order": order})
    api.act_as(world["alice"])
    names = [c["name"] for c in api.client.get(CATEGORIES).json()]
    assert names == ["Devotionals", "Audio Bible", "Sermons"]


def test_slug_from_accented_name_and_duplicates(api, world):
    api.act_as(world["staff"])
    assert api.client.post(CATEGORIES, json={"name": "Ìjọsìn"}).json()["slug"] == "ijosin"
    response = api.client.post(CATEGORIES, json={"name": "Worship", "slug": "ijosin"})
    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "category_exists"
    response = api.client.post(CATEGORIES, json={"name": "祈祷"})
    assert response.status_code == 400
    assert response.json()["detail"]["code"] == "slug_required"
    assert api.client.post(CATEGORIES, json={"name": "祈祷", "slug": "prayer"}).status_code == 201
    assert api.client.post(CATEGORIES, json={"name": "X", "slug": "Bad Slug"}).status_code == 422


@pytest.mark.parametrize("who", ["owner", "alice"])
def test_only_app_moderators_manage_categories(api, world, who):
    api.act_as(world[who])
    response = api.client.post(CATEGORIES, json={"name": "Sermons"})
    assert response.status_code == 403
    assert response.json()["detail"]["code"] == "insufficient_role"


def test_deleting_a_category_keeps_its_resources(api, world):
    api.act_as(world["staff"])
    category = api.client.post(CATEGORIES, json={"name": "Sermons"}).json()
    resource = published(api, world["staff"], category_id=category["id"])
    api.client.delete(f"{CATEGORIES}/{category['id']}")
    response = api.client.get(f"{RESOURCES}/{resource['id']}")
    assert response.status_code == 200
    assert response.json()["category_id"] is None


# Creating and publishing


def test_app_moderator_adds_to_app_wide_library(api, world):
    api.act_as(world["staff"])
    category = api.client.post(CATEGORIES, json={"name": "Devotionals"}).json()
    resource = create(
        api,
        world["staff"],
        category_id=category["id"],
        title="  Morning Devotional ",
        summary="Start the day in prayer",
        author_name="Pastor Ade",
        scripture_reference="Psalm 23",
        language="EN-gb",
    )
    assert resource["title"] == "Morning Devotional"
    assert resource["status"] == "draft"
    assert resource["published_at"] is None
    assert resource["community_id"] is None
    assert resource["category_id"] == category["id"]
    assert resource["language"] == "en-GB"
    assert resource["body"] == "Psalm 23 ..."
    assert resource["can_manage"] is True
    assert resource["bookmarked"] is False
    assert resource["my_progress"] is None

    body = publish(api, world["staff"], resource["id"])
    assert body["status"] == "published"
    assert body["published_at"] is not None


def test_community_moderator_creates_community_resources(api, world):
    resource = create(api, world["mod"], community_id=world["community_id"])
    assert resource["community_id"] == world["community_id"]


@pytest.mark.parametrize(
    "who, code", [("alice", "insufficient_role"), ("outsider", "membership_required")]
)
def test_members_cannot_create_community_resources(api, world, who, code):
    api.act_as(world[who])
    response = api.client.post(
        RESOURCES,
        json={"kind": "article", "title": "Notes", "community_id": world["community_id"]},
    )
    assert response.status_code == 403
    assert response.json()["detail"]["code"] == code


def test_only_app_moderators_add_to_app_wide_library(api, world):
    api.act_as(world["owner"])
    response = api.client.post(RESOURCES, json={"kind": "article", "title": "Notes"})
    assert response.status_code == 403
    assert response.json()["detail"]["code"] == "insufficient_role"


@pytest.mark.parametrize(
    "fields, status_code, code",
    [
        ({"category_id": str(uuid.uuid4())}, 404, "category_not_found"),
        ({"kind": "podcast"}, 422, None),
        ({"title": "  "}, 422, None),
        ({"language": "xx"}, 422, None),
        ({"external_url": "ftp://files.example.com/a.pdf"}, 422, None),
        ({"duration_seconds": 0}, 422, None),
        ({"unknown": "field"}, 422, None),
    ],
)
def test_create_validation(api, world, fields, status_code, code):
    api.act_as(world["staff"])
    response = api.client.post(RESOURCES, json={"kind": "article", "title": "Notes", **fields})
    assert response.status_code == status_code
    if code:
        assert response.json()["detail"]["code"] == code


@pytest.mark.parametrize(
    "fields",
    [
        {"kind": "article", "body": None},
        {"kind": "link", "body": None},
        {"kind": "audio", "body": None},
        {"kind": "document", "body": None},
    ],
)
def test_publishing_needs_content(api, world, fields):
    resource = create(api, world["staff"], **fields)
    response = api.client.post(f"{RESOURCES}/{resource['id']}/publish")
    assert response.status_code == 400
    assert response.json()["detail"]["code"] == "resource_incomplete"


@pytest.mark.parametrize("kind", ["link", "video", "audio"])
def test_external_url_is_enough_for_links_and_media(api, world, kind):
    resource = published(
        api, world["staff"], kind=kind, body=None, external_url="https://youtu.be/abc"
    )
    assert resource["status"] == "published"
    assert resource["external_url"] == "https://youtu.be/abc"


def test_publishing_twice_keeps_the_date(api, world):
    resource = published(api, world["staff"])
    again = publish(api, world["staff"], resource["id"])
    assert again["published_at"] == resource["published_at"]
    api.client.post(f"{RESOURCES}/{resource['id']}/unpublish")
    assert publish(api, world["staff"], resource["id"])["published_at"] == resource["published_at"]


def test_members_cannot_publish_or_edit(api, world):
    resource = create(api, world["mod"], community_id=world["community_id"])
    publish(api, world["mod"], resource["id"])
    api.act_as(world["alice"])
    for response in (
        api.client.post(f"{RESOURCES}/{resource['id']}/unpublish"),
        api.client.patch(f"{RESOURCES}/{resource['id']}", json={"title": "Changed"}),
        api.client.delete(f"{RESOURCES}/{resource['id']}"),
    ):
        assert response.status_code == 403
        assert response.json()["detail"]["code"] == "insufficient_role"


def test_app_moderators_manage_community_resources(api, world):
    resource = create(api, world["mod"], community_id=world["community_id"])
    publish(api, world["staff"], resource["id"])
    api.act_as(world["staff"])
    assert api.client.get(f"{RESOURCES}/{resource['id']}").json()["can_manage"] is True


# Editing


def test_update_changes_only_sent_fields(api, world):
    resource = create(api, world["staff"], summary="Old", author_name="Pastor Ade")
    api.act_as(world["staff"])
    response = api.client.patch(
        f"{RESOURCES}/{resource['id']}", json={"summary": "New", "author_name": None}
    )
    assert response.status_code == 200
    body = response.json()
    assert body["summary"] == "New"
    assert body["author_name"] is None
    assert body["title"] == "Morning Devotional"
    assert body["body"] == "Psalm 23 ..."


def test_published_resource_cannot_lose_its_content(api, world):
    resource = published(api, world["staff"])
    api.act_as(world["staff"])
    response = api.client.patch(f"{RESOURCES}/{resource['id']}", json={"body": None})
    assert response.status_code == 400
    assert response.json()["detail"]["code"] == "resource_incomplete"
    assert api.client.get(f"{RESOURCES}/{resource['id']}").json()["body"] == "Psalm 23 ..."


def test_kind_is_locked_while_a_file_is_attached(api, world, storage):
    resource = create(api, world["staff"], kind="audio", body=None)
    upload(api, storage, resource["id"])
    response = api.client.patch(f"{RESOURCES}/{resource['id']}", json={"kind": "video"})
    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "file_attached"


# Seeing resources


def test_drafts_are_hidden_from_readers(api, world):
    resource = create(api, world["staff"])
    api.act_as(world["alice"])
    response = api.client.get(f"{RESOURCES}/{resource['id']}")
    assert response.status_code == 404
    assert response.json()["detail"]["code"] == "resource_not_found"
    assert titles(api.client.get(RESOURCES)) == []


def test_private_community_resources_are_hidden(api, world):
    resource = published(api, world["owner"], community_id=world["private_id"], title="Leaders")
    api.act_as(world["alice"])
    assert api.client.get(f"{RESOURCES}/{resource['id']}").status_code == 404
    assert titles(api.client.get(RESOURCES)) == []
    api.act_as(world["owner"])
    assert titles(api.client.get(RESOURCES)) == ["Leaders"]


def test_library_lists_newest_published_first(api, world):
    first = create(api, world["staff"], title="Written first")
    published(api, world["staff"], title="Second")
    published(api, world["mod"], community_id=world["community_id"], title="Community one")
    publish(api, world["staff"], first["id"])
    api.act_as(world["outsider"])
    assert titles(api.client.get(RESOURCES)) == ["Written first", "Community one", "Second"]


def test_library_pages(api, world):
    for number in range(5):
        published(api, world["staff"], title=f"Day {number}")
    api.act_as(world["alice"])
    page = api.client.get(RESOURCES, params={"limit": 2}).json()
    seen = [item["title"] for item in page["items"]]
    while page["next_cursor"]:
        page = api.client.get(RESOURCES, params={"limit": 2, "cursor": page["next_cursor"]}).json()
        seen += [item["title"] for item in page["items"]]
    assert seen == [f"Day {number}" for number in reversed(range(5))]
    assert "body" not in page["items"][0]


def test_library_filters(api, world):
    api.act_as(world["staff"])
    category = api.client.post(CATEGORIES, json={"name": "Sermons"}).json()
    published(api, world["staff"], title="Sermon on grace", category_id=category["id"],
              kind="audio", body=None, external_url="https://cdn.example.com/a.mp3",
              language="en-NG", author_name="Pastor Ade")
    published(api, world["staff"], title="Ìfẹ́ Ọlọ́run", language="yo",
              scripture_reference="John 3:16")
    published(api, world["mod"], community_id=world["community_id"], title="Youth notes",
              language="en")

    api.act_as(world["alice"])
    get = lambda **params: titles(api.client.get(RESOURCES, params=params))  # noqa: E731
    assert get(category_id=category["id"]) == ["Sermon on grace"]
    assert get(kind="audio") == ["Sermon on grace"]
    assert get(language="EN") == ["Youth notes", "Sermon on grace"]
    assert get(language="yo") == ["Ìfẹ́ Ọlọ́run"]
    assert get(community_id=world["community_id"]) == ["Youth notes"]
    assert get(q="ade") == ["Sermon on grace"]
    assert get(q="john 3") == ["Ìfẹ́ Ọlọ́run"]
    assert get(q="100%") == []
    response = api.client.get(RESOURCES, params={"language": "zz"})
    assert response.status_code == 400
    assert response.json()["detail"]["code"] == "invalid_language"


def test_drafts_list_shows_what_you_manage(api, world):
    create(api, world["staff"], title="App draft")
    create(api, world["mod"], community_id=world["community_id"], title="Community draft")
    create(api, world["owner"], community_id=world["private_id"], title="Private draft")
    published(api, world["staff"], title="Live")

    api.act_as(world["mod"])
    assert titles(api.client.get(RESOURCES, params={"drafts": True})) == ["Community draft"]
    api.act_as(world["staff"])
    assert titles(api.client.get(RESOURCES, params={"drafts": True})) == [
        "Private draft",
        "Community draft",
        "App draft",
    ]
    api.act_as(world["alice"])
    assert titles(api.client.get(RESOURCES, params={"drafts": True})) == []
    response = api.client.get(
        RESOURCES, params={"drafts": True, "community_id": world["community_id"]}
    )
    assert response.status_code == 403


def test_delete_removes_file_bookmarks_and_progress(api, world, storage):
    resource = create(api, world["staff"], kind="document", body=None)
    key, _ = upload(api, storage, resource["id"], "application/pdf")
    publish(api, world["staff"], resource["id"])
    api.act_as(world["alice"])
    api.client.put(f"{RESOURCES}/{resource['id']}/bookmark")
    api.client.put(f"{RESOURCES}/{resource['id']}/progress", json={"percent": 30})

    api.act_as(world["staff"])
    assert api.client.delete(f"{RESOURCES}/{resource['id']}").status_code == 204
    assert key not in storage.objects
    with api.session_factory() as db:
        assert db.scalar(select(func.count()).select_from(Resource)) == 0
        assert db.scalar(select(func.count()).select_from(ResourceBookmark)) == 0
        assert db.scalar(select(func.count()).select_from(ResourceProgress)) == 0


# Files


def test_upload_and_read_a_file(api, world, storage):
    resource = create(api, world["staff"], kind="audio", body=None, duration_seconds=1800)
    key, response = upload(api, storage, resource["id"], "audio/mpeg", 4_000)
    assert key.startswith(f"resources/{resource['id']}/") and key.endswith(".mp3")
    assert response.status_code == 200
    body = response.json()
    assert body["has_file"] is True
    assert body["file_content_type"] == "audio/mpeg"
    assert body["file_size_bytes"] == 4_000

    publish(api, world["staff"], resource["id"])
    api.act_as(world["alice"])
    body = api.client.get(f"{RESOURCES}/{resource['id']}").json()
    assert body["file_url"] == (
        f"https://storage.test/private/{key}?expires_in={settings.storage_presign_ttl_seconds}"
    )
    expires = datetime.fromisoformat(body["file_url_expires_at"])
    assert expires > datetime.now(UTC) + timedelta(
        seconds=settings.storage_presign_ttl_seconds - 60
    )
    listed = api.client.get(RESOURCES).json()["items"][0]
    assert listed["has_file"] is True
    assert "file_url" not in listed


def test_replacing_a_file_deletes_the_old_one(api, world, storage):
    resource = create(api, world["staff"], kind="audio", body=None)
    old_key, _ = upload(api, storage, resource["id"])
    new_key, response = upload(api, storage, resource["id"], "audio/mp4")
    assert response.status_code == 200
    assert old_key not in storage.objects
    assert new_key in storage.objects
    assert response.json()["file_content_type"] == "audio/mp4"


@pytest.mark.parametrize(
    "kind, content_type, status_code, code",
    [
        ("article", "audio/mpeg", 409, "file_not_allowed"),
        ("link", "application/pdf", 409, "file_not_allowed"),
        ("audio", "video/mp4", 400, "unsupported_file_type"),
        ("document", "audio/mpeg", 400, "unsupported_file_type"),
    ],
)
def test_upload_must_fit_the_kind(api, world, storage, kind, content_type, status_code, code):
    resource = create(api, world["staff"], kind=kind)
    response = api.client.post(
        f"{RESOURCES}/{resource['id']}/file/upload-intent",
        json={"content_type": content_type, "size_bytes": 100},
    )
    assert response.status_code == status_code
    assert response.json()["detail"]["code"] == code


def test_upload_intent_limits(api, world, storage):
    resource = create(api, world["staff"], kind="audio", body=None)
    for payload in (
        {"content_type": "image/png", "size_bytes": 100},
        {"content_type": "audio/mpeg", "size_bytes": settings.resource_max_upload_bytes + 1},
    ):
        response = api.client.post(
            f"{RESOURCES}/{resource['id']}/file/upload-intent", json=payload
        )
        assert response.status_code == 422


def test_confirm_checks_the_uploaded_file(api, world, storage):
    resource = create(api, world["staff"], kind="audio", body=None)
    other = create(api, world["staff"], kind="audio", body=None)
    confirm = lambda key: api.client.post(  # noqa: E731
        f"{RESOURCES}/{resource['id']}/file/confirm", json={"object_key": key}
    )
    prefix = f"resources/{resource['id']}/"

    assert confirm(f"{prefix}missing.mp3").json()["detail"]["code"] == "invalid_upload"
    storage.put(f"resources/{other['id']}/theirs.mp3", "audio/mpeg", 10)
    assert confirm(f"resources/{other['id']}/theirs.mp3").json()["detail"]["code"] == "invalid_upload"

    storage.put(f"{prefix}wrong.mp3", "image/png", 10)
    response = confirm(f"{prefix}wrong.mp3")
    assert response.json()["detail"]["code"] == "unsupported_file_type"
    assert f"{prefix}wrong.mp3" not in storage.objects

    storage.put(f"{prefix}big.mp3", "audio/mpeg", settings.resource_max_upload_bytes + 1)
    response = confirm(f"{prefix}big.mp3")
    assert response.json()["detail"]["code"] == "file_too_large"
    assert f"{prefix}big.mp3" not in storage.objects


def test_remove_file(api, world, storage):
    resource = create(api, world["staff"], kind="audio", body=None)
    key, _ = upload(api, storage, resource["id"])
    publish(api, world["staff"], resource["id"])

    response = api.client.delete(f"{RESOURCES}/{resource['id']}/file")
    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "resource_published"
    assert key in storage.objects

    api.client.patch(
        f"{RESOURCES}/{resource['id']}", json={"external_url": "https://cdn.example.com/a.mp3"}
    )
    response = api.client.delete(f"{RESOURCES}/{resource['id']}/file")
    assert response.status_code == 200
    assert response.json()["has_file"] is False
    assert key not in storage.objects
    assert api.client.delete(f"{RESOURCES}/{resource['id']}/file").status_code == 404


def test_storage_off(api, world):
    from app.main import app
    from app.services.object_storage import UnconfiguredObjectStorage

    app.dependency_overrides[get_object_storage] = UnconfiguredObjectStorage
    try:
        resource = create(api, world["staff"], kind="audio", body=None)
        response = api.client.post(
            f"{RESOURCES}/{resource['id']}/file/upload-intent",
            json={"content_type": "audio/mpeg", "size_bytes": 100},
        )
        assert response.status_code == 503
        assert response.json()["detail"]["code"] == "storage_unavailable"
        # Reading still works, just without a file link.
        assert api.client.get(f"{RESOURCES}/{resource['id']}").json()["file_url"] is None
    finally:
        app.dependency_overrides.pop(get_object_storage, None)


# Bookmarks


def test_bookmarks(api, world):
    first = published(api, world["staff"], title="First")
    second = published(api, world["staff"], title="Second")
    api.act_as(world["alice"])
    response = api.client.put(f"{RESOURCES}/{first['id']}/bookmark")
    assert response.status_code == 200
    assert response.json()["bookmarked"] is True
    again = api.client.put(f"{RESOURCES}/{first['id']}/bookmark")
    assert again.json()["created_at"] == response.json()["created_at"]
    api.client.put(f"{RESOURCES}/{second['id']}/bookmark")

    assert titles(api.client.get(f"{RESOURCES}/bookmarks")) == ["Second", "First"]
    assert api.client.get(f"{RESOURCES}/{first['id']}").json()["bookmarked"] is True
    assert [i["bookmarked"] for i in api.client.get(RESOURCES).json()["items"]] == [True, True]

    assert api.client.delete(f"{RESOURCES}/{first['id']}/bookmark").status_code == 204
    assert api.client.delete(f"{RESOURCES}/{first['id']}/bookmark").status_code == 204
    assert titles(api.client.get(f"{RESOURCES}/bookmarks")) == ["Second"]

    api.act_as(world["mod"])
    assert titles(api.client.get(f"{RESOURCES}/bookmarks")) == []


def test_bookmarks_page(api, world):
    resources = [published(api, world["staff"], title=f"Day {n}") for n in range(3)]
    api.act_as(world["alice"])
    for resource in resources:
        api.client.put(f"{RESOURCES}/{resource['id']}/bookmark")
    page = api.client.get(f"{RESOURCES}/bookmarks", params={"limit": 2}).json()
    assert [i["title"] for i in page["items"]] == ["Day 2", "Day 1"]
    page = api.client.get(
        f"{RESOURCES}/bookmarks", params={"limit": 2, "cursor": page["next_cursor"]}
    ).json()
    assert [i["title"] for i in page["items"]] == ["Day 0"]
    assert page["next_cursor"] is None


def test_cannot_bookmark_a_draft(api, world):
    resource = create(api, world["staff"])
    api.act_as(world["staff"])
    response = api.client.put(f"{RESOURCES}/{resource['id']}/bookmark")
    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "resource_not_published"
    api.act_as(world["alice"])
    assert api.client.put(f"{RESOURCES}/{resource['id']}/bookmark").status_code == 404


def test_unpublished_bookmarks_drop_out_of_the_list(api, world):
    resource = published(api, world["staff"])
    api.act_as(world["alice"])
    api.client.put(f"{RESOURCES}/{resource['id']}/bookmark")
    api.act_as(world["staff"])
    api.client.post(f"{RESOURCES}/{resource['id']}/unpublish")
    api.act_as(world["alice"])
    assert titles(api.client.get(f"{RESOURCES}/bookmarks")) == []
    publish(api, world["staff"], resource["id"])
    api.act_as(world["alice"])
    assert titles(api.client.get(f"{RESOURCES}/bookmarks")) == ["Morning Devotional"]


def test_leaving_a_private_community_hides_its_bookmarks(api, world):
    resource = published(api, world["owner"], community_id=world["private_id"])
    api.act_as(world["owner"])
    api.client.put(f"{RESOURCES}/{resource['id']}/bookmark")
    with api.session_factory() as db:
        from app.models import CommunityMembership

        db.execute(
            CommunityMembership.__table__.delete().where(
                CommunityMembership.user_id == world["owner"]
            )
        )
        db.commit()
    assert titles(api.client.get(f"{RESOURCES}/bookmarks")) == []


# Progress


def test_progress(api, world):
    resource = published(
        api, world["staff"], kind="audio", body=None, external_url="https://cdn.example.com/a.mp3"
    )
    url = f"{RESOURCES}/{resource['id']}/progress"
    api.act_as(world["alice"])
    response = api.client.get(url)
    assert response.status_code == 404
    assert response.json()["detail"]["code"] == "no_progress"

    response = api.client.put(url, json={"percent": 40, "position_seconds": 600})
    assert response.status_code == 200
    body = response.json()
    assert body["percent"] == 40
    assert body["position_seconds"] == 600
    assert body["completed"] is False

    body = api.client.put(url, json={"percent": 55}).json()
    assert body["position_seconds"] == 600
    assert api.client.get(f"{RESOURCES}/{resource['id']}").json()["my_progress"]["percent"] == 55

    body = api.client.put(url, json={"completed": True}).json()
    assert body["percent"] == 100
    assert body["completed"] is True
    completed_at = body["completed_at"]

    body = api.client.put(url, json={"percent": 5, "position_seconds": None}).json()
    assert body["percent"] == 5
    assert body["position_seconds"] is None
    assert body["completed_at"] == completed_at

    assert api.client.delete(url).status_code == 204
    assert api.client.get(url).status_code == 404


@pytest.mark.parametrize(
    "payload", [{"percent": 101}, {"percent": -1}, {"position_seconds": -5}, {"extra": 1}]
)
def test_progress_validation(api, world, payload):
    resource = published(api, world["staff"])
    api.act_as(world["alice"])
    assert api.client.put(f"{RESOURCES}/{resource['id']}/progress", json=payload).status_code == 422


def test_progress_needs_a_published_resource(api, world):
    resource = create(api, world["staff"])
    api.act_as(world["staff"])
    response = api.client.put(f"{RESOURCES}/{resource['id']}/progress", json={"percent": 10})
    assert response.status_code == 409


def test_in_progress_lists_unfinished_most_recent_first(api, world):
    first, second, third = (published(api, world["staff"], title=t) for t in ("Day A", "Day B", "Day C"))
    api.act_as(world["alice"])
    progress = lambda r, **p: api.client.put(f"{RESOURCES}/{r['id']}/progress", json=p)  # noqa: E731
    progress(first, percent=10)
    progress(second, percent=20)
    progress(third, completed=True)
    progress(first, percent=30)

    assert titles(api.client.get(f"{RESOURCES}/in-progress")) == ["Day A", "Day B"]
    page = api.client.get(f"{RESOURCES}/in-progress", params={"limit": 1}).json()
    assert [i["title"] for i in page["items"]] == ["Day A"]
    assert page["items"][0]["my_progress"]["percent"] == 30
    page = api.client.get(
        f"{RESOURCES}/in-progress", params={"limit": 1, "cursor": page["next_cursor"]}
    ).json()
    assert [i["title"] for i in page["items"]] == ["Day B"]
    assert page["next_cursor"] is None

    api.act_as(world["mod"])
    assert titles(api.client.get(f"{RESOURCES}/in-progress")) == []


def test_bad_cursor(api, world):
    api.act_as(world["alice"])
    for path in (RESOURCES, f"{RESOURCES}/bookmarks", f"{RESOURCES}/in-progress"):
        response = api.client.get(path, params={"cursor": "nope"})
        assert response.status_code == 400
        assert response.json()["detail"]["code"] == "invalid_cursor"
