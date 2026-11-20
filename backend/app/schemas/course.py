"""Request and response schemas for courses, lessons and quizzes."""

from typing import Annotated, Literal
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
ModuleTitle = Annotated[str, StringConstraints(strip_whitespace=True, max_length=150)]
Scripture = Annotated[str, StringConstraints(strip_whitespace=True, max_length=100)]
Explanation = Annotated[str, StringConstraints(strip_whitespace=True, max_length=1000)]


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
    module_title: str | None = None
    scripture_reference: str | None = None
    scripture_text: str | None = None
    notes_url: str | None = None
    # An uploaded video or notes file (served from storage). When set,
    # ``video_url`` / ``notes_url`` are short-lived signed links to it, given
    # to people enrolled in the course and to its managers.
    has_video_file: bool = False
    has_notes_file: bool = False
    completed: bool
    created_at: UtcDatetime
    updated_at: UtcDatetime


class QuestionRead(BaseModel):
    prompt: str
    options: list[str]
    # Shown after answering. Learners get it from the check endpoint.
    explanation: str | None = None
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
    module_title: ModuleTitle | None = None
    scripture_reference: Scripture | None = None
    scripture_text: LongText | None = None
    notes_url: VideoUrl | None = None


class LessonUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: Title | None = None
    body: LongText | None = None
    video_url: VideoUrl | None = None
    duration_minutes: Minutes | None = None
    position: Position | None = None
    module_title: ModuleTitle | None = None
    scripture_reference: Scripture | None = None
    scripture_text: LongText | None = None
    notes_url: VideoUrl | None = None


# Quizzes


class QuestionWrite(BaseModel):
    model_config = ConfigDict(extra="forbid")

    prompt: PromptText
    options: list[OptionText] = Field(min_length=2, max_length=8)
    correct_index: int = Field(ge=0)
    explanation: Explanation | None = None

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
    certificate_number: str | None = None


class CourseOverview(BaseModel):
    """Totals over the courses you manage."""

    courses: int
    published: int
    students: int
    quizzes: int
    certificates: int
    recent_attempts: list[AttemptRead]


class AnswerCheck(BaseModel):
    """Check one answer before submitting the whole quiz."""

    model_config = ConfigDict(extra="forbid")

    question_index: int = Field(ge=0)
    answer: int = Field(ge=0)


class AnswerResult(BaseModel):
    correct: bool
    correct_index: int
    explanation: str | None


class CertificateVerification(BaseModel):
    """Public: what anyone sees when checking a certificate number."""

    valid: bool
    certificate_number: str
    recipient_name: str | None = None
    course_title: str | None = None
    completed_at: UtcDatetime | None = None
    issued_by: str = "Christ Youth Club (CYC)"


LESSON_VIDEO_TYPES = ("video/mp4", "video/quicktime", "video/webm")
LESSON_NOTES_TYPES = ("application/pdf",)


class LessonFileUploadRequest(BaseModel):
    """Declare a lesson video or notes PDF before uploading it to storage."""

    model_config = ConfigDict(extra="forbid")

    kind: Literal["video", "notes"]
    content_type: Literal["video/mp4", "video/quicktime", "video/webm", "application/pdf"]
    size_bytes: int = Field(gt=0)


class LessonFileConfirm(BaseModel):
    model_config = ConfigDict(extra="forbid")

    kind: Literal["video", "notes"]
    object_key: str = Field(min_length=1, max_length=255)
