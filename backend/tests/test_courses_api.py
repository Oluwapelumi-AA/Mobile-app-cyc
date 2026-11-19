import pytest

from app.models import AccountRole

COURSES = "/api/v1/courses"
LESSONS = "/api/v1/course-lessons"
QUIZZES = "/api/v1/course-quizzes"

QUESTIONS = [
    {"prompt": "Who wrote most of the Psalms?", "options": ["David", "Paul", "Moses"], "correct_index": 0},
    {"prompt": "How many books are in the Gospels?", "options": ["Three", "Four"], "correct_index": 1},
]


@pytest.fixture
def world(api):
    """A Chapter run by "coord" with a Member ("alice"), a second Chapter, a
    Guest ("guest") and an app moderator ("staff")."""
    ids = {name: api.add_user(name) for name in ("coord", "alice", "guest", "other")}
    ids["staff"] = api.add_user("staff", AccountRole.MODERATOR)
    cid = api.add_chapter("Abuja")
    other_cid = api.add_chapter("Ibadan")
    api.add_staff(ids["coord"], cid, "coordinator")
    api.add_member(ids["alice"], cid, "Alice")
    api.add_member(ids["other"], other_cid, "Other")
    return {"chapter_id": str(cid), "other_chapter_id": str(other_cid), **ids}


def create_course(api, user_id, **fields):
    api.act_as(user_id)
    payload = {"title": "Foundations of Faith", "level": "beginner", **fields}
    response = api.client.post(COURSES, json=payload)
    assert response.status_code == 201, response.text
    return response.json()


def add_lesson(api, course_id, title="Lesson one"):
    response = api.client.post(f"{COURSES}/{course_id}/lessons", json={"title": title, "body": "Read John 1."})
    assert response.status_code == 201, response.text
    return response.json()


def published_course(api, world, **fields):
    course = create_course(api, world["coord"], chapter_id=world["chapter_id"], **fields)
    add_lesson(api, course["id"], "Lesson one")
    course = add_lesson(api, course["id"], "Lesson two")
    quiz = api.client.post(f"{COURSES}/{course['id']}/quizzes", json={"title": "Check", "questions": QUESTIONS})
    assert quiz.status_code == 201, quiz.text
    response = api.client.post(f"{COURSES}/{course['id']}/publish")
    assert response.status_code == 200, response.text
    return response.json(), quiz.json()


def test_coordinator_creates_draft_course(api, world):
    course = create_course(api, world["coord"], chapter_id=world["chapter_id"], instructor_name="Pastor Ade")
    assert course["status"] == "draft"
    assert course["can_manage"] is True
    assert course["lessons"] == []
    assert course["instructor_name"] == "Pastor Ade"


def test_members_cannot_create_courses(api, world):
    api.act_as(world["alice"])
    response = api.client.post(COURSES, json={"title": "Mine", "chapter_id": world["chapter_id"]})
    assert response.status_code == 403


def test_only_platform_staff_create_app_wide_courses(api, world):
    api.act_as(world["coord"])
    assert api.client.post(COURSES, json={"title": "Global"}).status_code == 403
    course = create_course(api, world["staff"], title="Global course")
    assert course["chapter_id"] is None


def test_publish_needs_a_lesson(api, world):
    course = create_course(api, world["coord"], chapter_id=world["chapter_id"])
    response = api.client.post(f"{COURSES}/{course['id']}/publish")
    assert response.status_code == 400
    assert response.json()["detail"]["code"] == "lessons_required"


def test_lessons_are_ordered(api, world):
    course = create_course(api, world["coord"], chapter_id=world["chapter_id"])
    add_lesson(api, course["id"], "First")
    course = add_lesson(api, course["id"], "Second")
    assert [lesson["title"] for lesson in course["lessons"]] == ["First", "Second"]
    assert [lesson["position"] for lesson in course["lessons"]] == [0, 1]

    second = course["lessons"][1]["id"]
    response = api.client.patch(f"{LESSONS}/{second}", json={"position": 0, "title": "Now first"})
    assert response.status_code == 200
    first_two = response.json()["lessons"]
    assert {lesson["title"] for lesson in first_two} == {"First", "Now first"}


def test_drafts_are_hidden_from_members(api, world):
    course = create_course(api, world["coord"], chapter_id=world["chapter_id"])
    api.act_as(world["alice"])
    assert api.client.get(f"{COURSES}/{course['id']}").status_code == 404
    assert api.client.get(COURSES).json()["items"] == []


def test_published_course_is_visible_to_members_only(api, world):
    course, _ = published_course(api, world)
    api.act_as(world["alice"])
    listed = api.client.get(COURSES).json()["items"]
    assert [c["id"] for c in listed] == [course["id"]]
    assert listed[0]["lesson_count"] == 2
    assert listed[0]["quiz_count"] == 1

    api.act_as(world["other"])
    assert api.client.get(f"{COURSES}/{course['id']}").status_code == 404
    api.act_as(world["guest"])
    assert api.client.get(COURSES).json()["items"] == []


def test_learners_do_not_see_answers(api, world):
    _, quiz = published_course(api, world)
    assert quiz["questions"][0]["correct_index"] == 0
    api.act_as(world["alice"])
    seen = api.client.get(f"{QUIZZES}/{quiz['id']}").json()
    assert all(q["correct_index"] is None for q in seen["questions"])


