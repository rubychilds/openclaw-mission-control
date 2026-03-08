"""Add created_by/updated_by user tracking columns to core models.

Revision ID: c4a8d2e6f1b3
Revises: b7d3e1f2a4c6
Create Date: 2026-03-08 01:00:00.000000

"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "c4a8d2e6f1b3"
down_revision = "b7d3e1f2a4c6"
branch_labels = None
depends_on = None

_TABLES_BOTH = ("boards", "agents", "tags")
_TABLES_UPDATED_ONLY = ("tasks",)


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    for table in _TABLES_BOTH:
        columns = {c["name"] for c in inspector.get_columns(table)}
        if "created_by_user_id" not in columns:
            op.add_column(
                table,
                sa.Column(
                    "created_by_user_id",
                    sa.Uuid(),
                    sa.ForeignKey("users.id"),
                    nullable=True,
                ),
            )
            op.create_index(
                f"ix_{table}_created_by_user_id",
                table,
                ["created_by_user_id"],
            )
        if "updated_by_user_id" not in columns:
            op.add_column(
                table,
                sa.Column(
                    "updated_by_user_id",
                    sa.Uuid(),
                    sa.ForeignKey("users.id"),
                    nullable=True,
                ),
            )
            op.create_index(
                f"ix_{table}_updated_by_user_id",
                table,
                ["updated_by_user_id"],
            )

    for table in _TABLES_UPDATED_ONLY:
        columns = {c["name"] for c in inspector.get_columns(table)}
        if "updated_by_user_id" not in columns:
            op.add_column(
                table,
                sa.Column(
                    "updated_by_user_id",
                    sa.Uuid(),
                    sa.ForeignKey("users.id"),
                    nullable=True,
                ),
            )
            op.create_index(
                f"ix_{table}_updated_by_user_id",
                table,
                ["updated_by_user_id"],
            )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    for table in _TABLES_UPDATED_ONLY:
        columns = {c["name"] for c in inspector.get_columns(table)}
        if "updated_by_user_id" in columns:
            op.drop_index(f"ix_{table}_updated_by_user_id", table_name=table)
            op.drop_column(table, "updated_by_user_id")

    for table in _TABLES_BOTH:
        columns = {c["name"] for c in inspector.get_columns(table)}
        if "updated_by_user_id" in columns:
            op.drop_index(f"ix_{table}_updated_by_user_id", table_name=table)
            op.drop_column(table, "updated_by_user_id")
        if "created_by_user_id" in columns:
            op.drop_index(f"ix_{table}_created_by_user_id", table_name=table)
            op.drop_column(table, "created_by_user_id")
