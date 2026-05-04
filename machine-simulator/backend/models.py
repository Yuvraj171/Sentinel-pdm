from datetime import datetime
from typing import List, Optional

from sqlalchemy import (
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.database import Base


class SimRun(Base):
    __tablename__ = "sim_runs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    start_time: Mapped[Optional[datetime]] = mapped_column(
        DateTime, default=datetime.utcnow
    )
    total_rows: Mapped[Optional[int]] = mapped_column(Integer, default=0)
    status: Mapped[Optional[str]] = mapped_column(String, default="RUNNING")

    # Export-filter support
    session_start_time: Mapped[Optional[datetime]] = mapped_column(
        DateTime, default=datetime.utcnow
    )
    last_export_time: Mapped[Optional[datetime]] = mapped_column(
        DateTime, nullable=True
    )

    telemetry_logs: Mapped[List["Telemetry"]] = relationship(
        "Telemetry", back_populates="sim_run", cascade="all, delete-orphan"
    )


class Telemetry(Base):
    __tablename__ = "telemetry"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    sim_run_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("sim_runs.id"), nullable=False
    )
    timestamp_sim: Mapped[datetime] = mapped_column(DateTime, nullable=False)

    # Physics signals
    induction_power: Mapped[float] = mapped_column(Float, nullable=False)
    coil_voltage: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    quench_water_temp: Mapped[float] = mapped_column(Float, nullable=False)
    quench_water_flow: Mapped[float] = mapped_column(Float, nullable=False)
    quench_pressure: Mapped[float] = mapped_column(Float, nullable=False)
    coil_scan_speed: Mapped[float] = mapped_column(Float, nullable=False)
    part_temp: Mapped[Optional[float]] = mapped_column(Float, default=0.0)
    vibration: Mapped[Optional[float]] = mapped_column(Float, nullable=True)

    # Identity
    part_id: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    shift_id: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    operator_id: Mapped[Optional[str]] = mapped_column(String, nullable=True)

    # State & counters
    state: Mapped[str] = mapped_column(String, nullable=False)
    coil_life_counter: Mapped[Optional[int]] = mapped_column(Integer, default=0)
    ok_count: Mapped[Optional[int]] = mapped_column(Integer, default=0)
    ng_count: Mapped[Optional[int]] = mapped_column(Integer, default=0)

    # Failure ground truth (written by simulator, used for ML training)
    failure_mode: Mapped[Optional[str]] = mapped_column(
        String, default="normal", nullable=True
    )
    time_to_failure_s: Mapped[Optional[float]] = mapped_column(
        Float, nullable=True
    )
    will_fail_10min: Mapped[Optional[bool]] = mapped_column(
        Boolean, nullable=True
    )

    # Failure & maintenance
    is_anomaly: Mapped[Optional[bool]] = mapped_column(Boolean, default=False)
    downtime_reason: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    ng_reason: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    repair_time: Mapped[Optional[float]] = mapped_column(Float, default=0.0)

    # AI prediction (written by pdm-ai-engine, read by dashboard)
    ai_risk_score: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    ai_anomaly_score: Mapped[Optional[float]] = mapped_column(
        Float, nullable=True
    )
    ai_status: Mapped[Optional[str]] = mapped_column(String, nullable=True)

    sim_run: Mapped["SimRun"] = relationship(
        "SimRun", back_populates="telemetry_logs"
    )


# High-frequency time-series queries: dashboard polls by timestamp.
Index("idx_telemetry_timestamp", Telemetry.timestamp_sim)
