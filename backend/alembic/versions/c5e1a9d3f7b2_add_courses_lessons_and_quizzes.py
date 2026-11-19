
"""add courses lessons and quizzes

Revision ID: c5e1a9d3f7b2
Revises: b7d4e2f9a1c3
Create Date: 2026-11-16 09:23:52.468529

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c5e1a9d3f7b2'
down_revision: Union[str, Sequence[str], None] = 'b7d4e2f9a1c3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Apply this migration."""

    op.create_table('courses',
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('chapter_id', sa.Uuid(), nullable=True),
    sa.Column('created_by', sa.Uuid(), nullable=True),
    sa.Column('title', sa.String(length=200), nullable=False),
    sa.Column('summary', sa.String(length=500), nullable=True),
    sa.Column('description', sa.Text(), nullable=True),
    sa.Column('category', sa.String(length=80), nullable=True),
    sa.Column('level', sa.String(length=20), nullable=False),
    sa.Column('instructor_name', sa.String(length=150), nullable=True),
    sa.Column('status', sa.String(length=20), nullable=False),
    sa.Column('published_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
    sa.CheckConstraint("level IN ('beginner', 'intermediate', 'advanced')", name='ck_courses_level'),
    sa.CheckConstraint("status IN ('draft', 'published')", name='ck_courses_status'),
    sa.ForeignKeyConstraint(['chapter_id'], ['chapters.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['created_by'], ['users.id'], ondelete='SET NULL'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_courses_chapter_id'), 'courses', ['chapter_id'], unique=False)
    op.create_index('ix_courses_status_created', 'courses', ['status', 'created_at', 'id'], unique=False)
    op.create_table('course_enrollments',
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('course_id', sa.Uuid(), nullable=False),
    sa.Column('user_id', sa.Uuid(), nullable=False),
    sa.Column('completed_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.ForeignKeyConstraint(['course_id'], ['courses.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('course_id', 'user_id', name='uq_course_enrollments_user')
    )
    op.create_index(op.f('ix_course_enrollments_course_id'), 'course_enrollments', ['course_id'], unique=False)
    op.create_index(op.f('ix_course_enrollments_user_id'), 'course_enrollments', ['user_id'], unique=False)
    op.create_table('course_lessons',
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('course_id', sa.Uuid(), nullable=False),
    sa.Column('position', sa.Integer(), nullable=False),
    sa.Column('title', sa.String(length=200), nullable=False),
    sa.Column('body', sa.Text(), nullable=True),
    sa.Column('video_url', sa.String(length=500), nullable=True),
    sa.Column('duration_minutes', sa.Integer(), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
    sa.CheckConstraint('duration_minutes IS NULL OR duration_minutes > 0', name='ck_course_lessons_duration_positive'),
    sa.ForeignKeyConstraint(['course_id'], ['courses.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_course_lessons_course_position', 'course_lessons', ['course_id', 'position'], unique=False)
    op.create_table('course_lesson_completions',
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('lesson_id', sa.Uuid(), nullable=False),
    sa.Column('user_id', sa.Uuid(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.ForeignKeyConstraint(['lesson_id'], ['course_lessons.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('lesson_id', 'user_id', name='uq_course_lesson_completions_user')
    )
    op.create_index(op.f('ix_course_lesson_completions_lesson_id'), 'course_lesson_completions', ['lesson_id'], unique=False)
    op.create_index(op.f('ix_course_lesson_completions_user_id'), 'course_lesson_completions', ['user_id'], unique=False)
    op.create_table('course_quizzes',
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('course_id', sa.Uuid(), nullable=False),
    sa.Column('lesson_id', sa.Uuid(), nullable=True),
    sa.Column('title', sa.String(length=200), nullable=False),
    sa.Column('pass_mark', sa.Integer(), nullable=False),
    sa.Column('questions', sa.JSON(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
    sa.CheckConstraint('pass_mark >= 1 AND pass_mark <= 100', name='ck_course_quizzes_pass_mark'),
    sa.ForeignKeyConstraint(['course_id'], ['courses.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['lesson_id'], ['course_lessons.id'], ondelete='SET NULL'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_course_quizzes_course_id'), 'course_quizzes', ['course_id'], unique=False)
    op.create_table('course_quiz_attempts',
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('quiz_id', sa.Uuid(), nullable=False),
    sa.Column('user_id', sa.Uuid(), nullable=False),
    sa.Column('score', sa.Integer(), nullable=False),
    sa.Column('passed', sa.Boolean(), nullable=False),
    sa.Column('answers', sa.JSON(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.CheckConstraint('score >= 0 AND score <= 100', name='ck_course_quiz_attempts_score'),
    sa.ForeignKeyConstraint(['quiz_id'], ['course_quizzes.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_course_quiz_attempts_quiz_created', 'course_quiz_attempts', ['quiz_id', 'created_at', 'id'], unique=False)
    op.create_index(op.f('ix_course_quiz_attempts_user_id'), 'course_quiz_attempts', ['user_id'], unique=False)
    # ### end Alembic commands ###


def downgrade() -> None:
    """Reverse this migration."""

    op.drop_index(op.f('ix_course_quiz_attempts_user_id'), table_name='course_quiz_attempts')
    op.drop_index('ix_course_quiz_attempts_quiz_created', table_name='course_quiz_attempts')
    op.drop_table('course_quiz_attempts')
    op.drop_index(op.f('ix_course_quizzes_course_id'), table_name='course_quizzes')
    op.drop_table('course_quizzes')
    op.drop_index(op.f('ix_course_lesson_completions_user_id'), table_name='course_lesson_completions')
    op.drop_index(op.f('ix_course_lesson_completions_lesson_id'), table_name='course_lesson_completions')
    op.drop_table('course_lesson_completions')
    op.drop_index('ix_course_lessons_course_position', table_name='course_lessons')
    op.drop_table('course_lessons')
    op.drop_index(op.f('ix_course_enrollments_user_id'), table_name='course_enrollments')
    op.drop_index(op.f('ix_course_enrollments_course_id'), table_name='course_enrollments')
    op.drop_table('course_enrollments')
    op.drop_index('ix_courses_status_created', table_name='courses')
    op.drop_index(op.f('ix_courses_chapter_id'), table_name='courses')
    op.drop_table('courses')
    # ### end Alembic commands ###
