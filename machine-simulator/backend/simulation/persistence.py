import logging
from datetime import datetime
from typing import Any

from sqlalchemy import select

from backend.database import AsyncSessionLocal
from backend.models import SimRun, Telemetry

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
    Fast-gen runs (Module 3) will create their own SimRun per invocation.
    """
    async with AsyncSessionLocal() as session:
        async with session.begin():
            result = await session.execute(select(SimRun).where(SimRun.id == 1))
            run = result.scalar_one_or_none()
            if run is None:
                run = SimRun(
                    id=1,
                    status="RUNNING",
                    total_rows=0,
                    start_time=datetime.utcnow(),
                    session_start_time=datetime.utcnow(),
                )
                session.add(run)
                logger.info("created live SimRun id=1")
            return run.id
