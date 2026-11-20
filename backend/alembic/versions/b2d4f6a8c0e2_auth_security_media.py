"""Google sign-in, email codes, two-step sign-in, email queue, lesson files.

Users: Google link, password flag, sign-in lock, two-step secret. Everyone
who already has an account is marked email-verified so nobody is locked out
when email confirmation is switched on. New tables: email_codes,
mfa_recovery_codes, outbound_emails. Lessons: uploaded video and notes.

Revision ID: b2d4f6a8c0e2
Revises: a1c3e5f7b9d1
"""

import sqlalchemy as sa
from alembic import op

revision = "b2d4f6a8c0e2"
down_revision = "a1c3e5f7b9d1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("users") as batch:
        batch.add_column(sa.Column("has_password", sa.Boolean(), server_default=sa.true(), nullable=False))
        batch.add_column(sa.Column("google_sub", sa.String(255), nullable=True))
        batch.add_column(sa.Column("failed_login_count", sa.Integer(), server_default="0", nullable=False))
        batch.add_column(sa.Column("locked_until", sa.DateTime(timezone=True), nullable=True))
        batch.add_column(sa.Column("mfa_secret", sa.String(512), nullable=True))
        batch.add_column(sa.Column("mfa_enabled_at", sa.DateTime(timezone=True), nullable=True))
        batch.create_index("ix_users_google_sub", ["google_sub"], unique=True)

    op.execute(sa.text("UPDATE users SET is_verified = :yes WHERE is_active = :yes").bindparams(yes=True))

    op.create_table(
        "email_codes",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("user_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("purpose", sa.String(30), nullable=False),
        sa.Column("code_hash", sa.String(64), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("attempts", sa.Integer(), nullable=False),
        sa.Column("used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_email_codes_user_purpose", "email_codes", ["user_id", "purpose", "created_at"])

    op.create_table(
        "mfa_recovery_codes",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("user_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("code_hash", sa.String(64), nullable=False),
        sa.Column("used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_mfa_recovery_codes_user_id", "mfa_recovery_codes", ["user_id"])

    op.create_table(
        "outbound_emails",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("to", sa.String(320), nullable=False),
        sa.Column("template", sa.String(50), nullable=False),
        sa.Column("subject", sa.String(300), nullable=False),
        sa.Column("text", sa.Text(), nullable=False),
        sa.Column("html", sa.Text(), nullable=True),
        sa.Column("status", sa.String(10), nullable=False),
        sa.Column("attempts", sa.Integer(), nullable=False),
        sa.Column("next_attempt_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("last_error", sa.String(300), nullable=True),
        sa.Column("sent_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_outbound_emails_status_next", "outbound_emails", ["status", "next_attempt_at"])

    with op.batch_alter_table("course_lessons") as batch:
        batch.add_column(sa.Column("video_key", sa.String(500), nullable=True))
        batch.add_column(sa.Column("notes_key", sa.String(500), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("course_lessons") as batch:
        batch.drop_column("notes_key")
        batch.drop_column("video_key")
    op.drop_index("ix_outbound_emails_status_next", table_name="outbound_emails")
    op.drop_table("outbound_emails")
    op.drop_index("ix_mfa_recovery_codes_user_id", table_name="mfa_recovery_codes")
    op.drop_table("mfa_recovery_codes")
    op.drop_index("ix_email_codes_user_purpose", table_name="email_codes")
    op.drop_table("email_codes")
    with op.batch_alter_table("users") as batch:
        batch.drop_index("ix_users_google_sub")
        batch.drop_column("mfa_enabled_at")
        batch.drop_column("mfa_secret")
        batch.drop_column("locked_until")
        batch.drop_column("failed_login_count")
        batch.drop_column("google_sub")
        batch.drop_column("has_password")
