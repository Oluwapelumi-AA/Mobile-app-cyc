"""Persist the last accepted MFA TOTP step.

Revision ID: c7e9a2b4d6f1
Revises: b2d4f6a8c0e2
"""

import sqlalchemy as sa
from alembic import op

revision = "c7e9a2b4d6f1"
down_revision = "b2d4f6a8c0e2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("mfa_last_accepted_step", sa.Integer(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("users", "mfa_last_accepted_step")