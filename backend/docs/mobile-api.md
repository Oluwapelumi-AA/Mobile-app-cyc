# Mobile app API guide

Everything the CYC mobile app needs, grouped by screen. All paths are under
`/api/v1`. Send `Authorization: Bearer <access_token>` on every call except
sign-up, sign-in, refresh and password reset. Full request and response
shapes are at `/docs` on the running API.

The phone app is in `../mobile` (see its README). Phones don't need CORS;
the Expo web preview (`http://localhost:8081`) does, so keep it in
`CORS_ORIGINS` if you use it.

**Guests (no sign-in).** These read calls also work with no token, so the
app can let people browse before creating an account: `GET /chapters`,
`/chapters/{id}`, `/chapters/{id}/leaders`, `/events`, `/events/{id}`,
`/resources`, `/resources/{id}`, `/resource-categories`, `/courses`,
`/courses/{id}`, `/departments`, and `GET /certificates/verify/{number}`.
A wrong or expired token still returns 401. Everything else needs sign-in.

Errors come back as `{"detail": {"code": "...", "message": "..."}}`. Show
`message` to the user and branch on `code`.

## Signing in

See `security.md` for the rules behind these.

| Screen | Call |
|---|---|
| Sign up | `POST /auth/register` `{email, password}` (12+ characters, not a common password). A 6-digit code is emailed. |
| Confirm email | `POST /auth/verify-email` `{email, code}` → sign-in result (below). Resend: `POST /auth/verify-email/resend` `{email}` |
| Sign in | `POST /auth/login` `{email, password}` → sign-in result. Errors: 401 wrong details; 403 `email_not_verified` (a new code was sent: show the code screen); 403 `account_suspended` with `detail.reason`; 429 `account_locked` or `too_many_requests`. |
| Google | `POST /auth/google` `{id_token}` → sign-in result, plus `is_new_account` and `suggested_name` (create the profile with it). 503 `google_off` when not set up. |
| Two-step code | When the result has `mfa_required`: `POST /auth/mfa/verify` `{mfa_token, code}` (authenticator code or recovery code) → tokens |
| Admin first sign-in | When the result has `mfa_setup_required`: `POST /auth/mfa/setup` `{mfa_token}` → `{secret, otpauth_uri}`, then `POST /auth/mfa/enable` `{mfa_token, code}` → tokens + `recovery_codes` |
| Two-step settings | `GET /auth/mfa`; signed in: `POST /auth/mfa/setup` `{}`, `/auth/mfa/enable` `{code}`, `/auth/mfa/disable` `{code}`, `/auth/mfa/recovery-codes` `{code}` |
| Stay signed in | `POST /auth/refresh` `{refresh_token}` when a call returns 401. Reusing an old refresh token signs out everywhere. |
| Sign out | `POST /auth/logout` `{refresh_token}`; everywhere: `POST /auth/logout-everywhere` |
| Forgot password | `POST /auth/password-reset/request` `{email}`, then `POST /auth/password-reset/confirm` `{email, code, new_password}`. The code is 6 digits, emailed, valid 15 minutes, 5 tries. |
| Change password | `POST /auth/change-password` `{current_password, new_password}`. Signs out other devices. Google-only accounts add one with `POST /auth/set-password` `{new_password}`. |
| Account | `GET /auth/me` → also `has_password`, `google_linked`, `mfa_enabled`, `mfa_required` |
| Delete account | `POST /auth/delete-account` `{password}` or, for Google-only accounts, `{google_id_token}`. Required by the App Store and Google Play. |

A **sign-in result** is `{access_token, refresh_token}`, or
`{mfa_required: true, mfa_token}` or `{mfa_setup_required: true, mfa_token}`.

## Onboarding

1. `POST /profiles/me` `{display_name, language_code}`
2. `GET /onboarding/me` to see the steps, then complete or skip each with
   `POST /onboarding/me/steps/{step}/complete|skip`.
3. Chapter step: list chapters with `GET /chapters`, then
   `PUT /me/chapter` `{chapter_id}` and complete the `chapter` step.
4. `POST /onboarding/me/complete`. If a chapter was chosen, the user is now
   a full Member of it, with no approval needed.

