"""add chapter coordinators and departments

Revision ID: c82a5d91f604
Revises: accc66b2a68b
Create Date: 2026-10-29
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "c82a5d91f604"
down_revision: Union[str, Sequence[str], None] = "accc66b2a68b"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "branch_coordinators",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("branch_id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("assigned_by", sa.Uuid(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["branch_id"], ["branches.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["assigned_by"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("branch_id", "user_id", name="uq_branch_coordinators_branch_user"),
    )
    op.create_index("ix_branch_coordinators_branch_id", "branch_coordinators", ["branch_id"])
    op.create_index("ix_branch_coordinators_user_id", "branch_coordinators", ["user_id"])

    op.create_table(
        "departments",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("branch_id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("created_by", sa.Uuid(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["branch_id"], ["branches.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("branch_id", "name", name="uq_departments_branch_name"),
    )
    op.create_index("ix_departments_branch_id", "departments", ["branch_id"])


def downgrade() -> None:
    op.drop_index("ix_departments_branch_id", table_name="departments")
    op.drop_table("departments")
    op.drop_index("ix_branch_coordinators_user_id", table_name="branch_coordinators")
    op.drop_index("ix_branch_coordinators_branch_id", table_name="branch_coordinators")
    op.drop_table("branch_coordinators")
