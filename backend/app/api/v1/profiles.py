from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Response, status

from app.api.deps import get_avatar_storage, get_current_user_id, get_profile_repository
from app.core.identity import UserId
from app.schemas.avatar import AvatarConfirmRequest, AvatarUploadIntent, AvatarUploadRequest
from app.schemas.profile import ProfileCreate, ProfileRead, ProfileUpdate
from app.services.avatar_storage import (
    AvatarObjectInvalid,
    AvatarStorage,
    AvatarStorageUnavailable,
    avatar_key_prefix,
)
from app.services.profiles import (
    ProfileAlreadyExists,
    ProfileRecord,
    ProfileRepository,
)

router = APIRouter(prefix="/profiles", tags=["Profiles"])

CurrentUserId = Annotated[UserId, Depends(get_current_user_id)]
Profiles = Annotated[ProfileRepository, Depends(get_profile_repository)]
Storage = Annotated[AvatarStorage, Depends(get_avatar_storage)]


def error(status_code: int, code: str, message: str) -> HTTPException:
    return HTTPException(status_code=status_code, detail={"code": code, "message": message})


def get_existing_profile(user_id: UserId, profiles: ProfileRepository) -> ProfileRecord:
    record = profiles.get(user_id)
    if record is None:
        raise error(status.HTTP_404_NOT_FOUND, "profile_not_found", "Create a profile first.")
    return record


STORAGE_UNAVAILABLE = error(
    status.HTTP_503_SERVICE_UNAVAILABLE,
    "avatar_storage_unavailable",
    "Avatar uploads are not available yet.",
)


@router.post("/me", response_model=ProfileRead, status_code=status.HTTP_201_CREATED)
def create_my_profile(data: ProfileCreate, user_id: CurrentUserId, profiles: Profiles):
    record = ProfileRecord.from_create(user_id, data)
    try:
        profiles.add(record)
    except ProfileAlreadyExists:
        raise error(status.HTTP_409_CONFLICT, "profile_exists", "Profile already exists.")
    return record.to_read()


@router.get("/me", response_model=ProfileRead)
def get_my_profile(user_id: CurrentUserId, profiles: Profiles):
    return get_existing_profile(user_id, profiles).to_read()


@router.patch("/me", response_model=ProfileRead)
def update_my_profile(data: ProfileUpdate, user_id: CurrentUserId, profiles: Profiles):
    record = get_existing_profile(user_id, profiles)
    record.apply_update(data)
    profiles.save(record)
    return record.to_read()


@router.post("/me/avatar/upload-intent", response_model=AvatarUploadIntent)
def create_avatar_upload_intent(
    data: AvatarUploadRequest, user_id: CurrentUserId, profiles: Profiles, storage: Storage
):
    get_existing_profile(user_id, profiles)
    try:
        return storage.create_upload_intent(user_id, data.content_type, data.size_bytes)
    except AvatarStorageUnavailable:
        raise STORAGE_UNAVAILABLE


@router.post("/me/avatar/confirm", response_model=ProfileRead)
def confirm_avatar_upload(
    data: AvatarConfirmRequest, user_id: CurrentUserId, profiles: Profiles, storage: Storage
):
    record = get_existing_profile(user_id, profiles)
    if not data.object_key.startswith(avatar_key_prefix(user_id)) or ".." in data.object_key:
        raise error(
            422,
            "invalid_avatar_key",
            "object_key does not belong to the current user.",
        )
    try:
        record.avatar_url = storage.resolve_uploaded_avatar(user_id, data.object_key)
    except AvatarStorageUnavailable:
        raise STORAGE_UNAVAILABLE
    except AvatarObjectInvalid as exc:
        raise error(422, "invalid_avatar", str(exc))
    record.touch()
    profiles.save(record)
    return record.to_read()


@router.delete("/me/avatar", status_code=status.HTTP_204_NO_CONTENT)
def remove_my_avatar(user_id: CurrentUserId, profiles: Profiles):
    # Deleting the stored object is left to the storage provider integration.
    record = get_existing_profile(user_id, profiles)
    record.avatar_url = None
    record.touch()
    profiles.save(record)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
