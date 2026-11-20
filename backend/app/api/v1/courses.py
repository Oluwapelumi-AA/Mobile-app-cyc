"""Course endpoints: the catalogue, lessons, quizzes, enrolment and grading."""

from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Response, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user_id, get_viewer_id
from app.core.identity import UserId
from app.db.session import get_db
from app.models.course import CourseStatus
from app.schemas.common import Page
from app.schemas.course import (
    AnswerCheck,
    AnswerResult,
    CertificateVerification,
    AttemptCreate,
    AttemptRead,
    CertificateRead,
    CourseCreate,
    CourseOverview,
    CourseRead,
    CourseSummary,
    CourseUpdate,
    LessonCreate,
    LessonFileConfirm,
    LessonFileUploadRequest,
    LessonUpdate,
    QuizCreate,
    QuizRead,
    QuizUpdate,
)
from app.schemas.resource import FileUploadIntent
from app.services import courses
from app.services.object_storage import ObjectStorage, get_object_storage
from app.services.pagination import DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE

router = APIRouter(prefix="/courses", tags=["Courses"])
lessons_router = APIRouter(prefix="/course-lessons", tags=["Courses"])
quizzes_router = APIRouter(prefix="/course-quizzes", tags=["Courses"])
certificates_router = APIRouter(prefix="/certificates", tags=["Courses"])

CurrentUserId = Annotated[UserId, Depends(get_current_user_id)]
ViewerId = Annotated[UserId, Depends(get_viewer_id)]
DbSession = Annotated[Session, Depends(get_db)]
Storage = Annotated[ObjectStorage, Depends(get_object_storage)]
Limit = Annotated[int, Query(ge=1, le=MAX_PAGE_SIZE)]
Cursor = Annotated[str | None, Query(max_length=200)]


# Courses


@router.post("", response_model=CourseRead, status_code=status.HTTP_201_CREATED)
def create_course(data: CourseCreate, user_id: CurrentUserId, db: DbSession):
    """Add a draft course. Add lessons, then publish it."""
    return courses.create_course(db, user_id, data)


@router.get("", response_model=Page[CourseSummary])
def list_courses(
    user_id: ViewerId,
    db: DbSession,
    limit: Limit = DEFAULT_PAGE_SIZE,
    cursor: Cursor = None,
    chapter_id: UUID | None = None,
    status_filter: Annotated[CourseStatus | None, Query(alias="status")] = None,
    managed: bool = False,
    enrolled: bool = False,
):
    """Published courses you can see, plus drafts of courses you manage.
    ``managed=true`` keeps only courses you manage; ``enrolled=true`` only
    courses you're enrolled in."""
    return courses.list_courses(
        db,
        user_id,
        limit=limit,
        cursor=cursor,
        chapter_id=chapter_id,
        status=status_filter,
        managed=managed,
        enrolled=enrolled,
    )


@router.get("/overview", response_model=CourseOverview)
def course_overview(user_id: CurrentUserId, db: DbSession):
    """Totals and recent quiz attempts over the courses you manage."""
    return courses.overview(db, user_id)


@router.get("/quiz-attempts", response_model=Page[AttemptRead])
def list_attempts(
    user_id: CurrentUserId,
    db: DbSession,
    limit: Limit = DEFAULT_PAGE_SIZE,
    cursor: Cursor = None,
    course_id: UUID | None = None,
    quiz_id: UUID | None = None,
):
    """Quiz attempts in the courses you manage, newest first."""
    return courses.list_attempts(
        db, user_id, limit=limit, cursor=cursor, course_id=course_id, quiz_id=quiz_id
    )


@router.get("/certificates", response_model=Page[CertificateRead])
def list_certificates(
    user_id: CurrentUserId,
    db: DbSession,
    limit: Limit = DEFAULT_PAGE_SIZE,
    cursor: Cursor = None,
):
    """Learners who completed courses you manage, newest first."""
    return courses.list_certificates(db, user_id, limit=limit, cursor=cursor)


@router.get("/{course_id}", response_model=CourseRead)
def get_course(course_id: UUID, user_id: ViewerId, db: DbSession, storage: Storage):
    return courses.get_course(db, user_id, course_id, storage)


@router.patch("/{course_id}", response_model=CourseRead)
def update_course(course_id: UUID, data: CourseUpdate, user_id: CurrentUserId, db: DbSession):
    return courses.update_course(db, user_id, course_id, data)


