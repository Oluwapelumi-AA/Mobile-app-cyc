import uuid
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import select

from app.models import AccountRole, AuditLog, NotificationDevice, RefreshSession, User

ADMIN = "/api/v1/admin"
USERS = f"{ADMIN}/users"
PROFILE = "/api/v1/profiles/me"


@pytest.fixture
def world(api):
    ids = {name: api.add_user(name) for name in ("alice", "bob")}
    ids["mod"] = api.add_user("mod", AccountRole.MODERATOR)
    ids["mod2"] = api.add_user("mod2", AccountRole.MODERATOR)
    ids["admin"] = api.add_user("admin", AccountRole.ADMIN)
    api.act_as(ids["alice"])
    api.client.post(PROFILE, json={"display_name": "Alice Okafor"})
    return ids


def add_session_and_device(api, user_id):
    with api.session_factory() as db:
        db.add(
            RefreshSession(
                user_id=user_id,
                token_hash=uuid.uuid4().hex,
                expires_at=datetime.now(UTC) + timedelta(days=7),
            )
        )
        db.add(
            NotificationDevice(
                user_id=user_id,
                token=f"token-{user_id}",
                platform="ios",
                last_seen_at=datetime.now(UTC),
                created_at=datetime.now(UTC),
            )
        )
        db.commit()


def test_staff_list_and_search_users(api, world):
    api.act_as(world["mod"])
    response = api.client.get(USERS)
    assert response.status_code == 200
    assert len(response.json()["items"]) == 5

    [alice] = api.client.get(USERS, params={"q": "okafor"}).json()["items"]
    assert alice["email"] == "alice@example.com"
    assert alice["display_name"] == "Alice Okafor"
    assert alice["open_reports"] == 0
    [bob] = api.client.get(USERS, params={"q": "BOB@"}).json()["items"]
    assert bob["display_name"] is None
    staff = api.client.get(USERS, params={"account_role": "moderator"}).json()["items"]
    assert {item["email"] for item in staff} == {"mod@example.com", "mod2@example.com"}

    first = api.client.get(USERS, params={"limit": 3}).json()
    rest = api.client.get(USERS, params={"limit": 3, "cursor": first["next_cursor"]}).json()
    assert len(first["items"]) + len(rest["items"]) == 5
    assert rest["next_cursor"] is None

    assert api.client.get(f"{USERS}/{world['bob']}").json()["id"] == str(world["bob"])
    response = api.client.get(f"{USERS}/{uuid.uuid4()}")
    assert response.json()["detail"]["code"] == "user_not_found"


def test_regular_users_get_nothing(api, world):
    api.act_as(world["alice"])
    for path in (USERS, f"{ADMIN}/overview", f"{USERS}/{world['bob']}"):
        response = api.client.get(path)
        assert response.status_code == 403
        assert response.json()["detail"]["code"] == "staff_only"


def test_suspend_and_reinstate(api, world):
    add_session_and_device(api, world["bob"])
    api.act_as(world["mod"])
    response = api.client.post(f"{USERS}/{world['bob']}/suspend", json={"reason": "Spam bot"})
    assert response.status_code == 200, response.text
    assert response.json()["is_active"] is False

    with api.session_factory() as db:
        assert db.scalar(select(RefreshSession.revoked_at)) is not None
        assert db.scalars(select(NotificationDevice)).all() == []
        entry = db.scalar(select(AuditLog).where(AuditLog.action == "user.suspended"))
        assert entry.data == {"reason": "Spam bot", "sessions_revoked": 1}

    response = api.client.post(f"{USERS}/{world['bob']}/suspend", json={"reason": "Again"})
    assert response.status_code == 409
    response = api.client.post(f"{USERS}/{world['bob']}/reinstate")
    assert response.status_code == 200
    assert response.json()["is_active"] is True
    response = api.client.post(f"{USERS}/{world['bob']}/reinstate", json={"note": "x"})
    assert response.json()["detail"]["code"] == "not_suspended"


def test_suspended_users_cannot_use_their_token(api, world):
    """The auth dependency already turns away inactive users."""
    from app.core.security import create_access_token

    api.act_as(world["mod"])
    api.client.post(f"{USERS}/{world['alice']}/suspend", json={"reason": "Harassment"})
    from app.api.deps import get_current_user_id
    from app.main import app

    override = app.dependency_overrides.pop(get_current_user_id)
    try:
        token = create_access_token(str(world["alice"]))
        response = api.client.get(PROFILE, headers={"Authorization": f"Bearer {token}"})
    finally:
        app.dependency_overrides[get_current_user_id] = override
    assert response.status_code == 401


def test_suspension_rank_rules(api, world):
    api.act_as(world["mod"])
    response = api.client.post(f"{USERS}/{world['mod2']}/suspend", json={"reason": "x"})
    assert response.status_code == 403
    assert response.json()["detail"]["code"] == "insufficient_role"
    response = api.client.post(f"{USERS}/{world['mod']}/suspend", json={"reason": "x"})
    assert response.json()["detail"]["code"] == "cannot_suspend_self"
    assert api.client.post(f"{USERS}/{world['bob']}/suspend", json={}).status_code == 422
    api.act_as(world["admin"])
    response = api.client.post(f"{USERS}/{world['mod2']}/suspend", json={"reason": "x"})
    assert response.status_code == 200


def test_only_admins_change_roles(api, world):
    api.act_as(world["mod"])
    response = api.client.patch(f"{USERS}/{world['bob']}/role", json={"account_role": "moderator"})
    assert response.status_code == 403
    assert response.json()["detail"]["code"] == "admin_only"

    api.act_as(world["admin"])
    response = api.client.patch(f"{USERS}/{world['bob']}/role", json={"account_role": "moderator"})
    assert response.status_code == 200
    assert response.json()["account_role"] == "moderator"
    response = api.client.patch(f"{USERS}/{world['admin']}/role", json={"account_role": "user"})
    assert response.json()["detail"]["code"] == "cannot_change_own_role"
    response = api.client.patch(f"{USERS}/{world['bob']}/role", json={"account_role": "owner"})
    assert response.status_code == 422

    with api.session_factory() as db:
        assert db.get(User, world["bob"]).account_role == AccountRole.MODERATOR
        entry = db.scalar(select(AuditLog).where(AuditLog.action == "user.role_changed"))
        assert entry.data == {"from": "user", "to": "moderator"}


def test_overview(api, world):
    api.act_as(world["alice"])
    api.client.post("/api/v1/communities", json={"name": "Abuja Fellowship"})
    api.act_as(world["mod"])
    api.client.post(f"{USERS}/{world['bob']}/suspend", json={"reason": "Spam"})
    body = api.client.get(f"{ADMIN}/overview").json()
    assert body["users"] == 5
    assert body["active_users"] == 4
    assert body["inactive_users"] == 1
    assert body["new_users_last_7_days"] == 5
    assert body["communities"] == 1
    assert body["open_reports"] == 0
    assert body["branches"] == 0
