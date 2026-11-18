"""Platform-wide department catalog and one-department-per-member assignment."""
import uuid
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from app.core.identity import UserId
from app.models.chapter_management import Department
from app.models.user import AccountRole, MembershipStatus, User
from app.models.user_profile import UserProfile
from app.schemas.chapter_management import DepartmentCreate, DepartmentRead, DepartmentUpdate
from app.services.errors import Conflict, Forbidden, NotFound

def _admin(db: Session, actor_id: UserId) -> None:
    if db.scalar(select(User.account_role).where(User.id == actor_id)) != AccountRole.ADMIN:
        raise Forbidden("admin_only", "Only platform admins can manage global departments.")

def list_departments(db: Session, actor_id: UserId) -> list[DepartmentRead]:
    """Any signed-in user can see the departments, so Members can pick one."""
    rows = db.scalars(select(Department).order_by(Department.name, Department.id))
    counts = dict(
        db.execute(
            select(UserProfile.department_id, func.count())
            .join(User, User.id == UserProfile.user_id)
            .where(
                UserProfile.department_id.is_not(None),
                User.membership_status == MembershipStatus.MEMBER,
            )
            .group_by(UserProfile.department_id)
        ).all()
    )
    return [
        DepartmentRead.model_validate(row).model_copy(update={"member_count": counts.get(row.id, 0)})
        for row in rows
    ]

def create_department(db: Session, actor_id: UserId, data: DepartmentCreate) -> DepartmentRead:
    _admin(db, actor_id)
    row = Department(id=uuid.uuid4(), name=data.name, description=data.description or None, created_by=actor_id)
    db.add(row)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise Conflict("department_name_exists", "A global department with that name already exists.") from None
    db.refresh(row)
    return DepartmentRead.model_validate(row)

def update_department(db: Session, actor_id: UserId, department_id: uuid.UUID, data: DepartmentUpdate) -> DepartmentRead:
    _admin(db, actor_id)
    row = db.get(Department, department_id)
    if row is None:
        raise NotFound("department_not_found", "Department not found.")
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(row, key, (value or None) if key == "description" else value)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise Conflict("department_name_exists", "A global department with that name already exists.") from None
    db.refresh(row)
    return DepartmentRead.model_validate(row)

def delete_department(db: Session, actor_id: UserId, department_id: uuid.UUID) -> None:
    _admin(db, actor_id)
    row = db.get(Department, department_id)
    if row is None:
        raise NotFound("department_not_found", "Department not found.")
    # user_profiles.department_id uses SET NULL, so members remain intact.
    db.delete(row)
    db.commit()

def assign_member_department(db: Session, actor_id: UserId, target_id: uuid.UUID, department_id: uuid.UUID | None) -> None:
    _admin(db, actor_id)
    profile = db.get(UserProfile, target_id)
    if profile is None:
        raise NotFound("profile_not_found", "The user must create a profile before department assignment.")
    if department_id is not None and db.get(Department, department_id) is None:
        raise NotFound("department_not_found", "Department not found.")
    profile.department_id = department_id
    db.commit()
