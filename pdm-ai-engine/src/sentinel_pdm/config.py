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

    # CORSMiddleware allow_origins. allow_credentials=True forbids "*", so the
    # production simulator origin must be listed explicitly. Override via the
    # CORS_ALLOW_ORIGINS env var (comma-separated) when the Cloud Run URL changes.
    cors_allow_origins: list[str] = Field(
        default_factory=lambda: [
            "http://localhost:5173",
            "http://127.0.0.1:5173",
            "http://localhost:5174",
            "http://127.0.0.1:5174",
            "https://sentinel-simulator-69435327302.asia-northeast1.run.app",
            "https://sentinel-simulator-o7yiepxhnq-an.a.run.app",
        ]
    )

    @field_validator("cors_allow_origins", mode="before")
    @classmethod
    def split_cors_origins(cls, v):
        if isinstance(v, str):
            return [o.strip() for o in v.split(",") if o.strip()]
        return v

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
