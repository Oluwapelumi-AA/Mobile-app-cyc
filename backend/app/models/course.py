"""Courses: lessons, quizzes, enrolments and quiz attempts.

A course belongs to a Chapter or to the app-wide catalogue, like a resource.
A learner enrols, marks lessons complete and takes quizzes; finishing every
lesson completes the course, which is what the dashboard counts as a
certificate.
"""

import uuid
from datetime import datetime, timezone
from enum import Enum

from sqlalchemy import (
    JSON,
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.types import Uuid

from app.db.session import Base


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class CourseLevel(str, Enum):
    BEGINNER = "beginner"
    INTERMEDIATE = "intermediate"
    ADVANCED = "advanced"


class CourseStatus(str, Enum):
    DRAFT = "draft"
    PUBLISHED = "published"


def _id() -> Mapped[uuid.UUID]:
    return mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)


def _created() -> Mapped[datetime]:
    return mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)


def _updated() -> Mapped[datetime]:
    return mapped_column(
        DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False
    )


class Course(Base):
    __tablename__ = "courses"

    __table_args__ = (
        CheckConstraint(
            "level IN ('beginner', 'intermediate', 'advanced')",
            name="ck_courses_level",
        ),
        CheckConstraint("status IN ('draft', 'published')", name="ck_courses_status"),
        Index("ix_courses_status_created", "status", "created_at", "id"),
    )

    id: Mapped[uuid.UUID] = _id()
    # The Chapter that owns the course; null for the app-wide catalogue.
    chapter_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("chapters.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    summary: Mapped[str | None] = mapped_column(String(500), nullable=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    category: Mapped[str | None] = mapped_column(String(80), nullable=True)
    level: Mapped[str] = mapped_column(
        String(20), default=CourseLevel.BEGINNER.value, nullable=False
    )
    instructor_name: Mapped[str | None] = mapped_column(String(150), nullable=True)
    status: Mapped[str] = mapped_column(
        String(20), default=CourseStatus.DRAFT.value, nullable=False
    )
    published_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = _created()
    updated_at: Mapped[datetime] = _updated()


class CourseLesson(Base):
    __tablename__ = "course_lessons"

    __table_args__ = (
        CheckConstraint(
            "duration_minutes IS NULL OR duration_minutes > 0",
            name="ck_course_lessons_duration_positive",
        ),
        Index("ix_course_lessons_course_position", "course_id", "position"),
    )

    id: Mapped[uuid.UUID] = _id()
    course_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("courses.id", ondelete="CASCADE"), nullable=False
    )
    # Lower comes first.
    position: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    body: Mapped[str | None] = mapped_column(Text, nullable=True)
    video_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    duration_minutes: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # Lessons with the same module title are grouped together in the app.
    module_title: Mapped[str | None] = mapped_column(String(150), nullable=True)
    scripture_reference: Mapped[str | None] = mapped_column(String(100), nullable=True)
    scripture_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    notes_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    created_at: Mapped[datetime] = _created()
    updated_at: Mapped[datetime] = _updated()


class CourseQuiz(Base):
    __tablename__ = "course_quizzes"

    __table_args__ = (
        CheckConstraint(
            "pass_mark >= 1 AND pass_mark <= 100", name="ck_course_quizzes_pass_mark"
        ),
    )

    id: Mapped[uuid.UUID] = _id()
    course_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("courses.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    # The lesson the quiz follows; null for a course-wide assessment.
    lesson_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("course_lessons.id", ondelete="SET NULL"),
        nullable=True,
    )
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    # Percent needed to pass.
    pass_mark: Mapped[int] = mapped_column(Integer, default=70, nullable=False)
    # [{"prompt": str, "options": [str, ...], "correct_index": int}, ...]
    questions: Mapped[list] = mapped_column(JSON, default=list, nullable=False)
    created_at: Mapped[datetime] = _created()
    updated_at: Mapped[datetime] = _updated()


class CourseEnrollment(Base):
    __tablename__ = "course_enrollments"

    __table_args__ = (
        UniqueConstraint("course_id", "user_id", name="uq_course_enrollments_user"),
    )

    id: Mapped[uuid.UUID] = _id()
    course_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("courses.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    # Set when every lesson is complete; the course certificate.
    completed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    # Printed on the certificate; anyone can check it with
    # GET /certificates/verify/{number}.
    certificate_number: Mapped[str | None] = mapped_column(
        String(32), nullable=True, unique=True
    )
    created_at: Mapped[datetime] = _created()


class CourseLessonCompletion(Base):
    __tablename__ = "course_lesson_completions"

    __table_args__ = (
        UniqueConstraint("lesson_id", "user_id", name="uq_course_lesson_completions_user"),
    )

    id: Mapped[uuid.UUID] = _id()
    lesson_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("course_lessons.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    created_at: Mapped[datetime] = _created()


class QuizAttempt(Base):
    __tablename__ = "course_quiz_attempts"

    __table_args__ = (
        CheckConstraint(
            "score >= 0 AND score <= 100", name="ck_course_quiz_attempts_score"
        ),
        Index("ix_course_quiz_attempts_quiz_created", "quiz_id", "created_at", "id"),
    )

    id: Mapped[uuid.UUID] = _id()
    quiz_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("course_quizzes.id", ondelete="CASCADE"),
        nullable=False,
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    # Percent of questions answered correctly.
    score: Mapped[int] = mapped_column(Integer, nullable=False)
    passed: Mapped[bool] = mapped_column(Boolean, nullable=False)
    answers: Mapped[list] = mapped_column(JSON, default=list, nullable=False)
    created_at: Mapped[datetime] = _created()
