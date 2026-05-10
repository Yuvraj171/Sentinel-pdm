"""add machine_config table

Revision ID: a3f8e2c91b05
Revises: 1c5262348f44
Create Date: 2026-05-10 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a3f8e2c91b05'
down_revision: Union[str, Sequence[str], None] = '1c5262348f44'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'machine_config',
        sa.Column('key', sa.String(), nullable=False),
        sa.Column('value', sa.String(), nullable=False),
        sa.PrimaryKeyConstraint('key'),
    )
    op.execute(
        "INSERT INTO machine_config (key, value) VALUES ('coil_expected_parts', '5000')"
    )


def downgrade() -> None:
    op.drop_table('machine_config')
