from pathlib import Path

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# config.py -> sentinel_pdm/ -> src/ -> pdm-ai-engine/ -> workspace root
WORKSPACE_ROOT = Path(__file__).resolve().parents[3]
ENV_FILE = WORKSPACE_ROOT / ".env"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=ENV_FILE,
        env_file_encoding="utf-8",
        extra="ignore",
    )

    database_url: str = Field(...,
                              description="postgresql+asyncpg:// connection string")
    db_echo: bool = False

    ai_engine_host: str = "0.0.0.0"
    ai_engine_port: int = 8100
    poll_interval_s: float = 1.0
    risk_warning_threshold: float = 0.3
    risk_critical_threshold: float = 0.7

    mlflow_tracking_uri: str = "./mlruns"
    mlflow_experiment_name: str = "sentinel-pdm"

    drift_psi_warning_threshold: float = 0.1
    drift_psi_critical_threshold: float = 0.2
    drift_batch_size: int = 300

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


settings = Settings()  # type: ignore
