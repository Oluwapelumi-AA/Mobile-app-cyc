import re
from datetime import UTC, datetime, timedelta

import pytest

from app.models import PasswordResetCode
from app.services.email_sender import get_email_sender

V1 = "/api/v1/auth"
NEW = "a-brand-new-password"


@pytest.fixture
def db_session(api):
    with api.session_factory() as db:
        yield db


@pytest.fixture
def outbox():
    sender = get_email_sender()
    sender.outbox.clear()
    yield sender.outbox
    sender.outbox.clear()


def ask(api, email="ada@example.com"):
    response = api.client.post(f"{V1}/password-reset/request", json={"email": email})
    assert response.status_code == 202
    return response


def code_from(outbox):
    """The code in the latest reset email (a "password changed" email may
    have come after it)."""
    latest = [m for m in outbox if "reset code" in m.subject][-1]
    return re.search(r"\b(\d{6})\b", latest.text).group(1)


def confirm(api, code, email="ada@example.com", password=NEW):
    return api.client.post(
        f"{V1}/password-reset/confirm", json={"email": email, "code": code, "new_password": password}
    )


def login(api, password, email="ada@example.com"):
    return api.client.post(f"{V1}/login", json={"email": email, "password": password}).status_code


def test_reset_with_emailed_code(api, outbox):
    api.add_user("ada")
    ask(api, "ADA@example.com")
    assert len(outbox) == 1 and outbox[0].to == "ada@example.com"
    assert confirm(api, code_from(outbox)).status_code == 204
    assert login(api, NEW) == 200
    # The code is single use.
    assert confirm(api, code_from(outbox), password="another-password-1").status_code == 400


def test_unknown_email_looks_the_same(api, outbox):
    response = ask(api, "nobody@example.com")
    assert "If that email has an account" in response.json()["message"]
    assert outbox == []


def test_wrong_code_and_attempt_limit(api, outbox):
    api.add_user("ada")
    ask(api)
    real = code_from(outbox)
    wrong = "000000" if real != "000000" else "111111"
    for _ in range(5):
        assert confirm(api, wrong).status_code == 400
    # Locked after 5 wrong tries, even with the right code.
    assert confirm(api, real).status_code == 400


def test_expired_code(api, outbox, db_session):
    user = api.add_user("ada")
    ask(api)
    row = db_session.query(PasswordResetCode).filter_by(user_id=user).one()
    row.expires_at = datetime.now(UTC) - timedelta(seconds=1)
    db_session.commit()
    assert confirm(api, code_from(outbox)).status_code == 400


def test_new_request_replaces_old_code_and_is_throttled(api, outbox, db_session):
    user = api.add_user("ada")
    ask(api)
    first = code_from(outbox)
    ask(api)  # within a minute: no new email
    assert len(outbox) == 1

    row = db_session.query(PasswordResetCode).filter_by(user_id=user).one()
    row.created_at = datetime.now(UTC) - timedelta(minutes=2)
    db_session.commit()
    ask(api)
    assert len(outbox) == 2
    second = code_from(outbox)
    if first != second:
        assert confirm(api, first).status_code == 400
    assert confirm(api, second).status_code == 204


def test_validation(api, outbox):
    api.add_user("ada")
    ask(api)
    assert confirm(api, "12ab56").status_code == 422
    assert confirm(api, code_from(outbox), password="short").status_code == 422
