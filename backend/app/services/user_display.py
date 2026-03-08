"""Resolve user display names from user IDs in batch."""

from __future__ import annotations

from typing import TYPE_CHECKING
from uuid import UUID

from sqlmodel import col, select

from app.models.users import User

if TYPE_CHECKING:
    from sqlmodel.ext.asyncio.session import AsyncSession


def _display_name(user: User) -> str:
    return user.preferred_name or user.name or user.email or str(user.id)


async def resolve_user_display_names(
    session: AsyncSession,
    user_ids: set[UUID],
) -> dict[UUID, str]:
    """Batch-resolve user IDs to display names.

    Returns a mapping of user_id -> display string using
    preferred_name > name > email > str(id) as fallback chain.
    """
    if not user_ids:
        return {}
    result = await session.exec(
        select(User).where(col(User.id).in_(list(user_ids))),
    )
    return {user.id: _display_name(user) for user in result.all()}
