"""Database-backed service for post and comment reactions."""

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.reaction import Reaction
from app.schemas.reaction import ReactionTargetType, ReactionType


class ReactionNotFound(Exception):
    """Raised when the current user has no reaction for a target."""


def set_reaction(
    db: Session,
    user_id: UUID,
    target_type: ReactionTargetType,
    target_id: UUID,
    reaction_type: ReactionType,
) -> Reaction:
    """Create a reaction or update the user's existing reaction."""

    statement = select(Reaction).where(
        Reaction.user_id == user_id,
        Reaction.target_type == target_type,
        Reaction.target_id == target_id,
    )
    reaction = db.scalar(statement)

    if reaction is None:
        reaction = Reaction(
            user_id=user_id,
            target_type=target_type,
            target_id=target_id,
            reaction_type=reaction_type,
        )
        db.add(reaction)
    else:
        reaction.reaction_type = reaction_type

    db.commit()
    db.refresh(reaction)
    return reaction


def remove_reaction(
    db: Session,
    user_id: UUID,
    target_type: ReactionTargetType,
    target_id: UUID,
) -> None:
    """Remove the current user's reaction to a target."""

    statement = select(Reaction).where(
        Reaction.user_id == user_id,
        Reaction.target_type == target_type,
        Reaction.target_id == target_id,
    )
    reaction = db.scalar(statement)

    if reaction is None:
        raise ReactionNotFound

    db.delete(reaction)
    db.commit()
