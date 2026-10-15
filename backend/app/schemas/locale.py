"""Validated types for language, country/region and time-zone preferences.

- Language: a BCP 47 tag limited to ``language[-Script][-REGION]`` (e.g. ``en``,
  ``yo``, ``pt-BR``, ``zh-Hant-TW``, ``es-419``). Language subtags are checked
  against ISO 639 via pycountry, scripts against ISO 15924, regions against
  ISO 3166-1 alpha-2 or a UN M.49 numeric code.
- Country: ISO 3166-1 alpha-2 (e.g. ``NG``, ``GB``), checked via pycountry.
- Time zone: an IANA identifier (e.g. ``Africa/Lagos``) from the tz database.

These are separate on purpose: language drives UI and content, country drives
regional content and legal rules, and time zone drives event and notification
times. None is inferred from another.
"""

import re
import zoneinfo
from functools import lru_cache
from typing import Annotated

import pycountry
from pydantic import AfterValidator, StringConstraints

_LANGUAGE_TAG = re.compile(
    r"^(?P<language>[A-Za-z]{2,3})"
    r"(?:-(?P<script>[A-Za-z]{4}))?"
    r"(?:-(?P<region>[A-Za-z]{2}|\d{3}))?$"
)
# Tz database entries that are not real user-selectable zones.
_EXCLUDED_TIMEZONES = {"Factory", "localtime"}


def normalize_language_tag(value: str) -> str:
    match = _LANGUAGE_TAG.match(value.replace("_", "-"))
    if match is None:
        raise ValueError(
            "language_code must be a BCP 47 tag such as 'en', 'pt-BR' or 'zh-Hant-TW'"
        )

    subtag = match["language"].lower()
    if len(subtag) == 2:
        language = pycountry.languages.get(alpha_2=subtag)
    else:
        language = pycountry.languages.get(alpha_3=subtag)
    # Scope "S" covers special codes such as 'und' (undetermined) and 'mul'.
    if language is None or getattr(language, "scope", None) == "S":
        raise ValueError(f"'{match['language']}' is not a recognised ISO 639 language code")
    # BCP 47 requires the shortest available code, e.g. 'yor' -> 'yo'.
    parts = [getattr(language, "alpha_2", None) or language.alpha_3]

    if match["script"]:
        script = match["script"].title()
        if pycountry.scripts.get(alpha_4=script) is None:
            raise ValueError(f"'{match['script']}' is not a recognised ISO 15924 script code")
        parts.append(script)

    if match["region"]:
        region = match["region"].upper()
        if region.isalpha() and pycountry.countries.get(alpha_2=region) is None:
            raise ValueError(f"'{match['region']}' is not a recognised ISO 3166-1 region code")
        parts.append(region)

    return "-".join(parts)


def normalize_country_code(value: str) -> str:
    code = value.upper()
    if len(code) != 2 or not code.isalpha() or pycountry.countries.get(alpha_2=code) is None:
        raise ValueError("country_code must be an ISO 3166-1 alpha-2 code such as 'NG' or 'GB'")
    return code


@lru_cache(maxsize=1)
def _available_timezones() -> frozenset[str]:
    return frozenset(zoneinfo.available_timezones() - _EXCLUDED_TIMEZONES)


def validate_timezone(value: str) -> str:
    if value not in _available_timezones():
        raise ValueError("timezone must be an IANA time-zone identifier such as 'Africa/Lagos'")
    return value


LanguageCode = Annotated[
    str,
    StringConstraints(strip_whitespace=True, min_length=2, max_length=35),
    AfterValidator(normalize_language_tag),
]
CountryCode = Annotated[
    str,
    StringConstraints(strip_whitespace=True, min_length=2, max_length=2),
    AfterValidator(normalize_country_code),
]
TimeZoneId = Annotated[
    str,
    StringConstraints(strip_whitespace=True, min_length=1, max_length=64),
    AfterValidator(validate_timezone),
]
