import os
from pathlib import Path
import sys
from logging.config import fileConfig

from sqlalchemy import create_engine, pool
from alembic import context

config = context.config

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from backend.config import settings  # noqa: E402
from backend.database import Base  # noqa: E402
from backend import models  # noqa: E402,F401

# MIGRATION_DATABASE_URL bypasses configparser interpolation — required when
# the password contains special characters (@, %) that configparser rejects.
# Falls back to DATABASE_URL (asyncpg prefix stripped for sync psycopg2 engine).
_migration_url = os.environ.get("MIGRATION_DATABASE_URL")
sync_url = _migration_url or settings.database_url.replace(
    "postgresql+asyncpg://", "postgresql://"
)

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    context.configure(
        url=sync_url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    # Build engine from URL object. When MIGRATION_DATABASE_URL is set we use
    # URL.create() with the password as a separate arg so SQLAlchemy never has
    # to parse a string containing special characters (e.g. @ in password).
    import os
    from sqlalchemy.engine import URL

    migration_url = os.environ.get("MIGRATION_DATABASE_URL")
    if migration_url:
        engine_url = URL.create(
            drivername="postgresql",
            username=os.environ["MIGRATION_DB_USER"],
            password=os.environ["MIGRATION_DB_PASSWORD"],
            host=os.environ["MIGRATION_DB_HOST"],
            port=int(os.environ.get("MIGRATION_DB_PORT", "5432")),
            database=os.environ.get("MIGRATION_DB_NAME", "postgres"),
        )
    else:
        engine_url = sync_url

    connectable = create_engine(engine_url, poolclass=pool.NullPool)
    with connectable.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata)
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
