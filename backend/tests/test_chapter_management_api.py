"""Chapters: directory, staff (Coordinator + Moderators), members, feed,
bans, announcements and the Chapter dashboard."""

import pytest

from app.models import AccountRole

CHAPTERS = "/api/v1/chapters"
PROFILE = "/api/v1/profiles/me"


def chapter_payload(name="CYC Lagos", city="Lagos"):
    return {
        "name": name,
        "country_code": "ng",
        "city": city,
        "timezone": "Africa/Lagos",
        "language_code": "en-NG",
    }


def create_chapter(api, admin_id, name="CYC Lagos", city="Lagos"):
    api.act_as(admin_id)
    response = api.client.post(CHAPTERS, json=chapter_payload(name, city))
    assert response.status_code == 201, response.text
    return response.json()


def create_department(api, admin_id, name="Test Department"):
    api.act_as(admin_id)
    response = api.client.post("/api/v1/departments", json={"name": name})
    assert response.status_code == 201, response.text
    return response.json()["id"]


def assign_member(api, admin_id, target_id, chapter_id, department_id=None):
    """Convert a Guest into an official Member using the Admin workflow."""
    department_id = department_id or create_department(api, admin_id, f"Dept {target_id}")
    api.act_as(admin_id)
    response = api.client.patch(
        f"/api/v1/admin/users/{target_id}/membership",
        json={"chapter_id": str(chapter_id), "department_id": department_id},
    )
    assert response.status_code == 200, response.text
    return response.json()


@pytest.fixture
def world(api):
    ids = {
        "member": api.add_user("chapter-member"),
        "other_member": api.add_user("other-member"),
        "coordinator": api.add_user("chapter-coordinator"),
        "other_coordinator": api.add_user("other-coordinator"),
        "guest": api.add_user("guest"),
        "admin": api.add_user("chapter-admin", AccountRole.ADMIN),
        "app_mod": api.add_user("app-moderator", AccountRole.MODERATOR),
    }
    for key in ("member", "other_member", "coordinator", "guest"):
        api.act_as(ids[key])
        assert api.client.post(
            PROFILE, json={"display_name": key.replace("_", " ").title()}
        ).status_code == 201

    ids["lagos"] = create_chapter(api, ids["admin"])["id"]
    ids["abuja"] = create_chapter(api, ids["admin"], "CYC Abuja", "Abuja")["id"]
    assign_member(api, ids["admin"], ids["member"], ids["lagos"])
    assign_member(api, ids["admin"], ids["other_member"], ids["abuja"])

    api.act_as(ids["admin"])
    assert api.client.post(
        f"{CHAPTERS}/{ids['lagos']}/coordinators", json={"user_id": str(ids["coordinator"])}
    ).status_code == 201
    assert api.client.post(
        f"{CHAPTERS}/{ids['abuja']}/coordinators",
        json={"user_id": str(ids["other_coordinator"])},
    ).status_code == 201
    return ids


# Directory


def test_only_admins_create_edit_and_archive_chapters(api, world):
    api.act_as(world["member"])
    assert api.client.post(CHAPTERS, json=chapter_payload("CYC Ibadan")).status_code == 403
    assert api.client.patch(
        f"{CHAPTERS}/{world['lagos']}", json={"name": "Nope"}
    ).status_code == 403
    assert api.client.post(f"{CHAPTERS}/{world['lagos']}/archive").status_code == 403

    api.act_as(world["admin"])
    response = api.client.patch(f"{CHAPTERS}/{world['lagos']}", json={"city": "Ikeja"})
    assert response.status_code == 200
    assert response.json()["city"] == "Ikeja"

    archived = api.client.post(f"{CHAPTERS}/{world['abuja']}/archive")
    assert archived.status_code == 200 and archived.json()["is_active"] is False

    api.act_as(world["member"])
    names = [chapter["name"] for chapter in api.client.get(CHAPTERS).json()]
    assert names == ["CYC Lagos"]
    assert api.client.get(CHAPTERS, params={"include_archived": True}).status_code == 403


def test_duplicate_slug_conflicts(api, world):
    api.act_as(world["admin"])
    response = api.client.post(CHAPTERS, json=chapter_payload())
    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "chapter_exists"


def test_chapter_shows_my_role_and_member_count(api, world):
    roles = {}
    for key in ("member", "coordinator", "guest", "admin", "app_mod"):
        api.act_as(world[key])
        chapter = api.client.get(f"{CHAPTERS}/{world['lagos']}").json()
        roles[key] = chapter["my_role"]
        assert chapter["member_count"] == 1
    assert roles == {
        "member": "member",
        "coordinator": "coordinator",
        "guest": None,
        "admin": "platform_admin",
        "app_mod": "platform_moderator",
    }
    api.act_as(world["member"])
    assert api.client.get(f"{CHAPTERS}/{world['lagos']}").json()["is_mine"] is True


