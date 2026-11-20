"""Courses: a catalogue of lessons and quizzes with enrolment and grading.

- A course belongs to a Chapter or to the app-wide catalogue. Only platform
  admins add and manage courses, for a Chapter or app-wide.
- Courses start as drafts, seen only by the people who manage them.
  Publishing needs at least one lesson. A published Chapter course is seen
  by the Chapter's Members and staff; the app-wide catalogue by everyone.
  Hidden courses answer 404.
- Learners enrol, mark lessons complete and take quizzes. Answers are graded
  on the server and correct answers are never sent to learners. Completing
  every lesson completes the enrolment (the course certificate).
"""

import secrets
import uuid
from datetime import UTC, datetime

from sqlalchemy import false, func, select, true
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.identity import UserId
from app.models.chapter import Chapter
from app.models.course import (
    Course,
    CourseEnrollment,
    CourseLesson,
    CourseLessonCompletion,
    CourseQuiz,
    CourseStatus,
    QuizAttempt,
)
from app.models.user import User
from app.models.user_profile import UserProfile
from app.schemas.common import Page
from app.schemas.course import (
    AnswerCheck,
    AnswerResult,
    AttemptCreate,
    AttemptRead,
    CertificateRead,
    CertificateVerification,
    CourseCreate,
    CourseOverview,
    CourseRead,
    CourseSummary,
    CourseUpdate,
    LESSON_NOTES_TYPES,
    LESSON_VIDEO_TYPES,
    LessonCreate,
    LessonFileConfirm,
    LessonFileUploadRequest,
    LessonRead,
    LessonUpdate,
    QuestionRead,
    QuizCreate,
    QuizRead,
    QuizUpdate,
)
from app.services import chapter_access, pagination
from app.services.chapter_access import is_platform_admin
from app.services.errors import Conflict, Forbidden, InvalidInput, NotFound, ServiceUnavailable
from app.services.object_storage import ObjectStorage, StorageUnavailable, get_object_storage
from app.core.config import settings
from app.schemas.resource import FileUploadIntent

COURSE_NOT_FOUND = NotFound("course_not_found", "Course not found.")
LESSON_NOT_FOUND = NotFound("lesson_not_found", "Lesson not found.")
QUIZ_NOT_FOUND = NotFound("quiz_not_found", "Quiz not found.")
NOT_PUBLISHED = Conflict("course_not_published", "This course hasn't been published yet.")
NOT_ENROLLED = Conflict("not_enrolled", "Enrol in the course first.")

PUBLISHED = CourseStatus.PUBLISHED.value
DRAFT = CourseStatus.DRAFT.value


def _now() -> datetime:
    return datetime.now(UTC)


# Access


def _can_manage(db: Session, user_id: UserId, chapter_id: uuid.UUID | None) -> bool:
    """Only platform admins manage courses, for a Chapter or app-wide."""
    return is_platform_admin(db, user_id)


def _visible_course(db: Session, user_id: UserId, course_id: uuid.UUID) -> tuple[Course, bool]:
    course = db.get(Course, course_id)
    if course is None:
        raise COURSE_NOT_FOUND
    can_manage = _can_manage(db, user_id, course.chapter_id)
    if can_manage:
        return course, True
    if course.status != PUBLISHED:
        raise COURSE_NOT_FOUND
    if course.chapter_id is not None:
        chapter = db.get(Chapter, course.chapter_id)
        if (
            chapter is None
            or not chapter.is_active
            or not chapter_access.can_read(db, user_id, course.chapter_id)
        ):
            raise COURSE_NOT_FOUND
    return course, False


def _managed_course(db: Session, user_id: UserId, course_id: uuid.UUID) -> Course:
    course, can_manage = _visible_course(db, user_id, course_id)
    if not can_manage:
        raise Forbidden("insufficient_role", "Only admins manage courses.")
    return course


def _learning_course(db: Session, user_id: UserId, course_id: uuid.UUID) -> Course:
    """A published course the user may take part in."""
    course, _ = _visible_course(db, user_id, course_id)
    if course.status != PUBLISHED:
        raise NOT_PUBLISHED
    if course.chapter_id is not None:
        chapter_access.require_participate(db, user_id, course.chapter_id)
    return course


def _visibility(db: Session, user_id: UserId):
    """WHERE clause: published courses the user can see, plus every course
    they manage."""
    readable = chapter_access.readable_chapter_ids(db, user_id)
    active = chapter_access.active_chapter_ids()
    if readable is None:
        published = Course.chapter_id.is_(None) | Course.chapter_id.in_(active)
    else:
        published = Course.chapter_id.is_(None) | (
            Course.chapter_id.in_(active) & Course.chapter_id.in_(readable)
        )
    published = (Course.status == PUBLISHED) & published
    if is_platform_admin(db, user_id):
        return true()
    return published


def _managed_clause(db: Session, user_id: UserId):
    """WHERE clause: courses the user manages (every course for admins)."""
    return true() if is_platform_admin(db, user_id) else false()


