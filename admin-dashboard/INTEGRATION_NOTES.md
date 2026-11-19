# CYC Admin Dashboard integration notes

## How the dashboard talks to the API

The browser only calls the dashboard's own `/api/backend/...` proxy
(`app/api/backend/[...path]/route.ts`). The proxy keeps the access and refresh
tokens in httpOnly cookies, refreshes them when they expire, and forwards only
the routes on its allow-list to the FastAPI backend (`API_BASE_URL`, default
`http://127.0.0.1:8000/api/v1`). Anything not on the list answers 404 without
reaching the API. The API still checks every permission itself.

Screens and the endpoints they use:

| Screen | Endpoints |
| --- | --- |
| Overview | `admin/overview`, `moderation/reports`, `moderation/audit-logs` |
| Users | `admin/users`, `admin/users/{id}/(role|suspend|reinstate|membership)`, `chapters/{id}/members/{user}` |
| Chapters | `chapters`, `chapters/{id}`, `/archive`, `/restore`, `/dashboard`, `/staff`, `/members`, `/bans`, `/announcements` |
| Departments | `departments` |
| Posts and comments | `chapters/{id}/posts`, `posts/{id}`, `posts/{id}/comments`, `comments/{id}` |
| Events, Live, Resources | `events`, `meetings`, `resources` |
| Notifications | `chapters/{id}/announcements`; history from `moderation/audit-logs?action=chapter.announcement_sent` |
| Reports, Audit log | `moderation/reports`, `moderation/audit-logs` |

Signing in: platform admins get the full dashboard. Chapter coordinators and
moderators (`me/chapter-staff`) get the chapter staff landing page.

## Sample data

Screens fall back to built-in sample records only when
`NEXT_PUBLIC_ADMIN_SAMPLE_DATA=true`. Leave it unset against a real API so
errors and empty lists are visible.

## Create and edit forms

- Events: create, edit and duplicate (`POST /events`, `PATCH /events/{id}`).
- Live and video: go live now or schedule (`POST /meetings`, then
  `POST /meetings/{id}/start`); start, end and cancel from the list. Hosts
  broadcast from the CYC app.
- Spiritual resources: add, edit and delete; new categories inline. File
  uploads need `STORAGE_BACKEND=s3` on the server; without it the resource is
  saved and the dashboard says the file wasn't uploaded.
- Courses: `/courses`, `/course-lessons`, `/course-quizzes`. Create a course,
  add and reorder lessons, build quizzes, publish. Quiz results and
  certificates (learners who completed every lesson) come from the API.
