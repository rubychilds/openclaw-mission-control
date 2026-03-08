"""Command center chat endpoints for org-wide agent communication."""

from __future__ import annotations

import asyncio
import json
from datetime import UTC, datetime
from typing import TYPE_CHECKING

from fastapi import APIRouter, Depends, Query, Request
from sqlmodel import col
from sse_starlette.sse import EventSourceResponse

from app.api.deps import require_org_member
from app.core.config import settings
from app.core.time import utcnow
from app.db.pagination import paginate
from app.db.session import async_session_maker, get_session
from app.models.command_center import CommandCenterMessage
from app.models.gateways import Gateway
from app.schemas.command_center import (
    CommandCenterMessageCreate,
    CommandCenterMessageRead,
)
from app.schemas.pagination import DefaultLimitOffsetPage
from app.services.mentions import extract_mentions
from app.services.openclaw.gateway_dispatch import GatewayDispatchService
from app.services.openclaw.gateway_resolver import optional_gateway_client_config
from app.services.openclaw.shared import GatewayAgentIdentity
from app.services.organizations import OrganizationContext

if TYPE_CHECKING:
    from collections.abc import AsyncIterator

    from fastapi_pagination.limit_offset import LimitOffsetPage
    from sqlmodel.ext.asyncio.session import AsyncSession

router = APIRouter(prefix="/command-center", tags=["command-center"])
STREAM_POLL_SECONDS = 2
MAX_SNIPPET_LENGTH = 800
SINCE_QUERY = Query(default=None)
SESSION_DEP = Depends(get_session)
ORG_DEP = Depends(require_org_member)


def _parse_since(value: str | None) -> datetime | None:
    if not value:
        return None
    normalized = value.strip()
    if not normalized:
        return None
    normalized = normalized.replace("Z", "+00:00")
    try:
        parsed = datetime.fromisoformat(normalized)
    except ValueError:
        return None
    if parsed.tzinfo is not None:
        return parsed.astimezone(UTC).replace(tzinfo=None)
    return parsed


def _serialize_message(message: CommandCenterMessage) -> dict[str, object]:
    return CommandCenterMessageRead.model_validate(
        message,
        from_attributes=True,
    ).model_dump(mode="json")


async def _fetch_new_messages(
    session: AsyncSession,
    organization_id: object,
    since: datetime,
) -> list[CommandCenterMessage]:
    statement = (
        CommandCenterMessage.objects.filter_by(organization_id=organization_id)
        .filter(col(CommandCenterMessage.created_at) >= since)
        .order_by(col(CommandCenterMessage.created_at))
    )
    return await statement.all(session)


def _actor_display_name(ctx: OrganizationContext) -> str:
    user = ctx.member
    if hasattr(user, "display_name") and user.display_name:
        return user.display_name
    if hasattr(user, "name") and user.name:
        return user.name
    return "User"


@router.get("/messages", response_model=DefaultLimitOffsetPage[CommandCenterMessageRead])
async def list_messages(
    *,
    ctx: OrganizationContext = ORG_DEP,
    session: AsyncSession = SESSION_DEP,
) -> LimitOffsetPage[CommandCenterMessageRead]:
    """List command center messages for the current organization."""
    statement = (
        CommandCenterMessage.objects.filter_by(
            organization_id=ctx.organization.id,
        )
        .order_by(col(CommandCenterMessage.created_at).desc())
    )
    return await paginate(session, statement.statement)


@router.get("/messages/stream")
async def stream_messages(
    request: Request,
    *,
    ctx: OrganizationContext = ORG_DEP,
    since: str | None = SINCE_QUERY,
) -> EventSourceResponse:
    """Stream command center messages over server-sent events."""
    since_dt = _parse_since(since) or utcnow()
    last_seen = since_dt
    org_id = ctx.organization.id

    async def event_generator() -> AsyncIterator[dict[str, str]]:
        nonlocal last_seen
        while True:
            if await request.is_disconnected():
                break
            async with async_session_maker() as session:
                messages = await _fetch_new_messages(session, org_id, last_seen)
            for message in messages:
                last_seen = max(message.created_at, last_seen)
                payload = {"message": _serialize_message(message)}
                yield {"event": "message", "data": json.dumps(payload)}
            await asyncio.sleep(STREAM_POLL_SECONDS)

    return EventSourceResponse(event_generator(), ping=15)


@router.post("/messages", response_model=CommandCenterMessageRead)
async def send_message(
    payload: CommandCenterMessageCreate,
    *,
    ctx: OrganizationContext = ORG_DEP,
    session: AsyncSession = SESSION_DEP,
) -> CommandCenterMessage:
    """Send a user message and dispatch it to the gateway-main agent."""
    org = ctx.organization
    source = payload.source or _actor_display_name(ctx)

    # Store user message
    user_message = CommandCenterMessage(
        organization_id=org.id,
        role="user",
        content=payload.content,
        source=source,
    )
    session.add(user_message)
    await session.commit()
    await session.refresh(user_message)

    # Dispatch to gateway-main agent (best-effort, don't block on failure)
    try:
        await _dispatch_to_gateway_main(
            session=session,
            org_id=org.id,
            content=payload.content,
            source=source,
        )
    except Exception:
        pass  # Agent dispatch failure shouldn't prevent the message from being stored

    return user_message


async def _dispatch_to_gateway_main(
    *,
    session: AsyncSession,
    org_id: object,
    content: str,
    source: str,
) -> None:
    """Send the user message to the org's gateway-main agent."""
    # Find the org's gateway
    gateway = await Gateway.objects.filter_by(organization_id=org_id).first(session)
    if gateway is None:
        return

    config = optional_gateway_client_config(gateway)
    if config is None:
        return

    session_key = GatewayAgentIdentity.session_key(gateway)
    mentions = extract_mentions(content)

    snippet = content.strip()
    if len(snippet) > MAX_SNIPPET_LENGTH:
        snippet = f"{snippet[: MAX_SNIPPET_LENGTH - 3]}..."

    base_url = settings.base_url
    message = (
        f"COMMAND CENTER MESSAGE\n"
        f"From: {source}\n"
        f"{'Mentions: ' + ', '.join(sorted(mentions)) if mentions else ''}\n\n"
        f"{snippet}\n\n"
        "Reply via command center:\n"
        f"POST {base_url}/api/v1/command-center/messages\n"
        'Body: {"content":"...","source":"Assistant"}'
    )

    dispatch = GatewayDispatchService(session)
    await dispatch.try_send_agent_message(
        session_key=session_key,
        config=config,
        agent_name="gateway-main",
        message=message,
    )
