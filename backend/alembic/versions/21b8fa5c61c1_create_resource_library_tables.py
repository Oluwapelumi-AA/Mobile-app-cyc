
"""create resource library tables

Revision ID: 21b8fa5c61c1
Revises: 49f27bf83756
Create Date: 2026-10-19 22:16:55.443713

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '21b8fa5c61c1'
down_revision: Union[str, Sequence[str], None] = '49f27bf83756'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Apply this migration."""
    op.create_table('resource_categories',
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('slug', sa.String(length=80), nullable=False),
    sa.Column('name', sa.String(length=100), nullable=False),
    sa.Column('description', sa.String(length=500), nullable=True),
    sa.Column('sort_order', sa.Integer(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('slug')
    )
    op.create_table('resources',
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('community_id', sa.Uuid(), nullable=True),
    sa.Column('category_id', sa.Uuid(), nullable=True),
    sa.Column('created_by', sa.Uuid(), nullable=True),
    sa.Column('kind', sa.String(length=10), nullable=False),
    sa.Column('status', sa.String(length=10), nullable=False),
    sa.Column('title', sa.String(length=200), nullable=False),
    sa.Column('summary', sa.String(length=500), nullable=True),
    sa.Column('body', sa.Text(), nullable=True),
    sa.Column('author_name', sa.String(length=150), nullable=True),
    sa.Column('scripture_reference', sa.String(length=200), nullable=True),
    sa.Column('language', sa.String(length=35), nullable=True),
    sa.Column('external_url', sa.String(length=500), nullable=True),
    sa.Column('file_key', sa.String(length=255), nullable=True),
    sa.Column('file_content_type', sa.String(length=100), nullable=True),
    sa.Column('file_size_bytes', sa.BigInteger(), nullable=True),
    sa.Column('duration_seconds', sa.Integer(), nullable=True),
    sa.Column('published_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
    sa.CheckConstraint("kind IN ('article', 'audio', 'video', 'document', 'link')", name='ck_resources_kind'),
    sa.CheckConstraint("status IN ('draft', 'published')", name='ck_resources_status'),
    sa.CheckConstraint('duration_seconds IS NULL OR duration_seconds > 0', name='ck_resources_duration_positive'),
    sa.ForeignKeyConstraint(['category_id'], ['resource_categories.id'], ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['community_id'], ['communities.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['created_by'], ['users.id'], ondelete='SET NULL'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_resources_category_id'), 'resources', ['category_id'], unique=False)
    op.create_index('ix_resources_community_status_published', 'resources', ['community_id', 'status', 'published_at', 'id'], unique=False)
    op.create_index('ix_resources_status_published', 'resources', ['status', 'published_at', 'id'], unique=False)
    op.create_table('resource_bookmarks',
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('user_id', sa.Uuid(), nullable=False),
    sa.Column('resource_id', sa.Uuid(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.ForeignKeyConstraint(['resource_id'], ['resources.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('user_id', 'resource_id', name='uq_resource_bookmarks_user_resource')
    )
    op.create_index(op.f('ix_resource_bookmarks_resource_id'), 'resource_bookmarks', ['resource_id'], unique=False)
    op.create_index('ix_resource_bookmarks_user_created', 'resource_bookmarks', ['user_id', 'created_at', 'id'], unique=False)
    op.create_table('resource_progress',
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('user_id', sa.Uuid(), nullable=False),
    sa.Column('resource_id', sa.Uuid(), nullable=False),
    sa.Column('percent', sa.Integer(), nullable=False),
    sa.Column('position_seconds', sa.Integer(), nullable=True),
    sa.Column('completed_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
    sa.CheckConstraint('percent >= 0 AND percent <= 100', name='ck_resource_progress_percent'),
    sa.CheckConstraint('position_seconds IS NULL OR position_seconds >= 0', name='ck_resource_progress_position'),
    sa.ForeignKeyConstraint(['resource_id'], ['resources.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('user_id', 'resource_id', name='uq_resource_progress_user_resource')
    )
    op.create_index(op.f('ix_resource_progress_resource_id'), 'resource_progress', ['resource_id'], unique=False)
    op.create_index('ix_resource_progress_user_updated', 'resource_progress', ['user_id', 'updated_at', 'id'], unique=False)


def downgrade() -> None:
    """Reverse this migration."""
    op.drop_index('ix_resource_progress_user_updated', table_name='resource_progress')
    op.drop_index(op.f('ix_resource_progress_resource_id'), table_name='resource_progress')
    op.drop_table('resource_progress')
    op.drop_index('ix_resource_bookmarks_user_created', table_name='resource_bookmarks')
    op.drop_index(op.f('ix_resource_bookmarks_resource_id'), table_name='resource_bookmarks')
    op.drop_table('resource_bookmarks')
    op.drop_index('ix_resources_status_published', table_name='resources')
    op.drop_index('ix_resources_community_status_published', table_name='resources')
    op.drop_index(op.f('ix_resources_category_id'), table_name='resources')
    op.drop_table('resources')
    op.drop_table('resource_categories')
