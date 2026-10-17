
import uuid

import jwt
import pytest

from app.core.config import settings
from app.core.security import (
    ALGORITHM,
    create_access_token,
    create_refresh_token,
    decode_token,
)


def test_access_token_contains_expected_claims():
    token = create_access_token("user-123")

    payload = decode_token(token, expected_type="access")

    assert payload["sub"] == "user-123"
    assert payload["type"] == "access"
    assert "exp" in payload


def test_refresh_token_contains_expected_claims():
    session_id = uuid.uuid4()
    token = create_refresh_token("user-123", session_id)

    payload = decode_token(token, expected_type="refresh")

    assert payload["sub"] == "user-123"
    assert payload["type"] == "refresh"
    assert payload["sid"] == str(session_id)
    assert "exp" in payload


def test_access_token_cannot_be_used_as_refresh_token():
    token = create_access_token("user-123")

    with pytest.raises(jwt.InvalidTokenError):
        decode_token(token, expected_type="refresh")


def test_refresh_token_cannot_be_used_as_access_token():
    token = create_refresh_token("user-123", uuid.uuid4())

    with pytest.raises(jwt.InvalidTokenError):
        decode_token(token, expected_type="access")


def test_tampered_token_is_rejected():
    token = create_access_token("user-123")
    tampered_token = token[:-1] + (
        "a" if token[-1] != "a" else "b"
    )

    with pytest.raises(jwt.InvalidTokenError):
        decode_token(tampered_token, expected_type="access")


@pytest.mark.parametrize("subject", ["", "   "])
def test_empty_subject_is_rejected(subject):
    with pytest.raises(ValueError):
        create_access_token(subject)

    with pytest.raises(ValueError):
        create_refresh_token(subject, uuid.uuid4())