# Staff


def test_only_admins_assign_staff(api, world):
    api.act_as(world["coordinator"])
    response = api.client.put(
        f"{CHAPTERS}/{world['abuja']}/staff/{world['member']}", json={"role": "coordinator"}
    )
    assert response.status_code == 403
    assert response.json()["detail"]["code"] == "admin_only"


def test_chapter_moderator_role_is_gone(api, world):
    api.act_as(world["admin"])
    assert api.client.get(f"{CHAPTERS}/{world['lagos']}/moderators").status_code == 404
    response = api.client.put(
        f"{CHAPTERS}/{world['lagos']}/staff/{world['member']}", json={"role": "moderator"}
    )
    assert response.status_code == 422


def test_staff_list_shows_the_coordinator(api, world):
    api.act_as(world["member"])
    staff = api.client.get(f"{CHAPTERS}/{world['lagos']}/staff").json()
    assert [(row["user_id"], row["role"]) for row in staff] == [
        (str(world["coordinator"]), "coordinator"),
    ]
    assert staff[0]["display_name"] == "Coordinator"

    # Someone outside the Chapter can't see its staff.
    api.act_as(world["other_member"])
    assert api.client.get(f"{CHAPTERS}/{world['lagos']}/staff").status_code == 403


def test_one_coordinator_per_chapter(api, world):
    api.act_as(world["admin"])
    response = api.client.post(
        f"{CHAPTERS}/{world['lagos']}/coordinators",
        json={"user_id": str(world["other_coordinator"])},
    )
    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "coordinator_assignment_conflict"

    # Assigning the same Coordinator again is a no-op.
    assert api.client.post(
        f"{CHAPTERS}/{world['lagos']}/coordinators",
        json={"user_id": str(world["coordinator"])},
    ).status_code == 201


def test_admin_replaces_and_removes_the_coordinator(api, world):
    api.act_as(world["admin"])
    assert api.client.delete(
        f"{CHAPTERS}/{world['lagos']}/coordinators/{world['coordinator']}"
    ).status_code == 204
    response = api.client.put(
        f"{CHAPTERS}/{world['lagos']}/staff/{world['member']}", json={"role": "coordinator"}
    )
    assert response.status_code == 200
    assert response.json()["role"] == "coordinator"
    assert api.client.delete(
        f"{CHAPTERS}/{world['lagos']}/staff/{world['member']}"
    ).status_code == 204

    # The person is told about each change.
    api.act_as(world["member"])
    types = [n["type"] for n in api.client.get("/api/v1/notifications").json()["items"]]
    assert types.count("chapter_role_changed") == 2


def test_my_staff_roles(api, world):
    api.act_as(world["coordinator"])
    assert api.client.get("/api/v1/me/chapter-staff").json() == [
        {"chapter_id": world["lagos"], "chapter_name": "CYC Lagos", "role": "coordinator"}
    ]
    api.act_as(world["member"])
    assert api.client.get("/api/v1/me/chapter-staff").json() == []


# Members


def test_staff_list_only_their_chapter_members(api, world):
    for key in ("coordinator",):
        api.act_as(world[key])
        response = api.client.get(f"{CHAPTERS}/{world['lagos']}/members")
        assert response.status_code == 200, response.text
        assert [m["user_id"] for m in response.json()] == [str(world["member"])]
        assert api.client.get(f"{CHAPTERS}/{world['abuja']}/members").status_code == 403

    api.act_as(world["member"])
    assert api.client.get(f"{CHAPTERS}/{world['lagos']}/members").status_code == 403


def test_only_admin_reassigns_or_removes_members(api, world):
    department_id = create_department(api, world["admin"], "Ushering")

    api.act_as(world["member"])
    assert api.client.patch(
        f"/api/v1/admin/users/{world['member']}/membership",
        json={"chapter_id": str(world["abuja"]), "department_id": department_id},
    ).status_code == 403

    api.act_as(world["coordinator"])
    assert api.client.delete(
        f"{CHAPTERS}/{world['lagos']}/members/{world['member']}"
    ).status_code == 403

    api.act_as(world["admin"])
    assert api.client.delete(
        f"{CHAPTERS}/{world['lagos']}/members/{world['member']}"
    ).status_code == 204
    user = api.client.get(f"/api/v1/admin/users/{world['member']}").json()
    assert user["membership_status"] == "guest"
    assert user["chapter_id"] is None

    api.act_as(world["member"])
    types = [n["type"] for n in api.client.get("/api/v1/notifications").json()["items"]]
    assert "chapter_removed" in types


