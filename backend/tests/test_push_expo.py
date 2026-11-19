import json

import httpx
import pytest

from app.core.config import Settings
from app.services.push_provider import ExpoPushProvider, PushError, PushMessage

GOOD = "ExponentPushToken[aaaaaaaaaaaaaaaaaaaaaa]"
GONE = "ExponentPushToken[bbbbbbbbbbbbbbbbbbbbbb]"


def provider(handler, token=None):
    config = Settings(push_provider="expo", expo_access_token=token)
    return ExpoPushProvider(config, client=httpx.Client(transport=httpx.MockTransport(handler)))


def test_sends_one_message_per_token_and_drops_dead_ones():
    seen = {}

    def handler(request):
        seen["body"] = json.loads(request.content)
        seen["auth"] = request.headers.get("authorization")
        return httpx.Response(
            200,
            json={"data": [
                {"status": "ok", "id": "1"},
                {"status": "error", "message": "gone", "details": {"error": "DeviceNotRegistered"}},
            ]},
        )

    result = provider(handler, token="secret").send(
        [GOOD, GONE, "fcm-not-expo"],
        PushMessage(title="Hello", body="World", data={"type": "chapter"}, badge=3),
    )
    assert [m["to"] for m in seen["body"]] == [GOOD, GONE]
    assert seen["body"][0] == {"to": GOOD, "title": "Hello", "body": "World", "sound": "default", "data": {"type": "chapter"}, "badge": 3}
    assert seen["auth"] == "Bearer secret"
    assert result.invalid_tokens == {GONE, "fcm-not-expo"}


def test_other_ticket_errors_are_not_treated_as_dead():
    handler = lambda request: httpx.Response(200, json={"data": [{"status": "error", "details": {"error": "MessageRateExceeded"}}]})
    assert provider(handler).send([GOOD], PushMessage(title="Hi", body=None)).invalid_tokens == frozenset()


def test_batches_of_100():
    calls = []

    def handler(request):
        batch = json.loads(request.content)
        calls.append(len(batch))
        return httpx.Response(200, json={"data": [{"status": "ok"}] * len(batch)})

    tokens = [f"ExponentPushToken[{i:022d}]" for i in range(230)]
    provider(handler).send(tokens, PushMessage(title="Hi", body=None))
    assert calls == [100, 100, 30]


@pytest.mark.parametrize("status", [429, 500, 503, 400])
def test_http_errors_retry_later(status):
    handler = lambda request: httpx.Response(status, json={})
    with pytest.raises(PushError):
        provider(handler).send([GOOD], PushMessage(title="Hi", body=None))


def test_network_errors_retry_later():
    def handler(request):
        raise httpx.ConnectTimeout("slow")

    with pytest.raises(PushError):
        provider(handler).send([GOOD], PushMessage(title="Hi", body=None))
