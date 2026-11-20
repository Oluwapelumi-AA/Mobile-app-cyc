# Security overview

What protects CYC accounts and data, and the settings behind it.

## Sign-in

- **Passwords**: 12–128 characters, hashed with Argon2. Very common
  passwords and "your email name" passwords are refused.
- **Email confirmation**: new email sign-ups confirm a 6-digit code before
  they can sign in (`REQUIRE_EMAIL_VERIFICATION`). Codes last 15 minutes,
  allow 5 tries and are stored hashed. Accounts that existed before this
  change were marked confirmed.
- **Google sign-in**: ID tokens are verified against Google's keys and your
  client IDs (`GOOGLE_CLIENT_IDS`).
- **Two-step sign-in** (authenticator app, RFC 6238): required for admins
  (`REQUIRE_ADMIN_MFA`), optional for everyone else. 10 one-time recovery
  codes. Secrets are encrypted at rest; a code can't be reused.
- **Lockout**: 5 wrong passwords (or two-step codes) lock the account for
  15 minutes and email the owner (`LOGIN_MAX_FAILURES`, `LOGIN_LOCK_MINUTES`).
- **Rate limits** per IP: sign-in 10/min, sign-up 5/min, Google 10/min, codes
  10/min, resend 3/min, password reset 3/min (`RATE_LIMIT_ENABLED`). Behind a
  proxy run uvicorn with `--proxy-headers` so real IPs are used.
- **Same answers** for unknown and known emails on reset and resend, and
  equal timing on sign-in, so the API can't be used to find members.

## Sessions

- Access tokens last 15 minutes; refresh tokens 7 days and rotate on every
  use. Tokens carry issuer/audience claims.
- **Stolen-token detection**: reusing an old refresh token signs the account
  out everywhere.
- Password change/reset, suspension and "Sign out everywhere" end all sessions.
- The app keeps tokens in the phone's secure storage (Keychain / Keystore);
  the dashboard keeps them in httpOnly, SameSite=Strict cookies, never in
  page JavaScript.

## API and dashboard

- Security headers on every response (no framing, no sniffing, no referrer,
  strict CSP for the JSON API, HSTS in production).
- Request bodies over 1 MB are refused (`MAX_REQUEST_BYTES`); files go
  straight to S3.
- `/docs` is off in production unless `ENABLE_DOCS=true`.
- `ALLOWED_HOSTS` limits which host names the API answers to.
- The dashboard only forwards an allow-list of API routes.
- In production the API refuses to start with a weak `SECRET_KEY`, fake
  providers, `CORS_ORIGINS=*` or rate limits off.

## Files

Private S3 bucket, server-side encryption, uploads checked for type and size
after upload, signed CloudFront links that expire. See `aws-s3-cloudfront.md`.

## Audit trail

Sign-ins (with method), locks, password changes, Google linking and two-step
changes are written to the audit log alongside staff actions.

## Before going live

- Long random `SECRET_KEY` (e.g. `python -c "import secrets;print(secrets.token_urlsafe(48))"`).
- `ENVIRONMENT=production`, HTTPS only, PostgreSQL with backups.
- Set `ALLOWED_HOSTS` and `CORS_ORIGINS` to your real domains.
- Every admin sets up two-step sign-in on first sign-in.
