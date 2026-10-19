"""In-app notifications, notification preferences and push devices."""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Response, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user_id
from app.core.identity import UserId
from app.db.session import get_db
from app.models.notification import NotificationCategory
from app.schemas.common import Page
from app.schemas.notification import (
    DeviceRead,
    DeviceRegister,
    MarkedRead,
    NotificationRead,
    PreferenceRead,
    PreferencesUpdate,
    UnreadCount,
)
from app.services import notifications
from app.services.pagination import DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE

router = APIRouter(prefix="/notifications", tags=["Notifications"])

CurrentUserId = Annotated[UserId, Depends(get_current_user_id)]
DbSession = Annotated[Session, Depends(get_db)]
Limit = Annotated[int, Query(ge=1, le=MAX_PAGE_SIZE)]
Cursor = Annotated[str | None, Query(max_length=200)]


@router.get("", response_model=Page[NotificationRead])
def list_notifications(
    user_id: CurrentUserId,
    db: DbSession,
    limit: Limit = DEFAULT_PAGE_SIZE,
    cursor: Cursor = None,
    unread_only: bool = False,
    category: NotificationCategory | None = None,
):
    """Your notifications, newest first."""
    items, next_cursor = notifications.list_notifications(
        db, user_id, limit, cursor, unread_only=unread_only, category=category
    )
    return Page(items=items, next_cursor=next_cursor)


@router.get("/unread-count", response_model=UnreadCount)
def unread_count(user_id: CurrentUserId, db: DbSession):
    """For the badge on the bell icon."""
    return UnreadCount(count=notifications.unread_count(db, user_id))


@router.post("/read-all", response_model=MarkedRead)
def mark_all_read(
    user_id: CurrentUserId,
    db: DbSession,
    category: NotificationCategory | None = None,
):
    return MarkedRead(updated=notifications.mark_all_read(db, user_id, category))


# Preferences


@router.get("/preferences", response_model=list[PreferenceRead])
def list_preferences(user_id: CurrentUserId, db: DbSession):
    """Push and email on/off for every category. In-app is always on."""
    return notifications.list_preferences(db, user_id)


@router.patch("/preferences", response_model=list[PreferenceRead])
def update_preferences(data: PreferencesUpdate, user_id: CurrentUserId, db: DbSession):
    return notifications.update_preferences(db, user_id, data.preferences)


# Push devices


@router.get("/devices", response_model=list[DeviceRead])
def list_devices(user_id: CurrentUserId, db: DbSession):
    return notifications.list_devices(db, user_id)


@router.post("/devices", response_model=DeviceRead)
def register_device(
    data: DeviceRegister, user_id: CurrentUserId, db: DbSession, response: Response
):
    """Save this device's push token. Call on every launch and after sign-in;
    201 the first time, 200 after that."""
    device, created = notifications.register_device(db, user_id, data)
    response.status_code = status.HTTP_201_CREATED if created else status.HTTP_200_OK
    return device


@router.delete("/devices", status_code=status.HTTP_204_NO_CONTENT)
def remove_device_by_token(
    user_id: CurrentUserId,
    db: DbSession,
    token: Annotated[str, Query(min_length=1, max_length=500)],
):
    """Stop push to this device before signing out, by its push token."""
    notifications.remove_device_by_token(db, user_id, token)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.delete("/devices/{device_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_device(device_id: UUID, user_id: CurrentUserId, db: DbSession):
    notifications.remove_device(db, user_id, device_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# One notification


@router.get("/{notification_id}", response_model=NotificationRead)
def get_notification(notification_id: UUID, user_id: CurrentUserId, db: DbSession):
    return notifications.get_notification(db, user_id, notification_id)


@router.post("/{notification_id}/read", response_model=NotificationRead)
def mark_read(notification_id: UUID, user_id: CurrentUserId, db: DbSession):
    return notifications.set_read(db, user_id, notification_id, True)


@router.post("/{notification_id}/unread", response_model=NotificationRead)
def mark_unread(notification_id: UUID, user_id: CurrentUserId, db: DbSession):
    return notifications.set_read(db, user_id, notification_id, False)


@router.delete("/{notification_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_notification(notification_id: UUID, user_id: CurrentUserId, db: DbSession):
    notifications.delete_notification(db, user_id, notification_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
