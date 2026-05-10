import logging
from datetime import datetime
from typing import Any

from sqlalchemy import select

from backend.database import AsyncSessionLocal
from backend.models import MachineConfig, SimRun, Telemetry

logger = logging.getLogger(__name__)


class TelemetryWriter:
    """Async writer for telemetry rows. One row at a time for live mode;
    batch insert for fast-gen (Module 3).
    """

    def __init__(self, sim_run_id: int) -> None:
        self.sim_run_id = sim_run_id

    async def write_row(self, row: dict[str, Any]) -> None:
        async with AsyncSessionLocal() as session:
            async with session.begin():
                session.add(Telemetry(sim_run_id=self.sim_run_id, **row))

    async def write_batch(self, rows: list[dict[str, Any]]) -> None:
        if not rows:
            return
        async with AsyncSessionLocal() as session:
            async with session.begin():
                session.add_all(
                    [Telemetry(sim_run_id=self.sim_run_id, **r) for r in rows]
                )


async def get_or_create_live_sim_run() -> int:
    """The live dashboard always writes to a single SimRun (id=1).
    Fast-gen runs create their own SimRun per invocation (id >= 2).

    Also upserts machine_config so the AI engine always reads the authoritative
    coil_expected_parts value written here rather than a separate hardcoded constant.
    """
    # Imported here to avoid circular import (engine -> persistence -> engine).
    from backend.simulation.engine import COIL_EXPECTED_PARTS, LIVE_SIM_RUN_ID

    async with AsyncSessionLocal() as session:
        async with session.begin():
            result = await session.execute(
                select(SimRun).where(SimRun.id == LIVE_SIM_RUN_ID)
            )
            run = result.scalar_one_or_none()
            if run is None:
                run = SimRun(
                    id=LIVE_SIM_RUN_ID,
                    status="RUNNING",
                    total_rows=0,
                    start_time=datetime.utcnow(),
                    session_start_time=datetime.utcnow(),
                )
                session.add(run)
                logger.info("created live SimRun id=%d", LIVE_SIM_RUN_ID)

            # Upsert authoritative config values so the AI engine can read them
            # without duplicating constants across two services.
            cfg = await session.get(MachineConfig, "coil_expected_parts")
            if cfg is None:
                session.add(MachineConfig(key="coil_expected_parts", value=str(COIL_EXPECTED_PARTS)))
            else:
                cfg.value = str(COIL_EXPECTED_PARTS)

            return run.id