# Reading


def _counts(db: Session, column, ids: list[uuid.UUID]) -> dict[uuid.UUID, int]:
    if not ids:
        return {}
    rows = db.execute(
        select(column, func.count()).where(column.in_(ids)).group_by(column)
    )
    return {key: count for key, count in rows}


def _summaries(db: Session, user_id: UserId, rows: list[Course]) -> list[CourseSummary]:
    ids = [row.id for row in rows]
    lessons = _counts(db, CourseLesson.course_id, ids)
    quizzes = _counts(db, CourseQuiz.course_id, ids)
    students = _counts(db, CourseEnrollment.course_id, ids)
    mine = {
        row.course_id: row
        for row in db.scalars(
            select(CourseEnrollment).where(
                CourseEnrollment.user_id == user_id, CourseEnrollment.course_id.in_(ids)
            )
        )
    } if ids else {}
    manages = {cid: _can_manage(db, user_id, cid) for cid in {r.chapter_id for r in rows}}
    return [
        CourseSummary.model_validate(
            _summary_fields(
                row,
                lessons.get(row.id, 0),
                quizzes.get(row.id, 0),
                students.get(row.id, 0),
                mine.get(row.id),
                manages[row.chapter_id],
            )
        )
        for row in rows
    ]


def _summary_fields(
    course: Course,
    lesson_count: int,
    quiz_count: int,
    student_count: int,
    enrollment: CourseEnrollment | None,
    can_manage: bool,
) -> dict:
    return {
        "id": course.id,
        "chapter_id": course.chapter_id,
        "created_by": course.created_by,
        "title": course.title,
        "summary": course.summary,
        "category": course.category,
        "level": course.level,
        "instructor_name": course.instructor_name,
        "status": course.status,
        "published_at": course.published_at,
        "lesson_count": lesson_count,
        "quiz_count": quiz_count,
        "student_count": student_count,
        "enrolled": enrollment is not None,
        "completed_at": enrollment.completed_at if enrollment else None,
        "can_manage": can_manage,
        "created_at": course.created_at,
        "updated_at": course.updated_at,
    }


def _lessons(db: Session, course_id: uuid.UUID) -> list[CourseLesson]:
    return list(
        db.scalars(
            select(CourseLesson)
            .where(CourseLesson.course_id == course_id)
            .order_by(CourseLesson.position, CourseLesson.created_at, CourseLesson.id)
        )
    )


def _quiz_read(
    db: Session, user_id: UserId, quiz: CourseQuiz, can_manage: bool
) -> QuizRead:
    attempts = db.scalar(
        select(func.count()).select_from(QuizAttempt).where(QuizAttempt.quiz_id == quiz.id)
    )
    best = db.scalar(
        select(func.max(QuizAttempt.score)).where(
            QuizAttempt.quiz_id == quiz.id, QuizAttempt.user_id == user_id
        )
    )
    questions = [
        QuestionRead(
            prompt=q["prompt"],
            options=list(q["options"]),
            correct_index=q["correct_index"] if can_manage else None,
            explanation=q.get("explanation") if can_manage else None,
        )
        for q in quiz.questions or []
    ]
    return QuizRead(
        id=quiz.id,
        course_id=quiz.course_id,
        lesson_id=quiz.lesson_id,
        title=quiz.title,
        pass_mark=quiz.pass_mark,
        question_count=len(questions),
        questions=questions,
        attempt_count=attempts or 0,
        my_best_score=best,
        created_at=quiz.created_at,
        updated_at=quiz.updated_at,
    )


def _signed(storage: ObjectStorage | None, key: str | None) -> str | None:
    if not key or storage is None:
        return None
    try:
        return storage.presign_download(key, settings.storage_presign_ttl_seconds)
    except StorageUnavailable:
        return None


def _course_read(
    db: Session, user_id: UserId, course: Course, can_manage: bool, storage: ObjectStorage | None = None
) -> CourseRead:
    lessons = _lessons(db, course.id)
    done = set(
        db.scalars(
            select(CourseLessonCompletion.lesson_id).where(
                CourseLessonCompletion.user_id == user_id,
                CourseLessonCompletion.lesson_id.in_([lesson.id for lesson in lessons]),
            )
        )
    ) if lessons else set()
    quizzes = list(
        db.scalars(
            select(CourseQuiz)
            .where(CourseQuiz.course_id == course.id)
            .order_by(CourseQuiz.created_at, CourseQuiz.id)
        )
    )
    students = db.scalar(
        select(func.count())
        .select_from(CourseEnrollment)
        .where(CourseEnrollment.course_id == course.id)
    )
    enrollment = _enrollment(db, user_id, course.id)
    # Uploaded files are only signed for learners and managers.
    files = (storage or get_object_storage()) if (can_manage or enrollment is not None) else None
    return CourseRead.model_validate(
        {
            **_summary_fields(
                course, len(lessons), len(quizzes), students or 0, enrollment, can_manage
            ),
            "description": course.description,
            "lessons": [
                LessonRead(
                    id=lesson.id,
                    course_id=lesson.course_id,
                    position=lesson.position,
                    title=lesson.title,
                    body=lesson.body,
                    video_url=_signed(files, lesson.video_key) or lesson.video_url,
                    duration_minutes=lesson.duration_minutes,
                    module_title=lesson.module_title,
                    scripture_reference=lesson.scripture_reference,
                    scripture_text=lesson.scripture_text,
                    notes_url=_signed(files, lesson.notes_key) or lesson.notes_url,
                    has_video_file=lesson.video_key is not None,
                    has_notes_file=lesson.notes_key is not None,
                    completed=lesson.id in done,
                    created_at=lesson.created_at,
                    updated_at=lesson.updated_at,
                )
                for lesson in lessons
            ],
            "quizzes": [_quiz_read(db, user_id, quiz, can_manage) for quiz in quizzes],
        }
    )


