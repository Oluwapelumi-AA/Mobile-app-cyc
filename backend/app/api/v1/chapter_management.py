"""Chapter-scoped APIs: feed, staff, members, announcements, dashboard,
access requests and Guest content grants."""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Response, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user_id
from app.core.identity import UserId
from app.db.session import get_db
from app.models.chapter_access_request import (
    ChapterAccessRequestStatus as ModelRequestStatus,
)
from app.models.chapter_management import ChapterStaffRole
from app.schemas.chapter_access_grant import (
    ChapterAccessGrantCreate,
    ChapterAccessGrantRead,
)
from app.schemas.chapter_access_request import (
    ChapterAccessRequestRead,
    ChapterAccessRequestReview,
    ChapterAccessRequestStatus,
)
from app.schemas.chapter_management import (
    AnnouncementCreate,
    AnnouncementResult,
    ChapterDashboard,
    ChapterMemberRead,
    DepartmentMemberRead,
    MyStaffRoleRead,
    StaffAssign,
    StaffCreate,
    StaffRead,
)
from app.schemas.common import Page
from app.schemas.post import PostCreate, PostRead
from app.schemas.profile import ProfileRead, ProfileUpdate
from app.services import (
    chapter_access_grants as grant_service,
    chapter_access_requests as request_service,
    posts,
)
from app.services import chapter_management as service
from app.services.pagination import DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE

router = APIRouter(tags=["Chapter Management"])

CurrentUserId = Annotated[UserId, Depends(get_current_user_id)]
DbSession = Annotated[Session, Depends(get_db)]
Limit = Annotated[int, Query(ge=1, le=MAX_PAGE_SIZE)]
Cursor = Annotated[str | None, Query(max_length=200)]


# ---------------------------------------------------------------------------
# Feed
# ---------------------------------------------------------------------------


@router.post(
    "/chapters/{chapter_id}/posts",
    response_model=PostRead,
    status_code=status.HTTP_201_CREATED,
    tags=["Posts"],
)
def create_post(chapter_id: UUID, data: PostCreate, user_id: CurrentUserId, db: DbSession):
    """Members and staff post to their Chapter."""
    return posts.create_post(db, user_id, chapter_id, data)


@router.get("/chapters/{chapter_id}/posts", response_model=Page[PostRead], tags=["Posts"])
def chapter_feed(
    chapter_id: UUID,
    user_id: CurrentUserId,
    db: DbSession,
    limit: Limit = DEFAULT_PAGE_SIZE,
    cursor: Cursor = None,
):
    """The Chapter's posts, newest first. Guests see only posts granted to them."""
    items, next_cursor = posts.list_feed(db, user_id, chapter_id, limit, cursor)
    return Page(items=items, next_cursor=next_cursor)


# ---------------------------------------------------------------------------
# Staff: one Coordinator per Chapter
# ---------------------------------------------------------------------------


@router.get("/chapters/{chapter_id}/staff", response_model=list[StaffRead])
def chapter_staff(
    chapter_id: UUID,
    user_id: CurrentUserId,
    db: DbSession,
    role: ChapterStaffRole | None = None,
):
    """The Chapter's Coordinator."""
    return service.list_staff(db, user_id, chapter_id, role)


@router.put("/chapters/{chapter_id}/staff/{target_id}", response_model=StaffRead)
def assign_chapter_staff(
    chapter_id: UUID,
    target_id: UUID,
    data: StaffAssign,
    user_id: CurrentUserId,
    db: DbSession,
):
    """Make someone the Coordinator. Platform Admins only."""
    return service.assign_staff(db, user_id, chapter_id, target_id, data.role)


