"""Open Chapter membership: onboarded users join their chosen Chapter

Chapters no longer need a Coordinator's approval. Users who already finished
onboarding with an active Chapter chosen become official Members of it, and
their pending access requests are closed.

Revision ID: d8f2b6c4a1e9
Revises: c5e1a9d3f7b2
Create Date: 2026-11-18 17:00:00
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "d8f2b6c4a1e9"
down_revision: str | Sequence[str] | None = "c5e1a9d3f7b2"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


ELIGIBLE = """
    SELECT p.user_id, p.preferred_chapter_id
    FROM user_profiles p
    JOIN users u ON u.id = p.user_id
    JOIN chapters c ON c.id = p.preferred_chapter_id
    WHERE p.onboarding_completed_at IS NOT NULL
      AND c.is_active = :true
      AND u.membership_status = 'guest'
"""


def upgrade() -> None:
    bind = op.get_bind()
    rows = bind.execute(sa.text(ELIGIBLE), {"true": True}).fetchall()
    now = sa.func.now() if bind.dialect.name != "sqlite" else sa.text("CURRENT_TIMESTAMP")

    for user_id, chapter_id in rows:
        params = {"user_id": user_id, "chapter_id": chapter_id}
        bind.execute(
            sa.text("UPDATE users SET membership_status = 'member' WHERE id = :user_id"),
            params,
        )
        bind.execute(
            sa.text("UPDATE user_profiles SET chapter_id = :chapter_id WHERE user_id = :user_id"),
            params,
        )
        bind.execute(
            sa.update(sa.table(
                "chapter_access_requests",
                sa.column("user_id"),
                sa.column("chapter_id"),
                sa.column("status"),
                sa.column("reviewed_at"),
                sa.column("updated_at"),
            ))
            .where(sa.column("user_id") == user_id, sa.column("status") == "pending")
            .values(
                status=sa.case(
                    (sa.column("chapter_id") == chapter_id, "approved"),
                    else_="cancelled",
                ),
                reviewed_at=now,
                updated_at=now,
            )
        )


def downgrade() -> None:
    # Data-only change; nothing to undo in the schema.
    pass
