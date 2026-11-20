"""Every email the platform sends: subject, plain text and branded HTML.

Each template is a function returning ``Rendered``. Keep wording short and
plain; the HTML is a single table layout that works in Gmail, Outlook and
phone mail apps.
"""

from dataclasses import dataclass
from html import escape

from app.core.config import settings

MAROON = "#990000"
GOLD = "#C89830"
INK = "#1D1B19"
MUTED = "#4B4641"


@dataclass(frozen=True)
class Rendered:
    subject: str
    text: str
    html: str


def _layout(title: str, blocks: list[str], footer_note: str | None = None) -> str:
    body = "".join(blocks)
    note = (
        f'<p style="margin:16px 0 0;font-size:12px;color:#7C7670">{escape(footer_note)}</p>'
        if footer_note
        else ""
    )
    return f"""<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>{escape(title)}</title></head>
<body style="margin:0;padding:0;background:#F6F3F0;font-family:Helvetica,Arial,sans-serif;color:{INK}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F6F3F0;padding:24px 12px">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#FFFFFF;border-radius:16px;overflow:hidden">
<tr><td style="background:{MAROON};padding:20px 28px">
<span style="display:inline-block;width:36px;height:36px;line-height:36px;border-radius:18px;background:{GOLD};color:#2A1D00;font-weight:800;font-size:13px;text-align:center">CYC</span>
<span style="color:#FFFFFF;font-weight:700;letter-spacing:1px;font-size:13px;margin-left:10px">CHRIST YOUTH CLUB</span>
</td></tr>
<tr><td style="padding:28px">
<h1 style="margin:0 0 14px;font-size:22px;line-height:1.3;color:{INK}">{escape(title)}</h1>
{body}
{note}
</td></tr>
<tr><td style="padding:16px 28px;background:#FBF9F6;font-size:12px;color:#7C7670">
Christ Youth Club · You're getting this because you have a CYC account.
</td></tr>
</table></td></tr></table></body></html>"""


def _p(text: str) -> str:
    return f'<p style="margin:0 0 12px;font-size:15px;line-height:1.55;color:{MUTED}">{escape(text)}</p>'


def _code(code: str) -> str:
    return (
        f'<p style="margin:8px 0 18px"><span style="display:inline-block;padding:14px 22px;'
        f"background:#FFDEA4;border-radius:12px;font-size:28px;letter-spacing:8px;font-weight:800;"
        f'color:#2A1D00;font-family:Menlo,Consolas,monospace">{escape(code)}</span></p>'
    )


def _button(label: str, url: str) -> str:
    return (
        f'<p style="margin:8px 0 18px"><a href="{escape(url, quote=True)}" style="display:inline-block;'
        f"padding:12px 22px;background:{MAROON};color:#FFFFFF;border-radius:999px;text-decoration:none;"
        f'font-weight:700;font-size:15px">{escape(label)}</a></p>'
    )


def _details(rows: list[tuple[str, str]]) -> str:
    cells = "".join(
        f'<tr><td style="padding:6px 0;font-size:13px;color:#7C7670;width:110px">{escape(k)}</td>'
        f'<td style="padding:6px 0;font-size:15px;color:{INK}">{escape(v)}</td></tr>'
        for k, v in rows
    )
    return f'<table role="presentation" cellpadding="0" cellspacing="0" style="margin:4px 0 16px">{cells}</table>'


def _hello(name: str | None) -> str:
    return f"Hi {name}," if name else "Hi,"


def _text(*parts: str) -> str:
    return "\n\n".join(p for p in parts if p) + "\n\n— Christ Youth Club"


NOT_YOU = "If this wasn't you, change your password straight away and contact CYC support."


# Account


def verify_email(code: str, name: str | None = None) -> Rendered:
    lead = "Use this code to confirm your email and finish creating your CYC account."
    tail = "It expires in 15 minutes. If you didn't sign up, you can ignore this email."
    return Rendered(
        subject=f"{code} is your CYC confirmation code",
        text=_text(_hello(name), lead, code, tail),
        html=_layout("Confirm your email", [_p(_hello(name)), _p(lead), _code(code), _p(tail)]),
    )


def welcome(name: str | None) -> Rendered:
    lead = "Welcome to Christ Youth Club! Your account is ready."
    more = "Find your chapter, join a department, follow sermons and courses, and never miss an event."
    return Rendered(
        subject="Welcome to CYC",
        text=_text(_hello(name), lead, more, settings.public_app_url),
        html=_layout(
            "Welcome to CYC",
            [_p(_hello(name)), _p(lead), _p(more), _button("Open CYC", settings.public_app_url)],
        ),
    )


def password_reset(code: str) -> Rendered:
    lead = "Use this code to reset your CYC password."
    tail = "It expires in 15 minutes. If you didn't ask for this, ignore this email; your password hasn't changed."
    return Rendered(
        subject=f"{code} is your password reset code",
        text=_text(lead, code, tail),
        html=_layout("Reset your password", [_p(lead), _code(code), _p(tail)]),
    )


def password_changed(name: str | None) -> Rendered:
    lead = "Your CYC password was just changed, and you've been signed out on your other devices."
    return Rendered(
        subject="Your CYC password was changed",
        text=_text(_hello(name), lead, NOT_YOU),
        html=_layout("Password changed", [_p(_hello(name)), _p(lead), _p(NOT_YOU)]),
    )


