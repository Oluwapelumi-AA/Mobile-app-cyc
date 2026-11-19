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
    return {"admin": admin, "lagos": str(lagos), "ibadan": str(ibadan), "archived": str(archived)}


def add_coordinator(api, chapter_id, **person):
    return api.client.post(f"{V1}/admin/coordinators", json={"chapter_id": chapter_id, **person})


def team(api):
    return api.client.get(f"{V1}/admin/team").json()


def coordinators(api):
    return {(s["chapter_name"], s["email"]) for s in team(api)["chapter_staff"] if s["role"] == "coordinator"}


def real_login(api, email, password):
    response = api.client.post(f"{V1}/auth/login", json={"email": email, "password": password})
    return response


# Adding a Coordinator


def test_new_account_coordinator_with_chapter(api, world):
    response = add_coordinator(api, world["lagos"], new_account={"email": "Grace@Example.com", "display_name": "Grace A."})
    assert response.status_code == 201, response.text
    body = response.json()
    assert body["email"] == "grace@example.com"
    assert len(body["temporary_password"]) == 16
    assert coordinators(api) == {("Lagos", "grace@example.com")}

    # They are an official Member of the Chapter.
    members = api.client.get(f"{V1}/chapters/{world['lagos']}/members").json()
    assert [m["email"] for m in members] == ["grace@example.com"]

    # And can sign in with the temporary password.
    assert real_login(api, "grace@example.com", body["temporary_password"]).status_code == 200


def test_existing_user_becomes_coordinator(api, world):
    user = api.add_user("tolu")
    response = add_coordinator(api, world["ibadan"], user_id=str(user))
    assert response.status_code == 201
    assert response.json()["temporary_password"] is None
    assert coordinators(api) == {("Ibadan", "tolu@example.com")}


def test_a_moderator_is_promoted(api, world):
    user = api.add_user("tolu")
    api.add_member(user, world["lagos"], "Tolu")
    api.add_staff(user, world["lagos"], "moderator")
    assert add_coordinator(api, world["lagos"], user_id=str(user)).status_code == 201
    roles = [s["role"] for s in team(api)["chapter_staff"]]
    assert roles == ["coordinator"]


def test_coordinator_moves_from_another_chapter(api, world):
    user = api.add_user("tolu")
    api.add_member(user, world["ibadan"], "Tolu")
    assert add_coordinator(api, world["lagos"], user_id=str(user)).status_code == 201
    lagos = [m["email"] for m in api.client.get(f"{V1}/chapters/{world['lagos']}/members").json()]
    ibadan = [m["email"] for m in api.client.get(f"{V1}/chapters/{world['ibadan']}/members").json()]
    assert lagos == ["tolu@example.com"] and ibadan == []


def test_occupied_chapter_needs_replace(api, world):
    add_coordinator(api, world["lagos"], new_account={"email": "first@example.com", "display_name": "First"})
    second = api.add_user("second")
    blocked = add_coordinator(api, world["lagos"], user_id=str(second))
    assert blocked.status_code == 409
    assert blocked.json()["detail"]["code"] == "coordinator_assignment_conflict"

    replaced = add_coordinator(api, world["lagos"], user_id=str(second), replace_current=True)
    assert replaced.status_code == 201
    assert replaced.json()["replaced_user_id"] is not None
    assert coordinators(api) == {("Lagos", "second@example.com")}
    # The previous Coordinator is still a Member.
    members = {m["email"] for m in api.client.get(f"{V1}/chapters/{world['lagos']}/members").json()}
    assert members == {"first@example.com", "second@example.com"}


