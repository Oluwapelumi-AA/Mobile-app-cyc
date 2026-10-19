import smtplib
from datetime import UTC, datetime, timedelta

import pytest
from pydantic import ValidationError
from sqlalchemy import select

from app.core.config import Settings, settings
from app.models import (
    DeliveryStatus,
    Event,
    Notification,
    NotificationDelivery,
    NotificationDevice,
)
from app.services import notification_jobs
from app.services.email_sender import (
    EmailError,
    EmailMessage,
    FakeEmailSender,
    SmtpEmailSender,
    UnconfiguredEmailSender,
    build_email_sender,
)
from app.services.push_provider import (
    FakePushProvider,
    UnconfiguredPushProvider,
    build_push_provider,
)
from app.workers.notifications import run_once
from tests.test_notifications_api import (
    EVENTS,
    PREFERENCES,
    comment,
    create_event,
    inbox,
    post,
    register_device,
    sign_up,
    world,  # noqa: F401 (fixture)
)


@pytest.fixture
def senders():
    return FakePushProvider(), FakeEmailSender()


def run_jobs(api, senders, now=None):
    push, email = senders
    with api.session_factory() as db:
        return notification_jobs.process_deliveries(db, push, email, now=now)


def jobs(api):
    with api.session_factory() as db:
        return list(db.scalars(select(NotificationDelivery).order_by(NotificationDelivery.channel)))


def commented_post(api, world):
    created = post(api, world["alice"], world)
    comment(api, world["bob"], created["id"])
    return created


# Push


def test_push_goes_to_every_device(api, world, senders):
    register_device(api, world["alice"], token="alice-phone-token")
    register_device(api, world["alice"], token="alice-tablet-token", platform="android")
    created = commented_post(api, world)

    stats = run_jobs(api, senders)
    assert (stats.sent, stats.skipped, stats.retrying) == (1, 0, 0)
    push, _ = senders
    [(tokens, message)] = push.sent
    assert sorted(tokens) == ["alice-phone-token", "alice-tablet-token"]
    assert message.title == "Bob commented on your post"
    assert message.body == "Amen, praying with you!"
    assert message.badge == 1
    assert message.data["type"] == "comment_on_post"
    assert message.data["post_id"] == created["id"]
    assert message.data["notification_id"] == inbox(api, world["alice"])[0]["id"]
    [job] = jobs(api)
    assert job.status == "sent" and job.attempts == 1 and job.sent_at is not None

    # Nothing left to send.
    assert run_jobs(api, senders).sent == 0
    assert len(push.sent) == 1


def test_dead_tokens_are_forgotten(api, world, senders):
    register_device(api, world["alice"], token="alice-phone-token")
    register_device(api, world["alice"], token="invalid-old-token")
    commented_post(api, world)

    stats = run_jobs(api, senders)
    assert stats.sent == 1 and stats.removed_devices == 1
    with api.session_factory() as db:
        assert list(db.scalars(select(NotificationDevice.token))) == ["alice-phone-token"]


def test_only_dead_tokens_is_skipped(api, world, senders):
    register_device(api, world["alice"], token="invalid-old-token")
    commented_post(api, world)

    stats = run_jobs(api, senders)
    assert stats.skipped == 1
    [job] = jobs(api)
    assert job.status == "skipped" and job.last_error == "no working devices"
    with api.session_factory() as db:
        assert db.scalar(select(NotificationDevice)) is None


def test_devices_removed_before_sending_are_skipped(api, world, senders):
    device = register_device(api, world["alice"]).json()
    commented_post(api, world)
    api.act_as(world["alice"])
    api.client.delete(f"/api/v1/notifications/devices/{device['id']}")

    assert run_jobs(api, senders).skipped == 1
    assert jobs(api)[0].last_error == "no devices"


def test_read_notifications_are_not_pushed(api, world, senders):
    register_device(api, world["alice"])
    commented_post(api, world)
    api.act_as(world["alice"])
    api.client.post("/api/v1/notifications/read-all")

    assert run_jobs(api, senders).skipped == 1
    assert senders[0].sent == []
    assert jobs(api)[0].last_error == "already read in the app"


def test_push_off_skips_jobs(api, world):
    register_device(api, world["alice"])
    commented_post(api, world)
    stats = run_jobs(api, (UnconfiguredPushProvider(), FakeEmailSender()))
    assert stats.skipped == 1
    assert jobs(api)[0].last_error == "push is off"


def test_failed_sends_are_retried_then_given_up(api, world, senders):
    register_device(api, world["alice"])
    commented_post(api, world)
    push, _ = senders
    push.fail_next = settings.notification_max_attempts

    now = datetime.now(UTC)
    stats = run_jobs(api, senders, now=now)
    assert stats.retrying == 1 and stats.errors == ["PushError: fake push failure"]
    [job] = jobs(api)
    assert job.status == "pending" and job.attempts == 1
    # Not due again until a minute later.
    assert run_jobs(api, senders, now=now + timedelta(seconds=30)).retrying == 0

    later = now
    for attempt in range(2, settings.notification_max_attempts + 1):
        later += notification_jobs.retry_delay(attempt - 1) + timedelta(seconds=1)
        run_jobs(api, senders, now=later)
    [job] = jobs(api)
    assert job.status == "failed"
    assert job.attempts == settings.notification_max_attempts
    assert push.sent == []


