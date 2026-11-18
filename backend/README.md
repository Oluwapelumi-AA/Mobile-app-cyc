# The Light App — Backend

The backend powers authentication, user accounts, chapters, events, and other services for The Light App (CYC).

## Technology Stack

- Python
- FastAPI
- PostgreSQL
- SQLAlchemy
- Alembic
- Pytest

## Initial Development Scope

This backend is being developed as a modular monolith.

The initial foundation will cover:

- Application configuration and environment variables
- Database connectivity and migrations
- Authentication and session management
- Authorization and role-based access control
- Post likes and reactions
- Automated tests and API documentation

## Local Setup

1. Install Python 3.11 or a compatible project-approved version.
2. Create and activate a virtual environment.
3. Install dependencies from `requirements.txt`.
4. Configure the required environment variables using `.env.example`.
5. Set up the PostgreSQL database.
6. Run database migrations.
7. Start the FastAPI development server.

Detailed setup commands will be added as the implementation progresses.

## Notification worker

Push notifications, notification emails and event reminders are sent by a
separate process that runs next to the API with the same settings:

```bash
python -m app.workers.notifications          # keeps running
python -m app.workers.notifications --once   # one round, e.g. from cron
```

## Chapters

Chapters are the only grouping in the app (there are no separate
communities or branches). Everything members share is scoped to a chapter:
posts and comments, reactions, events, meetings, resources, bans, reports and
announcements. Who can do what is decided in one place,
`app/services/chapter_access.py`:

| Role | Where it's stored | What it allows |
| --- | --- | --- |
| Platform admin | `users.account_role = admin` | Everything: chapters, staff, membership |
| Platform moderator | `users.account_role = moderator` | Read and moderate every chapter; manage events, meetings, resources |
| Coordinator (one per chapter) | `chapter_staff.role = coordinator` | Runs the chapter: events, meetings, resources, announcements, access requests and grants, moderation |
| Chapter moderator | `chapter_staff.role = moderator` | Moderates the chapter's posts, comments, reports and bans |
| Member | `user_profiles.chapter_id` + `users.membership_status = member` | Reads the chapter; posts, comments, reacts, registers |
| Guest | anyone else | Reads only items a coordinator granted them |

Admins make someone a member with `PATCH /api/v1/admin/users/{id}/membership`
and appoint staff with `PUT /api/v1/chapters/{id}/staff/{user_id}`.

## The first admin

App admins manage chapters, staff and account roles, and app moderators and
admins review reports and suspend accounts (`/api/v1/admin`,
`/api/v1/moderation`).
Only an admin can make someone else an admin, so set the first one in the
database after they sign up:

```sql
UPDATE users SET account_role = 'admin' WHERE email = 'you@example.com';
```

## Security

- Never commit secrets, passwords, tokens, or production credentials.
- Use environment variables for sensitive configuration.
- Keep authentication and authorization checks on the server.
- Test access restrictions before merging changes.
