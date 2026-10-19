"""Email boundary for notification emails.

The worker sends through ``EmailSender``. ``EMAIL_BACKEND`` picks the
implementation:

- ``fake`` (default): records what would be sent. Development and tests only.
- ``none``: email is off; email jobs are skipped.
- ``smtp``: any SMTP service (Amazon SES, SendGrid, Mailgun, Postmark,
  Brevo, Gmail, ...), configured by the ``SMTP_*`` settings.

An HTTP API adapter for a chosen provider is one class with a ``send`` method,
named in ``build_email_sender``. ``send`` raises ``EmailError`` when the send
should be tried again later.
"""

import smtplib
import ssl
from dataclasses import dataclass
from email.message import EmailMessage as MimeMessage
from functools import lru_cache
from typing import Protocol

from app.core.config import Settings, settings


class EmailUnavailable(Exception):
    """No email backend is configured."""


class EmailError(Exception):
    """The send failed; try again later."""


@dataclass(frozen=True)
class EmailMessage:
    to: str
    subject: str
    text: str


class EmailSender(Protocol):
    name: str

    def send(self, message: EmailMessage) -> None: ...


class UnconfiguredEmailSender:
    name = "none"

    def send(self, message: EmailMessage) -> None:
        raise EmailUnavailable("email is not configured")


class FakeEmailSender:
    """Keeps sent messages in ``outbox``. ``fail_next`` makes the next sends
    raise, so tests can exercise retries."""

    name = "fake"

    def __init__(self) -> None:
        self.outbox: list[EmailMessage] = []
        self.fail_next = 0

    def send(self, message: EmailMessage) -> None:
        if self.fail_next:
            self.fail_next -= 1
            raise EmailError("fake email failure")
        self.outbox.append(message)


class SmtpEmailSender:
    name = "smtp"

    def __init__(self, config: Settings) -> None:
        self.host = config.smtp_host
        self.port = config.smtp_port
        self.username = config.smtp_username
        self.password = config.smtp_password
        self.security = config.smtp_security
        self.timeout = config.smtp_timeout_seconds
        self.sender = config.email_from

    def _connect(self) -> smtplib.SMTP:
        if self.security == "ssl":
            return smtplib.SMTP_SSL(
                self.host,
                self.port,
                timeout=self.timeout,
                context=ssl.create_default_context(),
            )
        client = smtplib.SMTP(self.host, self.port, timeout=self.timeout)
        if self.security == "starttls":
            client.starttls(context=ssl.create_default_context())
        return client

    def send(self, message: EmailMessage) -> None:
        mime = MimeMessage()
        mime["From"] = self.sender
        mime["To"] = message.to
        mime["Subject"] = message.subject
        mime.set_content(message.text)
        try:
            with self._connect() as client:
                if self.username:
                    client.login(self.username, self.password)
                client.send_message(mime)
        except (smtplib.SMTPException, OSError) as exc:
            raise EmailError(f"SMTP send failed: {exc.__class__.__name__}") from exc


def build_email_sender(config: Settings) -> EmailSender:
    if config.email_backend == "fake":
        return FakeEmailSender()
    if config.email_backend == "none":
        return UnconfiguredEmailSender()
    if config.email_backend == "smtp":
        return SmtpEmailSender(config)
    raise ValueError(f"Unknown EMAIL_BACKEND {config.email_backend!r}")


@lru_cache
def get_email_sender() -> EmailSender:
    return build_email_sender(settings)
