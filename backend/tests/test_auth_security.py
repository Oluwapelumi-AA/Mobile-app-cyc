
"""Email confirmation, Google sign-in, two-step sign-in, sign-in locks,
refresh-token theft detection, rate limits and security headers."""

import re
import time

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core import totp
from app.core.config import settings
from app.core.rate_limit import limiter
from app.db.session import Base, get_db
from app.main import app
from app.models import AccountRole, OutboundEmail, User
from app.services import google_auth, mfa
from app.services.email_sender import get_email_sender

AUTH = "/api/v1/auth"
PASSWORD = "a long and unusual phrase 42"


@pytest.fixture
def db():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=engine)
    session = sessionmaker(
        bind=engine,
        autoflush=False,
        autocommit=False,
    )()
    yield session
    session.close()


@pytest.fixture
def client(db, monkeypatch):
    monkeypatch.setattr(settings, "require_email_verification", True)
    monkeypatch.setattr(settings, "require_admin_mfa", True)
    app.dependency_overrides[get_db] = lambda: db
    get_email_sender().outbox.clear()

    with TestClient(app) as c:
        yield c

    app.dependency_overrides.clear()


def last_code(to: str) -> str:
    message = [m for m in get_email_sender().outbox if m.to == to][-1]
    return re.search(r"\b(\d{6})\b", message.text).group(1)


def register(client, email="ada@example.com", password=PASSWORD):
    return client.post(
        f"{AUTH}/register",
        json={"email": email, "password": password},
    )


def signed_up(client, email="ada@example.com"):
    register(client, email)
    res = client.post(
        f"{AUTH}/verify-email",
        json={"email": email, "code": last_code(email)},
    )
    assert res.status_code == 200, res.text
    return res.json()


# Email confirmation


def test_sign_up_sends_a_code_and_blocks_sign_in_until_confirmed(client, db):
    assert register(client).status_code == 201

    outbox = get_email_sender().outbox
    assert outbox[-1].to == "ada@example.com"
    assert "confirmation code" in outbox[-1].subject
    assert outbox[-1].html and "Confirm your email" in outbox[-1].html

    res = client.post(
        f"{AUTH}/login",
        json={"email": "ada@example.com", "password": PASSWORD},
    )
    assert res.status_code == 403
    assert res.json()["detail"]["code"] == "email_not_verified"


def test_confirming_the_code_signs_in_and_sends_welcome(client, db):
    tokens = signed_up(client)

    assert tokens["access_token"] and tokens["refresh_token"]
    assert db.scalar(
        select(User.is_verified).where(User.email == "ada@example.com")
    ) is True

    assert get_email_sender().outbox[-1].subject == "Welcome to CYC"

    me = client.get(
        f"{AUTH}/me",
        headers={"Authorization": f"Bearer {tokens['access_token']}"},
    )
    assert me.json()["is_verified"] is True
    assert me.json()["has_password"] is True


def test_wrong_code_is_rejected(client):
    register(client)

    res = client.post(
        f"{AUTH}/verify-email",
        json={"email": "ada@example.com", "code": "000000"},
    )

    if last_code("ada@example.com") == "000000":
        pytest.skip("random code collided")

    assert res.status_code == 400
    assert res.json()["detail"]["code"] == "invalid_code"


def test_weak_passwords_are_refused(client):
    res = register(client, password="password1234")

    assert res.status_code == 422
    assert res.json()["detail"]["code"] == "weak_password"


def test_emails_are_queued_and_marked_sent(client, db):
    register(client)

    row = db.scalar(
        select(OutboundEmail).where(
            OutboundEmail.to == "ada@example.com"
        )
    )

    assert row.status == "sent"
    assert row.template == "verify_email"


# Sign-in lock


def test_too_many_wrong_passwords_lock_the_account(client, db, monkeypatch):
    monkeypatch.setattr(settings, "login_max_failures", 3)
    signed_up(client)

    for _ in range(3):
        res = client.post(
            f"{AUTH}/login",
            json={
                "email": "ada@example.com",
                "password": "wrong password!!",
            },
        )
        assert res.status_code == 401

    res = client.post(
        f"{AUTH}/login",
        json={"email": "ada@example.com", "password": PASSWORD},
    )

    assert res.status_code == 429
    assert res.json()["detail"]["code"] == "account_locked"
    assert "locked" in get_email_sender().outbox[-1].subject


