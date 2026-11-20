# Sending email with Gmail (SMTP)

The API sends every email itself: sign-up confirmation codes, welcome,
password reset codes, password-changed and account-locked alerts, Google
linked, two-step sign-in on/off, account suspended/reinstated/deleted, staff
role given, chapter joined, event registration, certificate earned, and
notification emails. Emails are branded HTML with a plain-text version.

Emails are queued in the `outbound_emails` table and sent straight after
each request. If Gmail is unreachable, the notification worker retries them
with growing waits (`python -m app.workers.notifications`), so keep the
worker running in production.

## 1. Prepare the Gmail account

Use a dedicated account, e.g. `cyc.noreply@gmail.com` (or a Google Workspace
address on your domain).

1. Turn on **2-Step Verification**: <https://myaccount.google.com/security>.
2. Create an **App Password**: <https://myaccount.google.com/apppasswords> →
   name it "CYC API" → copy the 16-character password. Your normal Gmail
   password won't work.

## 2. Backend `.env`

```
EMAIL_BACKEND=smtp
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURITY=starttls
SMTP_USERNAME=cyc.noreply@gmail.com
SMTP_PASSWORD=abcdefghijklmnop
EMAIL_FROM="Christ Youth Club <cyc.noreply@gmail.com>"
PUBLIC_APP_URL=https://cyc.org
```

`EMAIL_FROM` must use the same address as `SMTP_USERNAME`, or Gmail rewrites
it. Port 465 with `SMTP_SECURITY=ssl` also works.

## 3. Check it

Start the API and ask for a password reset for your own account, or create a
new account. Look in the inbox (and spam the first time; mark it "Not spam").
Failures are recorded in `outbound_emails.last_error`.

## Limits

A personal Gmail account sends about **500 emails a day**; Google Workspace
about **2,000**. That's fine to start. When CYC grows (event reminders to
thousands of members), switch to a sending service such as Amazon SES,
Brevo or Postmark: they offer SMTP too, so only the `SMTP_*` settings change.
