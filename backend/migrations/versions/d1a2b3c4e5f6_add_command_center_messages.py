"""Add command_center_messages table for global chat.

Revision ID: d1a2b3c4e5f6
Revises: a1e6b0d62f0c, c4a8d2e6f1b3, b6f4c7d9e1a2, f4d2b649e93a
Create Date: 2026-03-08 12:00:00.000000

"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "d1a2b3c4e5f6"
down_revision = ("a1e6b0d62f0c", "c4a8d2e6f1b3", "b6f4c7d9e1a2", "f4d2b649e93a")
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "command_center_messages",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("organization_id", sa.Uuid(), nullable=False),
        sa.Column("role", sa.String(), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("source", sa.String(), nullable=True),
        sa.Column("metadata_", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(
            ["organization_id"],
            ["organizations.id"],
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.CheckConstraint(
            "role IN ('user', 'assistant', 'system')",
            name="ck_cc_messages_role",
        ),
    )
    op.create_index(
        "ix_cc_messages_org_created",
        "command_center_messages",
        ["organization_id", "created_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_cc_messages_org_created", table_name="command_center_messages")
    op.drop_table("command_center_messages")
