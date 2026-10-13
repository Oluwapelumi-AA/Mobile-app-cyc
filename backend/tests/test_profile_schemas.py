import pytest
from pydantic import ValidationError

from app.schemas.profile import (
    BIO_MAX_LENGTH,
    DISPLAY_NAME_MAX_LENGTH,
    ProfileCreate,
    ProfileUpdate,
)


def test_valid_profile_create():
    profile = ProfileCreate(
        display_name="  Grace Adeyemi ",
        bio="Worship leader.\nLagos.",
        language_code="en-ng",
        country_code="ng",
        timezone="Africa/Lagos",
    )

    assert profile.display_name == "Grace Adeyemi"
    assert profile.language_code == "en-NG"
    assert profile.country_code == "NG"


def test_only_display_name_is_required():
    profile = ProfileCreate(display_name="Grace")

    assert profile.bio is None
    assert profile.language_code is None
    assert profile.country_code is None
    assert profile.timezone is None


@pytest.mark.parametrize("payload", [{}, {"display_name": ""}, {"display_name": "   "}])
def test_display_name_is_required(payload):
    with pytest.raises(ValidationError):
        ProfileCreate(**payload)


def test_length_limits():
    ProfileCreate(display_name="a" * DISPLAY_NAME_MAX_LENGTH, bio="b" * BIO_MAX_LENGTH)

    with pytest.raises(ValidationError):
        ProfileCreate(display_name="a" * (DISPLAY_NAME_MAX_LENGTH + 1))
    with pytest.raises(ValidationError):
        ProfileCreate(display_name="Grace", bio="b" * (BIO_MAX_LENGTH + 1))


def test_unicode_names_are_allowed():
    assert ProfileCreate(display_name="Ọlọ́run Ṣe 恩典").display_name == "Ọlọ́run Ṣe 恩典"


@pytest.mark.parametrize("name", ["Grace\x00", "Gr‮ace", "Grace\nAdeyemi"])
def test_control_characters_are_rejected_in_display_name(name):
    with pytest.raises(ValidationError):
        ProfileCreate(display_name=name)


def test_blank_bio_becomes_none():
    assert ProfileCreate(display_name="Grace", bio="   ").bio is None


def test_unknown_and_identity_fields_are_rejected():
    for field in ("email", "password", "role", "avatar_url"):
        with pytest.raises(ValidationError):
            ProfileCreate(display_name="Grace", **{field: "x"})


def test_update_requires_at_least_one_field():
    with pytest.raises(ValidationError):
        ProfileUpdate()


def test_update_tracks_only_provided_fields():
    update = ProfileUpdate(bio=None, timezone="Europe/London")

    assert update.model_dump(exclude_unset=True) == {"bio": None, "timezone": "Europe/London"}


@pytest.mark.parametrize("field", ["display_name", "language_code"])
def test_update_cannot_clear_required_fields(field):
    with pytest.raises(ValidationError):
        ProfileUpdate(**{field: None})


@pytest.mark.parametrize("field", ["bio", "country_code", "timezone"])
def test_update_can_clear_optional_fields(field):
    assert ProfileUpdate(**{field: None}).model_dump(exclude_unset=True) == {field: None}


def test_update_does_not_accept_avatar_url():
    with pytest.raises(ValidationError):
        ProfileUpdate(avatar_url="https://example.com/a.png")


def test_update_validates_locale_fields():
    with pytest.raises(ValidationError):
        ProfileUpdate(country_code="ZZ")
    with pytest.raises(ValidationError):
        ProfileUpdate(timezone="Mars/Olympus")
