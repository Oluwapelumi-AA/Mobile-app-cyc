"""create user profiles table

Revision ID: 7b3c9e2a1f40
Revises: 3ece1df035ae
Create Date: 2026-10-17 10:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '7b3c9e2a1f40'
down_revision: Union[str, Sequence[str], None] = '3ece1df035ae'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Apply this migration."""
    op.create_table('user_profiles',
    sa.Column('user_id', sa.Uuid(), nullable=False),
    sa.Column('display_name', sa.String(length=50), nullable=False),
    sa.Column('bio', sa.String(length=300), nullable=True),
    sa.Column('avatar_url', sa.String(length=2048), nullable=True),
    sa.Column('language_code', sa.String(length=35), nullable=True),
    sa.Column('country_code', sa.String(length=2), nullable=True),
    sa.Column('timezone', sa.String(length=64), nullable=True),
    sa.Column('onboarding_steps', sa.JSON(), nullable=False),
    sa.Column('onboarding_completed_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('user_id')
    )


def downgrade() -> None:
    """Reverse this migration."""
    op.drop_table('user_profiles')
