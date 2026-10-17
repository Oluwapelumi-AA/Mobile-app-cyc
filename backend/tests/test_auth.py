import uuid
from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.security import (
    create_access_token,
    create_refresh_token,
    hash_password,
)
from app.db.session import Base, get_db
from app.main import app
from app.models.refresh_session import RefreshSession
from app.models.user import User


@pytest.fixture
def test_db():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    TestingSessionLocal = sessionmaker(
        bind=engine,
        autoflush=False,
        autocommit=False,
    )

    Base.metadata.create_all(bind=engine)
    db = TestingSessionLocal()

    try:
        yield db
    finally:
        db.close()
        Base.metadata.drop_all(bind=engine)
        engine.dispose()


@pytest.fixture
def client(test_db):
    def override_get_db():
        yield test_db

    app.dependency_overrides[get_db] = override_get_db

    with TestClient(app) as test_client:
        yield test_client

    app.dependency_overrides.clear()


def test_register_user_successfully(client):
    response = client.post(
        "/api/v1/auth/register",
        json={
            "email": "newuser@example.com",
            "password": "Strong-Password-123!",
        },
    )

    assert response.status_code == 201
    data = response.json()
    assert data["email"] == "newuser@example.com"
    assert data["is_active"] is True
    assert data["is_verified"] is False
    assert "password_hash" not in data


def test_duplicate_email_is_rejected(client):
    payload = {
        "email": "duplicate@example.com",
        "password": "Strong-Password-123!",
    }

    first = client.post("/api/v1/auth/register", json=payload)
    second = client.post("/api/v1/auth/register", json=payload)

    assert first.status_code == 201
    assert second.status_code == 409


def test_login_returns_tokens(client):
    client.post(
        "/api/v1/auth/register",
        json={
            "email": "login@example.com",
            "password": "Strong-Password-123!",
        },
    )

    response = client.post(
        "/api/v1/auth/login",
        json={
            "email": "login@example.com",
            "password": "Strong-Password-123!",
        },
    )

    assert response.status_code == 200
    data = response.json()
    assert data["token_type"] == "bearer"
    assert data["access_token"]
    assert data["refresh_token"]


def test_login_rejects_wrong_password(client):
    client.post(
        "/api/v1/auth/register",
        json={
            "email": "login@example.com",
            "password": "Strong-Password-123!",
        },
    )

    response = client.post(
        "/api/v1/auth/login",
        json={
            "email": "login@example.com",
            "password": "Wrong-Password-123!",
        },
    )

    assert response.status_code == 401
    assert response.json()["detail"] == "Invalid email or password"


def test_login_rejects_unknown_email(client):
    response = client.post(
        "/api/v1/auth/login",
        json={
            "email": "unknown@example.com",
            "password": "Strong-Password-123!",
        },
    )

    assert response.status_code == 401
    assert response.json()["detail"] == "Invalid email or password"


def test_login_rejects_inactive_account(client, test_db):
    user = User(
        email="inactive@example.com",
        password_hash=hash_password("Strong-Password-123!"),
        is_active=False,
    )
    test_db.add(user)
    test_db.commit()

    response = client.post(
        "/api/v1/auth/login",
        json={
            "email": "inactive@example.com",
            "password": "Strong-Password-123!",
        },
    )

    assert response.status_code == 403
    assert response.json()["detail"] == "This account is inactive"