def account_locked(name: str | None, minutes: int) -> Rendered:
    lead = (
        f"Someone entered the wrong password for your CYC account several times, so we've locked "
        f"it for {minutes} minutes to keep it safe."
    )
    tail = "If it was you, wait and try again, or reset your password. If not, reset your password now."
    return Rendered(
        subject="We locked your CYC account for a few minutes",
        text=_text(_hello(name), lead, tail),
        html=_layout("Too many sign-in attempts", [_p(_hello(name)), _p(lead), _p(tail)]),
    )


def google_linked(name: str | None) -> Rendered:
    lead = "You can now sign in to CYC with Google as well as your password."
    return Rendered(
        subject="Google sign-in added to your CYC account",
        text=_text(_hello(name), lead, NOT_YOU),
        html=_layout("Google sign-in added", [_p(_hello(name)), _p(lead), _p(NOT_YOU)]),
    )


def mfa_enabled(name: str | None) -> Rendered:
    lead = "Two-step sign-in is now on. You'll enter a code from your authenticator app each time you sign in."
    tail = "Keep your recovery codes somewhere safe. Each one works once if you lose your phone."
    return Rendered(
        subject="Two-step sign-in is on",
        text=_text(_hello(name), lead, tail, NOT_YOU),
        html=_layout("Two-step sign-in is on", [_p(_hello(name)), _p(lead), _p(tail), _p(NOT_YOU)]),
    )


def mfa_disabled(name: str | None) -> Rendered:
    lead = "Two-step sign-in was turned off for your CYC account."
    return Rendered(
        subject="Two-step sign-in was turned off",
        text=_text(_hello(name), lead, NOT_YOU),
        html=_layout("Two-step sign-in turned off", [_p(_hello(name)), _p(lead), _p(NOT_YOU)]),
    )


def account_deleted(name: str | None) -> Rendered:
    lead = "Your CYC account has been deleted, as you asked. Your profile, progress and certificates are gone."
    tail = "You're welcome back any time with a new account."
    return Rendered(
        subject="Your CYC account was deleted",
        text=_text(_hello(name), lead, tail),
        html=_layout("Account deleted", [_p(_hello(name)), _p(lead), _p(tail)]),
    )


def account_suspended(name: str | None, reason: str | None) -> Rendered:
    lead = "Your CYC account has been suspended, so you can't sign in for now."
    why = f"Reason: {reason}" if reason else ""
    tail = "If you think this is a mistake, reply to this email or contact your chapter coordinator."
    blocks = [_p(_hello(name)), _p(lead)] + ([_p(why)] if why else []) + [_p(tail)]
    return Rendered(
        subject="Your CYC account was suspended",
        text=_text(_hello(name), lead, why, tail),
        html=_layout("Account suspended", blocks),
    )


def account_reinstated(name: str | None) -> Rendered:
    lead = "Good news: your CYC account is active again. You can sign in as usual."
    return Rendered(
        subject="Your CYC account is active again",
        text=_text(_hello(name), lead),
        html=_layout("Welcome back", [_p(_hello(name)), _p(lead), _button("Open CYC", settings.public_app_url)]),
    )


def staff_role(name: str | None, role: str, place: str | None, temporary_password: str | None) -> Rendered:
    where = f" for {place}" if place else ""
    lead = f"You've been made {role}{where} on the CYC platform."
    how = (
        "Sign in with this email. Your admin will give you a temporary password; you'll choose your own when you first sign in."
        if temporary_password
        else "Sign in with your usual email and password to see your new tools."
    )
    return Rendered(
        subject=f"You're now {role}{where} at CYC",
        text=_text(_hello(name), lead, how),
        html=_layout(f"You're now {role}", [_p(_hello(name)), _p(lead), _p(how)]),
    )


# Community, events and learning


def chapter_joined(name: str | None, chapter: str) -> Rendered:
    lead = f"You're now a member of {chapter}. Welcome to the family!"
    more = "Open the app to see your chapter's announcements, events and leaders."
    return Rendered(
        subject=f"Welcome to {chapter}",
        text=_text(_hello(name), lead, more),
        html=_layout(f"Welcome to {chapter}", [_p(_hello(name)), _p(lead), _p(more)]),
    )


def event_registered(name: str | None, title: str, when: str, where: str | None) -> Rendered:
    lead = "You're registered. We'll remind you before it starts."
    rows = [("Event", title), ("When", when)] + ([("Where", where)] if where else [])
    text_rows = "\n".join(f"{k}: {v}" for k, v in rows)
    return Rendered(
        subject=f"You're going: {title}",
        text=_text(_hello(name), lead, text_rows),
        html=_layout("You're going!", [_p(_hello(name)), _p(lead), _details(rows)]),
    )


def certificate_earned(name: str | None, course: str, number: str) -> Rendered:
    link = f"{settings.public_app_url.rstrip('/')}/verify?n={number}"
    lead = f"Congratulations! You've completed {course} and earned your certificate."
    rows = [("Course", course), ("Certificate", number)]
    return Rendered(
        subject=f"Your certificate for {course}",
        text=_text(_hello(name), lead, f"Certificate number: {number}", f"Anyone can check it at {link}"),
        html=_layout(
            "You earned a certificate",
            [_p(_hello(name)), _p(lead), _details(rows), _button("Check certificate", link)],
            "Find it any time in the app under Profile → Certificates.",
        ),
    )


def notification(title: str, body: str | None, footer: str) -> Rendered:
    blocks = [_p(body)] if body else []
    return Rendered(
        subject=title,
        text=_text(title, body or "", footer.strip("—\n ")),
        html=_layout(title, blocks, footer.strip("—\n ")),
    )