def test_bad_inputs(api, world):
    assert add_coordinator(api, world["archived"], new_account={"email": "a@example.com", "display_name": "Ann"}).status_code == 404
    api.add_user("taken")
    taken = add_coordinator(api, world["lagos"], new_account={"email": "taken@example.com", "display_name": "Taken"})
    assert taken.status_code == 409 and taken.json()["detail"]["code"] == "email_taken"
    both = add_coordinator(api, world["lagos"], user_id=str(world["admin"]), new_account={"email": "b@example.com", "display_name": "Bee"})
    assert both.status_code == 422
    neither = add_coordinator(api, world["lagos"])
    assert neither.status_code == 422


def test_remove_coordinator_keeps_membership(api, world):
    add_coordinator(api, world["lagos"], new_account={"email": "grace@example.com", "display_name": "Grace"})
    assert api.client.delete(f"{V1}/admin/coordinators/{world['lagos']}").status_code == 204
    assert coordinators(api) == set()
    members = [m["email"] for m in api.client.get(f"{V1}/chapters/{world['lagos']}/members").json()]
    assert members == ["grace@example.com"]
    assert api.client.delete(f"{V1}/admin/coordinators/{world['lagos']}").status_code == 404


def test_only_admins_manage_the_team(api, world):
    mod = api.add_user("mod", AccountRole.MODERATOR)
    api.act_as(mod)
    assert api.client.get(f"{V1}/admin/team").status_code == 403
    assert add_coordinator(api, world["lagos"], new_account={"email": "x@example.com", "display_name": "Xen"}).status_code == 403


# Platform staff


def test_add_and_remove_admins(api, world):
    new = api.client.post(
        f"{V1}/admin/platform-staff",
        json={"new_account": {"email": "boss@example.com", "display_name": "Boss"}, "account_role": "admin"},
    )
    assert new.status_code == 201
    assert new.json()["temporary_password"]

    user = api.add_user("helper")
    mod = api.client.post(f"{V1}/admin/platform-staff", json={"user_id": str(user), "account_role": "moderator"})
    assert mod.status_code == 201
    roles = {p["email"]: p["account_role"] for p in team(api)["platform"]}
    assert roles == {"admin@example.com": "admin", "boss@example.com": "admin", "helper@example.com": "moderator"}

    assert api.client.delete(f"{V1}/admin/platform-staff/{user}").status_code == 204
    assert "helper@example.com" not in {p["email"] for p in team(api)["platform"]}


def test_admins_cannot_change_themselves_or_remove_last_admin(api, world):
    me = api.client.delete(f"{V1}/admin/platform-staff/{world['admin']}")
    assert me.status_code == 400

    other = api.add_user("other", AccountRole.ADMIN)
    api.act_as(other)
    # Removing the first admin is fine while another admin remains.
    assert api.client.delete(f"{V1}/admin/platform-staff/{world['admin']}").status_code == 204


def test_user_role_rejected(api, world):
    user = api.add_user("x")
    response = api.client.post(f"{V1}/admin/platform-staff", json={"user_id": str(user), "account_role": "user"})
    assert response.status_code == 422


# Passwords


def test_temporary_password_reset_and_change(api, world):
    created = add_coordinator(api, world["lagos"], new_account={"email": "grace@example.com", "display_name": "Grace"}).json()
    reset = api.client.post(f"{V1}/admin/users/{created['user_id']}/temporary-password").json()
    assert reset["temporary_password"] != created["temporary_password"]
    assert real_login(api, "grace@example.com", created["temporary_password"]).status_code == 401

    login = real_login(api, "grace@example.com", reset["temporary_password"])
    assert login.status_code == 200
    token = login.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    wrong = api.client.post(
        f"{V1}/auth/change-password",
        json={"current_password": "nope", "new_password": "a-new-strong-password"},
        headers=headers,
    )
    assert wrong.status_code == 400
    changed = api.client.post(
        f"{V1}/auth/change-password",
        json={"current_password": reset["temporary_password"], "new_password": "a-new-strong-password"},
        headers=headers,
    )
    assert changed.status_code == 204
    assert real_login(api, "grace@example.com", "a-new-strong-password").status_code == 200