# Refresh token theft


def test_reusing_a_rotated_refresh_token_signs_out_everywhere(client):
    tokens = signed_up(client)
    first = tokens["refresh_token"]

    second = client.post(
        f"{AUTH}/refresh",
        json={"refresh_token": first},
    ).json()["refresh_token"]

    assert client.post(
        f"{AUTH}/refresh",
        json={"refresh_token": first},
    ).status_code == 401

    # The thief's reuse also ended the newest session.
    assert client.post(
        f"{AUTH}/refresh",
        json={"refresh_token": second},
    ).status_code == 401


# Google


def fake_google(
    monkeypatch,
    sub="g-1",
    email="ada@example.com",
    name="Ada Obi",
):
    monkeypatch.setattr(
        google_auth,
        "verify_id_token",
        lambda token: google_auth.GoogleIdentity(
            sub=sub,
            email=email,
            name=name,
            picture=None,
        ),
    )


def test_google_creates_a_verified_account(client, db, monkeypatch):
    fake_google(monkeypatch)

    res = client.post(
        f"{AUTH}/google",
        json={"id_token": "x" * 20},
    )
    body = res.json()

    assert res.status_code == 200
    assert body["access_token"]
    assert body["is_new_account"] is True
    assert body["suggested_name"] == "Ada Obi"

    user = db.scalar(
        select(User).where(User.email == "ada@example.com")
    )

    assert user.is_verified
    assert not user.has_password
    assert user.google_sub == "g-1"

    # Signing in again is not a new account.
    again = client.post(
        f"{AUTH}/google",
        json={"id_token": "x" * 20},
    ).json()

    assert again["is_new_account"] is False


def test_google_links_an_existing_email_account(client, db, monkeypatch):
    signed_up(client)
    fake_google(monkeypatch)

    res = client.post(
        f"{AUTH}/google",
        json={"id_token": "x" * 20},
    )

    assert res.status_code == 200
    assert res.json()["is_new_account"] is False

    assert db.scalar(
        select(User.google_sub).where(User.email == "ada@example.com")
    ) == "g-1"

    assert "Google sign-in added" in get_email_sender().outbox[-1].subject


def test_google_is_off_without_client_ids(client, monkeypatch):
    monkeypatch.setattr(settings, "google_client_ids", [])

    res = client.post(
        f"{AUTH}/google",
        json={"id_token": "x" * 20},
    )

    assert res.status_code == 503


def test_google_only_account_can_add_a_password(client, monkeypatch):
    fake_google(monkeypatch)

    token = client.post(
        f"{AUTH}/google",
        json={"id_token": "x" * 20},
    ).json()["access_token"]

    headers = {"Authorization": f"Bearer {token}"}

    assert client.post(
        f"{AUTH}/set-password",
        json={"new_password": PASSWORD},
        headers=headers,
    ).status_code == 204

    res = client.post(
        f"{AUTH}/login",
        json={"email": "ada@example.com", "password": PASSWORD},
    )

    assert res.status_code == 200
    assert res.json()["access_token"]


# Two-step sign-in


def enable_mfa(client, token):
    headers = {"Authorization": f"Bearer {token}"}

    setup = client.post(
        f"{AUTH}/mfa/setup",
        json={},
        headers=headers,
    ).json()

    secret = setup["secret"]

    assert setup["otpauth_uri"].startswith("otpauth://totp/")

    res = client.post(
        f"{AUTH}/mfa/enable",
        json={
            "code": totp.code_at(secret, time.time()),
        },
        headers=headers,
    )

    assert res.status_code == 200, res.text

    return secret, res.json()["recovery_codes"]