def test_a_retry_can_succeed(api, world, senders):
    register_device(api, world["alice"])
    commented_post(api, world)
    push, _ = senders
    push.fail_next = 1
    now = datetime.now(UTC)
    run_jobs(api, senders, now=now)
    stats = run_jobs(api, senders, now=now + timedelta(minutes=2))
    assert stats.sent == 1
    [job] = jobs(api)
    assert job.status == "sent" and job.attempts == 2 and job.last_error is None


def test_retry_delays_grow_and_are_capped():
    assert notification_jobs.retry_delay(1) == timedelta(minutes=1)
    assert notification_jobs.retry_delay(3) == timedelta(minutes=4)
    assert notification_jobs.retry_delay(20) == timedelta(hours=1)


def test_unexpected_errors_do_not_stop_the_batch(api, world, senders):
    register_device(api, world["alice"])
    register_device(api, world["bob"], token="ExponentPushToken[bob-phone]")
    first = post(api, world["alice"], world)
    second = post(api, world["bob"], world)
    comment(api, world["owner"], first["id"])
    comment(api, world["owner"], second["id"])

    class Flaky(FakePushProvider):
        def send(self, tokens, message):
            if "alice" in tokens[0]:
                raise RuntimeError("boom")
            return super().send(tokens, message)

    stats = run_jobs(api, (Flaky(), FakeEmailSender()))
    assert (stats.sent, stats.retrying) == (1, 1)


# Email


def test_event_email_is_sent_to_the_account_address(api, world, senders):
    event = create_event(api, world["owner"], world)
    sign_up(api, world["alice"], event["id"])
    api.act_as(world["owner"])
    api.client.post(f"{EVENTS}/{event['id']}/cancel")

    assert run_jobs(api, senders).sent == 1
    [message] = senders[1].outbox
    assert message.to == "alice@example.com"
    assert message.subject == "Youth Prayer Night was cancelled"
    assert message.text.startswith("Youth Prayer Night was cancelled")
    assert "Settings > Notifications" in message.text


def test_email_off_by_preference_creates_no_job(api, world, senders):
    api.act_as(world["alice"])
    api.client.patch(PREFERENCES, json={"preferences": [{"category": "events", "email": False}]})
    event = create_event(api, world["owner"], world)
    sign_up(api, world["alice"], event["id"])
    api.act_as(world["owner"])
    api.client.post(f"{EVENTS}/{event['id']}/cancel")
    assert jobs(api) == []
    assert len(inbox(api, world["alice"])) == 1


def test_email_failures_are_retried(api, world, senders):
    event = create_event(api, world["owner"], world)
    sign_up(api, world["alice"], event["id"])
    api.act_as(world["owner"])
    api.client.post(f"{EVENTS}/{event['id']}/cancel")
    senders[1].fail_next = 1
    assert run_jobs(api, senders).retrying == 1
    assert jobs(api)[0].last_error == "EmailError: fake email failure"


def test_email_off_skips_jobs(api, world):
    event = create_event(api, world["owner"], world)
    sign_up(api, world["alice"], event["id"])
    api.act_as(world["owner"])
    api.client.post(f"{EVENTS}/{event['id']}/cancel")
    stats = run_jobs(api, (FakePushProvider(), UnconfiguredEmailSender()))
    assert stats.skipped == 1
    assert jobs(api)[0].last_error == "email is off"


def test_smtp_sender_builds_and_sends_the_message(monkeypatch):
    calls = {}

    class FakeSmtp:
        def __init__(self, host, port, timeout):
            calls["connect"] = (host, port, timeout)

        def __enter__(self):
            return self

        def __exit__(self, *_):
            return False

        def starttls(self, context):
            calls["starttls"] = True

        def login(self, username, password):
            calls["login"] = (username, password)

        def send_message(self, message):
            calls["message"] = message

    monkeypatch.setattr(smtplib, "SMTP", FakeSmtp)
    sender = build_email_sender(
        Settings(
            email_backend="smtp",
            smtp_host="smtp.example.com",
            smtp_username="apikey",
            smtp_password="secret",
            email_from="CYC <hello@example.com>",
        )
    )
    assert isinstance(sender, SmtpEmailSender)
    sender.send(EmailMessage(to="alice@example.com", subject="Hello", text="Peace be with you"))
    assert calls["connect"] == ("smtp.example.com", 587, 10)
    assert calls["starttls"] is True
    assert calls["login"] == ("apikey", "secret")
    message = calls["message"]
    assert message["From"] == "CYC <hello@example.com>"
    assert message["To"] == "alice@example.com"
    assert message["Subject"] == "Hello"
    assert message.get_content().strip() == "Peace be with you"