Members belong to one chapter and can't leave or switch
(`409 already_in_a_chapter`). Someone who skipped the chapter step can join
one later with `PUT /me/chapter`, once.

## Home

`GET /me/home` returns everything for the home screen in one call:
membership, unread notification count, live sessions now, upcoming events,
recent chapter posts, new resources and courses to continue.

## Profile and departments

| Screen | Call |
|---|---|
| My profile | `GET /profiles/me`, `PATCH /profiles/me` |
| Profile photo | `POST /profiles/me/avatar/upload-intent`, upload, then `POST /profiles/me/avatar/confirm` (needs file storage set up on the server) |
| Someone else's profile | `GET /profiles/{user_id}` |
| My chapter and department | `GET /me/membership` |
| Departments | `GET /departments`; join or switch `PUT /me/department` `{department_id}`; leave `DELETE /me/department` |

## Chapter feed

| Screen | Call |
|---|---|
| Feed | `GET /chapters/{chapter_id}/posts?limit=20&cursor=…` |
| New post | `POST /chapters/{chapter_id}/posts` `{body}` |
| Post and comments | `GET /posts/{id}`, `GET /posts/{id}/comments`, `POST /posts/{id}/comments` |
| Reactions | `PUT` / `DELETE /reactions/posts/{id}` and `/reactions/comments/{id}` |
| Report | `POST /reports` |

Lists are paged: pass back `next_cursor` as `cursor` until it is `null`.

## Events, live, resources, courses

| Area | Main calls |
|---|---|
| Events | `GET /events`, `GET /events/{id}`, register `POST /events/{id}/registrations`, cancel `DELETE /events/{id}/registrations/me` |
| Live | `GET /meetings?status=live`, join `POST /meetings/{id}/token`, replays `GET /meetings/{id}/recordings` |
| Resources | `GET /resources`, `GET /resource-categories`, bookmarks `PUT/DELETE /resources/{id}/bookmark`, progress `PUT /resources/{id}/progress` |
| Courses | `GET /courses`, `GET /courses/{id}`, enrol `PUT /courses/{id}/enrollment`, finish a lesson `PUT /course-lessons/{id}/completion`, take a quiz `POST /course-quizzes/{id}/attempts` `{answers}` |
| Quiz answers | Check one answer before submitting: `POST /course-quizzes/{id}/check` `{question_index, answer}` → `{correct, correct_index, explanation}` |
| Certificates | Mine: `GET /certificates/mine` (each has a `certificate_number`). Public check: `GET /certificates/verify/{number}` → `{valid, recipient_name, course_title, completed_at, issued_by}` |
| Chapter details | `GET /chapters/{id}` now includes `state`, `venue`, `address`, `meeting_schedule`, `meeting_time`, `contact_phone`, `latitude`, `longitude`. Leaders: `GET /chapters/{id}/leaders` |
| Lesson files | Course managers upload a video or notes PDF to S3: `POST /course-lessons/{id}/files/upload-intent` `{kind: "video"\|"notes", content_type, size_bytes}` → PUT the file to `upload_url` with `headers`, then `POST /course-lessons/{id}/files/confirm` `{kind, object_key}`. Remove: `DELETE /course-lessons/{id}/files/{kind}`. Lessons then have `has_video_file` / `has_notes_file`, and `video_url` / `notes_url` are signed links (enrolled learners and managers only). |
| Lessons | Lessons carry `module_title`, `scripture_reference`, `scripture_text`, `notes_url`; quiz questions carry `explanation` (shown to course managers; learners get it from `/check`) |
| Search | `GET /search?q=…` |

## Notifications

| Screen | Call |
|---|---|
| Register for push | `POST /notifications/devices` `{token, platform}` with the Expo push token (`ExponentPushToken[…]`) from `expo-notifications` |
| Sign out | `DELETE /notifications/devices` with the same token |
| Inbox | `GET /notifications`, `GET /notifications/unread-count`, `POST /notifications/{id}/read`, `POST /notifications/read-all` |
| Settings | `GET` / `PATCH /notifications/preferences` |

On the server set `PUSH_PROVIDER=expo`. `EXPO_ACCESS_TOKEN` is only needed
if enhanced push security is on in the Expo project. The push worker
(`python -m app.workers.notifications`) must be running for notifications to be delivered.
