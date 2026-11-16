
import pytest

from app.models import AccountRole, User
from app.models.branch import Chapter
from app.models.user_profile import UserProfile
from app.models.chapter_management import ChapterCoordinator


def create_chapter(api, name="Nigeria Chapter"):
    with api.session_factory() as db:
        chapter = Chapter(
            slug=name.lower().replace(" ", "-"),
            name=name,
            country_code="NG",
            timezone="Africa/Lagos",
        )
        db.add(chapter)
        db.commit()
        db.refresh(chapter)
        return chapter.id


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
        assignment = ChapterCoordinator(
            branch_id=chapter_id,
            user_id=coordinator_id,
        )
        db.add(assignment)
        db.commit()


def test_user_can_submit_chapter_access_request(api):
    user_id = api.add_user("requester")
    chapter_id = create_chapter(api)
    create_profile(api, user_id)

    api.act_as(user_id)

    response = api.client.post(
        f"/api/v1/chapters/{chapter_id}/access-requests"
    )

    assert response.status_code == 201
    data = response.json()

    assert data["chapter_id"] == str(chapter_id)
    assert data["user_id"] == str(user_id)
    assert data["status"] == "pending"

    with api.session_factory() as db:
        profile = db.get(UserProfile, user_id)

        assert profile.preferred_chapter_id == chapter_id
        assert profile.branch_id is None


def test_user_can_view_own_chapter_access_requests(api):
    user_id = api.add_user("requester")
    chapter_id = create_chapter(api)
    create_profile(api, user_id)

    api.act_as(user_id)

    submit_response = api.client.post(
        f"/api/v1/chapters/{chapter_id}/access-requests"
    )

    assert submit_response.status_code == 201

    response = api.client.get(
        "/api/v1/me/chapter-access-requests"
    )

    assert response.status_code == 200
    assert len(response.json()) == 1
    assert response.json()[0]["chapter_id"] == str(chapter_id)
    assert response.json()[0]["status"] == "pending"


def test_chapter_coordinator_can_view_requests_for_own_chapter(api):
    user_id = api.add_user("requester")
    coordinator_id = api.add_user("coordinator")
    chapter_id = create_chapter(api)

    create_profile(api, user_id)
    assign_coordinator(api, chapter_id, coordinator_id)

    api.act_as(user_id)

    submit_response = api.client.post(
        f"/api/v1/chapters/{chapter_id}/access-requests"
    )

    assert submit_response.status_code == 201

    api.act_as(coordinator_id)

    response = api.client.get(
        f"/api/v1/chapters/{chapter_id}/access-requests"
    )

    assert response.status_code == 200
    assert len(response.json()) == 1
    assert response.json()[0]["user_id"] == str(user_id)


@pytest.mark.parametrize("decision", ["approved", "declined"])
def test_coordinator_can_review_chapter_access_request(api, decision):
    user_id = api.add_user("requester")
    coordinator_id = api.add_user("coordinator")
    chapter_id = create_chapter(api)

    create_profile(api, user_id)
    assign_coordinator(api, chapter_id, coordinator_id)

    api.act_as(user_id)

    submit_response = api.client.post(
        f"/api/v1/chapters/{chapter_id}/access-requests"
    )

    assert submit_response.status_code == 201
    request_id = submit_response.json()["id"]

    api.act_as(coordinator_id)

    response = api.client.post(
        f"/api/v1/chapter-access-requests/{request_id}/review",
        json={"status": decision},
    )

    assert response.status_code == 200

    data = response.json()

    assert data["status"] == decision
    assert data["reviewed_by"] == str(coordinator_id)
    assert data["reviewed_at"] is not None

    # Approval of a Guest request must not automatically
    # convert the user into a Member or assign official membership.
    with api.session_factory() as db:
        from app.models.user import MembershipStatus

        user = db.get(User, user_id)
        profile = db.get(UserProfile, user_id)

        assert user.membership_status == MembershipStatus.GUEST
        assert profile.branch_id is None
        assert profile.department_id is None


def test_user_can_cancel_own_pending_request(api):
    user_id = api.add_user("requester")
    chapter_id = create_chapter(api)
    create_profile(api, user_id)

    api.act_as(user_id)

    submit_response = api.client.post(
        f"/api/v1/chapters/{chapter_id}/access-requests"
    )

    assert submit_response.status_code == 201
    request_id = submit_response.json()["id"]

    response = api.client.post(
        f"/api/v1/chapter-access-requests/{request_id}/cancel"
    )

    assert response.status_code == 200
    assert response.json()["status"] == "cancelled"


def test_duplicate_pending_request_does_not_create_another_request(api):
    user_id = api.add_user("requester")
    chapter_id = create_chapter(api)
    create_profile(api, user_id)

    api.act_as(user_id)

    first_response = api.client.post(
        f"/api/v1/chapters/{chapter_id}/access-requests"
    )

    second_response = api.client.post(
        f"/api/v1/chapters/{chapter_id}/access-requests"
    )

    assert first_response.status_code == 201
    assert second_response.status_code == 201

    assert first_response.json()["id"] == second_response.json()["id"]

    response = api.client.get(
        "/api/v1/me/chapter-access-requests"
    )

    assert response.status_code == 200
    assert len(response.json()) == 1
