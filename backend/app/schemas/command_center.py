"""Pydantic schemas for command center chat endpoints."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from sqlmodel import SQLModel

from app.schemas.common import NonEmptyStr


class CommandCenterMessageCreate(SQLModel):
    """Payload for sending a message to the command center."""

    content: NonEmptyStr
    source: str | None = None


class CommandCenterMessageRead(SQLModel):
    """Serialized command center message returned from API endpoints."""

    id: UUID
    organization_id: UUID
    role: str
    content: str
    source: str | None = None
    metadata_: dict | None = None
    created_at: datetime
