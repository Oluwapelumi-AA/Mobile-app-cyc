"""CYC branches (local chapters) and members' home branch.

- Everyone signed in can list and read branches. Archived ones are listed
  only for app staff (``include_archived``), and stay readable by id so old
  links keep working.
- Only app admins create, edit, archive and restore branches. Archiving
  keeps the branch on the profiles and communities that already have it, but
  nobody can pick it any more.
- A member picks one home branch (it needs a profile), and can leave it.
"""

import uuid

from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.identity import UserId
from app.models.branch import Branch
from app.models.community import Community
from app.models.user import AccountRole, User
from app.models.user_profile import UserProfile
from app.schemas.branch import BranchCreate, BranchRead, BranchUpdate
from app.services import audit
from app.services.communities import BRANCH_NOT_FOUND, check_branch, is_platform_moderator
from app.services.errors import Conflict, Forbidden, InvalidInput, NotFound
from app.services.resources import slugify

BRANCH_EXISTS = Conflict("branch_exists", "A branch with this slug already exists.")
PROFILE_NOT_FOUND = NotFound("profile_not_found", "Create a profile first.")

_NULLABLE = {"description", "city", "language_code", "contact_email"}


def _escape_like(value: str) -> str:
    return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def _require_admin(db: Session, user_id: UserId) -> None:
    role = db.scalar(select(User.account_role).where(User.id == user_id))
    if role != AccountRole.ADMIN:
        raise Forbidden("admin_only", "Only app admins manage branches.")


def _counts(db: Session, column, ids: list[uuid.UUID]) -> dict[uuid.UUID, int]:
    if not ids:
        return {}
    rows = db.execute(select(column, func.count()).where(column.in_(ids)).group_by(column))
    return dict(rows.all())


def _my_branch(db: Session, user_id: UserId) -> uuid.UUID | None:
    return db.scalar(select(UserProfile.branch_id).where(UserProfile.user_id == user_id))


def _reads(db: Session, user_id: UserId, rows: list[Branch]) -> list[BranchRead]:
    ids = [row.id for row in rows]
    members = _counts(db, UserProfile.branch_id, ids)
    communities = _counts(db, Community.branch_id, ids)
    mine = _my_branch(db, user_id)
    return [
        BranchRead.model_validate(
            {
                "id": row.id,
                "slug": row.slug,
                "name": row.name,
                "description": row.description,
                "country_code": row.country_code,
                "city": row.city,
                "timezone": row.timezone,
                "language_code": row.language_code,
                "contact_email": row.contact_email,
                "is_active": row.is_active,
                "member_count": members.get(row.id, 0),
                "community_count": communities.get(row.id, 0),
                "is_mine": row.id == mine,
                "created_at": row.created_at,
                "updated_at": row.updated_at,
            }
        )
        for row in rows
    ]


def _get(db: Session, branch_id: uuid.UUID) -> Branch:
    branch = db.get(Branch, branch_id)
    if branch is None:
        raise BRANCH_NOT_FOUND
    return branch


def list_branches(
    db: Session,
    user_id: UserId,
    *,
    q: str | None = None,
    country_code: str | None = None,
    include_archived: bool = False,
) -> list[BranchRead]:
    """Branches by country, then name. There are few enough to send at once."""
    statement = select(Branch)
    if include_archived:
        if not is_platform_moderator(db, user_id):
            raise Forbidden(
                "insufficient_role", "Only app moderators and admins see archived branches."
            )
    else:
        statement = statement.where(Branch.is_active.is_(True))
    if country_code:
        statement = statement.where(Branch.country_code == country_code.upper())
    if q:
        pattern = f"%{_escape_like(q)}%"
        statement = statement.where(
            or_(
                Branch.name.ilike(pattern, escape="\\"),
                Branch.city.ilike(pattern, escape="\\"),
            )
        )
    statement = statement.order_by(Branch.country_code, Branch.name, Branch.id)
    return _reads(db, user_id, list(db.scalars(statement)))


def get_branch(db: Session, user_id: UserId, branch_id: uuid.UUID) -> BranchRead:
    return _reads(db, user_id, [_get(db, branch_id)])[0]


def _check_slug_free(db: Session, slug: str, branch_id: uuid.UUID | None = None) -> None:
    existing = db.scalar(select(Branch.id).where(Branch.slug == slug))
    if existing is not None and existing != branch_id:
        raise BRANCH_EXISTS


def _commit(db: Session, user_id: UserId, branch: Branch) -> BranchRead:
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise BRANCH_EXISTS from None
    db.refresh(branch)
    return get_branch(db, user_id, branch.id)


def create_branch(db: Session, user_id: UserId, data: BranchCreate) -> BranchRead:
    _require_admin(db, user_id)
    slug = data.slug or slugify(data.name)
    if len(slug) < 2:
        raise InvalidInput("slug_required", "Send a slug made of letters, numbers and dashes.")
    _check_slug_free(db, slug)
    fields = data.model_dump(exclude={"slug"})
    for name in _NULLABLE:
        fields[name] = fields[name] or None
    branch = Branch(id=uuid.uuid4(), slug=slug, **fields)
    db.add(branch)
    audit.record(
        db, user_id, "branch.created", "branch", branch.id, data={"name": data.name, "slug": slug}
    )
    return _commit(db, user_id, branch)


def update_branch(
    db: Session, user_id: UserId, branch_id: uuid.UUID, data: BranchUpdate
) -> BranchRead:
    _require_admin(db, user_id)
    branch = _get(db, branch_id)
    changes = data.model_dump(exclude_unset=True)
    for name in list(changes):
        if name in _NULLABLE:
            changes[name] = changes[name] or None
        elif changes[name] is None:
            # Required fields can be changed but not cleared.
            changes.pop(name)
    if "slug" in changes:
        _check_slug_free(db, changes["slug"], branch.id)
    for name, value in changes.items():
        setattr(branch, name, value)
    if changes:
        audit.record(
            db,
            user_id,
            "branch.updated",
            "branch",
            branch.id,
            data={"changed": sorted(changes)},
        )
    return _commit(db, user_id, branch)


def set_archived(db: Session, user_id: UserId, branch_id: uuid.UUID, archived: bool) -> BranchRead:
    _require_admin(db, user_id)
    branch = _get(db, branch_id)
    if branch.is_active == archived:
        branch.is_active = not archived
        audit.record(
            db,
            user_id,
            "branch.archived" if archived else "branch.restored",
            "branch",
            branch.id,
            data={"name": branch.name},
        )
    return _commit(db, user_id, branch)


def _profile(db: Session, user_id: UserId) -> UserProfile:
    profile = db.get(UserProfile, user_id)
    if profile is None:
        raise PROFILE_NOT_FOUND
    return profile


def join_branch(db: Session, user_id: UserId, branch_id: uuid.UUID) -> BranchRead:
    """Make this the user's home branch, replacing any other."""
    check_branch(db, branch_id)
    profile = _profile(db, user_id)
    profile.branch_id = branch_id
    db.commit()
    return get_branch(db, user_id, branch_id)


def leave_branch(db: Session, user_id: UserId, branch_id: uuid.UUID) -> None:
    _get(db, branch_id)
    profile = _profile(db, user_id)
    if profile.branch_id != branch_id:
        raise NotFound("not_branch_member", "This is not your branch.")
    profile.branch_id = None
    db.commit()
