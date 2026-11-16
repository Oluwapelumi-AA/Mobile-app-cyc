"""add chapter-only posts and comments

Revision ID: da72e96b4f10
Revises: c82a5d91f604
Create Date: 2026-10-29
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
revision: str = "da72e96b4f10"
down_revision: Union[str, Sequence[str], None] = "c82a5d91f604"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

def upgrade() -> None:
    op.create_table("chapter_posts", sa.Column("id", sa.Uuid(), nullable=False), sa.Column("branch_id", sa.Uuid(), nullable=False), sa.Column("author_id", sa.Uuid(), nullable=False), sa.Column("body", sa.Text(), nullable=False), sa.Column("created_at", sa.DateTime(timezone=True), nullable=False), sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False), sa.ForeignKeyConstraint(["branch_id"], ["branches.id"], ondelete="CASCADE"), sa.ForeignKeyConstraint(["author_id"], ["users.id"], ondelete="CASCADE"), sa.PrimaryKeyConstraint("id"))
    op.create_index("ix_chapter_posts_branch_id", "chapter_posts", ["branch_id"])
    op.create_index("ix_chapter_posts_author_id", "chapter_posts", ["author_id"])
    op.create_index("ix_chapter_posts_feed", "chapter_posts", ["branch_id", "created_at", "id"])
    op.create_table("chapter_post_comments", sa.Column("id", sa.Uuid(), nullable=False), sa.Column("post_id", sa.Uuid(), nullable=False), sa.Column("author_id", sa.Uuid(), nullable=False), sa.Column("body", sa.Text(), nullable=False), sa.Column("created_at", sa.DateTime(timezone=True), nullable=False), sa.ForeignKeyConstraint(["post_id"], ["chapter_posts.id"], ondelete="CASCADE"), sa.ForeignKeyConstraint(["author_id"], ["users.id"], ondelete="CASCADE"), sa.PrimaryKeyConstraint("id"))
    op.create_index("ix_chapter_post_comments_post_id", "chapter_post_comments", ["post_id"])
    op.create_index("ix_chapter_post_comments_author_id", "chapter_post_comments", ["author_id"])
    op.create_index("ix_chapter_post_comments_thread", "chapter_post_comments", ["post_id", "created_at", "id"])

def downgrade() -> None:
    op.drop_index("ix_chapter_post_comments_thread", table_name="chapter_post_comments")
    op.drop_index("ix_chapter_post_comments_author_id", table_name="chapter_post_comments")
    op.drop_index("ix_chapter_post_comments_post_id", table_name="chapter_post_comments")
    op.drop_table("chapter_post_comments")
    op.drop_index("ix_chapter_posts_feed", table_name="chapter_posts")
    op.drop_index("ix_chapter_posts_author_id", table_name="chapter_posts")
    op.drop_index("ix_chapter_posts_branch_id", table_name="chapter_posts")
    op.drop_table("chapter_posts")
