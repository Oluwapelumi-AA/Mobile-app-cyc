"""Lesson video/notes uploads (S3) and the platform's emails."""

import pytest

from app.main import app
from app.services.email_sender import get_email_sender
from app.services.object_storage import InMemoryObjectStorage, get_object_storage
from tests.test_courses_api import COURSES, LESSONS, published_course, world  # noqa: F401


@pytest.fixture
def storage(api):
    store = InMemoryObjectStorage()
    app.dependency_overrides[get_object_storage] = lambda: store
    try:
        yield store
    finally:
        app.dependency_overrides.pop(get_object_storage, None)


@pytest.fixture
def outbox():
    sender = get_email_sender()
    sender.outbox.clear()
    yield sender.outbox
    sender.outbox.clear()


def upload(api, storage, lesson_id, kind="video", content_type="video/mp4", size=10_000_000):
    intent = api.client.post(
        f"{LESSONS}/{lesson_id}/files/upload-intent",
        json={"kind": kind, "content_type": content_type, "size_bytes": size},
    )
    assert intent.status_code == 200, intent.text
    key = intent.json()["object_key"]
    assert key.startswith("courses/") and f"/{kind}/" in key
    storage.put(key, content_type, size)
    return api.client.post(f"{LESSONS}/{lesson_id}/files/confirm", json={"kind": kind, "object_key": key})


def test_admin_uploads_lesson_video_and_notes(api, world, storage):  # noqa: F811
    course, _ = published_course(api, world)
    lesson = course["lessons"][0]
    res = upload(api, storage, lesson["id"])
    assert res.status_code == 200, res.text
    read = res.json()["lessons"][0]
    assert read["has_video_file"] is True and "/private/courses/" in read["video_url"]

    notes = upload(api, storage, lesson["id"], "notes", "application/pdf", 200_000).json()["lessons"][0]
    assert notes["has_notes_file"] is True and notes["notes_url"].endswith("expires_in=900")


def test_wrong_file_type_and_size_are_refused(api, world, storage):  # noqa: F811
    course, _ = published_course(api, world)
    lesson_id = course["lessons"][0]["id"]
    bad = api.client.post(
        f"{LESSONS}/{lesson_id}/files/upload-intent",
        json={"kind": "notes", "content_type": "video/mp4", "size_bytes": 100},
    )
    assert bad.status_code == 400
    huge = api.client.post(
        f"{LESSONS}/{lesson_id}/files/upload-intent",
        json={"kind": "video", "content_type": "video/mp4", "size_bytes": 50 * 1024**3},
    )
    assert huge.status_code == 400 and huge.json()["detail"]["code"] == "file_too_large"


def test_signed_links_only_for_learners_and_managers(api, world, storage):  # noqa: F811
    course, _ = published_course(api, world)
    upload(api, storage, course["lessons"][0]["id"])

    api.act_as(world["alice"])
    before = api.client.get(f"{COURSES}/{course['id']}").json()["lessons"][0]
    assert before["has_video_file"] is True and before["video_url"] is None
    api.client.put(f"{COURSES}/{course['id']}/enrollment")
    after = api.client.get(f"{COURSES}/{course['id']}").json()["lessons"][0]
    assert after["video_url"] and "/private/" in after["video_url"]


def test_removing_and_replacing_deletes_the_old_file(api, world, storage):  # noqa: F811
    course, _ = published_course(api, world)
    lesson_id = course["lessons"][0]["id"]
    upload(api, storage, lesson_id)
    upload(api, storage, lesson_id)
    assert len(storage.objects) == 1
    res = api.client.delete(f"{LESSONS}/{lesson_id}/files/video")
    assert res.status_code == 200 and res.json()["lessons"][0]["has_video_file"] is False
    assert storage.objects == {}


def test_finishing_a_course_emails_the_certificate(api, world, outbox):  # noqa: F811
    course, _ = published_course(api, world)
    api.act_as(world["alice"])
    api.client.put(f"{COURSES}/{course['id']}/enrollment")
    for lesson in course["lessons"]:
        api.client.put(f"{LESSONS}/{lesson['id']}/completion")
    mail = [m for m in outbox if m.to == "alice@example.com"]
    assert mail and "certificate" in mail[-1].subject.lower()
    assert "CYC-" in mail[-1].text and mail[-1].html
