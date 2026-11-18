import pytest

from app.models import AccountRole

V1 = "/api/v1"


@pytest.fixture
def world(api):
    admin = api.add_user("admin", AccountRole.ADMIN)
    lagos = api.add_chapter("Lagos")
    ibadan = api.add_chapter("Ibadan")
    archived = api.add_chapter("Old", is_active=False)
    api.act_as(admin)
    music = api.client.post(f"{V1}/departments", json={"name": "Music"}).json()["id"]
    media = api.client.post(f"{V1}/departments", json={"name": "Media"}).json()["id"]
    return {"admin": admin, "lagos": str(lagos), "ibadan": str(ibadan), "archived": str(archived), "music": music, "media": media}


def onboard(api, name, chapter_id=None, complete=True):
    """Sign up a user through the API: profile, steps, optional chapter."""
    user_id = api.add_user(name)
    api.act_as(user_id)
    assert api.client.post(f"{V1}/profiles/me", json={"display_name": name.title(), "language_code": "en"}).status_code == 201
    api.client.post(f"{V1}/onboarding/me/steps/profile_basics/complete")
    api.client.post(f"{V1}/onboarding/me/steps/language/complete")
    if chapter_id:
        chosen = api.client.put(f"{V1}/me/chapter", json={"chapter_id": chapter_id})
        assert chosen.status_code == 200, chosen.text
        assert api.client.post(f"{V1}/onboarding/me/steps/chapter/complete").status_code == 200
    if complete:
        assert api.client.post(f"{V1}/onboarding/me/complete").status_code == 200
    return user_id


def me(api):
    return api.client.get(f"{V1}/me/membership").json()


# Joining a Chapter


def test_choosing_during_onboarding_only_records_the_choice(api, world):
    onboard(api, "ada", world["lagos"], complete=False)
    status = me(api)
    assert status["membership_status"] == "guest"
    assert status["preferred_chapter_id"] == world["lagos"]
    assert status["onboarding_complete"] is False


def test_completing_onboarding_makes_you_a_member(api, world):
    user = onboard(api, "ada", world["lagos"])
    status = me(api)
    assert status["membership_status"] == "member"
    assert status["chapter_id"] == world["lagos"]
    assert status["chapter_name"] == "Lagos"

    # Full Member access: shows in the Chapter's member list and can post.
    api.act_as(world["admin"])
    members = api.client.get(f"{V1}/chapters/{world['lagos']}/members").json()
    assert [m["user_id"] for m in members] == [str(user)]
    api.act_as(user)
    post = api.client.post(f"{V1}/chapters/{world['lagos']}/posts", json={"body": "Hello Lagos!"})
    assert post.status_code == 201, post.text


def test_onboarding_without_a_chapter_stays_guest(api, world):
    onboard(api, "ada")
    assert me(api)["membership_status"] == "guest"


def test_after_onboarding_you_can_join_or_move(api, world):
    onboard(api, "ada")
    joined = api.client.put(f"{V1}/me/chapter", json={"chapter_id": world["ibadan"]}).json()
    assert joined["membership_status"] == "member"
    assert joined["chapter_id"] == world["ibadan"]

    moved = api.client.put(f"{V1}/me/chapter", json={"chapter_id": world["lagos"]}).json()
    assert moved["chapter_id"] == world["lagos"]


def test_archived_chapters_cannot_be_chosen(api, world):
    onboard(api, "ada")
    response = api.client.put(f"{V1}/me/chapter", json={"chapter_id": world["archived"]})
    assert response.status_code == 404


def test_joining_settles_pending_access_requests(api, world):
    user = onboard(api, "ada", complete=False)
    api.client.post(f"{V1}/chapters/{world['lagos']}/access-requests")
    api.client.post(f"{V1}/chapters/{world['ibadan']}/access-requests")
    api.client.put(f"{V1}/me/chapter", json={"chapter_id": world["lagos"]})
    api.client.post(f"{V1}/onboarding/me/steps/chapter/complete")
    api.client.post(f"{V1}/onboarding/me/complete")

    api.act_as(user)
    requests = {r["chapter_id"]: r["status"] for r in api.client.get(f"{V1}/me/chapter-access-requests").json()}
    assert requests == {world["lagos"]: "approved", world["ibadan"]: "cancelled"}


def test_joining_is_audited_for_the_chapter(api, world):
    onboard(api, "ada", world["lagos"])
    api.act_as(world["admin"])
    logs = api.client.get(f"{V1}/moderation/audit-logs?chapter_id={world['lagos']}&action=member.joined").json()["items"]
    assert len(logs) == 1
    assert logs[0]["data"]["how"] == "onboarding"


# Departments: self-service


def test_anyone_signed_in_can_list_departments(api, world):
    onboard(api, "ada")
    names = [d["name"] for d in api.client.get(f"{V1}/departments").json()]
    assert names == ["Media", "Music"]


def test_guests_cannot_join_departments(api, world):
    onboard(api, "ada")
    response = api.client.put(f"{V1}/me/department", json={"department_id": world["music"]})
    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "membership_required"


def test_members_join_switch_and_leave_departments(api, world):
    onboard(api, "ada", world["lagos"])
    joined = api.client.put(f"{V1}/me/department", json={"department_id": world["music"]}).json()
    assert joined["department_name"] == "Music"

    switched = api.client.put(f"{V1}/me/department", json={"department_id": world["media"]}).json()
    assert switched["department_name"] == "Media"

    left = api.client.delete(f"{V1}/me/department").json()
    assert left["department_id"] is None


def test_unknown_department(api, world):
    onboard(api, "ada", world["lagos"])
    response = api.client.put(f"{V1}/me/department", json={"department_id": world["lagos"]})
    assert response.status_code == 404


# Departments: admin


def test_admin_adds_and_removes_department_members(api, world):
    user = onboard(api, "ada", world["lagos"])
    api.act_as(world["admin"])
    url = f"{V1}/departments/{world['music']}/members"

    assert api.client.put(f"{url}/{user}").status_code == 204
    members = api.client.get(url).json()
    assert [(m["display_name"], m["chapter_name"]) for m in members] == [("Ada", "Lagos")]
    music = next(d for d in api.client.get(f"{V1}/departments").json() if d["id"] == world["music"])
    assert music["member_count"] == 1

    # Adding to another department moves them.
    assert api.client.put(f"{V1}/departments/{world['media']}/members/{user}").status_code == 204
    assert api.client.get(url).json() == []

    assert api.client.delete(f"{V1}/departments/{world['media']}/members/{user}").status_code == 204
    assert api.client.delete(f"{V1}/departments/{world['media']}/members/{user}").status_code == 404


def test_admin_cannot_add_guests_to_departments(api, world):
    guest = onboard(api, "gift")
    api.act_as(world["admin"])
    response = api.client.put(f"{V1}/departments/{world['music']}/members/{guest}")
    assert response.status_code == 409


def test_only_admins_manage_department_members(api, world):
    user = onboard(api, "ada", world["lagos"])
    api.act_as(user)
    url = f"{V1}/departments/{world['music']}/members"
    assert api.client.get(url).status_code == 403
    assert api.client.put(f"{url}/{user}").status_code == 403


def test_admin_membership_assignment_without_department(api, world):
    user = onboard(api, "ada")
    api.act_as(world["admin"])
    response = api.client.patch(f"{V1}/admin/users/{user}/membership", json={"chapter_id": world["lagos"]})
    assert response.status_code == 200, response.text
    api.act_as(user)
    assert me(api)["chapter_id"] == world["lagos"]