@router.delete("/{course_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_course(course_id: UUID, user_id: CurrentUserId, db: DbSession):
    courses.delete_course(db, user_id, course_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/{course_id}/publish", response_model=CourseRead)
def publish_course(course_id: UUID, user_id: CurrentUserId, db: DbSession):
    """Needs at least one lesson."""
    return courses.publish_course(db, user_id, course_id)


@router.post("/{course_id}/unpublish", response_model=CourseRead)
def unpublish_course(course_id: UUID, user_id: CurrentUserId, db: DbSession):
    return courses.unpublish_course(db, user_id, course_id)


@router.post("/{course_id}/lessons", response_model=CourseRead, status_code=status.HTTP_201_CREATED)
def add_lesson(course_id: UUID, data: LessonCreate, user_id: CurrentUserId, db: DbSession):
    return courses.add_lesson(db, user_id, course_id, data)


@router.post("/{course_id}/quizzes", response_model=QuizRead, status_code=status.HTTP_201_CREATED)
def add_quiz(course_id: UUID, data: QuizCreate, user_id: CurrentUserId, db: DbSession):
    return courses.add_quiz(db, user_id, course_id, data)


@router.put("/{course_id}/enrollment", response_model=CourseRead)
def enroll(course_id: UUID, user_id: CurrentUserId, db: DbSession):
    return courses.enroll(db, user_id, course_id)


@router.delete("/{course_id}/enrollment", status_code=status.HTTP_204_NO_CONTENT)
def unenroll(course_id: UUID, user_id: CurrentUserId, db: DbSession):
    courses.unenroll(db, user_id, course_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# Lessons


@lessons_router.patch("/{lesson_id}", response_model=CourseRead)
def update_lesson(lesson_id: UUID, data: LessonUpdate, user_id: CurrentUserId, db: DbSession):
    return courses.update_lesson(db, user_id, lesson_id, data)


@lessons_router.delete("/{lesson_id}", response_model=CourseRead)
def delete_lesson(lesson_id: UUID, user_id: CurrentUserId, db: DbSession):
    return courses.delete_lesson(db, user_id, lesson_id)


@lessons_router.post("/{lesson_id}/files/upload-intent", response_model=FileUploadIntent)
def lesson_upload_intent(
    lesson_id: UUID, data: LessonFileUploadRequest, user_id: CurrentUserId, db: DbSession, storage: Storage
):
    """Get a link to upload a lesson video (MP4, MOV or WebM, up to 2 GB by
    default) or notes PDF straight to storage, then confirm it with
    ``/files/confirm``."""
    return courses.lesson_upload_intent(db, user_id, lesson_id, data, storage)


@lessons_router.post("/{lesson_id}/files/confirm", response_model=CourseRead)
def lesson_confirm_upload(
    lesson_id: UUID, data: LessonFileConfirm, user_id: CurrentUserId, db: DbSession, storage: Storage
):
    return courses.lesson_confirm_upload(db, user_id, lesson_id, data, storage)


@lessons_router.delete("/{lesson_id}/files/{kind}", response_model=CourseRead)
def lesson_remove_file(
    lesson_id: UUID, kind: Literal["video", "notes"], user_id: CurrentUserId, db: DbSession, storage: Storage
):
    return courses.lesson_remove_file(db, user_id, lesson_id, kind, storage)


@lessons_router.put("/{lesson_id}/completion", response_model=CourseRead)
def complete_lesson(lesson_id: UUID, user_id: CurrentUserId, db: DbSession):
    return courses.complete_lesson(db, user_id, lesson_id)


@lessons_router.delete("/{lesson_id}/completion", response_model=CourseRead)
def uncomplete_lesson(lesson_id: UUID, user_id: CurrentUserId, db: DbSession):
    return courses.uncomplete_lesson(db, user_id, lesson_id)


# Quizzes


@quizzes_router.get("/{quiz_id}", response_model=QuizRead)
def get_quiz(quiz_id: UUID, user_id: CurrentUserId, db: DbSession):
    """Correct answers are only included for people who manage the course."""
    return courses.get_quiz(db, user_id, quiz_id)


@quizzes_router.patch("/{quiz_id}", response_model=QuizRead)
def update_quiz(quiz_id: UUID, data: QuizUpdate, user_id: CurrentUserId, db: DbSession):
    return courses.update_quiz(db, user_id, quiz_id, data)


@quizzes_router.delete("/{quiz_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_quiz(quiz_id: UUID, user_id: CurrentUserId, db: DbSession):
    courses.delete_quiz(db, user_id, quiz_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@quizzes_router.post("/{quiz_id}/attempts", response_model=AttemptRead, status_code=status.HTTP_201_CREATED)
def submit_attempt(quiz_id: UUID, data: AttemptCreate, user_id: CurrentUserId, db: DbSession):
    """Graded on the server. You must be enrolled in the course."""
    return courses.submit_attempt(db, user_id, quiz_id, data)


@quizzes_router.get("/{quiz_id}/attempts/me", response_model=list[AttemptRead])
def my_attempts(quiz_id: UUID, user_id: CurrentUserId, db: DbSession):
    return courses.my_attempts(db, user_id, quiz_id)


@quizzes_router.post("/{quiz_id}/check", response_model=AnswerResult)
def check_answer(quiz_id: UUID, data: AnswerCheck, user_id: CurrentUserId, db: DbSession):
    """Is this one answer right? For instant feedback while taking a quiz."""
    return courses.check_answer(db, user_id, quiz_id, data)


@certificates_router.get("/mine", response_model=list[CertificateRead])
def my_certificates(user_id: CurrentUserId, db: DbSession):
    """Certificates for the courses you've finished."""
    return courses.my_certificates(db, user_id)


@certificates_router.get("/verify/{number}", response_model=CertificateVerification)
def verify_certificate(number: str, db: DbSession):
    """Public: anyone can check a certificate number. No sign-in needed."""
    return courses.verify_certificate(db, number[:32])
