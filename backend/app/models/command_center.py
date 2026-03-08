"""Command center message model for global org-scoped chat."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID, uuid4

from sqlalchemy import JSON, Column, Text
from sqlmodel import Field

from app.core.time import utcnow
from app.models.base import QueryModel


class CommandCenterMessage(QueryModel, table=True):
    """Persistent message in the org-level command center chat."""

    __tablename__ = "command_center_messages"  # pyright: ignore[reportAssignmentType]

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    organization_id: UUID = Field(foreign_key="organizations.id", index=True)
    role: str  # "user" | "assistant" | "system"
    content: str = Field(sa_column=Column(Text, nullable=False))
    source: str | None = None
    metadata_: dict | None = Field(default=None, sa_column=Column("metadata_", JSON))
    created_at: datetime = Field(default_factory=utcnow)
