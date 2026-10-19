"""Reports, the moderation queue and community bans.

Reports

- Any signed-in user can report a post, comment, event, resource, community
  or user they can see. Nobody reports themselves or their own content.
- One report per person per thing. Reporting it again while open is a
  conflict; after review it reopens the same report.
- The report keeps a snapshot of what was reported, so moderators see it as
  it was even after an edit or delete.
- Reports about things inside a community go to that community's moderators
  and above. Reports about users, communities themselves and app-wide events
  and resources go to app moderators and admins, who also see everything.
- Reviewing closes every open report about the same thing, as ``actioned``
  or ``dismissed``. Moderators can remove a reported post or comment as part
  of that; the author is told. Nobody reviews reports about their own content
  unless they are app staff.
- Reporters only see their own reports and whether they were reviewed, not
  who reviewed them or what was decided.

Bans

- Community moderators and above (and app moderators) ban people from a
  community: they are removed and can't join again until unbanned. The same
  rank rules as removing a member apply, and owners can't be banned.

Every review and ban goes in the audit log.
"""

import uuid
from datetime import UTC, datetime

from sqlalchemy import func, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.identity import UserId
from app.models.community import CommunityMembership, CommunityRole
from app.models.event import Event
from app.models.moderation import (
    CommunityBan,
    ContentReport,
    ReportStatus,
    ReportTarget,
)
from app.models.post import Comment, Post
from app.models.resource import Resource
from app.models.community import Community
from app.models.user import User
from app.models.user_profile import UserProfile
from app.schemas.moderation import (
    BanCreate,
    BanRead,
    MyReportRead,
    ReportCreate,
    ReportRead,
    ReportResolve,
)
from app.services import audit, events, notifications, pagination, posts, resources
from app.services.communities import (
    get_membership,
    get_visible_community,
    is_platform_moderator,
    rank,
    require_role,
)
from app.services.errors import Conflict, Forbidden, InvalidInput, NotFound

REPORT_NOT_FOUND = NotFound("report_not_found", "Report not found.")
USER_NOT_FOUND = NotFound("user_not_found", "User not found.")
BAN_NOT_FOUND = NotFound("ban_not_found", "That user is not banned from this community.")

MODERATOR_ROLES = [
    role.value for role in CommunityRole if rank(role) >= rank(CommunityRole.MODERATOR)
]

# Where each kind of target lives, for "does it still exist?".
TARGET_MODELS = {
    ReportTarget.POST: Post,
    ReportTarget.COMMENT: Comment,
    ReportTarget.USER: User,
    ReportTarget.COMMUNITY: Community,
    ReportTarget.EVENT: Event,
    ReportTarget.RESOURCE: Resource,
}


def _now() -> datetime:
    return datetime.now(UTC)


# What is being reported


def _target_context(
    db: Session, user_id: UserId, target_type: ReportTarget, target_id: uuid.UUID
) -> tuple[UserId | None, uuid.UUID | None, dict]:
    """(owner, reviewing community, snapshot) for something the user can see.

    Raises the target's own 404 when it is missing or hidden from them.
    """
    if target_type == ReportTarget.POST:
        post, _ = posts.visible_post(db, user_id, target_id)
        return post.author_id, post.community_id, {"body": post.body}
    if target_type == ReportTarget.COMMENT:
        comment, _ = posts.visible_comment(db, user_id, target_id)
        community_id = db.scalar(select(Post.community_id).where(Post.id == comment.post_id))
        return (
            comment.author_id,
            community_id,
            {"body": comment.body, "post_id": str(comment.post_id)},
        )
    if target_type == ReportTarget.EVENT:
        event, _ = events.visible_event(db, user_id, target_id)
        return (
            event.created_by,
            event.community_id,
            {"title": event.title, "description": event.description, "location": event.location},
        )
    if target_type == ReportTarget.RESOURCE:
        resource = resources.visible_resource(db, user_id, target_id)
        return (
            resource.created_by,
            resource.community_id,
            {"title": resource.title, "summary": resource.summary},
        )
    if target_type == ReportTarget.COMMUNITY:
        community, _ = get_visible_community(db, target_id, user_id)
        # Reports about a community go to app staff, not its own moderators.
        return (
            community.created_by,
            None,
            {"name": community.name, "description": community.description},
        )
    user = db.get(User, target_id)
    if user is None:
        raise USER_NOT_FOUND
    profile = db.get(UserProfile, target_id)
    return (
        user.id,
        None,
        {
            "display_name": profile.display_name if profile else None,
            "bio": profile.bio if profile else None,
            "avatar_url": profile.avatar_url if profile else None,
        },
    )