def test_me_returns_authenticated_user(client, test_db):
    user = User(
        email="protected@example.com",
        password_hash=hash_password("Strong-Password-123!"),
    )
    test_db.add(user)
    test_db.commit()
    test_db.refresh(user)

    token = create_access_token(str(user.id))

    response = client.get(
        "/api/v1/auth/me",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 200
    data = response.json()
    assert data["id"] == str(user.id)
    assert data["email"] == "protected@example.com"
    assert "password_hash" not in data


def test_me_rejects_missing_token(client):
    response = client.get("/api/v1/auth/me")

    assert response.status_code == 401


def test_me_rejects_invalid_token(client):
    response = client.get(
        "/api/v1/auth/me",
        headers={"Authorization": "Bearer invalid.token.value"},
    )

    assert response.status_code == 401


def test_me_rejects_refresh_token(client, test_db):
    user = User(
        email="refresh@example.com",
        password_hash=hash_password("Strong-Password-123!"),
    )
    test_db.add(user)
    test_db.commit()
    test_db.refresh(user)

    token = create_refresh_token(str(user.id), uuid.uuid4())

    response = client.get(
        "/api/v1/auth/me",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 401


def test_me_rejects_inactive_user(client, test_db):
    user = User(
        email="inactive-protected@example.com",
        password_hash=hash_password("Strong-Password-123!"),
        is_active=False,
    )
    test_db.add(user)
    test_db.commit()
    test_db.refresh(user)

    token = create_access_token(str(user.id))

    response = client.get(
        "/api/v1/auth/me",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 401






def test_refresh_rotates_tokens(client):
    client.post(
        "/api/v1/auth/register",
        json={
            "email": "rotate@example.com",
            "password": "Strong-Password-123!",
        },
    )
    login_response = client.post(
        "/api/v1/auth/login",
        json={
            "email": "rotate@example.com",
            "password": "Strong-Password-123!",
        },
    )
    old_refresh = login_response.json()["refresh_token"]

    response = client.post(
        "/api/v1/auth/refresh",
        json={"refresh_token": old_refresh},
    )

    assert response.status_code == 200
    data = response.json()
    assert data["access_token"]
    assert data["refresh_token"]
    assert data["refresh_token"] != old_refresh


def test_refresh_rejects_reuse_of_rotated_token(client):
    client.post(
        "/api/v1/auth/register",
        json={
            "email": "reuse@example.com",
            "password": "Strong-Password-123!",
        },
    )
    login_response = client.post(
        "/api/v1/auth/login",
        json={
            "email": "reuse@example.com",
            "password": "Strong-Password-123!",
        },
    )
    old_refresh = login_response.json()["refresh_token"]

    first_refresh = client.post(
        "/api/v1/auth/refresh",
        json={"refresh_token": old_refresh},
    )
    assert first_refresh.status_code == 200

    replay_response = client.post(
        "/api/v1/auth/refresh",
        json={"refresh_token": old_refresh},
    )

    assert replay_response.status_code == 401


def test_logout_revokes_refresh_token(client):
    client.post(
        "/api/v1/auth/register",
        json={
            "email": "logout@example.com",
            "password": "Strong-Password-123!",
        },
    )
    login_response = client.post(
        "/api/v1/auth/login",
        json={
            "email": "logout@example.com",
            "password": "Strong-Password-123!",
        },
    )
    refresh_token = login_response.json()["refresh_token"]

    logout_response = client.post(
        "/api/v1/auth/logout",
        json={"refresh_token": refresh_token},
    )

    assert logout_response.status_code == 204

    refresh_response = client.post(
        "/api/v1/auth/refresh",
        json={"refresh_token": refresh_token},
    )
    assert refresh_response.status_code == 401


def test_refresh_rejects_expired_session(client, test_db):
    user = User(
        email="expired-session@example.com",
        password_hash=hash_password("Strong-Password-123!"),
    )
    test_db.add(user)
    test_db.commit()
    test_db.refresh(user)

    session_id = uuid.uuid4()
    from app.core.security import create_refresh_token, hash_refresh_token

    token = create_refresh_token(str(user.id), session_id)
    session = RefreshSession(
        id=session_id,
        user_id=user.id,
        token_hash=hash_refresh_token(token),
        expires_at=datetime.now(timezone.utc) - timedelta(minutes=1),
    )
    test_db.add(session)
    test_db.commit()

    response = client.post(
        "/api/v1/auth/refresh",
        json={"refresh_token": token},
    )

    assert response.status_code == 401


def test_refresh_rejects_inactive_user(client, test_db):
    user = User(
        email="inactive-refresh@example.com",
        password_hash=hash_password("Strong-Password-123!"),
        is_active=False,
    )
    test_db.add(user)
    test_db.commit()
    test_db.refresh(user)

    session_id = uuid.uuid4()
    from app.core.security import create_refresh_token, hash_refresh_token

    token = create_refresh_token(str(user.id), session_id)
    session = RefreshSession(
        id=session_id,
        user_id=user.id,
        token_hash=hash_refresh_token(token),
        expires_at=datetime.now(timezone.utc) + timedelta(days=1),
    )
    test_db.add(session)
    test_db.commit()

    response = client.post(
        "/api/v1/auth/refresh",
        json={"refresh_token": token},
    )

    assert response.status_code == 401
