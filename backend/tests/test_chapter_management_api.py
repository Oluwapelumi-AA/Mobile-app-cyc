import pytest

from app.models import AccountRole

BRANCHES = "/api/v1/branches"
PROFILE = "/api/v1/profiles/me"


def branch_payload(name="CYC Lagos", city="Lagos"):
    return {
        "name": name,
        "country_code": "ng",
        "city": city,
        "timezone": "Africa/Lagos",
        "language_code": "en-NG",
    }


def create_branch(api, admin_id, name="CYC Lagos", city="Lagos"):
    api.act_as(admin_id)
    response = api.client.post(BRANCHES, json=branch_payload(name, city))
    assert response.status_code == 201, response.text
    return response.json()
def assign_member(api, admin_id, target_id, branch_id):
    """Convert a Guest into an official Member using the Admin workflow."""
    api.act_as(admin_id)

    department_response = api.client.post(
        f"{BRANCHES}/{branch_id}/departments",
        json={"name": "Test Department"},
    )
    assert department_response.status_code == 201, department_response.text

    department_id = department_response.json()["id"]

    response = api.client.patch(
        f"/api/v1/admin/users/{target_id}/membership",
        json={
            "branch_id": str(branch_id),
            "department_id": department_id,
        },
    )
    assert response.status_code == 200, response.text
    return response.json()


@pytest.fixture
def chapter_world(api):
    ids = {
        "member": api.add_user("chapter-member"),
        "coordinator": api.add_user("chapter-coordinator"),
        "other_coordinator": api.add_user("other-coordinator"),
        "admin": api.add_user("chapter-admin", AccountRole.ADMIN),
    }

    api.act_as(ids["member"])
    assert api.client.post(
        PROFILE,
        json={"display_name": "Chapter Member"},
    ).status_code == 201

    return ids

def test_admin_assigns_coordinator_and_coordinator_is_chapter_scoped(api, chapter_world):
    ids = chapter_world
    lagos = create_branch(api, ids["admin"])
    abuja = create_branch(api, ids["admin"], "CYC Abuja", "Abuja")

    assign_member(api, ids["admin"], ids["member"], lagos["id"])

    # Non-admin cannot assign coordinators.
    api.act_as(ids["coordinator"])
    response = api.client.post(
        f"{BRANCHES}/{lagos['id']}/coordinators",
        json={"user_id": str(ids["coordinator"])},
    )
    assert response.status_code == 403

    api.act_as(ids["admin"])
    response = api.client.post(
        f"{BRANCHES}/{lagos['id']}/coordinators",
        json={"user_id": str(ids["coordinator"])},
    )
    assert response.status_code == 201, response.text

    api.act_as(ids["coordinator"])
    response = api.client.get(f"{BRANCHES}/{lagos['id']}/members")
    assert response.status_code == 200, response.text
    assert [member["user_id"] for member in response.json()] == [str(ids["member"])]

    response = api.client.get(f"{BRANCHES}/{abuja['id']}/members")
    assert response.status_code == 403
    assert response.json()["detail"]["code"] == "chapter_access_denied"


def test_departments_are_platform_admin_only(api, chapter_world):
    ids = chapter_world
    lagos = create_branch(api, ids["admin"])
    api.act_as(ids["admin"])
    response = api.client.post(
        f"{BRANCHES}/{lagos['id']}/departments",
        json={"name": "Choir", "description": "Music ministry"},
    )
    assert response.status_code == 201, response.text
    department = response.json()

    api.act_as(ids["admin"])
    assigned = api.client.post(
        f"{BRANCHES}/{lagos['id']}/coordinators",
        json={"user_id": str(ids["coordinator"])},
    )
    assert assigned.status_code == 201, assigned.text

    api.act_as(ids["coordinator"])
    assert api.client.get(f"{BRANCHES}/{lagos['id']}/departments").status_code == 403
    assert api.client.post(
        f"{BRANCHES}/{lagos['id']}/departments", json={"name": "Ushering"}
    ).status_code == 403
    assert api.client.patch(
        f"{BRANCHES}/{lagos['id']}/departments/{department['id']}",
        json={"name": "Renamed"},
    ).status_code == 403
    assert api.client.delete(
        f"{BRANCHES}/{lagos['id']}/departments/{department['id']}"
    ).status_code == 403

    api.act_as(ids["admin"])
    assert api.client.patch(
        f"{BRANCHES}/{lagos['id']}/departments/{department['id']}",
        json={"description": "Choir and worship"},
    ).status_code == 200
    assert api.client.delete(
        f"{BRANCHES}/{lagos['id']}/departments/{department['id']}"
    ).status_code == 204