def _my_report_read(report: ContentReport) -> MyReportRead:
    return MyReportRead.model_validate(report, from_attributes=True)


def create_report(db: Session, user_id: UserId, data: ReportCreate) -> MyReportRead:
    owner_id, community_id, snapshot = _target_context(
        db, user_id, data.target_type, data.target_id
    )
    if owner_id == user_id:
        raise InvalidInput("cannot_report_self", "You can't report yourself or your own content.")
    report = db.scalar(
        select(ContentReport).where(
            ContentReport.reporter_id == user_id,
            ContentReport.target_type == data.target_type.value,
            ContentReport.target_id == data.target_id,
        )
    )
    if report is not None and report.status == ReportStatus.OPEN.value:
        raise Conflict("already_reported", "You already reported this. Moderators will review it.")
    if report is None:
        report = ContentReport(
            reporter_id=user_id,
            target_type=data.target_type.value,
            target_id=data.target_id,
        )
        db.add(report)
    report.target_owner_id = owner_id
    report.community_id = community_id
    report.reason = data.reason.value
    report.details = data.details
    report.snapshot = snapshot
    report.status = ReportStatus.OPEN.value
    report.reviewed_by = None
    report.reviewed_at = None
    report.resolution_note = None
    report.content_removed = False
    report.created_at = _now()
    try:
        db.commit()
    except IntegrityError:
        # The same person reported it twice at once.
        db.rollback()
        raise Conflict(
            "already_reported", "You already reported this. Moderators will review it."
        ) from None
    db.refresh(report)
    return _my_report_read(report)


def list_my_reports(
    db: Session, user_id: UserId, limit: int, cursor: str | None
) -> tuple[list[MyReportRead], str | None]:
    """The user's own reports, newest first."""
    statement = select(ContentReport).where(ContentReport.reporter_id == user_id)
    if cursor:
        statement = statement.where(
            pagination.after_cursor(
                ContentReport.created_at, ContentReport.id, cursor, newest_first=True
            )
        )
    statement = statement.order_by(
        *pagination.order_by(ContentReport.created_at, ContentReport.id, newest_first=True)
    ).limit(limit + 1)
    rows, next_cursor = pagination.split_page(list(db.scalars(statement)), limit)
    return [_my_report_read(row) for row in rows], next_cursor


# The moderation queue


def _moderated_communities(db: Session, user_id: UserId):
    return select(CommunityMembership.community_id).where(
        CommunityMembership.user_id == user_id,
        CommunityMembership.role.in_(MODERATOR_ROLES),
    )


def _can_review(db: Session, user_id: UserId, report: ContentReport) -> bool:
    if is_platform_moderator(db, user_id):
        return True
    if report.community_id is None:
        return False
    membership = get_membership(db, report.community_id, user_id)
    return rank(membership.role if membership else None) >= rank(CommunityRole.MODERATOR)


def _reviewable_report(db: Session, user_id: UserId, report_id: uuid.UUID) -> ContentReport:
    report = db.get(ContentReport, report_id)
    # Reports someone can't review look the same as missing ones.
    if report is None or not _can_review(db, user_id, report):
        raise REPORT_NOT_FOUND
    return report


def _open_counts(db: Session, rows: list[ContentReport]) -> dict[tuple[str, uuid.UUID], int]:
    targets = {(row.target_type, row.target_id) for row in rows}
    if not targets:
        return {}
    counts = db.execute(
        select(ContentReport.target_type, ContentReport.target_id, func.count())
        .where(
            ContentReport.status == ReportStatus.OPEN.value,
            ContentReport.target_id.in_([target_id for _, target_id in targets]),
        )
        .group_by(ContentReport.target_type, ContentReport.target_id)
    )
    return {(target_type, target_id): count for target_type, target_id, count in counts}


def _existing_targets(db: Session, rows: list[ContentReport]) -> set[tuple[str, uuid.UUID]]:
    found: set[tuple[str, uuid.UUID]] = set()
    by_type: dict[str, set[uuid.UUID]] = {}
    for row in rows:
        by_type.setdefault(row.target_type, set()).add(row.target_id)
    for target_type, ids in by_type.items():
        model = TARGET_MODELS[ReportTarget(target_type)]
        for target_id in db.scalars(select(model.id).where(model.id.in_(ids))):
            found.add((target_type, target_id))
    return found


