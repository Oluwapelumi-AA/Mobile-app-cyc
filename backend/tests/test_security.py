import pytest

from app.core.security import hash_password, verify_password


def test_password_is_hashed():
    password = "Example-Strong-Password-123!"

    hashed = hash_password(password)

    assert hashed != password
    assert hashed.startswith("$argon2")


def test_correct_password_verifies():
    password = "Example-Strong-Password-123!"

    hashed = hash_password(password)

    assert verify_password(password, hashed) is True


def test_incorrect_password_is_rejected():
    hashed = hash_password("Example-Strong-Password-123!")

    assert verify_password("Wrong-Password-123!", hashed) is False


def test_same_password_produces_different_hashes():
    password = "Example-Strong-Password-123!"

    first_hash = hash_password(password)
    second_hash = hash_password(password)

    assert first_hash != second_hash
    assert verify_password(password, first_hash)
    assert verify_password(password, second_hash)


def test_empty_password_cannot_be_hashed():
    with pytest.raises(ValueError):
        hash_password("")