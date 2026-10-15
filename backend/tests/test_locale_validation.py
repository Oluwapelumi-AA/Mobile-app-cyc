import pytest
from pydantic import TypeAdapter, ValidationError

from app.schemas.locale import CountryCode, LanguageCode, TimeZoneId

language = TypeAdapter(LanguageCode)
country = TypeAdapter(CountryCode)
timezone = TypeAdapter(TimeZoneId)


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("en", "en"),
        ("YO", "yo"),
        ("yor", "yo"),  # shortest ISO 639 code wins
        ("pt-br", "pt-BR"),
        ("pt_BR", "pt-BR"),
        ("zh-hant-tw", "zh-Hant-TW"),
        ("es-419", "es-419"),
        ("fil", "fil"),  # ISO 639-3 only
        (" sw ", "sw"),
    ],
)
def test_language_codes_are_normalized(raw, expected):
    assert language.validate_python(raw) == expected


@pytest.mark.parametrize(
    "raw",
    ["", "e", "english", "xx", "und", "mul", "en-XX", "en-Abcd", "en-US-x-private", "12", "en--US"],
)
def test_invalid_language_codes_are_rejected(raw):
    with pytest.raises(ValidationError):
        language.validate_python(raw)


@pytest.mark.parametrize(("raw", "expected"), [("NG", "NG"), ("gb", "GB"), ("br", "BR")])
def test_country_codes_are_normalized(raw, expected):
    assert country.validate_python(raw) == expected


@pytest.mark.parametrize("raw", ["", "N", "NGA", "ZZ", "UK", "1A", "Nigeria"])
def test_invalid_country_codes_are_rejected(raw):
    with pytest.raises(ValidationError):
        country.validate_python(raw)


@pytest.mark.parametrize("raw", ["Africa/Lagos", "Europe/London", "America/Sao_Paulo", "UTC"])
def test_iana_timezones_are_accepted(raw):
    assert timezone.validate_python(raw) == raw


@pytest.mark.parametrize("raw", ["", "Lagos", "GMT+1", "+01:00", "africa/lagos", "Factory", "localtime"])
def test_invalid_timezones_are_rejected(raw):
    with pytest.raises(ValidationError):
        timezone.validate_python(raw)
