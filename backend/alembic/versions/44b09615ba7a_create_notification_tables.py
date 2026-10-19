
"""create notification tables

Revision ID: 44b09615ba7a
Revises: 21b8fa5c61c1
Create Date: 2026-10-19 22:45:47.878740

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '44b09615ba7a'
down_revision: Union[str, Sequence[str], None] = '21b8fa5c61c1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Apply this migration."""
    op.create_table('notification_devices',
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('user_id', sa.Uuid(), nullable=False),
    sa.Column('token', sa.String(length=500), nullable=False),
    sa.Column('platform', sa.String(length=10), nullable=False),
    sa.Column('app_version', sa.String(length=50), nullable=True),
    sa.Column('last_seen_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.CheckConstraint("platform IN ('ios', 'android', 'web')", name='ck_notification_devices_platform'),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('token')
    )
    op.create_index(op.f('ix_notification_devices_user_id'), 'notification_devices', ['user_id'], unique=False)
    op.create_table('notification_preferences',
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('user_id', sa.Uuid(), nullable=False),
    sa.Column('category', sa.String(length=20), nullable=False),
    sa.Column('push_enabled', sa.Boolean(), nullable=False),
    sa.Column('email_enabled', sa.Boolean(), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('user_id', 'category', name='uq_notification_preferences_user_category')
    )
    op.create_table('notifications',
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('user_id', sa.Uuid(), nullable=False),
    sa.Column('actor_id', sa.Uuid(), nullable=True),
    sa.Column('type', sa.String(length=40), nullable=False),
    sa.Column('category', sa.String(length=20), nullable=False),
    sa.Column('title', sa.String(length=200), nullable=False),
    sa.Column('body', sa.Text(), nullable=True),
    sa.Column('data', sa.JSON(), nullable=False),
    sa.Column('dedupe_key', sa.String(length=200), nullable=True),
    sa.Column('read_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.ForeignKeyConstraint(['actor_id'], ['users.id'], ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('user_id', 'dedupe_key', name='uq_notifications_user_dedupe')
    )
    op.create_index('ix_notifications_created', 'notifications', ['created_at'], unique=False)
    op.create_index('ix_notifications_user_created', 'notifications', ['user_id', 'created_at', 'id'], unique=False)
    op.create_table('notification_deliveries',
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('notification_id', sa.Uuid(), nullable=False),
    sa.Column('channel', sa.String(length=10), nullable=False),
    sa.Column('status', sa.String(length=10), nullable=False),
    sa.Column('attempts', sa.Integer(), nullable=False),
    sa.Column('next_attempt_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('last_error', sa.String(length=500), nullable=True),
    sa.Column('sent_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.CheckConstraint("channel IN ('push', 'email')", name='ck_notification_deliveries_channel'),
    sa.CheckConstraint("status IN ('pending', 'sent', 'skipped', 'failed')", name='ck_notification_deliveries_status'),
    sa.ForeignKeyConstraint(['notification_id'], ['notifications.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('notification_id', 'channel', name='uq_notification_deliveries_notification_channel')
    )
    op.create_index('ix_notification_deliveries_due', 'notification_deliveries', ['status', 'next_attempt_at'], unique=False)


def downgrade() -> None:
    """Reverse this migration."""
    op.drop_index('ix_notification_deliveries_due', table_name='notification_deliveries')
    op.drop_table('notification_deliveries')
    op.drop_index('ix_notifications_user_created', table_name='notifications')
    op.drop_index('ix_notifications_created', table_name='notifications')
    op.drop_table('notifications')
    op.drop_table('notification_preferences')
    op.drop_index(op.f('ix_notification_devices_user_id'), table_name='notification_devices')
    op.drop_table('notification_devices')