def _report_reads(db: Session, rows: list[ContentReport]) -> list[ReportRead]:
    counts = _open_counts(db, rows)
    existing = _existing_targets(db, rows)
    return [
        ReportRead.model_validate(
            {
                **MyReportRead.model_validate(row, from_attributes=True).model_dump(),
                "reporter_id": row.reporter_id,
                "target_owner_id": row.target_owner_id,
                "community_id": row.community_id,
                "snapshot": row.snapshot or {},
                "target_exists": (row.target_type, row.target_id) in existing,
                "open_reports_on_target": counts.get((row.target_type, row.target_id), 0),
                "reviewed_by": row.reviewed_by,
                "resolution_note": row.resolution_note,
                "content_removed": row.content_removed,
                "updated_at": row.updated_at,
            }
        )
        for row in rows
    ]


def list_reports(
    db: Session,
    user_id: UserId,
    limit: int,
    cursor: str | None,
    *,
    status: ReportStatus | None = ReportStatus.OPEN,
    target_type: ReportTarget | None = None,
    community_id: uuid.UUID | None = None,
    app_wide: bool = False,
) -> tuple[list[ReportRead], str | None]:
    """Reports the user can review.

    Open reports come oldest first, like a queue; reviewed ones newest first.
    ``app_wide`` (app staff only) lists only reports with no community.
    """
    platform_moderator = is_platform_moderator(db, user_id)
    statement = select(ContentReport)
    if community_id is not None:
        if not platform_moderator:
            _, membership = get_visible_community(db, community_id, user_id)
            require_role(membership, CommunityRole.MODERATOR)
        statement = statement.where(ContentReport.community_id == community_id)
    elif app_wide:
        if not platform_moderator:
            raise Forbidden(
                "insufficient_role", "Only app moderators and admins review app-wide reports."
            )
        statement = statement.where(ContentReport.community_id.is_(None))
    elif not platform_moderator:
        statement = statement.where(
            ContentReport.community_id.in_(_moderated_communities(db, user_id))
        )
    if status is not None:
        statement = statement.where(ContentReport.status == status.value)
    if target_type is not None:
        statement = statement.where(ContentReport.target_type == target_type.value)

    newest_first = status != ReportStatus.OPEN
    if cursor:
        statement = statement.where(
            pagination.after_cursor(
                ContentReport.created_at, ContentReport.id, cursor, newest_first=newest_first
            )
        )
    statement = statement.order_by(
        *pagination.order_by(ContentReport.created_at, ContentReport.id, newest_first=newest_first)
    ).limit(limit + 1)
    rows, next_cursor = pagination.split_page(list(db.scalars(statement)), limit)
    return _report_reads(db, rows), next_cursor


def get_report(db: Session, user_id: UserId, report_id: uuid.UUID) -> ReportRead:
    return _report_reads(db, [_reviewable_report(db, user_id, report_id)])[0]


def _remove_target(db: Session, user_id: UserId, report: ContentReport, note: str | None) -> bool:
    """Delete the reported post or comment. False if it was already gone."""
    extra = {"report_id": report.id, "reason": report.reason, "note": note}
    if report.target_type == ReportTarget.POST.value:
        post = db.get(Post, report.target_id)
        if post is None:
            return False
        posts.remove_post(db, user_id, post, **extra)
        return True
    if report.target_type == ReportTarget.COMMENT.value:
        comment = db.get(Comment, report.target_id)
        if comment is None:
            return False
        posts.remove_comment(db, user_id, comment, **extra)
        return True
    raise InvalidInput(
        "cannot_remove_content",
        "Only posts and comments can be removed from a report. Use the "
        "event, resource, community or user tools for the rest.",
    )


