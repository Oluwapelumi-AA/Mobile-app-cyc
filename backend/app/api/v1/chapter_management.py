
"""Chapter-scoped coordinator, department, and access APIs."""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Response, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user_id
from app.core.identity import UserId
from app.db.session import get_db
from app.models.chapter_access_request import (
    ChapterAccessRequestStatus as ModelRequestStatus,
)
from app.schemas.chapter_access_grant import (
    ChapterAccessGrantCreate,
    ChapterAccessGrantRead,
)
from app.schemas.chapter_access_request import (
    ChapterAccessRequestRead,
    ChapterAccessRequestReview,
    ChapterAccessRequestStatus,
)
from app.schemas.chapter_content import (
    ChapterBroadcastCreate,
    ChapterCommentCreate,
    ChapterCommentRead,
    ChapterPostCreate,
    ChapterPostRead,
)
from app.schemas.chapter_management import (
    ChapterMemberRead,
    CoordinatorCreate,
    CoordinatorRead,
    DepartmentCreate,
    DepartmentMemberRead,
    DepartmentRead,
    DepartmentUpdate,
)
from app.schemas.profile import ProfileRead, ProfileUpdate
from app.services import (
    chapter_access_grants as grant_service,
    chapter_access_requests as request_service,
)
from app.services import chapter_management as service

router = APIRouter(tags=["Chapter Management"])

CurrentUserId = Annotated[UserId, Depends(get_current_user_id)]
DbSession = Annotated[Session, Depends(get_db)]


@router.get(
    "/branches/{branch_id}/coordinators",
    response_model=list[CoordinatorRead],
)
def coordinators(branch_id: UUID, user_id: CurrentUserId, db: DbSession):
    return service.list_coordinators(db, user_id, branch_id)


@router.post(
    "/branches/{branch_id}/coordinators",
    response_model=CoordinatorRead,
    status_code=status.HTTP_201_CREATED,
)
def add_coordinator(
    branch_id: UUID,
    data: CoordinatorCreate,
    user_id: CurrentUserId,
    db: DbSession,
):
    return service.assign_coordinator(db, user_id, branch_id, data)


