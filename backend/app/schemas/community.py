"""Request and response schemas for communities and their members."""

from typing import Annotated
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, StringConstraints

from app.models.community import CommunityRole, CommunityVisibility
from app.schemas.common import UtcDatetime

CommunityName = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=3, max_length=100)
]
CommunityDescription = Annotated[
    str, StringConstraints(strip_whitespace=True, max_length=1000)
]


class CommunityCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: CommunityName
    description: CommunityDescription | None = None
    visibility: CommunityVisibility = CommunityVisibility.PUBLIC
    branch_id: UUID | None = None


class CommunityUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: CommunityName | None = None
    description: CommunityDescription | None = None
    visibility: CommunityVisibility | None = None
    # Null takes the community out of its branch.
    branch_id: UUID | None = None


class CommunityRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    description: str | None
    visibility: CommunityVisibility
    created_by: UUID | None
    branch_id: UUID | None
    member_count: int
    # The caller's role, or null when they are not a member.
    my_role: CommunityRole | None
    created_at: UtcDatetime
    updated_at: UtcDatetime


class MembershipRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    community_id: UUID
    user_id: UUID
    role: CommunityRole
    joined_at: UtcDatetime


class MemberRoleUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    role: CommunityRole = Field(description="The member's new role.")
