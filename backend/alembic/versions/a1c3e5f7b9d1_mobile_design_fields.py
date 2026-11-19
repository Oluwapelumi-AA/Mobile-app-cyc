"""Fields for the mobile app designs.

Chapters: where and when they meet, phone, state and map position.
Profiles: phone. Lessons: module, scripture and notes. Enrolments:
certificate number (backfilled for courses already completed).

Revision ID: a1c3e5f7b9d1
Revises: f4b8d2e6a0c3
"""

import secrets

import sqlalchemy as sa
from alembic import op

revision = "a1c3e5f7b9d1"
down_revision = "f4b8d2e6a0c3"
branch_labels = None
depends_on = None

_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"


def upgrade() -> None:
    with op.batch_alter_table("chapters") as batch:
        batch.add_column(sa.Column("contact_phone", sa.String(40), nullable=True))
        batch.add_column(sa.Column("state", sa.String(100), nullable=True))
        batch.add_column(sa.Column("venue", sa.String(150), nullable=True))
        batch.add_column(sa.Column("address", sa.String(300), nullable=True))
        batch.add_column(sa.Column("meeting_schedule", sa.String(150), nullable=True))
        batch.add_column(sa.Column("meeting_time", sa.String(100), nullable=True))
        batch.add_column(sa.Column("latitude", sa.Float(), nullable=True))
        batch.add_column(sa.Column("longitude", sa.Float(), nullable=True))

    with op.batch_alter_table("user_profiles") as batch:
        batch.add_column(sa.Column("phone", sa.String(40), nullable=True))

    with op.batch_alter_table("course_lessons") as batch:
        batch.add_column(sa.Column("module_title", sa.String(150), nullable=True))
        batch.add_column(sa.Column("scripture_reference", sa.String(100), nullable=True))
        batch.add_column(sa.Column("scripture_text", sa.Text(), nullable=True))
        batch.add_column(sa.Column("notes_url", sa.String(500), nullable=True))

    with op.batch_alter_table("course_enrollments") as batch:
        batch.add_column(sa.Column("certificate_number", sa.String(32), nullable=True))
        batch.create_unique_constraint("uq_course_enrollments_certificate", ["certificate_number"])

    conn = op.get_bind()
    rows = conn.execute(
        sa.text("SELECT id, completed_at FROM course_enrollments WHERE completed_at IS NOT NULL")
    ).all()
    used: set[str] = set()
    for row_id, completed_at in rows:
        year = str(completed_at)[:4]
        while True:
            number = f"CYC-{year}-" + "".join(secrets.choice(_ALPHABET) for _ in range(6))
            if number not in used:
                used.add(number)
                break
        conn.execute(
            sa.text("UPDATE course_enrollments SET certificate_number = :n WHERE id = :id"),
            {"n": number, "id": row_id},
        )


def downgrade() -> None:
    with op.batch_alter_table("course_enrollments") as batch:
        batch.drop_constraint("uq_course_enrollments_certificate", type_="unique")
        batch.drop_column("certificate_number")
    with op.batch_alter_table("course_lessons") as batch:
        for name in ("notes_url", "scripture_text", "scripture_reference", "module_title"):
            batch.drop_column(name)
    with op.batch_alter_table("user_profiles") as batch:
        batch.drop_column("phone")
    with op.batch_alter_table("chapters") as batch:
        for name in ("longitude", "latitude", "meeting_time", "meeting_schedule", "address", "venue", "state", "contact_phone"):
            batch.drop_column(name)
