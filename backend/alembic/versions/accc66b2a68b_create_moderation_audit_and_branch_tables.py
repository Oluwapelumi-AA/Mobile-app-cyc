
"""create moderation, audit and branch tables

Revision ID: accc66b2a68b
Revises: 44b09615ba7a
Create Date: 2026-10-19 23:17:33.976000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'accc66b2a68b'
down_revision: Union[str, Sequence[str], None] = '44b09615ba7a'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Apply this migration."""
    op.create_table('branches',
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('slug', sa.String(length=80), nullable=False),
    sa.Column('name', sa.String(length=100), nullable=False),
    sa.Column('description', sa.String(length=1000), nullable=True),
    sa.Column('country_code', sa.String(length=2), nullable=False),
    sa.Column('city', sa.String(length=100), nullable=True),
    sa.Column('timezone', sa.String(length=64), nullable=False),
    sa.Column('language_code', sa.String(length=35), nullable=True),
    sa.Column('contact_email', sa.String(length=320), nullable=True),
    sa.Column('is_active', sa.Boolean(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('slug')
    )
    op.create_index(op.f('ix_branches_country_code'), 'branches', ['country_code'], unique=False)
    op.create_table('audit_logs',
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('actor_id', sa.Uuid(), nullable=True),
    sa.Column('action', sa.String(length=50), nullable=False),
    sa.Column('target_type', sa.String(length=20), nullable=False),
    sa.Column('target_id', sa.Uuid(), nullable=False),
    sa.Column('community_id', sa.Uuid(), nullable=True),
    sa.Column('data', sa.JSON(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.ForeignKeyConstraint(['actor_id'], ['users.id'], ondelete='SET NULL'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_audit_logs_actor_created', 'audit_logs', ['actor_id', 'created_at'], unique=False)
    op.create_index('ix_audit_logs_community_created', 'audit_logs', ['community_id', 'created_at', 'id'], unique=False)
    op.create_index('ix_audit_logs_created', 'audit_logs', ['created_at', 'id'], unique=False)
    op.create_index('ix_audit_logs_target', 'audit_logs', ['target_type', 'target_id'], unique=False)
    op.create_table('community_bans',
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('community_id', sa.Uuid(), nullable=False),
    sa.Column('user_id', sa.Uuid(), nullable=False),
    sa.Column('banned_by', sa.Uuid(), nullable=True),
    sa.Column('reason', sa.String(length=500), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.ForeignKeyConstraint(['banned_by'], ['users.id'], ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['community_id'], ['communities.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('community_id', 'user_id', name='uq_community_bans_community_user')
    )
    op.create_index(op.f('ix_community_bans_user_id'), 'community_bans', ['user_id'], unique=False)
    op.create_table('content_reports',
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('reporter_id', sa.Uuid(), nullable=True),
    sa.Column('target_type', sa.String(length=20), nullable=False),
    sa.Column('target_id', sa.Uuid(), nullable=False),
    sa.Column('target_owner_id', sa.Uuid(), nullable=True),
    sa.Column('community_id', sa.Uuid(), nullable=True),
    sa.Column('reason', sa.String(length=20), nullable=False),
    sa.Column('details', sa.String(length=1000), nullable=True),
    sa.Column('snapshot', sa.JSON(), nullable=False),
    sa.Column('status', sa.String(length=10), nullable=False),
    sa.Column('reviewed_by', sa.Uuid(), nullable=True),
    sa.Column('reviewed_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('resolution_note', sa.String(length=1000), nullable=True),
    sa.Column('content_removed', sa.Boolean(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
    sa.CheckConstraint("reason IN ('spam', 'harassment', 'hate', 'violence', 'sexual_content', 'self_harm', 'misinformation', 'impersonation', 'other')", name='ck_content_reports_reason'),
    sa.CheckConstraint("status IN ('open', 'actioned', 'dismissed')", name='ck_content_reports_status'),
    sa.CheckConstraint("target_type IN ('post', 'comment', 'user', 'community', 'event', 'resource')", name='ck_content_reports_target_type'),
    sa.ForeignKeyConstraint(['community_id'], ['communities.id'], ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['reporter_id'], ['users.id'], ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['reviewed_by'], ['users.id'], ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['target_owner_id'], ['users.id'], ondelete='SET NULL'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('reporter_id', 'target_type', 'target_id', name='uq_content_reports_reporter_target')
    )
    op.create_index('ix_content_reports_community_status', 'content_reports', ['community_id', 'status'], unique=False)
    op.create_index('ix_content_reports_status_created', 'content_reports', ['status', 'created_at', 'id'], unique=False)
    op.create_index('ix_content_reports_target', 'content_reports', ['target_type', 'target_id'], unique=False)
    op.create_index(op.f('ix_content_reports_target_owner_id'), 'content_reports', ['target_owner_id'], unique=False)
    # Batch mode so SQLite can add the foreign keys too.
    for table in ('communities', 'user_profiles'):
        with op.batch_alter_table(table) as batch:
            batch.add_column(sa.Column('branch_id', sa.Uuid(), nullable=True))
            batch.create_index(f'ix_{table}_branch_id', ['branch_id'], unique=False)
            batch.create_foreign_key(
                f'fk_{table}_branch_id_branches', 'branches', ['branch_id'], ['id'], ondelete='SET NULL'
            )

def downgrade() -> None:
    """Reverse this migration."""
    for table in ('user_profiles', 'communities'):
        with op.batch_alter_table(table) as batch:
            batch.drop_constraint(f'fk_{table}_branch_id_branches', type_='foreignkey')
            batch.drop_index(f'ix_{table}_branch_id')
            batch.drop_column('branch_id')
    op.drop_index(op.f('ix_content_reports_target_owner_id'), table_name='content_reports')
    op.drop_index('ix_content_reports_target', table_name='content_reports')
    op.drop_index('ix_content_reports_status_created', table_name='content_reports')
    op.drop_index('ix_content_reports_community_status', table_name='content_reports')
    op.drop_table('content_reports')
    op.drop_index(op.f('ix_community_bans_user_id'), table_name='community_bans')
    op.drop_table('community_bans')
    op.drop_index('ix_audit_logs_target', table_name='audit_logs')
    op.drop_index('ix_audit_logs_created', table_name='audit_logs')
    op.drop_index('ix_audit_logs_community_created', table_name='audit_logs')
    op.drop_index('ix_audit_logs_actor_created', table_name='audit_logs')
    op.drop_table('audit_logs')
    op.drop_index(op.f('ix_branches_country_code'), table_name='branches')
    op.drop_table('branches')