@router.delete(
    "/chapters/{chapter_id}/staff/{target_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def remove_chapter_staff(
    chapter_id: UUID, target_id: UUID, user_id: CurrentUserId, db: DbSession
):
    service.remove_staff(db, user_id, chapter_id, target_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


def _staff_routes(path: str, role: ChapterStaffRole) -> None:
    """GET/POST/DELETE shortcuts for one staff role."""

    @router.get(f"/chapters/{{chapter_id}}/{path}", response_model=list[StaffRead])
    def list_role(chapter_id: UUID, user_id: CurrentUserId, db: DbSession):
        return service.list_staff(db, user_id, chapter_id, role)

    @router.post(
        f"/chapters/{{chapter_id}}/{path}",
        response_model=StaffRead,
        status_code=status.HTTP_201_CREATED,
    )
    def add_role(chapter_id: UUID, data: StaffCreate, user_id: CurrentUserId, db: DbSession):
        return service.assign_staff(db, user_id, chapter_id, data.user_id, role)

    @router.delete(
        f"/chapters/{{chapter_id}}/{path}/{{target_id}}",
        status_code=status.HTTP_204_NO_CONTENT,
    )
    def remove_role(chapter_id: UUID, target_id: UUID, user_id: CurrentUserId, db: DbSession):
        service.remove_staff(db, user_id, chapter_id, target_id, role)
        return Response(status_code=status.HTTP_204_NO_CONTENT)

    list_role.__name__ = f"list_chapter_{path}"
    add_role.__name__ = f"add_chapter_{path}"
    remove_role.__name__ = f"remove_chapter_{path}"


_staff_routes("coordinators", ChapterStaffRole.COORDINATOR)


@router.get("/me/chapter-staff", response_model=list[MyStaffRoleRead])
def my_staff_roles(user_id: CurrentUserId, db: DbSession):
    """The Chapters you coordinate."""
    return service.list_my_staff_roles(db, user_id)


# ---------------------------------------------------------------------------
# Members
# ---------------------------------------------------------------------------


@router.get("/chapters/{chapter_id}/members", response_model=list[ChapterMemberRead])
def chapter_members(chapter_id: UUID, user_id: CurrentUserId, db: DbSession):
    """Official Members, for the Chapter's staff and platform staff."""
    return service.list_members(db, user_id, chapter_id)


@router.delete(
    "/chapters/{chapter_id}/members/{target_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def remove_chapter_member(
    chapter_id: UUID, target_id: UUID, user_id: CurrentUserId, db: DbSession
):
    """Take someone out of the Chapter; they become a Guest. Platform Admins only."""
    service.remove_member(db, user_id, chapter_id, target_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get(
    "/chapters/{chapter_id}/department-members",
    response_model=list[DepartmentMemberRead],
)
def chapter_department_members(chapter_id: UUID, user_id: CurrentUserId, db: DbSession):
    return service.list_chapter_department_members(db, user_id, chapter_id)


@router.patch(
    "/chapters/{chapter_id}/members/{target_id}/profile",
    response_model=ProfileRead,
)
def edit_chapter_member_profile(
    chapter_id: UUID,
    target_id: UUID,
    data: ProfileUpdate,
    user_id: CurrentUserId,
    db: DbSession,
):
    return service.update_member_profile(db, user_id, chapter_id, target_id, data)


# ---------------------------------------------------------------------------
# Announcements and dashboard
# ---------------------------------------------------------------------------


@router.post(
    "/chapters/{chapter_id}/announcements",
    response_model=AnnouncementResult,
    status_code=status.HTTP_202_ACCEPTED,
)
def send_announcement(
    chapter_id: UUID,
    data: AnnouncementCreate,
    user_id: CurrentUserId,
    db: DbSession,
):
    """Notify every Member of the Chapter. Its Coordinator and platform Admins."""
    return service.send_announcement(db, user_id, chapter_id, data)


@router.get("/chapters/{chapter_id}/dashboard", response_model=ChapterDashboard)
def chapter_dashboard(chapter_id: UUID, user_id: CurrentUserId, db: DbSession):
    """Summary numbers for the Chapter's staff and platform staff."""
    return service.chapter_dashboard(db, user_id, chapter_id)


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
