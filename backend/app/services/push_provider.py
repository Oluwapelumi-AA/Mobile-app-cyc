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
- ``expo``: Expo Push Service, for the Expo mobile app. Device tokens are
  Expo push tokens (``ExponentPushToken[...]``). ``EXPO_ACCESS_TOKEN`` is
  only needed when enhanced push security is on in the Expo project.
"""

from dataclasses import dataclass, field
from functools import lru_cache
from typing import Protocol

import httpx

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


class ExpoPushProvider:
    """Sends through the Expo Push Service.

    Expo takes up to 100 messages per request and answers with one ticket per
    message, in order. A ticket with ``DeviceNotRegistered`` means the app was
    uninstalled or the token expired, so that device is dropped. Other ticket
    errors are per-device and not retried; HTTP errors and timeouts retry the
    whole send.
    """

    name = "expo"
    BATCH = 100

    def __init__(self, config: Settings, client: httpx.Client | None = None) -> None:
        self.url = config.expo_push_url
        self.headers = {
            "Accept": "application/json",
            "Accept-Encoding": "gzip, deflate",
            "Content-Type": "application/json",
        }
        if config.expo_access_token:
            self.headers["Authorization"] = f"Bearer {config.expo_access_token}"
        self.client = client or httpx.Client(timeout=15)

    def _payload(self, token: str, message: PushMessage) -> dict:
        body: dict = {"to": token, "title": message.title, "sound": "default"}
        if message.body:
            body["body"] = message.body
        if message.data:
            body["data"] = message.data
        if message.badge is not None:
            body["badge"] = message.badge
        return body

    def send(self, tokens: list[str], message: PushMessage) -> PushResult:
        dead: set[str] = set()
        # Anything that isn't an Expo token can never be delivered here.
        expo_tokens = []
        for token in tokens:
            if token.startswith(("ExponentPushToken[", "ExpoPushToken[")):
                expo_tokens.append(token)
            else:
                dead.add(token)
        for start in range(0, len(expo_tokens), self.BATCH):
            batch = expo_tokens[start : start + self.BATCH]
            try:
                response = self.client.post(
                    self.url,
                    headers=self.headers,
                    json=[self._payload(token, message) for token in batch],
                )
            except httpx.HTTPError as exc:
                raise PushError(f"Expo push request failed: {exc.__class__.__name__}") from exc
            if response.status_code == 429 or response.status_code >= 500:
                raise PushError(f"Expo push returned {response.status_code}")
            if response.status_code >= 400:
                raise PushError(f"Expo push rejected the request ({response.status_code})")
            try:
                tickets = response.json().get("data") or []
            except ValueError as exc:
                raise PushError("Expo push returned an unreadable response") from exc
            for token, ticket in zip(batch, tickets, strict=False):
                details = ticket.get("details") or {}
                if ticket.get("status") == "error" and details.get("error") == "DeviceNotRegistered":
                    dead.add(token)
        return PushResult(invalid_tokens=frozenset(dead))


def build_push_provider(config: Settings) -> PushProvider:
    if config.push_provider == "fake":
        return FakePushProvider()
    if config.push_provider == "none":
        return UnconfiguredPushProvider()
    if config.push_provider == "expo":
        return ExpoPushProvider(config)
    raise ValueError(f"Unknown PUSH_PROVIDER {config.push_provider!r}")


@lru_cache
def get_push_provider() -> PushProvider:
    return build_push_provider(settings)
