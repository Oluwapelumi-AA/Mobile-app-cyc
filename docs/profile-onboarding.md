# Profiles and onboarding

Status: schemas, validation, onboarding rules, API routes and the avatar
storage interface are implemented and tested. Profiles are stored in the
`user_profiles` table (migration `7b3c9e2a1f40`, after Elijah's reactions
migration) and the routes use Elijah's bearer-token auth through
`get_current_user_id()`. Avatar uploads do not work yet: no storage provider
is configured, so those endpoints return 503.

## Profile fields

| Field | Required | Rules |
| --- | --- | --- |
| `display_name` | yes | 1-50 chars after trimming, any script, no control characters or newlines |
| `bio` | no | up to 300 chars, newlines allowed, blank becomes null |
| `avatar_url` | no | read-only; set only by the avatar upload flow |
| `language_code` | no on create, required for onboarding | BCP 47 `lang[-Script][-REGION]`, ISO 639 / 15924 / 3166 checked via pycountry, normalized (`pt_br` -> `pt-BR`, `yor` -> `yo`) |
| `country_code` | no | ISO 3166-1 alpha-2, uppercased |
| `timezone` | no | IANA identifier from the tz database (`Africa/Lagos`) |

Language, country and time zone are independent: a Yoruba speaker living in
the UK is `yo`, `GB`, `Europe/London`. Nothing is inferred from another field.
Identity fields (email, password, roles) are rejected by the profile schemas.

## Onboarding

Account creation and sign-in come first and belong to the auth workstream.

| Step | Required | Completes when |
| --- | --- | --- |
| `profile_basics` | yes | profile has a display name |
| `avatar` | no | profile has an avatar URL |
| `language` | yes | profile has a language (clients can prefill from device locale) |
| `region` | no | profile has a country |
| `timezone` | no | profile has a time zone (clients can prefill from device) |
| `communities` | no | always (will check memberships once communities exist) |

Rules: required steps cannot be skipped; a skipped step can be completed
later; a completed step cannot be skipped; onboarding completes only when
required steps are done, and any pending optional steps become skipped; after
completion, step changes return 409 while profile edits keep working.

## API (`/api/v1`)

| Method | Path | Result |
| --- | --- | --- |
| POST | `/profiles/me` | 201 create, 409 if it exists |
| GET | `/profiles/me` | 200, 404 `profile_not_found` |
| PATCH | `/profiles/me` | 200 partial update |
| POST | `/profiles/me/avatar/upload-intent` | upload target; 503 until storage exists |
| POST | `/profiles/me/avatar/confirm` | sets `avatar_url`; 503 until storage exists |
| DELETE | `/profiles/me/avatar` | 204 clears `avatar_url` |
| GET | `/onboarding/me` | status, next step, remaining required steps |
| POST | `/onboarding/me/steps/{step}/complete` | 200, 422 if data missing, 409 if finished |
| POST | `/onboarding/me/steps/{step}/skip` | 200, 409 for required steps |
| POST | `/onboarding/me/complete` | 200, 422 `required_steps_incomplete` |

Errors from these routes use `{"detail": {"code": ..., "message": ...}}`.
Validation errors keep FastAPI's standard 422 list.

`/users/...` is left free for the auth workstream.

## Avatar uploads

Allowed: JPEG, PNG, WebP up to `AVATAR_MAX_UPLOAD_BYTES` (default 5 MB).
The client asks for an upload intent, uploads directly to object storage,
then confirms with the object key. Keys are `avatars/{user_id}/{random}.{ext}`
and confirm rejects keys outside the caller's prefix. Only the URL is stored on
the profile. A provider adapter implements `AvatarStorage` in
`app/services/avatar_storage.py` and reads credentials from environment
variables. Still to decide: provider, public vs signed URLs, image resizing,
moderation, and deleting old objects.

## Shared identity contract (agreed with Elijah, 2026-10-17)

As implemented: `users` holds `account_role` as user/moderator/admin and
`is_active`/`is_verified` flags; the rest matches this proposal.

1. **Primary key:** `users.id` is a UUID (`UserId` in `app/core/identity.py`).
2. **`User` (auth owns):** id, email, password hash, email verified flag,
   account status (active, suspended, deleted), account role (`member`,
   `admin`), created/updated timestamps.
3. **`UserProfile` (profiles own):** `user_id` as primary key and foreign key
   to `users.id` with `ON DELETE CASCADE`, the fields above, onboarding step
   statuses and `onboarding_completed_at`. One row per user, created by
   `POST /profiles/me` after sign-up, not by auth.
4. **Roles:** account role on `User` only. Community roles (owner, moderator,
   member) live on a community membership table owned by communities, never on
   `User`.
5. **Current user:** auth provides `get_current_user_id()` (or a
   `get_current_user()` returning at least `id` and account status) in
   `app/api/deps.py`, which rejects missing, invalid or inactive accounts with
   401/403. Profile routes depend only on that.
6. **Migrations:** auth owns the first Alembic revision (`users` table plus
   SQLAlchemy `Base` and session setup). Profiles adds `user_profiles` in a
   second revision on top of it. Each workstream only edits its own tables and
   rebases before adding a revision so there is one head.
