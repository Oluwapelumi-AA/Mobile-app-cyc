
"""create events and registrations

Revision ID: 6e27f6085e31
Revises: 0ce4014e8642
Create Date: 2026-10-17 11:04:58.121850

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '6e27f6085e31'
down_revision: Union[str, Sequence[str], None] = '0ce4014e8642'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Apply this migration."""
    op.create_table('events',
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('community_id', sa.Uuid(), nullable=True),
    sa.Column('created_by', sa.Uuid(), nullable=True),
    sa.Column('title', sa.String(length=200), nullable=False),
    sa.Column('description', sa.Text(), nullable=True),
    sa.Column('location', sa.String(length=300), nullable=True),
    sa.Column('online_url', sa.String(length=500), nullable=True),
    sa.Column('starts_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('ends_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('timezone', sa.String(length=64), nullable=False),
    sa.Column('capacity', sa.Integer(), nullable=True),
    sa.Column('status', sa.String(length=10), nullable=False),
    sa.Column('cancelled_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
    sa.CheckConstraint("status IN ('scheduled', 'cancelled')", name='ck_events_status'),
    sa.CheckConstraint('capacity IS NULL OR capacity > 0', name='ck_events_capacity_positive'),
    sa.CheckConstraint('ends_at > starts_at', name='ck_events_ends_after_start'),
    sa.ForeignKeyConstraint(['community_id'], ['communities.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['created_by'], ['users.id'], ondelete='SET NULL'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_events_community_schedule', 'events', ['community_id', 'starts_at', 'id'], unique=False)
    op.create_index('ix_events_schedule', 'events', ['starts_at', 'id'], unique=False)
    op.create_table('event_registrations',
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('event_id', sa.Uuid(), nullable=False),
    sa.Column('user_id', sa.Uuid(), nullable=False),
    sa.Column('status', sa.String(length=10), nullable=False),
    sa.Column('attended_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('checked_in_by', sa.Uuid(), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
    sa.CheckConstraint("status IN ('registered', 'waitlisted')", name='ck_event_registrations_status'),
    sa.ForeignKeyConstraint(['checked_in_by'], ['users.id'], ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['event_id'], ['events.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('event_id', 'user_id', name='uq_event_registrations_event_user')
    )
    op.create_index('ix_event_registrations_event_status', 'event_registrations', ['event_id', 'status', 'created_at', 'id'], unique=False)
    op.create_index(op.f('ix_event_registrations_user_id'), 'event_registrations', ['user_id'], unique=False)


def downgrade() -> None:
    """Reverse this migration."""
    op.drop_index(op.f('ix_event_registrations_user_id'), table_name='event_registrations')
    op.drop_index('ix_event_registrations_event_status', table_name='event_registrations')
    op.drop_table('event_registrations')
    op.drop_index('ix_events_schedule', table_name='events')
    op.drop_index('ix_events_community_schedule', table_name='events')
    op.drop_table('events')
