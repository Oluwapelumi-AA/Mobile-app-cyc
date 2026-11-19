"""Request and response schemas for courses, lessons and quizzes."""

from typing import Annotated
from uuid import UUID

from pydantic import (
    AnyUrl,
    BaseModel,
    ConfigDict,
    Field,
    StringConstraints,
    UrlConstraints,
    model_validator,
)

from app.models.course import CourseLevel, CourseStatus
from app.schemas.common import UtcDatetime

Title = Annotated[str, StringConstraints(strip_whitespace=True, min_length=3, max_length=200)]
Summary = Annotated[str, StringConstraints(strip_whitespace=True, max_length=500)]
LongText = Annotated[str, StringConstraints(strip_whitespace=True, max_length=100_000)]
Category = Annotated[str, StringConstraints(strip_whitespace=True, min_length=2, max_length=80)]
PersonName = Annotated[str, StringConstraints(strip_whitespace=True, max_length=150)]
VideoUrl = Annotated[AnyUrl, UrlConstraints(max_length=500, allowed_schemes=["http", "https"])]
Minutes = Annotated[int, Field(ge=1, le=24 * 60)]
Position = Annotated[int, Field(ge=0, le=10_000)]
PassMark = Annotated[int, Field(ge=1, le=100)]
OptionText = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=300)]
PromptText = Annotated[str, StringConstraints(strip_whitespace=True, min_length=3, max_length=1000)]


# Courses


class CourseCreate(BaseModel):
    """A new course starts as a draft. Add lessons, then publish it."""

    model_config = ConfigDict(extra="forbid")

    # Leave out for the app-wide catalogue (app moderators and admins only).
    chapter_id: UUID | None = None
    title: Title
    summary: Summary | None = None
    description: LongText | None = None
    category: Category | None = None
    level: CourseLevel = CourseLevel.BEGINNER
    instructor_name: PersonName | None = None


class CourseUpdate(BaseModel):
    """Only the fields sent change. Send ``null`` to clear an optional one."""

    model_config = ConfigDict(extra="forbid")

    title: Title | None = None
    summary: Summary | None = None
    description: LongText | None = None
    category: Category | None = None
    level: CourseLevel | None = None
    instructor_name: PersonName | None = None


class CourseSummary(BaseModel):
    id: UUID
    chapter_id: UUID | None
    created_by: UUID | None
    title: str
    summary: str | None
    category: str | None
    level: CourseLevel
    instructor_name: str | None
    status: CourseStatus
    published_at: UtcDatetime | None
    lesson_count: int
    quiz_count: int
    student_count: int
    # Whether you are enrolled, and when you finished; null if not enrolled.
    enrolled: bool
    completed_at: UtcDatetime | None
    can_manage: bool
    created_at: UtcDatetime
    updated_at: UtcDatetime


class LessonRead(BaseModel):
    id: UUID
    course_id: UUID
    position: int
    title: str
    body: str | None
    video_url: str | None
    duration_minutes: int | None
    completed: bool
    created_at: UtcDatetime
    updated_at: UtcDatetime


class QuestionRead(BaseModel):
    prompt: str
    options: list[str]
    # Only sent to people who manage the course.
    correct_index: int | None = None


class QuizRead(BaseModel):
    id: UUID
    course_id: UUID
    lesson_id: UUID | None
    title: str
    pass_mark: int
    question_count: int
    questions: list[QuestionRead]
    attempt_count: int
    # Your best score so far; null if you haven't taken it.
    my_best_score: int | None
    created_at: UtcDatetime
    updated_at: UtcDatetime


class CourseRead(CourseSummary):
    description: str | None
    lessons: list[LessonRead]
    quizzes: list[QuizRead]


# Lessons


class LessonCreate(BaseModel):
    """Added at the end unless ``position`` is sent."""

    model_config = ConfigDict(extra="forbid")

    title: Title
    body: LongText | None = None
    video_url: VideoUrl | None = None
    duration_minutes: Minutes | None = None
    position: Position | None = None


class LessonUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: Title | None = None
    body: LongText | None = None
    video_url: VideoUrl | None = None
    duration_minutes: Minutes | None = None
    position: Position | None = None


# Quizzes


class QuestionWrite(BaseModel):
    model_config = ConfigDict(extra="forbid")

    prompt: PromptText
    options: list[OptionText] = Field(min_length=2, max_length=8)
    correct_index: int = Field(ge=0)

    @model_validator(mode="after")
    def _correct_is_an_option(self):
        if self.correct_index >= len(self.options):
            raise ValueError("correct_index must point at one of the options")
        return self


class QuizCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: Title
    lesson_id: UUID | None = None
    pass_mark: PassMark = 70
    questions: list[QuestionWrite] = Field(min_length=1, max_length=100)


class QuizUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: Title | None = None
    lesson_id: UUID | None = None
    pass_mark: PassMark | None = None
    questions: list[QuestionWrite] | None = Field(default=None, min_length=1, max_length=100)


class AttemptCreate(BaseModel):
    """One option index per question, in order."""

    model_config = ConfigDict(extra="forbid")

    answers: list[Annotated[int, Field(ge=0)]] = Field(min_length=1, max_length=100)


class AttemptRead(BaseModel):
    id: UUID
    quiz_id: UUID
    quiz_title: str
    course_id: UUID
    user_id: UUID
    user_name: str | None
    score: int
    passed: bool
    correct_count: int
    question_count: int
    created_at: UtcDatetime


class CertificateRead(BaseModel):
    """A learner who finished every lesson of a course."""

    course_id: UUID
    course_title: str
    user_id: UUID
    user_name: str | None
    # Their best score across the course's quizzes; null if they took none.
    best_score: int | None
    completed_at: UtcDatetime


class CourseOverview(BaseModel):
    """Totals over the courses you manage."""

    courses: int
    published: int
    students: int
    quizzes: int
    certificates: int
    recent_attempts: list[AttemptRead]
