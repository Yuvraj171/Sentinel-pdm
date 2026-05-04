"""Single tick loop driving the cycle + physics + persistence.

Module 1: live mode only (1Hz with asyncio.sleep).
Module 3 will add fast-gen mode (no sleep, batched writes, look-ahead labels).
"""

import asyncio
import logging
from dataclasses import asdict
from datetime import datetime
from typing import Optional

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.config import settings
from backend.models import SimRun, Telemetry
from backend.simulation.cycle import MachineCycle
from backend.simulation.persistence import TelemetryWriter, get_or_create_live_sim_run
from backend.simulation.physics import (
    SensorReading,
    apply_failure_signature,
    generate_normal_reading,
)

logger = logging.getLogger(__name__)


class SimulationEngine:
    def __init__(self) -> None:
        self.cycle = MachineCycle()
        self.writer: Optional[TelemetryWriter] = None
        self.task: Optional[asyncio.Task] = None
        self.running: bool = False
        self.last_reading: Optional[SensorReading] = None
        self.last_state: str = "IDLE"
        self.tick_count: int = 0
        self.failure_mode: str = "normal"
        self.failure_severity: float = 0.0
        self._lifecycle_lock: Optional[asyncio.Lock] = None

    def _lock(self) -> asyncio.Lock:
        # Lazy: asyncio.Lock() must be created inside a running event loop.
        if self._lifecycle_lock is None:
            self._lifecycle_lock = asyncio.Lock()
        return self._lifecycle_lock

    async def start(self) -> None:
        async with self._lock():
            if self.running:
                logger.warning("start called but engine is already running")
                return
            sim_run_id = await get_or_create_live_sim_run()
            self.writer = TelemetryWriter(sim_run_id=sim_run_id)
            self.cycle.reset()
            self.tick_count = 0
            self.running = True
            self.task = asyncio.create_task(self._run_loop(), name="sim-tick-loop")
            logger.info(
                "simulation started (sim_run_id=%d, tick_hz=%.2f)",
                sim_run_id, settings.simulator_tick_rate_hz,
            )

    async def stop(self) -> None:
        async with self._lock():
            await self._stop_inner()

    async def _stop_inner(self) -> None:
        if not self.running and self.task is None:
            return
        self.running = False
        if self.task is not None:
            try:
                await asyncio.wait_for(self.task, timeout=2.0)
            except asyncio.TimeoutError:
                logger.warning("tick loop did not exit within 2s; cancelling")
                self.task.cancel()
                try:
                    await self.task
                except (asyncio.CancelledError, Exception):
                    pass
        self.task = None
        logger.info("simulation stopped after %d ticks", self.tick_count)

    async def reset(self, session: AsyncSession) -> None:
        async with self._lock():
            await self._stop_inner()
            await session.execute(delete(Telemetry))
            result = await session.execute(select(SimRun).where(SimRun.id == 1))
            run = result.scalar_one_or_none()
            if run is not None:
                run.total_rows = 0
            await session.commit()
            self.cycle.reset()
            self.tick_count = 0
            self.last_reading = None
            self.last_state = "IDLE"
            logger.info("simulation reset: telemetry cleared, cycle reset")

    async def _run_loop(self) -> None:
        period = 1.0 / settings.simulator_tick_rate_hz
        try:
            while self.running:
                try:
                    await self._tick()
                except Exception:
                    logger.exception("tick failed; halting engine")
                    self.running = False
                    self.cycle.fail()
                    break
                await asyncio.sleep(period)
        except asyncio.CancelledError:
            logger.info("tick loop cancelled")
            raise
        except Exception:
            logger.exception("tick loop crashed")
            raise

    async def _tick(self) -> None:
        cs = self.cycle.advance()
        progress = self.cycle.progress
        reading = generate_normal_reading(cs.state, progress)
        if self.failure_mode != "normal":
            reading = apply_failure_signature(
                reading, self.failure_mode, self.failure_severity
            )

        row = {
            "timestamp_sim": datetime.utcnow(),
            **asdict(reading),
            "state": cs.state,
            "coil_life_counter": 0,
            "ok_count": cs.cycle_count,
            "ng_count": 0,
            "failure_mode": self.failure_mode,
            "time_to_failure_s": None,
            "will_fail_10min": None,
            "is_anomaly": False,
            "downtime_reason": None,
            "ng_reason": None,
            "repair_time": 0.0,
        }
        assert self.writer is not None
        await self.writer.write_row(row)

        self.last_reading = reading
        self.last_state = cs.state
        self.tick_count += 1

    def status(self) -> dict:
        return {
            "running": self.running,
            "state": self.last_state,
            "tick_count": self.tick_count,
            "cycle_count": self.cycle.s.cycle_count,
            "failure_mode": self.failure_mode,
            "last_reading": asdict(self.last_reading) if self.last_reading else None,
        }


_engine: Optional[SimulationEngine] = None


def get_engine() -> SimulationEngine:
    global _engine
    if _engine is None:
        _engine = SimulationEngine()
    return _engine
