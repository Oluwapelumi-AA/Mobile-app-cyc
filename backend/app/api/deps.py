from fastapi import HTTPException, status

from app.core.identity import UserId
from app.services.avatar_storage import AvatarStorage, UnconfiguredAvatarStorage
from app.services.profiles import InMemoryProfileRepository, ProfileRepository

_profile_repository = InMemoryProfileRepository()


async def get_current_user_id() -> UserId:
    """Authenticated user's id. Integration point for the auth workstream.

    Auth will replace this body with its own dependency (token verification,
    active-account check). Profile routes depend only on this function, so no
    authentication logic lives in the profile code. Until then every request
    is rejected; tests override this dependency.
    """
    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail={"code": "not_authenticated", "message": "Authentication is required."},
        headers={"WWW-Authenticate": "Bearer"},
    )


def get_profile_repository() -> ProfileRepository:
    return _profile_repository


def get_avatar_storage() -> AvatarStorage:
    return UnconfiguredAvatarStorage()