def list_courses(
    db: Session,
    user_id: UserId,
    *,
    limit: int,
    cursor: str | None = None,
    chapter_id: uuid.UUID | None = None,
    status: CourseStatus | None = None,
    managed: bool = False,
    enrolled: bool = False,
) -> Page[CourseSummary]:
    query = select(Course).where(_visibility(db, user_id))
    if managed:
        query = query.where(_managed_clause(db, user_id))
    if enrolled:
        query = query.where(
            Course.id.in_(
                select(CourseEnrollment.course_id).where(CourseEnrollment.user_id == user_id)
            )
        )
    if chapter_id is not None:
        query = query.where(Course.chapter_id == chapter_id)
    if status is not None:
        query = query.where(Course.status == status.value)
    if cursor:
        query = query.where(pagination.after_cursor(Course.created_at, Course.id, cursor, True))
    rows = list(
        db.scalars(query.order_by(*pagination.order_by(Course.created_at, Course.id, True)).limit(limit + 1))
    )
    rows, next_cursor = pagination.split_page(rows, limit)
    return Page(items=_summaries(db, user_id, rows), next_cursor=next_cursor)


def get_course(
    db: Session, user_id: UserId, course_id: uuid.UUID, storage: ObjectStorage | None = None
) -> CourseRead:
    course, can_manage = _visible_course(db, user_id, course_id)
    return _course_read(db, user_id, course, can_manage, storage)


# Managing courses


def create_course(db: Session, user_id: UserId, data: CourseCreate) -> CourseRead:
    if data.chapter_id is not None:
        chapter_access.get_active_chapter(db, data.chapter_id)
    if not _can_manage(db, user_id, data.chapter_id):
        raise Forbidden("insufficient_role", "Only admins add courses.")
    course = Course(
        chapter_id=data.chapter_id,
        created_by=user_id,
        title=data.title,
        summary=data.summary or None,
        description=data.description or None,
        category=data.category or None,
        level=data.level.value,
        instructor_name=data.instructor_name or None,
        status=DRAFT,
    )
    db.add(course)
    db.commit()
    db.refresh(course)
    return _course_read(db, user_id, course, True)


def update_course(
    db: Session, user_id: UserId, course_id: uuid.UUID, data: CourseUpdate
) -> CourseRead:
    course = _managed_course(db, user_id, course_id)
    changes = data.model_dump(exclude_unset=True)
    for required in ("title", "level"):
        if changes.get(required) is None:
            changes.pop(required, None)
    for name, value in changes.items():
        if name == "level":
            value = value.value if hasattr(value, "value") else value
        setattr(course, name, value if value != "" else None)
    db.commit()
    db.refresh(course)
    return _course_read(db, user_id, course, True)


def delete_course(db: Session, user_id: UserId, course_id: uuid.UUID) -> None:
    course = _managed_course(db, user_id, course_id)
    db.delete(course)
    db.commit()


def publish_course(db: Session, user_id: UserId, course_id: uuid.UUID) -> CourseRead:
    course = _managed_course(db, user_id, course_id)
    if not _lessons(db, course.id):
        raise InvalidInput("lessons_required", "Add at least one lesson before publishing.")
    if course.status != PUBLISHED:
        course.status = PUBLISHED
        course.published_at = _now()
        db.commit()
        db.refresh(course)
    return _course_read(db, user_id, course, True)


def unpublish_course(db: Session, user_id: UserId, course_id: uuid.UUID) -> CourseRead:
    course = _managed_course(db, user_id, course_id)
    if course.status != DRAFT:
        course.status = DRAFT
        db.commit()
        db.refresh(course)
    return _course_read(db, user_id, course, True)


# Lessons


def _managed_lesson(db: Session, user_id: UserId, lesson_id: uuid.UUID) -> CourseLesson:
    lesson = db.get(CourseLesson, lesson_id)
    if lesson is None:
        raise LESSON_NOT_FOUND
    try:
        _managed_course(db, user_id, lesson.course_id)
    except NotFound:
        raise LESSON_NOT_FOUND from None
    return lesson