def test_only_admin_can_reassign_chapter_and_admin_can_manage_any_chapter(api, chapter_world):
    ids = chapter_world
    lagos = create_branch(api, ids["admin"])
    abuja = create_branch(api, ids["admin"], "CYC Abuja", "Abuja")

    api.act_as(ids["admin"])
    department_response = api.client.post(
        f"{BRANCHES}/{abuja['id']}/departments",
        json={"name": "Ushering"},
    )
    assert department_response.status_code == 201, department_response.text
    department_id = department_response.json()["id"]

    # Admin assigns the Guest as an official Member of Lagos Chapter.
    response = api.client.patch(
        f"/api/v1/admin/users/{ids['member']}/membership",
        json={
            "branch_id": str(lagos["id"]),
            "department_id": department_id,
        },
    )
    assert response.status_code == 200, response.text

    # Only an Admin can reassign official Chapter membership.
    api.act_as(ids["member"])
    response = api.client.patch(
        f"/api/v1/admin/users/{ids['member']}/membership",
        json={
            "branch_id": str(abuja["id"]),
            "department_id": department_id,
        },
    )
    assert response.status_code == 403

def test_member_cannot_switch_or_leave_selected_chapter(api, chapter_world):
    ids = chapter_world
    lagos = create_branch(api, ids["admin"])
    abuja = create_branch(api, ids["admin"], "CYC Abuja", "Abuja")

    # A Guest cannot join a Chapter through the old self-service endpoint.
    api.act_as(ids["member"])
    assert api.client.put(
        f"{BRANCHES}/{lagos['id']}/membership"
    ).status_code == 404

    # Admin assigns official membership.
    assign_member(api, ids["admin"], ids["member"], lagos["id"])

    # A Member cannot independently switch or leave.
    api.act_as(ids["member"])
    assert api.client.put(
        f"{BRANCHES}/{abuja['id']}/membership"
    ).status_code == 404
    assert api.client.delete(
        f"{BRANCHES}/{lagos['id']}/membership"
    ).status_code == 404


def test_coordinator_can_edit_profile_only_in_assigned_chapter(api, chapter_world):
    ids = chapter_world
    lagos = create_branch(api, ids["admin"])
    abuja = create_branch(api, ids["admin"], "CYC Abuja", "Abuja")

    assign_member(api, ids["admin"], ids["member"], lagos["id"])

    api.act_as(ids["admin"])
    assert api.client.post(
        f"{BRANCHES}/{lagos['id']}/coordinators",
        json={"user_id": str(ids["coordinator"])},
    ).status_code == 201

    api.act_as(ids["coordinator"])
    response = api.client.patch(
        f"{BRANCHES}/{lagos['id']}/members/{ids['member']}/profile",
        json={"display_name": "Updated Member", "bio": "Updated by coordinator"},
    )
    assert response.status_code == 200, response.text
    assert response.json()["display_name"] == "Updated Member"

    assert api.client.patch(
        f"{BRANCHES}/{abuja['id']}/members/{ids['member']}/profile",
        json={"display_name": "Cross Chapter"},
    ).status_code == 403


def test_chapter_posts_and_comments_are_scoped(api, chapter_world):
    ids = chapter_world
    lagos = create_branch(api, ids["admin"])
    abuja = create_branch(api, ids["admin"], "CYC Abuja", "Abuja")

    assign_member(api, ids["admin"], ids["member"], lagos["id"])

    api.act_as(ids["member"])
    post = api.client.post(
        f"{BRANCHES}/{lagos['id']}/posts",
        json={"body": "Lagos-only update"},
    )
    assert post.status_code == 201, post.text
    post_id = post.json()["id"]

    assert api.client.get(f"{BRANCHES}/{lagos['id']}/posts").status_code == 200
    assert api.client.get(f"{BRANCHES}/{abuja['id']}/posts").status_code == 403

    comment = api.client.post(
        f"/api/v1/chapter-posts/{post_id}/comments",
        json={"body": "Thanks"},
    )
    assert comment.status_code == 201, comment.text

    api.act_as(ids["other_coordinator"])
    assert api.client.get(
        f"/api/v1/chapter-posts/{post_id}/comments"
    ).status_code == 403
    assert api.client.post(
        f"/api/v1/chapter-posts/{post_id}/comments",
        json={"body": "Not allowed"},
    ).status_code == 403