def test_enrol_complete_and_get_certificate(api, world):
    course, _ = published_course(api, world)
    api.act_as(world["alice"])
    lesson_id = course["lessons"][0]["id"]
    assert api.client.put(f"{LESSONS}/{lesson_id}/completion").status_code == 409

    enrolled = api.client.put(f"{COURSES}/{course['id']}/enrollment").json()
    assert enrolled["enrolled"] is True
    assert enrolled["student_count"] == 1

    for lesson in course["lessons"]:
        result = api.client.put(f"{LESSONS}/{lesson['id']}/completion")
        assert result.status_code == 200
    final = result.json()
    assert all(lesson["completed"] for lesson in final["lessons"])
    assert final["completed_at"] is not None

    undone = api.client.delete(f"{LESSONS}/{lesson_id}/completion").json()
    assert undone["completed_at"] is None


def test_quiz_attempts_are_graded(api, world):
    course, quiz = published_course(api, world)
    api.act_as(world["alice"])
    assert api.client.post(f"{QUIZZES}/{quiz['id']}/attempts", json={"answers": [0, 1]}).status_code == 409
    api.client.put(f"{COURSES}/{course['id']}/enrollment")

    bad = api.client.post(f"{QUIZZES}/{quiz['id']}/attempts", json={"answers": [0]})
    assert bad.status_code == 400

    half = api.client.post(f"{QUIZZES}/{quiz['id']}/attempts", json={"answers": [0, 0]}).json()
    assert half["score"] == 50 and half["passed"] is False
    full = api.client.post(f"{QUIZZES}/{quiz['id']}/attempts", json={"answers": [0, 1]}).json()
    assert full["score"] == 100 and full["passed"] is True
    assert full["user_name"] == "Alice"

    mine = api.client.get(f"{QUIZZES}/{quiz['id']}/attempts/me").json()
    assert [a["score"] for a in mine] == [100, 50]


def test_managers_see_attempts_and_overview(api, world):
    course, quiz = published_course(api, world)
    api.act_as(world["alice"])
    api.client.put(f"{COURSES}/{course['id']}/enrollment")
    api.client.post(f"{QUIZZES}/{quiz['id']}/attempts", json={"answers": [0, 1]})

    api.act_as(world["alice"])
    assert api.client.get(f"{COURSES}/quiz-attempts").json()["items"] == []

    api.act_as(world["coord"])
    attempts = api.client.get(f"{COURSES}/quiz-attempts").json()["items"]
    assert len(attempts) == 1 and attempts[0]["quiz_title"] == "Check"
    overview = api.client.get(f"{COURSES}/overview").json()
    assert overview == {
        **overview,
        "courses": 1,
        "published": 1,
        "students": 1,
        "quizzes": 1,
        "certificates": 0,
    }
    assert len(overview["recent_attempts"]) == 1

    api.act_as(world["staff"])
    assert api.client.get(f"{COURSES}/overview").json()["courses"] == 1


def test_quiz_rejects_bad_answer_key(api, world):
    course = create_course(api, world["coord"], chapter_id=world["chapter_id"])
    bad = [{"prompt": "Pick one", "options": ["A", "B"], "correct_index": 5}]
    response = api.client.post(f"{COURSES}/{course['id']}/quizzes", json={"title": "Bad", "questions": bad})
    assert response.status_code == 422


def test_update_unpublish_and_delete(api, world):
    course, quiz = published_course(api, world)
    api.act_as(world["alice"])
    assert api.client.patch(f"{COURSES}/{course['id']}", json={"title": "Hijack"}).status_code == 403

    api.act_as(world["coord"])
    updated = api.client.patch(f"{COURSES}/{course['id']}", json={"title": "Faith 101", "level": "advanced", "summary": None})
    assert updated.status_code == 200
    assert updated.json()["title"] == "Faith 101"
    assert updated.json()["level"] == "advanced"

    edited = api.client.patch(f"{QUIZZES}/{quiz['id']}", json={"pass_mark": 50})
    assert edited.json()["pass_mark"] == 50

    assert api.client.post(f"{COURSES}/{course['id']}/unpublish").json()["status"] == "draft"
    assert api.client.delete(f"{QUIZZES}/{quiz['id']}").status_code == 204
    assert api.client.delete(f"{COURSES}/{course['id']}").status_code == 204
    assert api.client.get(f"{COURSES}/{course['id']}").status_code == 404


def test_managed_filter(api, world):
    published_course(api, world)
    create_course(api, world["staff"], title="Global course")
    api.act_as(world["coord"])
    managed = api.client.get(f"{COURSES}?managed=true").json()["items"]
    assert [c["title"] for c in managed] == ["Foundations of Faith"]


def test_certificates_list_completed_learners(api, world):
    course, quiz = published_course(api, world)
    api.act_as(world["alice"])
    api.client.put(f"{COURSES}/{course['id']}/enrollment")
    api.client.post(f"{QUIZZES}/{quiz['id']}/attempts", json={"answers": [0, 1]})
    for lesson in course["lessons"]:
        api.client.put(f"{LESSONS}/{lesson['id']}/completion")

    assert api.client.get(f"{COURSES}/certificates").json()["items"] == []
    api.act_as(world["coord"])
    certs = api.client.get(f"{COURSES}/certificates").json()["items"]
    assert len(certs) == 1
    assert certs[0]["user_name"] == "Alice"
    assert certs[0]["best_score"] == 100
    assert certs[0]["course_title"] == "Foundations of Faith"