def add_lesson(
    db: Session, user_id: UserId, course_id: uuid.UUID, data: LessonCreate
) -> CourseRead:
    course = _managed_course(db, user_id, course_id)
    position = data.position
    if position is None:
        last = db.scalar(
            select(func.max(CourseLesson.position)).where(CourseLesson.course_id == course.id)
        )
        position = 0 if last is None else last + 1
    db.add(
        CourseLesson(
            course_id=course.id,
            position=position,
            title=data.title,
            body=data.body or None,
            video_url=str(data.video_url) if data.video_url else None,
            duration_minutes=data.duration_minutes,
            module_title=data.module_title or None,
            scripture_reference=data.scripture_reference or None,
            scripture_text=data.scripture_text or None,
            notes_url=str(data.notes_url) if data.notes_url else None,
        )
    )
    db.commit()
    return _course_read(db, user_id, course, True)


def update_lesson(
    db: Session, user_id: UserId, lesson_id: uuid.UUID, data: LessonUpdate
) -> CourseRead:
    lesson = _managed_lesson(db, user_id, lesson_id)
    changes = data.model_dump(exclude_unset=True)
    for required in ("title", "position"):
        if changes.get(required) is None:
            changes.pop(required, None)
    for name, value in changes.items():
        if name in ("video_url", "notes_url") and value is not None:
            value = str(value)
        setattr(lesson, name, value if value != "" else None)
    db.commit()
    course = db.get(Course, lesson.course_id)
    return _course_read(db, user_id, course, True)


def delete_lesson(db: Session, user_id: UserId, lesson_id: uuid.UUID) -> CourseRead:
    lesson = _managed_lesson(db, user_id, lesson_id)
    course = db.get(Course, lesson.course_id)
    for key in (lesson.video_key, lesson.notes_key):
        _delete_stored(get_object_storage(), key)
    db.delete(lesson)
    db.commit()
    return _course_read(db, user_id, course, True)


# Lesson files (videos and notes in storage)

STORAGE_UNAVAILABLE = ServiceUnavailable("storage_unavailable", "File storage is not available right now.")


def _delete_stored(storage: ObjectStorage, key: str | None) -> None:
    if not key:
        return
    try:
        storage.delete(key)
    except StorageUnavailable:
        pass


def _lesson_file_rules(kind: str) -> tuple[tuple[str, ...], int]:
    if kind == "video":
        return LESSON_VIDEO_TYPES, settings.course_video_max_upload_bytes
    return LESSON_NOTES_TYPES, settings.course_notes_max_upload_bytes


_LESSON_EXTENSIONS = {"video/mp4": "mp4", "video/quicktime": "mov", "video/webm": "webm", "application/pdf": "pdf"}


def lesson_key_prefix(lesson: CourseLesson, kind: str) -> str:
    return f"courses/{lesson.course_id}/lessons/{lesson.id}/{kind}/"


def lesson_upload_intent(
    db: Session, user_id: UserId, lesson_id: uuid.UUID, data: LessonFileUploadRequest, storage: ObjectStorage
) -> FileUploadIntent:
    lesson = _managed_lesson(db, user_id, lesson_id)
    allowed, max_size = _lesson_file_rules(data.kind)
    if data.content_type not in allowed:
        raise InvalidInput("unsupported_file_type", f"Lesson {data.kind} takes {', '.join(allowed)}.")
    if data.size_bytes > max_size:
        raise InvalidInput("file_too_large", f"The file is too large (most {max_size // (1024 * 1024)} MB).")
    key = f"{lesson_key_prefix(lesson, data.kind)}{uuid.uuid4().hex}.{_LESSON_EXTENSIONS[data.content_type]}"
    try:
        upload = storage.presign_upload(key, data.content_type, settings.storage_presign_ttl_seconds)
    except StorageUnavailable:
        raise STORAGE_UNAVAILABLE from None
    return FileUploadIntent(
        upload_url=upload.url,
        method="PUT",
        headers=upload.headers,
        object_key=key,
        expires_at=upload.expires_at,
        max_size_bytes=max_size,
    )


def lesson_confirm_upload(
    db: Session, user_id: UserId, lesson_id: uuid.UUID, data: LessonFileConfirm, storage: ObjectStorage
) -> CourseRead:
    """Attach an uploaded video or notes file, replacing any earlier one."""
    lesson = _managed_lesson(db, user_id, lesson_id)
    allowed, max_size = _lesson_file_rules(data.kind)
    invalid = InvalidInput("invalid_upload", "The uploaded file was not found.")
    key = data.object_key.strip()
    if not key.startswith(lesson_key_prefix(lesson, data.kind)) or ".." in key:
        raise invalid
    try:
        stored = storage.head(key)
    except StorageUnavailable:
        raise STORAGE_UNAVAILABLE from None
    if stored is None:
        raise invalid
    if stored.content_type not in allowed or stored.size_bytes > max_size:
        _delete_stored(storage, key)
        raise InvalidInput("unsupported_file_type", "That file type or size isn't allowed.")
    field = "video_key" if data.kind == "video" else "notes_key"
    old = getattr(lesson, field)
    if old and old != key:
        _delete_stored(storage, old)
    setattr(lesson, field, key)
    db.commit()
    course = db.get(Course, lesson.course_id)
    return _course_read(db, user_id, course, True, storage)