def resolve_report(
    db: Session, user_id: UserId, report_id: uuid.UUID, data: ReportResolve
) -> ReportRead:
    report = _reviewable_report(db, user_id, report_id)
    if report.status != ReportStatus.OPEN.value:
        raise Conflict("report_closed", "This report was already reviewed.")
    if report.target_owner_id == user_id and not is_platform_moderator(db, user_id):
        raise Forbidden(
            "cannot_review_own", "Someone else has to review reports about your content."
        )
    removed = data.remove_content and _remove_target(db, user_id, report, data.note)

    same_target = list(
        db.scalars(
            select(ContentReport.id).where(
                ContentReport.target_type == report.target_type,
                ContentReport.target_id == report.target_id,
                ContentReport.status == ReportStatus.OPEN.value,
            )
        )
    )
    now = _now()
    db.execute(
        update(ContentReport)
        .where(ContentReport.id.in_(same_target))
        .values(
            status=data.status.value,
            reviewed_by=user_id,
            reviewed_at=now,
            resolution_note=data.note,
            content_removed=removed,
            updated_at=now,
        )
    )
    audit.record(
        db,
        user_id,
        f"report.{data.status.value}",
        report.target_type,
        report.target_id,
        community_id=report.community_id,
        data={
            "report_ids": [str(report_id) for report_id in same_target],
            "note": data.note,
            "content_removed": removed,
        },
    )
    db.commit()
    db.refresh(report)
    return _report_reads(db, [report])[0]


# Community bans


def _require_ban_rights(
    db: Session, user_id: UserId, community_id: uuid.UUID
) -> CommunityMembership | None:
    """The actor's membership, if they may ban in this community."""
    _, membership = get_visible_community(db, community_id, user_id)
    if is_platform_moderator(db, user_id):
        return membership
    return require_role(membership, CommunityRole.MODERATOR)


def ban_member(
    db: Session,
    user_id: UserId,
    community_id: uuid.UUID,
    target_user_id: UserId,
    data: BanCreate,
) -> BanRead:
    actor = _require_ban_rights(db, user_id, community_id)
    if target_user_id == user_id:
        raise InvalidInput("cannot_ban_self", "You can't ban yourself.")
    if db.get(User, target_user_id) is None:
        raise USER_NOT_FOUND
    target = get_membership(db, community_id, target_user_id)
    if target is not None:
        if target.role == CommunityRole.OWNER.value:
            raise Forbidden("cannot_ban_owner", "Owners can't be banned.")
        if (
            actor is not None
            and actor.role != CommunityRole.OWNER.value
            and rank(actor.role) <= rank(target.role)
            and not is_platform_moderator(db, user_id)
        ):
            raise Forbidden("insufficient_role", "You can only ban members ranked below you.")
    existing = db.scalar(
        select(CommunityBan).where(
            CommunityBan.community_id == community_id,
            CommunityBan.user_id == target_user_id,
        )
    )
    if existing is not None:
        raise Conflict("already_banned", "That user is already banned from this community.")

    if target is not None:
        db.delete(target)
    ban = CommunityBan(
        community_id=community_id,
        user_id=target_user_id,
        banned_by=user_id,
        reason=data.reason,
    )
    db.add(ban)
    audit.record(
        db,
        user_id,
        "member.banned",
        "user",
        target_user_id,
        community_id=community_id,
        data={"reason": data.reason, "role": target.role if target else None},
    )
    notifications.member_banned(db, community_id, target_user_id, user_id)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise Conflict(
            "already_banned", "That user is already banned from this community."
        ) from None
    db.refresh(ban)
    return BanRead.model_validate(ban)


def unban_member(
    db: Session, user_id: UserId, community_id: uuid.UUID, target_user_id: UserId
) -> None:
    _require_ban_rights(db, user_id, community_id)
    ban = db.scalar(
        select(CommunityBan).where(
            CommunityBan.community_id == community_id,
            CommunityBan.user_id == target_user_id,
        )
    )
    if ban is None:
        raise BAN_NOT_FOUND
    audit.record(
        db,
        user_id,
        "member.unbanned",
        "user",
        target_user_id,
        community_id=community_id,
        data={"banned_at": ban.created_at, "reason": ban.reason},
    )
    db.delete(ban)
    db.commit()


def list_bans(
    db: Session, user_id: UserId, community_id: uuid.UUID, limit: int, cursor: str | None
) -> tuple[list[BanRead], str | None]:
    """A community's bans, newest first."""
    _require_ban_rights(db, user_id, community_id)
    statement = select(CommunityBan).where(CommunityBan.community_id == community_id)
    if cursor:
        statement = statement.where(
            pagination.after_cursor(
                CommunityBan.created_at, CommunityBan.id, cursor, newest_first=True
            )
        )
    statement = statement.order_by(
        *pagination.order_by(CommunityBan.created_at, CommunityBan.id, newest_first=True)
    ).limit(limit + 1)
    rows, next_cursor = pagination.split_page(list(db.scalars(statement)), limit)
    return [BanRead.model_validate(row) for row in rows], next_cursor
