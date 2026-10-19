"""Push notification boundary.

No push service has been chosen yet, so the worker sends through
``PushProvider`` and never through a vendor SDK directly. Adding one (Expo
Push, Firebase Cloud Messaging, APNs, OneSignal, ...) means writing one class
with a ``send`` method and naming it in ``build_push_provider``.

``send`` gets the user's device tokens and one message. It returns the tokens
the service says are dead (app uninstalled, token expired) so the worker can
forget those devices, and raises ``PushError`` when the whole send failed and
should be tried again later.

``PUSH_PROVIDER`` picks the implementation:

- ``fake`` (default): records what would be sent. Development and tests only.
- ``none``: push is off; push jobs are skipped.
"""

from dataclasses import dataclass, field
from functools import lru_cache
from typing import Protocol

from app.core.config import Settings, settings


class PushUnavailable(Exception):
    """No push provider is configured."""


class PushError(Exception):
    """The send failed; try again later."""


@dataclass(frozen=True)
class PushMessage:
    title: str
    body: str | None
    # Small string map the app reads when the notification is tapped.
    data: dict[str, str] = field(default_factory=dict)
    # The user's unread count, for the app icon badge.
    badge: int | None = None


@dataclass(frozen=True)
class PushResult:
    invalid_tokens: frozenset[str] = frozenset()


class PushProvider(Protocol):
    name: str

    def send(self, tokens: list[str], message: PushMessage) -> PushResult: ...


class UnconfiguredPushProvider:
    name = "none"

    def send(self, tokens: list[str], message: PushMessage) -> PushResult:
        raise PushUnavailable("push is not configured")


class FakePushProvider:
    """Keeps sent messages in ``sent``. Tokens starting with ``invalid`` are
    reported dead, and ``fail_next`` makes the next sends raise, so tests can
    exercise cleanup and retries."""

    name = "fake"

    def __init__(self) -> None:
        self.sent: list[tuple[list[str], PushMessage]] = []
        self.fail_next = 0

    def send(self, tokens: list[str], message: PushMessage) -> PushResult:
        if self.fail_next:
            self.fail_next -= 1
            raise PushError("fake push failure")
        live = [token for token in tokens if not token.startswith("invalid")]
        if live:
            self.sent.append((live, message))
        return PushResult(invalid_tokens=frozenset(set(tokens) - set(live)))


def build_push_provider(config: Settings) -> PushProvider:
    if config.push_provider == "fake":
        return FakePushProvider()
    if config.push_provider == "none":
        return UnconfiguredPushProvider()
    raise ValueError(f"Unknown PUSH_PROVIDER {config.push_provider!r}")


@lru_cache
def get_push_provider() -> PushProvider:
    return build_push_provider(settings)