def lesson_remove_file(
    db: Session, user_id: UserId, lesson_id: uuid.UUID, kind: str, storage: ObjectStorage
) -> CourseRead:
    lesson = _managed_lesson(db, user_id, lesson_id)
    field = "video_key" if kind == "video" else "notes_key"
    key = getattr(lesson, field)
    if key is None:
        raise NotFound("file_not_found", f"This lesson has no uploaded {kind}.")
    setattr(lesson, field, None)
    db.commit()
    _delete_stored(storage, key)
    course = db.get(Course, lesson.course_id)
    return _course_read(db, user_id, course, True, storage)


# Quizzes


def _check_lesson(db: Session, course_id: uuid.UUID, lesson_id: uuid.UUID | None) -> None:
    if lesson_id is None:
        return
    lesson = db.get(CourseLesson, lesson_id)
    if lesson is None or lesson.course_id != course_id:
        raise LESSON_NOT_FOUND


def _questions(data) -> list[dict]:
    return [q.model_dump() for q in data]


def _managed_quiz(db: Session, user_id: UserId, quiz_id: uuid.UUID) -> CourseQuiz:
    quiz = db.get(CourseQuiz, quiz_id)
    if quiz is None:
        raise QUIZ_NOT_FOUND
    try:
        _managed_course(db, user_id, quiz.course_id)
    except NotFound:
        raise QUIZ_NOT_FOUND from None
    return quiz


def add_quiz(db: Session, user_id: UserId, course_id: uuid.UUID, data: QuizCreate) -> QuizRead:
    course = _managed_course(db, user_id, course_id)
    _check_lesson(db, course.id, data.lesson_id)
    quiz = CourseQuiz(
        course_id=course.id,
        lesson_id=data.lesson_id,
        title=data.title,
        pass_mark=data.pass_mark,
        questions=_questions(data.questions),
    )
    db.add(quiz)
    db.commit()
    db.refresh(quiz)
    return _quiz_read(db, user_id, quiz, True)


def get_quiz(db: Session, user_id: UserId, quiz_id: uuid.UUID) -> QuizRead:
    quiz = db.get(CourseQuiz, quiz_id)
    if quiz is None:
        raise QUIZ_NOT_FOUND
    try:
        _, can_manage = _visible_course(db, user_id, quiz.course_id)
    except NotFound:
        raise QUIZ_NOT_FOUND from None
    return _quiz_read(db, user_id, quiz, can_manage)


def update_quiz(db: Session, user_id: UserId, quiz_id: uuid.UUID, data: QuizUpdate) -> QuizRead:
    quiz = _managed_quiz(db, user_id, quiz_id)
    changes = data.model_dump(exclude_unset=True)
    if "lesson_id" in changes:
        _check_lesson(db, quiz.course_id, changes["lesson_id"])
        quiz.lesson_id = changes["lesson_id"]
    if changes.get("title"):
        quiz.title = changes["title"]
    if changes.get("pass_mark"):
        quiz.pass_mark = changes["pass_mark"]
    if data.questions is not None:
        quiz.questions = _questions(data.questions)
    db.commit()
    db.refresh(quiz)
    return _quiz_read(db, user_id, quiz, True)


def delete_quiz(db: Session, user_id: UserId, quiz_id: uuid.UUID) -> None:
    quiz = _managed_quiz(db, user_id, quiz_id)
    db.delete(quiz)
    db.commit()


# Learning


def _enrollment(db: Session, user_id: UserId, course_id: uuid.UUID) -> CourseEnrollment | None:
    return db.scalar(
        select(CourseEnrollment).where(
            CourseEnrollment.course_id == course_id, CourseEnrollment.user_id == user_id
        )
    )


def enroll(db: Session, user_id: UserId, course_id: uuid.UUID) -> CourseRead:
    course = _learning_course(db, user_id, course_id)
    if _enrollment(db, user_id, course.id) is None:
        db.add(CourseEnrollment(course_id=course.id, user_id=user_id))
        try:
            db.commit()
        except IntegrityError:
            db.rollback()
    return get_course(db, user_id, course.id)


def unenroll(db: Session, user_id: UserId, course_id: uuid.UUID) -> None:
    _visible_course(db, user_id, course_id)
    enrollment = _enrollment(db, user_id, course_id)
    if enrollment is not None:
        db.delete(enrollment)
        db.commit()