def test_smtp_errors_become_retryable(monkeypatch):
    def refuse(*args, **kwargs):
        raise ConnectionRefusedError("no server")

    monkeypatch.setattr(smtplib, "SMTP", refuse)
    sender = SmtpEmailSender(Settings(email_backend="smtp", smtp_host="localhost"))
    with pytest.raises(EmailError):
        sender.send(EmailMessage(to="a@example.com", subject="Hi", text="Hi"))


# Event reminders


def test_reminders_go_to_people_with_a_spot_once(api, world, senders):
    event = create_event(api, world["owner"], world, capacity=1)
    sign_up(api, world["alice"], event["id"])
    sign_up(api, world["bob"], event["id"])
    starts = datetime.fromisoformat(event["starts_at"])

    with api.session_factory() as db:
        # Too early: outside the reminder window.
        assert notification_jobs.send_event_reminders(db, now=starts - timedelta(hours=2)) == 0
        soon = starts - timedelta(minutes=30)
        assert notification_jobs.send_event_reminders(db, now=soon) == 1
        assert notification_jobs.send_event_reminders(db, now=soon) == 0
        # Already started: no reminder.
        assert notification_jobs.send_event_reminders(db, now=starts + timedelta(minutes=1)) == 0

    items = inbox(api, world["alice"])
    assert [item["type"] for item in items] == ["event_reminder"]
    assert items[0]["title"] == "Youth Prayer Night starts soon"
    assert inbox(api, world["bob"]) == []


def test_rescheduled_events_remind_again(api, world):
    event = create_event(api, world["owner"], world)
    sign_up(api, world["alice"], event["id"])
    starts = datetime.fromisoformat(event["starts_at"])
    with api.session_factory() as db:
        notification_jobs.send_event_reminders(db, now=starts - timedelta(minutes=30))
        stored = db.scalar(select(Event))
        stored.starts_at = starts + timedelta(days=1)
        stored.ends_at = starts + timedelta(days=1, hours=2)
        db.commit()
        later = starts + timedelta(days=1) - timedelta(minutes=30)
        assert notification_jobs.send_event_reminders(db, now=later) == 1


def test_cancelled_events_are_not_reminded(api, world):
    event = create_event(api, world["owner"], world)
    sign_up(api, world["alice"], event["id"])
    api.act_as(world["owner"])
    api.client.post(f"{EVENTS}/{event['id']}/cancel")
    starts = datetime.fromisoformat(event["starts_at"])
    with api.session_factory() as db:
        assert notification_jobs.send_event_reminders(db, now=starts - timedelta(minutes=30)) == 0


# Pruning and the worker


def test_old_notifications_are_pruned(api, world):
    register_device(api, world["alice"])
    commented_post(api, world)
    with api.session_factory() as db:
        assert notification_jobs.prune_notifications(db) == 0
        later = datetime.now(UTC) + timedelta(days=settings.notification_retention_days + 1)
        assert notification_jobs.prune_notifications(db, now=later) == 1
        assert db.scalar(select(Notification)) is None
        assert db.scalar(select(NotificationDelivery)) is None


def test_worker_round(api, world, senders):
    register_device(api, world["alice"])
    commented_post(api, world)
    event = create_event(api, world["owner"], world)
    sign_up(api, world["alice"], event["id"])
    api.act_as(world["owner"])
    api.client.post(f"{EVENTS}/{event['id']}/cancel")

    push, email = senders
    result = run_once(push, email, session_factory=api.session_factory)
    assert result == {
        "reminded": 0,
        # Comment: push. Cancellation: push and email.
        "sent": 3,
        "skipped": 0,
        "retrying": 0,
        "failed": 0,
        "removed_devices": 0,
        "pruned": 0,
    }
    assert {job.status for job in jobs(api)} == {DeliveryStatus.SENT.value}


# Settings


def test_adapters_are_chosen_by_settings():
    assert isinstance(build_push_provider(Settings(push_provider="fake")), FakePushProvider)
    assert isinstance(build_push_provider(Settings(push_provider="none")), UnconfiguredPushProvider)
    assert isinstance(build_email_sender(Settings(email_backend="fake")), FakeEmailSender)
    assert isinstance(build_email_sender(Settings(email_backend="none")), UnconfiguredEmailSender)
    with pytest.raises(ValueError):
        build_push_provider(Settings(push_provider="pigeon"))
    with pytest.raises(ValueError):
        build_email_sender(Settings(email_backend="fax"))


@pytest.mark.parametrize(
    "overrides",
    [
        {"push_provider": "fake", "email_backend": "none"},
        {"push_provider": "none", "email_backend": "fake"},
    ],
)
def test_fakes_are_refused_in_production(overrides):
    with pytest.raises(ValidationError):
        Settings(
            environment="production",
            secret_key="x" * 40,
            video_provider="none",
            **overrides,
        )


@pytest.mark.parametrize(
    "overrides",
    [
        {"email_backend": "smtp"},
        {"smtp_security": "tls-please"},
        {"notification_max_attempts": 0},
        {"event_reminder_minutes_before": -5},
    ],
)
def test_bad_notification_settings_are_refused(overrides):
    with pytest.raises(ValidationError):
        Settings(**overrides)
