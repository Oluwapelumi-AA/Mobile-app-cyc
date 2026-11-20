"""Password rules shared by sign-up, reset and change: 12–128 characters,
not a well-known password, and not just your email name."""

from fastapi import HTTPException, status

# Passwords that show up first in every leaked-password list, at 12+ chars
# or with simple padding. Checked case-insensitively, ignoring spaces.
_COMMON = {
    "123456789012", "1234567890123", "12345678910", "qwertyuiopas", "qwertyuiop12",
    "qwerty123456", "password1234", "password12345", "password123!", "passwordpassword",
    "iloveyou1234", "1q2w3e4r5t6y", "1qaz2wsx3edc", "abcdefghijkl", "abc123456789",
    "aaaaaaaaaaaa", "111111111111", "000000000000", "123123123123", "welcome12345",
    "letmein12345", "admin1234567", "administrator", "changeme1234", "football1234",
    "baseball1234", "monkey123456", "dragon123456", "sunshine1234", "princess1234",
    "trustno11234", "jesuschrist1", "jesuslovesme", "godisgood123", "praisethelord",
    "christ123456", "cyc123456789", "christyouthclub", "passw0rd1234", "p@ssw0rd1234",
    "p@ssword1234", "qwerty12345!", "zaq12wsxcde3", "asdfghjkl123", "zxcvbnm12345",
}


def password_problem(password: str, email: str | None = None) -> str | None:
    """Why the password isn't allowed, or None."""
    if len(password) < 12:
        return "Use at least 12 characters."
    if len(password) > 128:
        return "Use at most 128 characters."
    squashed = password.lower().replace(" ", "")
    if squashed in _COMMON or len(set(squashed)) <= 3:
        return "That password is too easy to guess. Try a short sentence you'll remember."
    if email:
        name = email.split("@")[0].lower()
        if len(name) >= 4 and squashed in {name, name + "123", name + "1234", name + "12345"}:
            return "Don't use your email as your password."
    return None


def require_strong_password(password: str, email: str | None = None) -> None:
    problem = password_problem(password, email)
    if problem:
        raise HTTPException(
            status_code=422,
            detail={"code": "weak_password", "message": problem},
        )
