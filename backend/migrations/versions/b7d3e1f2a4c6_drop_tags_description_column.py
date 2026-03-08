"""Drop description column from tags table.

Revision ID: b7d3e1f2a4c6
Revises: a9b1c2d3e4f7
Create Date: 2026-03-08 00:00:00.000000

"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "b7d3e1f2a4c6"
down_revision = "a9b1c2d3e4f7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    columns = {c["name"] for c in inspector.get_columns("tags")}
    if "description" in columns:
        op.drop_column("tags", "description")


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    columns = {c["name"] for c in inspector.get_columns("tags")}
    if "description" not in columns:
        op.add_column(
            "tags",
            sa.Column("description", sa.String(), nullable=True),
        )
