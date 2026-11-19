
"""add password reset codes

Revision ID: e3a7c1f5b9d2
Revises: d8f2b6c4a1e9
Create Date: 2026-11-19 13:13:32.950385

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'e3a7c1f5b9d2'
down_revision: Union[str, Sequence[str], None] = 'd8f2b6c4a1e9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Apply this migration."""
    op.create_table('password_reset_codes',
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('user_id', sa.Uuid(), nullable=False),
    sa.Column('code_hash', sa.String(length=64), nullable=False),
    sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('attempts', sa.Integer(), nullable=False),
    sa.Column('used_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_password_reset_codes_user_created', 'password_reset_codes', ['user_id', 'created_at'], unique=False)


def downgrade() -> None:
    """Reverse this migration."""
    op.drop_index('ix_password_reset_codes_user_created', table_name='password_reset_codes')
    op.drop_table('password_reset_codes')