def test_coordinator_edits_profile_only_in_own_chapter(api, world):
    api.act_as(world["coordinator"])
    response = api.client.patch(
        f"{CHAPTERS}/{world['lagos']}/members/{world['member']}/profile",
        json={"display_name": "Updated Member", "bio": "Updated by coordinator"},
    )
    assert response.status_code == 200, response.text
    assert response.json()["display_name"] == "Updated Member"
    assert response.json()["chapter_id"] == world["lagos"]

    assert api.client.patch(
        f"{CHAPTERS}/{world['abuja']}/members/{world['other_member']}/profile",
        json={"display_name": "Cross Chapter"},
    ).status_code == 403

    # Members don't edit other people's profiles.
    api.act_as(world["member"])
    assert api.client.patch(
        f"{CHAPTERS}/{world['lagos']}/members/{world['member']}/profile",
        json={"display_name": "Nope"},
    ).status_code == 403


# Feed


def test_members_post_and_comment_in_their_chapter_only(api, world):
    api.act_as(world["member"])
    post = api.client.post(f"{CHAPTERS}/{world['lagos']}/posts", json={"body": "Lagos update"})
    assert post.status_code == 201, post.text
    assert post.json()["chapter_id"] == world["lagos"]
    post_id = post.json()["id"]

    feed = api.client.get(f"{CHAPTERS}/{world['lagos']}/posts").json()
    assert [item["id"] for item in feed["items"]] == [post_id]

    assert api.client.post(
        f"/api/v1/posts/{post_id}/comments", json={"body": "Thanks"}
    ).status_code == 201

    # Members of another Chapter neither see nor post.
    api.act_as(world["other_member"])
    assert api.client.get(f"{CHAPTERS}/{world['lagos']}/posts").json()["items"] == []
    assert api.client.get(f"/api/v1/posts/{post_id}").status_code == 404
    response = api.client.post(f"{CHAPTERS}/{world['lagos']}/posts", json={"body": "Hi"})
    assert response.status_code == 403
    assert response.json()["detail"]["code"] == "membership_required"


def test_guests_read_only_granted_posts(api, world):
    api.act_as(world["member"])
    granted = api.client.post(f"{CHAPTERS}/{world['lagos']}/posts", json={"body": "Open"}).json()
    hidden = api.client.post(f"{CHAPTERS}/{world['lagos']}/posts", json={"body": "Hidden"}).json()

    api.act_as(world["guest"])
    request = api.client.post(f"{CHAPTERS}/{world['lagos']}/access-requests")
    assert request.status_code == 201, request.text

    api.act_as(world["coordinator"])
    assert api.client.post(
        f"/api/v1/chapter-access-requests/{request.json()['id']}/review",
        json={"status": "approved"},
    ).status_code == 200
    response = api.client.post(
        f"{CHAPTERS}/{world['lagos']}/access-grants",
        json={"user_id": str(world["guest"]), "items": [{"post_id": granted["id"]}]},
    )
    assert response.status_code == 201, response.text

    api.act_as(world["guest"])
    feed = api.client.get(f"{CHAPTERS}/{world['lagos']}/posts").json()["items"]
    assert [post["id"] for post in feed] == [granted["id"]]
    assert api.client.get(f"/api/v1/posts/{granted['id']}").status_code == 200
    assert api.client.get(f"/api/v1/posts/{hidden['id']}").status_code == 404
    # Read-only: no comments, reactions or posts.
    assert api.client.post(
        f"/api/v1/posts/{granted['id']}/comments", json={"body": "Hi"}
    ).status_code == 403
    assert api.client.put(
        f"/api/v1/reactions/posts/{granted['id']}", json={"reaction_type": "like"}
    ).status_code == 403


