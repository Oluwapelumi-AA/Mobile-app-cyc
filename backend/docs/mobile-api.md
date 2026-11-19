# Mobile app API guide

Everything the CYC mobile app needs, grouped by screen. All paths are under
`/api/v1`. Send `Authorization: Bearer <access_token>` on every call except
sign-up, sign-in, refresh and password reset. Full request and response
shapes are at `/docs` on the running API.

Errors come back as `{"detail": {"code": "...", "message": "..."}}`. Show
`message` to the user and branch on `code`.

## Signing in

| Screen | Call |
|---|---|
| Sign up | `POST /auth/register` `{email, password}` (password: 12+ characters) |
| Sign in | `POST /auth/login` → `access_token`, `refresh_token` |
| Stay signed in | `POST /auth/refresh` `{refresh_token}` when a call returns 401 |
| Sign out | `POST /auth/logout` `{refresh_token}` |
| Forgot password | `POST /auth/password-reset/request` `{email}`, then `POST /auth/password-reset/confirm` `{email, code, new_password}`. The code is 6 digits, emailed, valid 15 minutes, 5 tries. |
| Change password | `POST /auth/change-password` `{current_password, new_password}`. Signs out other devices. Use after an admin gives a temporary password. |
| Delete account | `POST /auth/delete-account` `{password}`. Required by the App Store and Google Play. Wipes the account and signs out everywhere; posts stay as "Deleted user". |

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
