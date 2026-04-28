from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field

# --- Shared Base Models ---

class TelemetryBase(BaseModel):
    # Identity
    timestamp_sim: str
    part_id: Optional[str] = None
    shift_id: str
    operator_id: str
    machine_state: str

    # Process
    quench_water_temp: float
    quench_water_flow: float
    quench_pressure: float
    induction_power: float
    tempering_speed: float
    coil_scan_speed: float

    # Health
    coil_life_counter: int
    repair_time: float = 0.0
    downtime_reason: Optional[str] = None

    # Labels
    ok_count: int = 0
    ng_count: int = 0
    is_anomaly: bool = False

class SimRunBase(BaseModel):
    status: str
    total_rows: int = 0

# --- Create Models (Input) ---

class TelemetryCreate(TelemetryBase):
    pass

class SimRunCreate(SimRunBase):
    pass

# --- Read Models (Output) ---

class TelemetryRead(TelemetryBase):
    id: int
    sim_run_id: int

    class Config:
        from_attributes = True

class SimRunRead(SimRunBase):
    id: int
    start_time: datetime
    # We can add a list of logs if needed, but usually too large for simple read
    # telemetry_logs: list[TelemetryRead] = []

    class Config:
        from_attributes = True