def test_coordinators_and_app_moderators_remove_posts(api, world):
    api.act_as(world["member"])
    first = api.client.post(f"{CHAPTERS}/{world['lagos']}/posts", json={"body": "One"}).json()
    second = api.client.post(f"{CHAPTERS}/{world['lagos']}/posts", json={"body": "Two"}).json()

    api.act_as(world["other_coordinator"])
    assert api.client.delete(f"/api/v1/posts/{first['id']}").status_code == 404

    api.act_as(world["app_mod"])
    assert api.client.delete(f"/api/v1/posts/{first['id']}").status_code == 204
    api.act_as(world["coordinator"])
    assert api.client.delete(f"/api/v1/posts/{second['id']}").status_code == 204

    api.act_as(world["member"])
    types = [n["type"] for n in api.client.get("/api/v1/notifications").json()["items"]]
    assert types.count("content_removed") == 2

    api.act_as(world["admin"])
    entries = api.client.get(
        "/api/v1/moderation/audit-logs", params={"chapter_id": world["lagos"]}
    ).json()["items"]
    assert [entry["action"] for entry in entries][:2] == ["post.removed", "post.removed"]


# Bans


def test_coordinator_bans_member_from_participating(api, world):
    api.act_as(world["coordinator"])
    response = api.client.put(
        f"{CHAPTERS}/{world['lagos']}/bans/{world['member']}", json={"reason": "Spam"}
    )
    assert response.status_code == 201, response.text
    assert response.json()["chapter_id"] == world["lagos"]

    api.act_as(world["member"])
    # Still a Member who can read, but can't post.
    assert api.client.get(f"{CHAPTERS}/{world['lagos']}/posts").status_code == 200
    response = api.client.post(f"{CHAPTERS}/{world['lagos']}/posts", json={"body": "Hi"})
    assert response.status_code == 403
    assert response.json()["detail"]["code"] == "banned"

    api.act_as(world["coordinator"])
    members = api.client.get(f"{CHAPTERS}/{world['lagos']}/members").json()
    assert members[0]["is_banned"] is True

    assert api.client.delete(
        f"{CHAPTERS}/{world['lagos']}/bans/{world['member']}"
    ).status_code == 204
    api.act_as(world["member"])
    assert api.client.post(
        f"{CHAPTERS}/{world['lagos']}/posts", json={"body": "Back"}
    ).status_code == 201


def test_bans_respect_chapter_roles(api, world):
    # Nobody bans app staff.
    api.act_as(world["coordinator"])
    assert api.client.put(
        f"{CHAPTERS}/{world['lagos']}/bans/{world['app_mod']}"
    ).status_code == 403
    # Members and other Chapters' staff can't ban here.
    for key in ("member", "other_coordinator"):
        api.act_as(world[key])
        assert api.client.put(
            f"{CHAPTERS}/{world['lagos']}/bans/{world['guest']}"
        ).status_code == 403
    # App moderators ban anywhere.
    api.act_as(world["app_mod"])
    assert api.client.put(
        f"{CHAPTERS}/{world['abuja']}/bans/{world['other_member']}"
    ).status_code == 201
    assert api.client.put(
        f"{CHAPTERS}/{world['abuja']}/bans/{world['other_member']}"
    ).status_code == 409


# Announcements and dashboard


def test_coordinator_announces_to_own_chapter_only(api, world):
    api.act_as(world["coordinator"])
    response = api.client.post(
        f"{CHAPTERS}/{world['lagos']}/announcements",
        json={"title": "Update", "body": "Chapter meeting on Friday"},
    )
    assert response.status_code == 202, response.text
    assert response.json() == {"chapter_id": world["lagos"], "recipients": 1}

    assert api.client.post(
        f"{CHAPTERS}/{world['abuja']}/announcements",
        json={"title": "Update", "body": "Wrong chapter"},
    ).status_code == 403

    api.act_as(world["app_mod"])
    assert api.client.post(
        f"{CHAPTERS}/{world['lagos']}/announcements",
        json={"title": "Update", "body": "App moderators can't"},
    ).status_code == 403

    api.act_as(world["member"])
    inbox = api.client.get("/api/v1/notifications").json()["items"]
    assert [(n["type"], n["title"]) for n in inbox] == [("chapter_announcement", "Update")]


def test_dashboard_for_staff(api, world):
    api.act_as(world["member"])
    api.client.post(f"{CHAPTERS}/{world['lagos']}/posts", json={"body": "One"})

    api.act_as(world["coordinator"])
    dashboard = api.client.get(f"{CHAPTERS}/{world['lagos']}/dashboard")
    assert dashboard.status_code == 200, dashboard.text
    body = dashboard.json()
    assert body["member_count"] == 1
    assert body["coordinator_count"] == 1
    assert "moderator_count" not in body
    assert body["post_count"] == 1
    assert body["my_role"] == "coordinator"
    assert body["is_platform_admin"] is False

    api.act_as(world["member"])
    assert api.client.get(f"{CHAPTERS}/{world['lagos']}/dashboard").status_code == 403