@router.delete(
    "/branches/{branch_id}/coordinators/{target_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def remove_coordinator(
    branch_id: UUID,
    target_id: UUID,
    user_id: CurrentUserId,
    db: DbSession,
):
    service.remove_coordinator(db, user_id, branch_id, target_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get(
    "/branches/{branch_id}/members",
    response_model=list[ChapterMemberRead],
)
def chapter_members(branch_id: UUID, user_id: CurrentUserId, db: DbSession):
    return service.list_members(db, user_id, branch_id)


@router.get("/departments", response_model=list[DepartmentRead])
def departments(user_id: CurrentUserId, db: DbSession):
    return service.list_departments(db, user_id)


@router.post(
    "/departments",
    response_model=DepartmentRead,
    status_code=status.HTTP_201_CREATED,
)
def add_department(
    data: DepartmentCreate,
    user_id: CurrentUserId,
    db: DbSession,
):
    return service.create_department(db, user_id, data)


@router.patch(
    "/departments/{department_id}",
    response_model=DepartmentRead,
)
def edit_department(
    department_id: UUID,
    data: DepartmentUpdate,
    user_id: CurrentUserId,
    db: DbSession,
):
    return service.update_department(db, user_id, department_id, data)


@router.delete(
    "/departments/{department_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def remove_department(
    department_id: UUID,
    user_id: CurrentUserId,
    db: DbSession,
):
    service.delete_department(db, user_id, department_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get(
    "/branches/{branch_id}/department-members",
    response_model=list[DepartmentMemberRead],
)
def chapter_department_members(
    branch_id: UUID,
    user_id: CurrentUserId,
    db: DbSession,
):
    return service.list_chapter_department_members(db, user_id, branch_id)


# Backward-compatible chapter URL aliases. Department records are global;
# the chapter ID is validated but never stored on the department.
@router.get(
    "/branches/{branch_id}/departments",
    response_model=list[DepartmentRead],
    include_in_schema=False,
)
def legacy_departments(
    branch_id: UUID,
    user_id: CurrentUserId,
    db: DbSession,
):
    from app.models.branch import Branch
    from app.services.errors import NotFound

    if db.get(Branch, branch_id) is None:
        raise NotFound("branch_not_found", "Chapter not found.")

    return service.list_departments(db, user_id)


@router.post(
    "/branches/{branch_id}/departments",
    response_model=DepartmentRead,
    status_code=status.HTTP_201_CREATED,
    include_in_schema=False,
)
def legacy_add_department(
    branch_id: UUID,
    data: DepartmentCreate,
    user_id: CurrentUserId,
    db: DbSession,
):
    from app.models.branch import Branch
    from app.services.errors import NotFound

    if db.get(Branch, branch_id) is None:
        raise NotFound("branch_not_found", "Chapter not found.")

    return service.create_department(db, user_id, data)


@router.patch(
    "/branches/{branch_id}/departments/{department_id}",
    response_model=DepartmentRead,
    include_in_schema=False,
)
def legacy_edit_department(
    branch_id: UUID,
    department_id: UUID,
    data: DepartmentUpdate,
    user_id: CurrentUserId,
    db: DbSession,
):
    from app.models.branch import Branch
    from app.services.errors import NotFound

    if db.get(Branch, branch_id) is None:
        raise NotFound("branch_not_found", "Chapter not found.")

    return service.update_department(db, user_id, department_id, data)


@router.delete(
    "/branches/{branch_id}/departments/{department_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    include_in_schema=False,
)
def legacy_remove_department(
    branch_id: UUID,
    department_id: UUID,
    user_id: CurrentUserId,
    db: DbSession,
):
    from app.models.branch import Branch
    from app.services.errors import NotFound

    if db.get(Branch, branch_id) is None:
        raise NotFound("branch_not_found", "Chapter not found.")

    service.delete_department(db, user_id, department_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.patch(
    "/branches/{branch_id}/members/{target_id}/profile",
    response_model=ProfileRead,
)
def edit_chapter_member_profile(
    branch_id: UUID,
    target_id: UUID,
    data: ProfileUpdate,
    user_id: CurrentUserId,
    db: DbSession,
):
    return service.update_member_profile(
        db,
        user_id,
        branch_id,
        target_id,
        data,
    )


@router.get(
    "/branches/{branch_id}/posts",
    response_model=list[ChapterPostRead],
)
def chapter_posts(branch_id: UUID, user_id: CurrentUserId, db: DbSession):
    return service.list_chapter_posts(db, user_id, branch_id)


@router.post(
    "/branches/{branch_id}/posts",
    response_model=ChapterPostRead,
    status_code=status.HTTP_201_CREATED,
)
def add_chapter_post(
    branch_id: UUID,
    data: ChapterPostCreate,
    user_id: CurrentUserId,
    db: DbSession,
):
    return service.create_chapter_post(db, user_id, branch_id, data)


@router.delete(
    "/branches/{branch_id}/posts/{post_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def moderate_chapter_post(
    branch_id: UUID,
    post_id: UUID,
    user_id: CurrentUserId,
    db: DbSession,
):
    from app.services.errors import NotFound

    post = service._chapter_post(db, post_id)

    if post.branch_id != branch_id:
        raise NotFound("chapter_post_not_found", "Chapter post not found.")

    service.delete_chapter_post(db, user_id, post_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get(
    "/chapter-posts/{post_id}/comments",
    response_model=list[ChapterCommentRead],
)
def chapter_post_comments(
    post_id: UUID,
    user_id: CurrentUserId,
    db: DbSession,
):
    return service.list_chapter_comments(db, user_id, post_id)


@router.post(
    "/chapter-posts/{post_id}/comments",
    response_model=ChapterCommentRead,
    status_code=status.HTTP_201_CREATED,
)
def add_chapter_post_comment(
    post_id: UUID,
    data: ChapterCommentCreate,
    user_id: CurrentUserId,
    db: DbSession,
):
    return service.create_chapter_comment(db, user_id, post_id, data)


@router.delete(
    "/branches/{branch_id}/posts/{post_id}/comments/{comment_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def moderate_chapter_comment(
    branch_id: UUID,
    post_id: UUID,
    comment_id: UUID,
    user_id: CurrentUserId,
    db: DbSession,
):
    from app.services.errors import NotFound

    post = service._chapter_post(db, post_id)

    if post.branch_id != branch_id:
        raise NotFound("chapter_post_not_found", "Chapter post not found.")

    service.delete_chapter_comment(db, user_id, post_id, comment_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post(
    "/branches/{branch_id}/push-notifications",
    status_code=status.HTTP_202_ACCEPTED,
)
def broadcast_chapter_notification(
    branch_id: UUID,
    data: ChapterBroadcastCreate,
    user_id: CurrentUserId,
    db: DbSession,
):
    return service.broadcast_chapter_push(db, user_id, branch_id, data)


@router.get("/branches/{branch_id}/dashboard")
def chapter_dashboard(
    branch_id: UUID,
    user_id: CurrentUserId,
    db: DbSession,
):
    """Summary data for a coordinator's independent Chapter dashboard."""
    return service.chapter_dashboard(db, user_id, branch_id)


@router.get("/chapter-coordinator/me")
def my_coordinator_assignments(user_id: CurrentUserId, db: DbSession):
    """Return the authenticated user's own coordinator assignments."""
    return service.list_my_coordinator_assignments(db, user_id)


# ---------------------------------------------------------------------------
# Chapter access requests
# ---------------------------------------------------------------------------

@router.post(
    "/chapters/{chapter_id}/access-requests",
    response_model=ChapterAccessRequestRead,
    status_code=status.HTTP_201_CREATED,
)
def submit_chapter_access_request(
    chapter_id: UUID,
    user_id: CurrentUserId,
    db: DbSession,
):
    return request_service.create_access_request(
        db,
        user_id,
        chapter_id,
    )


@router.get(
    "/me/chapter-access-requests",
    response_model=list[ChapterAccessRequestRead],
)
def my_chapter_access_requests(
    user_id: CurrentUserId,
    db: DbSession,
):
    return request_service.list_my_access_requests(db, user_id)


@router.get(
    "/chapters/{chapter_id}/access-requests",
    response_model=list[ChapterAccessRequestRead],
)
def chapter_access_requests(
    chapter_id: UUID,
    user_id: CurrentUserId,
    db: DbSession,
    request_status: ChapterAccessRequestStatus | None = None,
):
    model_status = (
        ModelRequestStatus(request_status.value)
        if request_status is not None
        else None
    )

    return request_service.list_chapter_access_requests(
        db,
        user_id,
        chapter_id,
        model_status,
    )


@router.post(
    "/chapter-access-requests/{request_id}/review",
    response_model=ChapterAccessRequestRead,
)
def review_chapter_access_request(
    request_id: UUID,
    data: ChapterAccessRequestReview,
    user_id: CurrentUserId,
    db: DbSession,
):
    return request_service.review_access_request(
        db,
        user_id,
        request_id,
        ModelRequestStatus(data.status.value),
    )


@router.post(
    "/chapter-access-requests/{request_id}/cancel",
    response_model=ChapterAccessRequestRead,
)
def cancel_chapter_access_request(
    request_id: UUID,
    user_id: CurrentUserId,
    db: DbSession,
):
    return request_service.cancel_access_request(
        db,
        user_id,
        request_id,
    )


# ---------------------------------------------------------------------------
# Selective Chapter content access grants
# ---------------------------------------------------------------------------

@router.post(
    "/chapters/{chapter_id}/access-grants",
    response_model=ChapterAccessGrantRead,
    status_code=status.HTTP_201_CREATED,
)
def grant_chapter_content_access(
    chapter_id: UUID,
    data: ChapterAccessGrantCreate,
    user_id: CurrentUserId,
    db: DbSession,
):
    """Grant selected Chapter content to an approved Guest."""
    return grant_service.grant_chapter_content(
        db,
        user_id,
        chapter_id,
        data,
    )


@router.get(
    "/chapters/{chapter_id}/access-grants",
    response_model=list[ChapterAccessGrantRead],
)
def chapter_content_access_grants(
    chapter_id: UUID,
    user_id: CurrentUserId,
    db: DbSession,
):
    """List Guest content grants for a Chapter."""
    return grant_service.list_guest_chapter_grants(
        db,
        user_id,
        chapter_id,
    )


@router.get(
    "/me/chapter-access-grants",
    response_model=list[ChapterAccessGrantRead],
)
def my_chapter_content_access_grants(
    user_id: CurrentUserId,
    db: DbSession,
):
    """List the authenticated Guest's selective Chapter content grants."""
    return grant_service.list_my_chapter_grants(
        db,
        user_id,
    )