def test_two_step_sign_in(client):
    tokens = signed_up(client)

    secret, recovery = enable_mfa(
        client,
        tokens["access_token"],
    )

    assert len(recovery) == 10

    first = client.post(
        f"{AUTH}/login",
        json={"email": "ada@example.com", "password": PASSWORD},
    ).json()

    assert first["mfa_required"] is True
    assert first["access_token"] is None

    wrong = client.post(
        f"{AUTH}/mfa/verify",
        json={
            "mfa_token": first["mfa_token"],
            "code": "000000",
        },
    )

    if totp.code_at(secret, time.time()) != "000000":
        assert wrong.status_code == 400

    # MFA setup already consumed the current TOTP step.
    # Use the next step for this sign-in.
    code = totp.code_at(secret, time.time() + 30)

    ok = client.post(
        f"{AUTH}/mfa/verify",
        json={
            "mfa_token": first["mfa_token"],
            "code": code,
        },
    )

    assert ok.status_code == 200
    assert ok.json()["access_token"]

    # The same TOTP step must not be accepted again.
    replay_login = client.post(
        f"{AUTH}/login",
        json={"email": "ada@example.com", "password": PASSWORD},
    ).json()

    replay = client.post(
        f"{AUTH}/mfa/verify",
        json={
            "mfa_token": replay_login["mfa_token"],
            "code": code,
        },
    )

    assert replay.status_code == 400

    # A recovery code works once.
    again = client.post(
        f"{AUTH}/login",
        json={"email": "ada@example.com", "password": PASSWORD},
    ).json()

    used = client.post(
        f"{AUTH}/mfa/verify",
        json={
            "mfa_token": again["mfa_token"],
            "code": recovery[0],
        },
    )

    assert used.status_code == 200

    reused = client.post(
        f"{AUTH}/mfa/verify",
        json={
            "mfa_token": again["mfa_token"],
            "code": recovery[0],
        },
    )

    assert reused.status_code == 400


def test_an_mfa_token_is_not_an_access_token(client):
    tokens = signed_up(client)
    enable_mfa(client, tokens["access_token"])

    first = client.post(
        f"{AUTH}/login",
        json={"email": "ada@example.com", "password": PASSWORD},
    ).json()

    me = client.get(
        f"{AUTH}/me",
        headers={"Authorization": f"Bearer {first['mfa_token']}"},
    )

    assert me.status_code == 401


def test_admins_must_set_up_two_step_sign_in(client, db):
    signed_up(client)

    user = db.scalar(
        select(User).where(User.email == "ada@example.com")
    )

    user.account_role = AccountRole.ADMIN
    db.commit()

    first = client.post(
        f"{AUTH}/login",
        json={"email": "ada@example.com", "password": PASSWORD},
    ).json()

    assert first["mfa_setup_required"] is True
    assert first["access_token"] is None

    setup = client.post(
        f"{AUTH}/mfa/setup",
        json={"mfa_token": first["mfa_token"]},
    ).json()

    code = totp.code_at(setup["secret"], time.time())

    done = client.post(
        f"{AUTH}/mfa/enable",
        json={
            "mfa_token": first["mfa_token"],
            "code": code,
        },
    ).json()

    assert done["access_token"]
    assert len(done["recovery_codes"]) == 10

    headers = {"Authorization": f"Bearer {done['access_token']}"}

    status = client.get(
        f"{AUTH}/mfa",
        headers=headers,
    ).json()

    assert status == {
        "enabled": True,
        "required": True,
        "recovery_codes_left": 10,
    }

    # Use a new TOTP step so the setup code is not replayed.
    next_code = totp.code_at(
        setup["secret"],
        time.time() + 30,
    )

    off = client.post(
        f"{AUTH}/mfa/disable",
        json={"code": next_code},
        headers=headers,
    )

    # Admins are not allowed to disable required MFA.
    assert off.status_code == 403


# Rate limits and headers


def test_sign_in_is_rate_limited(client, monkeypatch):
    monkeypatch.setattr(limiter, "enabled", True)
    limiter.reset()

    codes = [
        client.post(
            f"{AUTH}/login",
            json={
                "email": "nobody@example.com",
                "password": "whatever",
            },
        ).status_code
        for _ in range(12)
    ]

    limiter.reset()

    assert codes[:10] == [401] * 10
    assert codes[-1] == 429


def test_security_headers(client):
    res = client.get("/health")

    assert res.headers["X-Content-Type-Options"] == "nosniff"
    assert res.headers["X-Frame-Options"] == "DENY"
    assert "default-src 'none'" in res.headers["Content-Security-Policy"]

    auth = client.post(
        f"{AUTH}/login",
        json={"email": "x@example.com", "password": "y"},
    )

    assert auth.headers["Cache-Control"] == "no-store"


def test_oversized_requests_are_refused(client):
    res = client.post(
        f"{AUTH}/login",
        content=b"x" * (settings.max_request_bytes + 1),
        headers={"Content-Type": "application/json"},
    )

    assert res.status_code == 413