def _certificate_email(db: Session, user_id: UserId, course_id: uuid.UUID, number: str) -> None:
    from app.emails import templates
    from app.models.user import User
    from app.services import email_codes, mailer

    user = db.get(User, user_id)
    course = db.get(Course, course_id)
    if user is not None and course is not None:
        mailer.send(
            db, user.email, templates.certificate_earned(email_codes.display_name(db, user_id), course.title, number), "certificate"
        )


def _refresh_completion(db: Session, user_id: UserId, course_id: uuid.UUID) -> None:
    enrollment = _enrollment(db, user_id, course_id)
    if enrollment is None:
        return
    lesson_ids = [lesson.id for lesson in _lessons(db, course_id)]
    done = db.scalar(
        select(func.count())
        .select_from(CourseLessonCompletion)
        .where(
            CourseLessonCompletion.user_id == user_id,
            CourseLessonCompletion.lesson_id.in_(lesson_ids),
        )
    ) if lesson_ids else 0
    finished = bool(lesson_ids) and done == len(lesson_ids)
    if finished and enrollment.completed_at is None:
        enrollment.completed_at = _now()
        if enrollment.certificate_number is None:
            enrollment.certificate_number = new_certificate_number(db, enrollment.completed_at)
            _certificate_email(db, user_id, course_id, enrollment.certificate_number)
    elif not finished:
        enrollment.completed_at = None
    db.commit()


def _learning_lesson(db: Session, user_id: UserId, lesson_id: uuid.UUID) -> CourseLesson:
    lesson = db.get(CourseLesson, lesson_id)
    if lesson is None:
        raise LESSON_NOT_FOUND
    try:
        _learning_course(db, user_id, lesson.course_id)
    except NotFound:
        raise LESSON_NOT_FOUND from None
    if _enrollment(db, user_id, lesson.course_id) is None:
        raise NOT_ENROLLED
    return lesson


def complete_lesson(db: Session, user_id: UserId, lesson_id: uuid.UUID) -> CourseRead:
    lesson = _learning_lesson(db, user_id, lesson_id)
    exists = db.scalar(
        select(CourseLessonCompletion.id).where(
            CourseLessonCompletion.lesson_id == lesson.id,
            CourseLessonCompletion.user_id == user_id,
        )
    )
    if exists is None:
        db.add(CourseLessonCompletion(lesson_id=lesson.id, user_id=user_id))
        db.commit()
    _refresh_completion(db, user_id, lesson.course_id)
    return get_course(db, user_id, lesson.course_id)


def uncomplete_lesson(db: Session, user_id: UserId, lesson_id: uuid.UUID) -> CourseRead:
    lesson = _learning_lesson(db, user_id, lesson_id)
    row = db.scalar(
        select(CourseLessonCompletion).where(
            CourseLessonCompletion.lesson_id == lesson.id,
            CourseLessonCompletion.user_id == user_id,
        )
    )
    if row is not None:
        db.delete(row)
        db.commit()
    _refresh_completion(db, user_id, lesson.course_id)
    return get_course(db, user_id, lesson.course_id)


def _names(db: Session, user_ids: set[uuid.UUID]) -> dict[uuid.UUID, str]:
    if not user_ids:
        return {}
    return dict(
        db.execute(
            select(UserProfile.user_id, UserProfile.display_name).where(
                UserProfile.user_id.in_(user_ids)
            )
        ).all()
    )


def _attempt_reads(db: Session, rows: list[QuizAttempt]) -> list[AttemptRead]:
    quizzes = {
        quiz.id: quiz
        for quiz in db.scalars(
            select(CourseQuiz).where(CourseQuiz.id.in_({row.quiz_id for row in rows}))
        )
    } if rows else {}
    names = _names(db, {row.user_id for row in rows})
    emails = dict(
        db.execute(
            select(User.id, User.email).where(User.id.in_({row.user_id for row in rows}))
        ).all()
    ) if rows else {}
    result = []
    for row in rows:
        quiz = quizzes[row.quiz_id]
        total = len(quiz.questions or [])
        result.append(
            AttemptRead(
                id=row.id,
                quiz_id=row.quiz_id,
                quiz_title=quiz.title,
                course_id=quiz.course_id,
                user_id=row.user_id,
                user_name=names.get(row.user_id) or emails.get(row.user_id),
                score=row.score,
                passed=row.passed,
                correct_count=round(row.score * total / 100) if total else 0,
                question_count=total,
                created_at=row.created_at,
            )
        )
    return result


