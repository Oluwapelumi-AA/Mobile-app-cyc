"""Remove the chapter Moderator role

Chapters now have one staff role, Coordinator. Existing chapter Moderators
lose the role and stay Members of their Chapter. App-wide moderators
(users.account_role) are not affected.

Revision ID: f4b8d2e6a0c3
Revises: e3a7c1f5b9d2
Create Date: 2026-11-19 14:00:00
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "f4b8d2e6a0c3"
down_revision: str | Sequence[str] | None = "e3a7c1f5b9d2"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute(sa.text("DELETE FROM chapter_staff WHERE role = 'moderator'"))
    with op.batch_alter_table("chapter_staff") as batch:
        batch.drop_constraint("ck_chapter_staff_role", type_="check")
        batch.create_check_constraint("ck_chapter_staff_role", "role = 'coordinator'")


def downgrade() -> None:
    # The role can come back, but the removed assignments can't.
    with op.batch_alter_table("chapter_staff") as batch:
        batch.drop_constraint("ck_chapter_staff_role", type_="check")
        batch.create_check_constraint(
            "ck_chapter_staff_role", "role IN ('coordinator', 'moderator')"
        )
