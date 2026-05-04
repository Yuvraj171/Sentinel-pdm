import logging
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database import get_db
from backend.models import Telemetry
from backend.simulation.engine import LIVE_SIM_RUN_ID, get_engine
from backend.simulation.fastgen import run_fast_gen

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/simulation", tags=["simulation"])


@router.post("/start")
async def start_simulation():
    engine = get_engine()
    await engine.start()
    return {"message": "start requested", "status": engine.status()}


@router.post("/stop")
async def stop_simulation():
    engine = get_engine()
    await engine.stop()
    return {"message": "stop requested", "status": engine.status()}


@router.post("/reset")
async def reset_simulation(db: AsyncSession = Depends(get_db)):
    """Stops the engine, drops live telemetry rows (sim_run_id=1 only —
    fast-gen runs are preserved), resets cycle counters. Atomic under
    the engine lifecycle lock."""
    engine = get_engine()
    await engine.reset(db)
    return {"message": "reset complete", "status": engine.status()}


@router.post("/inject-failure")
async def inject_failure(
    mode: Literal["coolant_pump", "quench_system", "power_supply"] = Query(
        ..., description="One of the three CLAUDE.md failure modes"
    ),
    onset_seconds: float = Query(
        ..., gt=0.0, le=3600.0,
        description="Seconds from now until severity reaches 1.0 and the "
                    "machine transitions to DOWN. Range: 0 < t <= 3600.",
    ),
):
    """Schedule a failure-mode degradation that ramps linearly from
    severity=0 (now) to severity=1 (onset_seconds from now). Sensors
    affected per the mode's CLAUDE.md spec; unaffected sensors stay
    at baseline."""
    engine = get_engine()
    try:
        engine.inject_failure(mode=mode, onset_seconds=onset_seconds)
    except RuntimeError as exc:
        raise HTTPException(status_code=409, detail=str(exc))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return {"message": "failure injected", "status": engine.status()}


@router.post("/clear-failure")
async def clear_failure():
    """Cancel any active failure-mode degradation. Sensors return to
    baseline immediately; cycle state is unchanged (no auto-recovery
    from DOWN — call /reset for that)."""
    engine = get_engine()
    engine.clear_failure()
    return {"message": "failure cleared", "status": engine.status()}


@router.post("/generate-training-data")
async def generate_training_data(
    duration_hours: float = Query(
        ..., gt=0.0, le=8760.0,
        description="Simulated hours of telemetry to generate. 1 year max.",
    ),
    failure_probability: float = Query(
        0.15, ge=0.0, le=1.0,
        description="Probability of a failure onset starting per simulated "
                    "hour. CLAUDE.md spec is 0.05; 0.15 produces a denser "
                    "dataset for ML training.",
    ),
):
    """Fast-gen mode: generates a labelled training dataset into a fresh
    SimRun (separate from live's sim_run_id=1). Returns counts when
    complete. Expect ~60-90 seconds for duration_hours=168.

    Cannot run while the live engine is running — call /stop first."""
    engine = get_engine()
    if engine.running:
        raise HTTPException(
            status_code=409,
            detail="live engine is running; call /stop first",
        )
    try:
        result = await run_fast_gen(
            duration_hours=duration_hours,
            failure_probability=failure_probability,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return {"message": "fast-gen complete", **result}


@router.get("/status")
async def get_status():
    return get_engine().status()


@router.get("/telemetry/recent")
async def recent_telemetry(
    limit: int = Query(default=60, ge=1, le=1000),
    db: AsyncSession = Depends(get_db),
):
    """Most recent rows from the live SimRun (sim_run_id=1). Fast-gen
    runs are excluded — those are training data, not dashboard data."""
    result = await db.execute(
        select(Telemetry)
        .where(Telemetry.sim_run_id == LIVE_SIM_RUN_ID)
        .order_by(Telemetry.id.desc())
        .limit(limit)
    )
    rows = list(reversed(result.scalars().all()))
    return [
        {
            "id": r.id,
            "timestamp_sim": r.timestamp_sim.isoformat(),
            "state": r.state,
            "induction_power": r.induction_power,
            "coil_voltage": r.coil_voltage,
            "quench_water_temp": r.quench_water_temp,
            "quench_water_flow": r.quench_water_flow,
            "quench_pressure": r.quench_pressure,
            "coil_scan_speed": r.coil_scan_speed,
            "part_temp": r.part_temp,
            "vibration": r.vibration,
            "failure_mode": r.failure_mode,
            "time_to_failure_s": r.time_to_failure_s,
        }
        for r in rows
    ]
