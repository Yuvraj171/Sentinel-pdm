from pathlib import Path

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# machine-simulator/backend/config.py -> machine-simulator/ -> sentinel-pdm-workspace/
WORKSPACE_ROOT = Path(__file__).resolve().parents[2]
ENV_FILE = WORKSPACE_ROOT / ".env"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=ENV_FILE,
        env_file_encoding="utf-8",
        extra="ignore",
    )

    database_url: str = Field(..., description="postgresql+asyncpg:// connection string")
    db_echo: bool = False

    simulator_host: str = "0.0.0.0"
    simulator_port: int = 8000
    simulator_tick_rate_hz: float = Field(default=1.0, gt=0.0)
    failure_probability: float = Field(default=0.05, ge=0.0, le=1.0)

    @field_validator("database_url")
    @classmethod
    def reject_sqlite(cls, v: str) -> str:
        if "sqlite" in v.lower():
            raise ValueError(
                "SQLite is not allowed (DECISIONS.md D2). "
                "Set DATABASE_URL to postgresql+asyncpg://..."
            )
        if not v.startswith("postgresql+asyncpg://"):
            raise ValueError(
                "DATABASE_URL must start with 'postgresql+asyncpg://' for async support."
            )
        return v


settings = Settings()  # pyright: ignore[reportCallIssue]
# Pyright can't see that pydantic-settings populates `database_url` from
# the .env file at runtime, so it flags the call as missing the required
# argument. Suppress for this single instantiation.