def submit_attempt(
    db: Session, user_id: UserId, quiz_id: uuid.UUID, data: AttemptCreate
) -> AttemptRead:
    quiz = db.get(CourseQuiz, quiz_id)
    if quiz is None:
        raise QUIZ_NOT_FOUND
    try:
        _learning_course(db, user_id, quiz.course_id)
    except NotFound:
        raise QUIZ_NOT_FOUND from None
    if _enrollment(db, user_id, quiz.course_id) is None:
        raise NOT_ENROLLED
    questions = quiz.questions or []
    if len(data.answers) != len(questions):
        raise InvalidInput(
            "answer_count", f"Send one answer for each of the {len(questions)} questions."
        )
    correct = sum(
        1 for answer, question in zip(data.answers, questions, strict=True)
        if answer == question["correct_index"]
    )
    score = round(correct * 100 / len(questions))
    attempt = QuizAttempt(
        quiz_id=quiz.id,
        user_id=user_id,
        score=score,
        passed=score >= quiz.pass_mark,
        answers=list(data.answers),
    )
    db.add(attempt)
    db.commit()
    db.refresh(attempt)
    return _attempt_reads(db, [attempt])[0]


def list_attempts(
    db: Session,
    user_id: UserId,
    *,
    limit: int,
    cursor: str | None = None,
    course_id: uuid.UUID | None = None,
    quiz_id: uuid.UUID | None = None,
) -> Page[AttemptRead]:
    """Attempts on quizzes in courses you manage, newest first."""
    managed = select(Course.id).where(_managed_clause(db, user_id))
    query = (
        select(QuizAttempt)
        .join(CourseQuiz, CourseQuiz.id == QuizAttempt.quiz_id)
        .where(CourseQuiz.course_id.in_(managed))
    )
    if course_id is not None:
        query = query.where(CourseQuiz.course_id == course_id)
    if quiz_id is not None:
        query = query.where(QuizAttempt.quiz_id == quiz_id)
    if cursor:
        query = query.where(
            pagination.after_cursor(QuizAttempt.created_at, QuizAttempt.id, cursor, True)
        )
    rows = list(
        db.scalars(
            query.order_by(*pagination.order_by(QuizAttempt.created_at, QuizAttempt.id, True))
            .limit(limit + 1)
        )
    )
    rows, next_cursor = pagination.split_page(rows, limit)
    return Page(items=_attempt_reads(db, rows), next_cursor=next_cursor)


def my_attempts(db: Session, user_id: UserId, quiz_id: uuid.UUID) -> list[AttemptRead]:
    get_quiz(db, user_id, quiz_id)
    rows = list(
        db.scalars(
            select(QuizAttempt)
            .where(QuizAttempt.quiz_id == quiz_id, QuizAttempt.user_id == user_id)
            .order_by(QuizAttempt.created_at.desc(), QuizAttempt.id.desc())
        )
    )
    return _attempt_reads(db, rows)


def list_certificates(
    db: Session, user_id: UserId, *, limit: int, cursor: str | None = None
) -> Page[CertificateRead]:
    """Completed enrolments in courses you manage, newest first."""
    managed = select(Course.id).where(_managed_clause(db, user_id))
    query = select(CourseEnrollment).where(
        CourseEnrollment.course_id.in_(managed),
        CourseEnrollment.completed_at.is_not(None),
    )
    if cursor:
        query = query.where(
            pagination.after_cursor(
                CourseEnrollment.completed_at, CourseEnrollment.id, cursor, True
            )
        )
    rows = list(
        db.scalars(
            query.order_by(
                *pagination.order_by(CourseEnrollment.completed_at, CourseEnrollment.id, True)
            ).limit(limit + 1)
        )
    )
    rows, next_cursor = pagination.split_page(rows, limit, "completed_at")
    if not rows:
        return Page(items=[], next_cursor=None)
    titles = dict(
        db.execute(
            select(Course.id, Course.title).where(Course.id.in_({r.course_id for r in rows}))
        ).all()
    )
    users = {r.user_id for r in rows}
    names = _names(db, users)
    emails = dict(db.execute(select(User.id, User.email).where(User.id.in_(users))).all())
    best = {
        (course_id, uid): score
        for course_id, uid, score in db.execute(
            select(CourseQuiz.course_id, QuizAttempt.user_id, func.max(QuizAttempt.score))
            .join(CourseQuiz, CourseQuiz.id == QuizAttempt.quiz_id)
            .where(
                CourseQuiz.course_id.in_({r.course_id for r in rows}),
                QuizAttempt.user_id.in_(users),
            )
            .group_by(CourseQuiz.course_id, QuizAttempt.user_id)
        )
    }
    return Page(
        items=[
            CertificateRead(
                course_id=r.course_id,
                course_title=titles.get(r.course_id, ""),
                user_id=r.user_id,
                user_name=names.get(r.user_id) or emails.get(r.user_id),
                best_score=best.get((r.course_id, r.user_id)),
                completed_at=r.completed_at,
                certificate_number=r.certificate_number,
            )
            for r in rows
        ],
        next_cursor=next_cursor,
    )


