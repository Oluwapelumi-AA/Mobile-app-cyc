# The Light App — Backend

The backend powers authentication, user accounts, community interactions, events, and other services for The Light App (CYC).

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

## Security

- Never commit secrets, passwords, tokens, or production credentials.
- Use environment variables for sensitive configuration.
- Keep authentication and authorization checks on the server.
- Test access restrictions before merging changes.
