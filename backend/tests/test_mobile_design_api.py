"""Backend support for the mobile app designs: guest browsing, chapter
details, public leaders, certificates and instant quiz feedback."""

from datetime import UTC, datetime, timedelta

from app.models import AccountRole

V1 = "/api/v1"


def _event(api, admin, chapter_id=None, title="Youth rally"):
    api.act_as(admin)
    start = datetime.now(UTC) + timedelta(days=3)
    response = api.client.post(
        f"{V1}/events",
        json={
            "chapter_id": str(chapter_id) if chapter_id else None,
            "title": title,
            "starts_at": start.isoformat(),
            "ends_at": (start + timedelta(hours=2)).isoformat(),
            "timezone": "Africa/Lagos",
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


def _course(api, admin):
    api.act_as(admin)
    course = api.client.post(f"{V1}/courses", json={"title": "Foundations of Faith"}).json()
    lesson = api.client.post(
        f"{V1}/courses/{course['id']}/lessons",
        json={
            "title": "Who is Jesus?",
            "module_title": "Getting started",
            "scripture_reference": "John 3:16",
            "scripture_text": "For God so loved the world…",
            "notes_url": "https://example.com/notes.pdf",
        },
    ).json()["lessons"][0]
    quiz = api.client.post(
        f"{V1}/courses/{course['id']}/quizzes",
        json={
            "title": "Module 1 quiz",
            "pass_mark": 50,
            "questions": [
                {
                    "prompt": "Where do we read about Jesus' life?",
                    "options": ["The Gospels", "Leviticus"],
                    "correct_index": 0,
                    "explanation": "Matthew, Mark, Luke and John tell his story.",
                }
            ],
        },
    ).json()
    quiz = quiz["quizzes"][0] if "quizzes" in quiz else quiz
    assert api.client.post(f"{V1}/courses/{course['id']}/publish").status_code == 200
    return course, lesson, quiz


def test_guests_browse_public_content_without_signing_in(api):
    admin = api.add_user("admin", AccountRole.ADMIN)
    chapter_id = api.add_chapter("Abuja Chapter", city="Abuja", venue="Chapter hall")
    _event(api, admin, title="CYC national rally")
    _event(api, admin, chapter_id, title="Chapter meeting")
    _course(api, admin)

    api.act_as(None)  # no account
    chapters = api.client.get(f"{V1}/chapters")
    assert chapters.status_code == 200
    assert chapters.json()[0]["venue"] == "Chapter hall"
    assert api.client.get(f"{V1}/chapters/{chapter_id}").status_code == 200

    titles = [e["title"] for e in api.client.get(f"{V1}/events").json()["items"]]
    assert titles == ["CYC national rally"]  # chapter events stay members-only

    assert api.client.get(f"{V1}/courses").json()["items"][0]["title"] == "Foundations of Faith"
    assert api.client.get(f"{V1}/departments").status_code == 200


def test_requests_without_a_token_are_guests_only_on_public_reads(api):
    from app.api.deps import get_current_user_id, get_viewer_id
    from app.main import app

    # Use the real auth dependencies, as the app does.
    saved = {dep: app.dependency_overrides.pop(dep) for dep in (get_current_user_id, get_viewer_id)}
    try:
        assert api.client.get(f"{V1}/chapters").status_code == 200
        assert api.client.get(f"{V1}/me/home").status_code == 401
        bad_token = {"Authorization": "Bearer not-a-token"}
        assert api.client.get(f"{V1}/chapters", headers=bad_token).status_code == 401
    finally:
        app.dependency_overrides.update(saved)


def test_chapter_details_and_public_leaders(api):
    admin = api.add_user("admin", AccountRole.ADMIN)
    leader = api.add_user("leader")
    chapter_id = api.add_chapter("Abuja Chapter")
    api.add_member(leader, chapter_id, "Pastor Femi")
    api.add_staff(leader, chapter_id)

    api.act_as(admin)
    response = api.client.patch(
        f"{V1}/chapters/{chapter_id}",
        json={
            "venue": "Chapter hall",
            "address": "12 Wuse Rd",
            "state": "FCT",
            "meeting_schedule": "Sundays",
            "meeting_time": "2:00 pm – 4:00 pm",
            "contact_phone": "+234 800 000 0000",
            "latitude": 9.07,
            "longitude": 7.49,
        },
    )
    assert response.status_code == 200, response.text
    assert response.json()["meeting_schedule"] == "Sundays"

    api.act_as(None)
    leaders = api.client.get(f"{V1}/chapters/{chapter_id}/leaders").json()
    assert leaders == [{"user_id": str(leader), "display_name": "Pastor Femi", "role": "Chapter coordinator"}]


def test_profile_phone(api):
    user = api.add_user("ada")
    api.act_as(user)
    created = api.client.post(f"{V1}/profiles/me", json={"display_name": "Ada", "phone": "+234 801 234 5678"})
    assert created.status_code == 201, created.text
    assert created.json()["phone"] == "+234 801 234 5678"
    assert api.client.patch(f"{V1}/profiles/me", json={"phone": None}).json()["phone"] is None
    assert api.client.patch(f"{V1}/profiles/me", json={"phone": "call me"}).status_code == 422


def test_lesson_modules_check_answers_and_certificates(api):
    admin = api.add_user("admin", AccountRole.ADMIN)
    learner = api.add_user("learner")
    api.add_profile(learner, "Ada Okafor")
    course, lesson, quiz = _course(api, admin)
    assert lesson["module_title"] == "Getting started"
    assert lesson["scripture_reference"] == "John 3:16"

    api.act_as(learner)
    # Must enrol before checking answers.
    assert api.client.post(f"{V1}/course-quizzes/{quiz['id']}/check", json={"question_index": 0, "answer": 1}).status_code == 409
    api.client.put(f"{V1}/courses/{course['id']}/enrollment")

    wrong = api.client.post(f"{V1}/course-quizzes/{quiz['id']}/check", json={"question_index": 0, "answer": 1}).json()
    assert wrong == {"correct": False, "correct_index": 0, "explanation": "Matthew, Mark, Luke and John tell his story."}
    assert api.client.post(f"{V1}/course-quizzes/{quiz['id']}/check", json={"question_index": 5, "answer": 0}).status_code == 400
    # Learners don't get answers or explanations up front.
    shown = api.client.get(f"{V1}/course-quizzes/{quiz['id']}").json()["questions"][0]
    assert shown["correct_index"] is None and shown["explanation"] is None

    assert api.client.get(f"{V1}/certificates/mine").json() == []
    api.client.put(f"{V1}/course-lessons/{lesson['id']}/completion")
    certs = api.client.get(f"{V1}/certificates/mine").json()
    assert len(certs) == 1
    number = certs[0]["certificate_number"]
    assert number.startswith("CYC-")

    api.act_as(None)  # anyone can verify
    verified = api.client.get(f"{V1}/certificates/verify/{number.lower()}").json()
    assert verified["valid"] is True
    assert verified["recipient_name"] == "Ada Okafor"
    assert verified["course_title"] == "Foundations of Faith"
    assert api.client.get(f"{V1}/certificates/verify/CYC-2026-NOPE00").json()["valid"] is False
