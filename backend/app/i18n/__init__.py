"""Server-side translations for text the API writes itself.

Most of what people read comes from the app's own UI strings or from content
people wrote. The API only writes a little text of its own: notification
titles and bodies, and the footer of notification emails. Those are written
in each recipient's language, from the catalogs in this package.

- ``Text("some.key", name=...)`` is a message to translate later, once the
  reader's language is known. ``render(text, language)`` turns it into a
  string. Parameters can be strings, other ``Text`` values or ``LocalTime``.
- A language is picked from a BCP 47 tag with ``best_language``: ``pt-BR``
  uses ``pt``, and a language with no catalog uses ``DEFAULT_LANGUAGE``
  (``DEFAULT_LANGUAGE`` setting).
- A key missing from a catalog falls back to English, so a new message never
  shows up blank while it waits for a translator.

Error responses stay in English: clients translate them from their ``code``.
"""

from dataclasses import dataclass, field
from datetime import UTC, datetime
from zoneinfo import ZoneInfo

from app.core.config import settings
from app.i18n import en, es, fr, pt

FALLBACK_LANGUAGE = "en"

CATALOGS: dict[str, dict[str, str]] = {
    "en": en.MESSAGES,
    "es": es.MESSAGES,
    "fr": fr.MESSAGES,
    "pt": pt.MESSAGES,
}

# (English name, name in the language itself), for the language picker.
LANGUAGE_NAMES: dict[str, tuple[str, str]] = {
    "en": ("English", "English"),
    "es": ("Spanish", "Español"),
    "fr": ("French", "Français"),
    "pt": ("Portuguese", "Português"),
}


@dataclass(frozen=True)
class Text:
    """A message to translate once the reader's language is known."""

    key: str
    params: dict = field(default_factory=dict)

    def __init__(self, key: str, **params) -> None:
        object.__setattr__(self, "key", key)
        object.__setattr__(self, "params", params)


@dataclass(frozen=True)
class LocalTime:
    """A moment shown in a given time zone, formatted for the reader."""

    when: datetime
    timezone: str


def supported_languages() -> list[str]:
    """Languages the API writes in: the configured ones that have a catalog."""
    return [code for code in settings.supported_languages if code in CATALOGS]


def default_language() -> str:
    code = settings.default_language
    return code if code in CATALOGS else FALLBACK_LANGUAGE


def _closest(tag: str, supported: list[str]) -> str | None:
    tag = tag.replace("_", "-").lower()
    for candidate in (tag, tag.split("-", 1)[0]):
        if candidate in supported:
            return candidate
    return None


def best_language(tag: str | None) -> str:
    """The supported language closest to a BCP 47 tag such as ``pt-BR``."""
    return (tag and _closest(tag, supported_languages())) or default_language()


def parse_accept_language(header: str | None) -> list[str]:
    """Language tags from an ``Accept-Language`` header, most wanted first."""
    if not header:
        return []
    weighted = []
    for position, part in enumerate(header.split(",")):
        tag, _, params = part.strip().partition(";")
        tag = tag.strip()
        if not tag or tag == "*":
            continue
        quality = 1.0
        params = params.strip()
        if params.startswith("q="):
            try:
                quality = float(params[2:])
            except ValueError:
                continue
        if quality > 0:
            weighted.append((-quality, position, tag))
    return [tag for *_, tag in sorted(weighted)]


def negotiate(header: str | None) -> str:
    """The best supported language for an ``Accept-Language`` header."""
    supported = supported_languages()
    for tag in parse_accept_language(header):
        language = _closest(tag, supported)
        if language:
            return language
    return default_language()


def message(key: str, language: str) -> str:
    catalog = CATALOGS.get(language, {})
    if key in catalog:
        return catalog[key]
    return CATALOGS[FALLBACK_LANGUAGE][key]


def _format_time(value: LocalTime, language: str) -> str:
    when = value.when if value.when.tzinfo else value.when.replace(tzinfo=UTC)
    local = when.astimezone(ZoneInfo(value.timezone))
    return f"{local.strftime(message('format.datetime', language))} ({value.timezone})"


def render(value, language: str) -> str | None:
    """Turn a ``Text`` (or a plain string) into a string in ``language``."""
    if value is None or isinstance(value, str):
        return value
    if isinstance(value, LocalTime):
        return _format_time(value, language)
    if isinstance(value, Text):
        params = {name: render(param, language) for name, param in value.params.items()}
        return message(value.key, language).format(**params)
    return str(value)
