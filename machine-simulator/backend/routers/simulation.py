import logging

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database import get_db
from backend.models import Telemetry
from backend.simulation.engine import get_engine

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
    """Stops the engine, drops all telemetry rows, resets cycle counters
    — atomic under the engine lifecycle lock."""
    engine = get_engine()
    await engine.reset(db)
    return {"message": "reset complete", "status": engine.status()}


@router.get("/status")
async def get_status():
    return get_engine().status()


@router.get("/telemetry/recent")
async def recent_telemetry(
    limit: int = Query(default=60, ge=1, le=1000),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Telemetry).order_by(Telemetry.id.desc()).limit(limit)
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