def test_only_assigned_coordinator_or_admin_can_delete_chapter_posts(api, chapter_world):
    ids = chapter_world
    lagos = create_branch(api, ids["admin"])
    abuja = create_branch(api, ids["admin"], "CYC Abuja", "Abuja")

    # Admin assigns the Guest as an official Member.
    assign_member(api, ids["admin"], ids["member"], lagos["id"])

    api.act_as(ids["member"])
    post = api.client.post(
        f"{BRANCHES}/{lagos['id']}/posts",
        json={"body": "Post requiring moderation"},
    )
    assert post.status_code == 201, post.text
    post_id = post.json()["id"]

    comment = api.client.post(
        f"/api/v1/chapter-posts/{post_id}/comments",
        json={"body": "A comment"},
    )
    assert comment.status_code == 201, comment.text

    # A regular Member cannot delete a post, even their own.
    response = api.client.delete(f"{BRANCHES}/{lagos['id']}/posts/{post_id}")
    assert response.status_code == 403, response.text

    # An unassigned Coordinator cannot moderate another Chapter.
    api.act_as(ids["other_coordinator"])
    response = api.client.delete(f"{BRANCHES}/{lagos['id']}/posts/{post_id}")
    assert response.status_code == 403, response.text

    # The assigned Coordinator can delete the post.
    api.act_as(ids["admin"])
    assignment = api.client.post(
        f"{BRANCHES}/{lagos['id']}/coordinators",
        json={"user_id": str(ids["coordinator"])},
    )
    assert assignment.status_code == 201, assignment.text

    api.act_as(ids["coordinator"])
    response = api.client.delete(f"{BRANCHES}/{lagos['id']}/posts/{post_id}")
    assert response.status_code == 204, response.text

    assert api.client.get(f"{BRANCHES}/{lagos['id']}/posts").json() == []
    assert api.client.get(
        f"/api/v1/chapter-posts/{post_id}/comments"
    ).status_code == 404

    # Platform Admins can moderate posts in any Chapter.
    api.act_as(ids["admin"])
    admin_post = api.client.post(
        f"{BRANCHES}/{abuja['id']}/posts",
        json={"body": "Abuja post"},
    )
    assert admin_post.status_code == 201, admin_post.text

    response = api.client.delete(
        f"{BRANCHES}/{abuja['id']}/posts/{admin_post.json()['id']}"
    )
    assert response.status_code == 204, response.text


def test_coordinator_can_queue_push_for_own_chapter_only(api, chapter_world):
    ids = chapter_world
    lagos = create_branch(api, ids["admin"])
    abuja = create_branch(api, ids["admin"], "CYC Abuja", "Abuja")

    assign_member(api, ids["admin"], ids["member"], lagos["id"])

    api.act_as(ids["admin"])
    assert api.client.post(
        f"{BRANCHES}/{lagos['id']}/coordinators",
        json={"user_id": str(ids["coordinator"])},
    ).status_code == 201

    api.act_as(ids["coordinator"])
    response = api.client.post(
        f"{BRANCHES}/{lagos['id']}/push-notifications",
        json={"title": "Update", "body": "Chapter meeting"},
    )
    assert response.status_code == 202, response.text
    assert response.json()["recipients"] == 1

    assert api.client.post(
        f"{BRANCHES}/{abuja['id']}/push-notifications",
        json={"title": "Update", "body": "Wrong chapter"},
    ).status_code == 403


def test_my_coordinator_assignments_returns_only_authenticated_users_assignments(api, chapter_world):
    ids = chapter_world
    lagos = create_branch(api, ids["admin"])
    create_branch(api, ids["admin"], "CYC Abuja", "Abuja")

    # Give the ordinary user official membership, not Coordinator status.
    assign_member(api, ids["admin"], ids["member"], lagos["id"])

    # Assign the Coordinator to Lagos only.
    api.act_as(ids["admin"])
    assigned = api.client.post(
        f"{BRANCHES}/{lagos['id']}/coordinators",
        json={"user_id": str(ids["coordinator"])},
    )
    assert assigned.status_code == 201, assigned.text

    api.act_as(ids["coordinator"])
    response = api.client.get("/api/v1/chapter-coordinator/me")
    assert response.status_code == 200, response.text
    assert response.json() == [
        {
            "branch_id": str(lagos["id"]),
            "branch_name": "CYC Lagos",
        }
    ]

    # Ordinary Chapter membership must not count as Coordinator status.
    api.act_as(ids["member"])
    response = api.client.get("/api/v1/chapter-coordinator/me")
    assert response.status_code == 200, response.text
    assert response.json() == []

    # A user assigned to no Chapters receives an empty list.
    api.act_as(ids["other_coordinator"])
    response = api.client.get("/api/v1/chapter-coordinator/me")
    assert response.status_code == 200, response.text
    assert response.json() == []