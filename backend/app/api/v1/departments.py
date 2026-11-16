"""Global department administration endpoints."""
from typing import Annotated
from uuid import UUID
from fastapi import APIRouter, Depends, Response, status
from sqlalchemy.orm import Session
from app.api.deps import get_current_user_id
from app.core.identity import UserId
from app.db.session import get_db
from app.schemas.chapter_management import DepartmentCreate, DepartmentRead, DepartmentUpdate, DepartmentAssignmentUpdate
from app.services import departments as service
router = APIRouter(prefix="/departments", tags=["Departments"])
CurrentUserId = Annotated[UserId, Depends(get_current_user_id)]
DbSession = Annotated[Session, Depends(get_db)]
@router.get("", response_model=list[DepartmentRead])
def list_departments(user_id: CurrentUserId, db: DbSession):
    return service.list_departments(db, user_id)
@router.post("", response_model=DepartmentRead, status_code=status.HTTP_201_CREATED)
def create_department(data: DepartmentCreate, user_id: CurrentUserId, db: DbSession):
    return service.create_department(db, user_id, data)
@router.patch("/{department_id}", response_model=DepartmentRead)
def update_department(department_id: UUID, data: DepartmentUpdate, user_id: CurrentUserId, db: DbSession):
    return service.update_department(db, user_id, department_id, data)
@router.delete("/{department_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_department(department_id: UUID, user_id: CurrentUserId, db: DbSession):
    service.delete_department(db, user_id, department_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
