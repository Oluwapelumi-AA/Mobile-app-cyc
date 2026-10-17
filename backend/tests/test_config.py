
import pytest
from pydantic import ValidationError

from app.core.config import Settings


def test_default_security_settings_are_valid():
    settings = Settings()

    assert settings.access_token_expire_minutes == 15
    assert settings.refresh_token_expire_days == 7


def test_access_token_expiry_must_be_positive():
    with pytest.raises(ValidationError):
        Settings(access_token_expire_minutes=0)


def test_refresh_token_expiry_must_be_positive():
    with pytest.raises(ValidationError):
        Settings(refresh_token_expire_days=-1)


def test_production_requires_a_long_secret():
    with pytest.raises(ValidationError):
        Settings(
            environment="production",
            secret_key="short-secret",
        )


def test_production_rejects_placeholder_secret():
    with pytest.raises(ValidationError):
        Settings(
            environment="production",
            secret_key="replace-with-a-random-secret-before-enabling-auth",
        )
