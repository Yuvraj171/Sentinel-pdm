from datetime import datetime
from sqlalchemy import Column, Integer, Float, String, DateTime, ForeignKey, Boolean, Index
from sqlalchemy.orm import relationship
from backend.database import Base

class SimRun(Base):
    __tablename__ = "sim_runs"

    id = Column(Integer, primary_key=True, index=True)
    start_time = Column(DateTime, default=datetime.utcnow)
    total_rows = Column(Integer, default=0)
    status = Column(String, default="RUNNING") # RUNNING, COMPLETED, FAILED
    
    # Export Filtering Support
    session_start_time = Column(DateTime, default=datetime.utcnow)  # Reset when user clicks Reset
    last_export_time = Column(DateTime, nullable=True)  # Updated after each export
    
    # Relationship to Telemetry
    telemetry_logs = relationship("Telemetry", back_populates="sim_run", cascade="all, delete-orphan")

class Telemetry(Base):
    __tablename__ = "telemetry"

    id = Column(Integer, primary_key=True, index=True)
    sim_run_id = Column(Integer, ForeignKey("sim_runs.id"), nullable=False)
    timestamp_sim = Column(DateTime, nullable=False)
    
    # Physics Signals
    induction_power = Column(Float, nullable=False)
    quench_water_temp = Column(Float, nullable=False)
    quench_water_flow = Column(Float, nullable=False)
    quench_pressure = Column(Float, nullable=False)
    coil_scan_speed = Column(Float, nullable=False)
    tempering_speed = Column(Float, nullable=False)
    part_temp = Column(Float, default=0.0) # NEW: Max part temp reached
    
    # Identity
    part_id = Column(String, nullable=True) # Computed Part ID
    shift_id = Column(String, nullable=True)
    operator_id = Column(String, nullable=True)

    # State & Counters
    state = Column(String, nullable=False) # IDLE, HEATING, QUENCH, DOWN, etc.
    coil_life_counter = Column(Integer, default=0)
    ok_count = Column(Integer, default=0)
    ng_count = Column(Integer, default=0)
    
    # Failure & Maint
    is_anomaly = Column(Boolean, default=False)
    downtime_reason = Column(String, nullable=True)  # Why machine stopped (E-Stop, Maint, etc.)
    ng_reason = Column(String, nullable=True)  # Why part was NG (CRACKING, SOFTNESS, etc.)
    repair_time = Column(Float, default=0.0)
    
    # AI Prediction (Early Downtime Detection)
    ai_risk_score = Column(Float, nullable=True)  # 0.0 - 1.0 probability of failure
    ai_status = Column(String, nullable=True)  # OK, WARNING, CRITICAL
    
    sim_run = relationship("SimRun", back_populates="telemetry_logs")

# Optimizing for high-frequency time-series queries (Tech Stack Req)
# Adding Index on timestamp_sim for dashboard polling
Index("idx_telemetry_timestamp", Telemetry.timestamp_sim)
