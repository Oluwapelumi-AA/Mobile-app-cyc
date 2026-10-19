
"""create meetings recordings and webhook receipts

Revision ID: 49f27bf83756
Revises: 6e27f6085e31
Create Date: 2026-10-19 21:34:07.732890

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '49f27bf83756'
down_revision: Union[str, Sequence[str], None] = '6e27f6085e31'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Apply this migration."""
    op.create_table('video_webhook_receipts',
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('provider', sa.String(length=30), nullable=False),
    sa.Column('event_id', sa.String(length=200), nullable=False),
    sa.Column('event_type', sa.String(length=50), nullable=False),
    sa.Column('received_at', sa.DateTime(timezone=True), nullable=False),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('provider', 'event_id', name='uq_video_webhook_receipts_provider_event')
    )
    op.create_table('meetings',
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('community_id', sa.Uuid(), nullable=True),
    sa.Column('event_id', sa.Uuid(), nullable=True),
    sa.Column('created_by', sa.Uuid(), nullable=True),
    sa.Column('kind', sa.String(length=10), nullable=False),
    sa.Column('title', sa.String(length=200), nullable=False),
    sa.Column('description', sa.Text(), nullable=True),
    sa.Column('status', sa.String(length=10), nullable=False),
    sa.Column('scheduled_start_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('recording_enabled', sa.Boolean(), nullable=False),
    sa.Column('provider', sa.String(length=30), nullable=True),
    sa.Column('provider_room_id', sa.String(length=200), nullable=True),
    sa.Column('started_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('ended_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
    sa.CheckConstraint("kind IN ('meeting', 'livestream')", name='ck_meetings_kind'),
    sa.CheckConstraint("status IN ('scheduled', 'live', 'ended', 'cancelled')", name='ck_meetings_status'),
    sa.ForeignKeyConstraint(['community_id'], ['communities.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['created_by'], ['users.id'], ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['event_id'], ['events.id'], ondelete='SET NULL'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('provider', 'provider_room_id', name='uq_meetings_provider_room')
    )
    op.create_index('ix_meetings_community_created', 'meetings', ['community_id', 'created_at', 'id'], unique=False)
    op.create_index('ix_meetings_created', 'meetings', ['created_at', 'id'], unique=False)
    op.create_index(op.f('ix_meetings_event_id'), 'meetings', ['event_id'], unique=False)
    op.create_table('meeting_recordings',
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('meeting_id', sa.Uuid(), nullable=False),
    sa.Column('provider', sa.String(length=30), nullable=False),
    sa.Column('provider_recording_id', sa.String(length=200), nullable=False),
    sa.Column('status', sa.String(length=10), nullable=False),
    sa.Column('storage_key', sa.String(length=500), nullable=True),
    sa.Column('content_type', sa.String(length=100), nullable=True),
    sa.Column('size_bytes', sa.BigInteger(), nullable=True),
    sa.Column('duration_seconds', sa.Integer(), nullable=True),
    sa.Column('published', sa.Boolean(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
    sa.CheckConstraint("status IN ('processing', 'ready', 'failed')", name='ck_meeting_recordings_status'),
    sa.ForeignKeyConstraint(['meeting_id'], ['meetings.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('provider', 'provider_recording_id', name='uq_meeting_recordings_provider_recording')
    )
    op.create_index('ix_meeting_recordings_meeting_created', 'meeting_recordings', ['meeting_id', 'created_at', 'id'], unique=False)


def downgrade() -> None:
    """Reverse this migration."""
    op.drop_index('ix_meeting_recordings_meeting_created', table_name='meeting_recordings')
    op.drop_table('meeting_recordings')
    op.drop_index(op.f('ix_meetings_event_id'), table_name='meetings')
    op.drop_index('ix_meetings_created', table_name='meetings')
    op.drop_index('ix_meetings_community_created', table_name='meetings')
    op.drop_table('meetings')
    op.drop_table('video_webhook_receipts')