def overview(db: Session, user_id: UserId) -> CourseOverview:
    managed = select(Course.id).where(_managed_clause(db, user_id))
    courses = db.scalar(select(func.count()).select_from(Course).where(Course.id.in_(managed)))
    published = db.scalar(
        select(func.count())
        .select_from(Course)
        .where(Course.id.in_(managed), Course.status == PUBLISHED)
    )
    students = db.scalar(
        select(func.count(func.distinct(CourseEnrollment.user_id))).where(
            CourseEnrollment.course_id.in_(managed)
        )
    )
    quizzes = db.scalar(
        select(func.count()).select_from(CourseQuiz).where(CourseQuiz.course_id.in_(managed))
    )
    certificates = db.scalar(
        select(func.count())
        .select_from(CourseEnrollment)
        .where(
            CourseEnrollment.course_id.in_(managed),
            CourseEnrollment.completed_at.is_not(None),
        )
    )
    recent = list_attempts(db, user_id, limit=5).items
    return CourseOverview(
        courses=courses or 0,
        published=published or 0,
        students=students or 0,
        quizzes=quizzes or 0,
        certificates=certificates or 0,
        recent_attempts=recent,
    )


__all__ = [
    "add_lesson",
    "add_quiz",
    "complete_lesson",
    "create_course",
    "delete_course",
    "delete_lesson",
    "delete_quiz",
    "enroll",
    "get_course",
    "get_quiz",
    "list_attempts",
    "list_certificates",
    "list_courses",
    "my_attempts",
    "overview",
    "publish_course",
    "submit_attempt",
    "uncomplete_lesson",
    "unenroll",
    "unpublish_course",
    "update_course",
    "update_lesson",
    "update_quiz",
]


# Certificates


def new_certificate_number(db: Session, when: datetime) -> str:
    """A short, unguessable number such as CYC-2026-7K3QF9."""
    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    while True:
        code = "".join(secrets.choice(alphabet) for _ in range(6))
        number = f"CYC-{when.year}-{code}"
        exists = db.scalar(
            select(CourseEnrollment.id).where(CourseEnrollment.certificate_number == number)
        )
        if exists is None:
            return number


def my_certificates(db: Session, user_id: UserId) -> list[CertificateRead]:
    """The courses this person has finished, newest first."""
    rows = list(
        db.scalars(
            select(CourseEnrollment)
            .where(
                CourseEnrollment.user_id == user_id,
                CourseEnrollment.completed_at.is_not(None),
            )
            .order_by(CourseEnrollment.completed_at.desc())
        )
    )
    if not rows:
        return []
    changed = False
    for row in rows:
        if row.certificate_number is None:
            row.certificate_number = new_certificate_number(db, row.completed_at or _now())
            changed = True
    if changed:
        db.commit()
    titles = dict(
        db.execute(
            select(Course.id, Course.title).where(Course.id.in_({r.course_id for r in rows}))
        ).all()
    )
    name = _names(db, {user_id}).get(user_id)
    best = dict(
        db.execute(
            select(CourseQuiz.course_id, func.max(QuizAttempt.score))
            .join(CourseQuiz, CourseQuiz.id == QuizAttempt.quiz_id)
            .where(QuizAttempt.user_id == user_id)
            .group_by(CourseQuiz.course_id)
        ).all()
    )
    return [
        CertificateRead(
            course_id=r.course_id,
            course_title=titles.get(r.course_id, ""),
            user_id=user_id,
            user_name=name,
            best_score=best.get(r.course_id),
            completed_at=r.completed_at,
            certificate_number=r.certificate_number,
        )
        for r in rows
    ]


def verify_certificate(db: Session, number: str) -> CertificateVerification:
    """Public check of a certificate number. Shows only the name, course and date."""
    cleaned = number.strip().upper()
    row = db.scalar(
        select(CourseEnrollment).where(CourseEnrollment.certificate_number == cleaned)
    )
    if row is None or row.completed_at is None:
        return CertificateVerification(valid=False, certificate_number=cleaned)
    course = db.get(Course, row.course_id)
    return CertificateVerification(
        valid=True,
        certificate_number=cleaned,
        recipient_name=_names(db, {row.user_id}).get(row.user_id),
        course_title=course.title if course else None,
        completed_at=row.completed_at,
    )


def check_answer(
    db: Session, user_id: UserId, quiz_id: uuid.UUID, data: AnswerCheck
) -> AnswerResult:
    """Tell a learner whether one answer is right, with the explanation."""
    quiz = db.get(CourseQuiz, quiz_id)
    if quiz is None:
        raise QUIZ_NOT_FOUND
    try:
        _learning_course(db, user_id, quiz.course_id)
    except NotFound:
        raise QUIZ_NOT_FOUND from None
    if _enrollment(db, user_id, quiz.course_id) is None:
        raise NOT_ENROLLED
    questions = quiz.questions or []
    if data.question_index >= len(questions):
        raise InvalidInput("question_not_found", "That question isn't in this quiz.")
    question = questions[data.question_index]
    if data.answer >= len(question["options"]):
        raise InvalidInput("answer_out_of_range", "Pick one of the options.")
    return AnswerResult(
        correct=data.answer == question["correct_index"],
        correct_index=question["correct_index"],
        explanation=question.get("explanation"),
    )
