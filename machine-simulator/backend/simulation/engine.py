"""Single tick loop driving the cycle + physics + persistence.

Module 1: live mode only (1Hz with asyncio.sleep).
Module 2: failure-mode injection with linear severity ramp; auto-transition
to DOWN when severity reaches 1.0.
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
from backend.simulation.cycle import DOWN, MachineCycle
from backend.simulation.persistence import TelemetryWriter, get_or_create_live_sim_run
from backend.simulation.physics import (
    SensorReading,
    apply_failure_signature,
    generate_normal_reading,
)

logger = logging.getLogger(__name__)


VALID_FAILURE_MODES = ("coolant_pump", "quench_system", "power_supply")

# Live mode always writes to a single SimRun (id=1). Fast-gen runs
# create their own SimRuns starting from id=2.
LIVE_SIM_RUN_ID = 1


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
        self.failure_onset_duration_s: float = 0.0
        self.failure_elapsed_s: float = 0.0
        self._lifecycle_lock: Optional[asyncio.Lock] = None

    def _lock(self) -> asyncio.Lock:
        # Lazy: asyncio.Lock() must be created inside a running event loop.
        if self._lifecycle_lock is None:
            self._lifecycle_lock = asyncio.Lock()
        return self._lifecycle_lock

    @property
    def failure_severity(self) -> float:
        if self.failure_mode == "normal" or self.failure_onset_duration_s <= 0.0:
            return 0.0
        return min(1.0, self.failure_elapsed_s / self.failure_onset_duration_s)

    @property
    def time_to_failure_s(self) -> Optional[float]:
        if self.failure_mode == "normal":
            return None
        return max(0.0, self.failure_onset_duration_s - self.failure_elapsed_s)

    async def start(self) -> None:
        async with self._lock():
            if self.running:
                logger.warning("start called but engine is already running")
                return
            sim_run_id = await get_or_create_live_sim_run()
            self.writer = TelemetryWriter(sim_run_id=sim_run_id)
            self.cycle.reset()
            self._reset_failure_state()
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
            # Scope deletion to the live SimRun — fast-gen training data
            # under other SimRun ids is preserved.
            await session.execute(
                delete(Telemetry).where(Telemetry.sim_run_id == LIVE_SIM_RUN_ID)
            )
            result = await session.execute(
                select(SimRun).where(SimRun.id == LIVE_SIM_RUN_ID)
            )
            run = result.scalar_one_or_none()
            if run is not None:
                run.total_rows = 0
            await session.commit()
            self.cycle.reset()
            self._reset_failure_state()
            self.tick_count = 0
            self.last_reading = None
            self.last_state = "IDLE"
            logger.info(
                "simulation reset: live telemetry (sim_run_id=%d) cleared, "
                "cycle reset", LIVE_SIM_RUN_ID,
            )

    def inject_failure(self, mode: str, onset_seconds: float) -> None:
        """Schedule a failure-mode degradation. Validation done by router.

        Caller must hold no lock; the lifecycle lock isn't required here
        because failure state is read inside _tick (single async task).
        """
        if mode not in VALID_FAILURE_MODES:
            raise ValueError(
                f"invalid failure mode: {mode!r} "
                f"(must be one of {VALID_FAILURE_MODES})"
            )
        if onset_seconds <= 0:
            raise ValueError(f"onset_seconds must be > 0; got {onset_seconds}")
        if not self.running:
            raise RuntimeError("engine is not running; call /start first")
        if self.failure_mode != "normal":
            raise RuntimeError(
                f"failure already active ({self.failure_mode}); "
                f"call /clear-failure first"
            )
        if self.cycle.state == DOWN:
            raise RuntimeError("machine is DOWN; call /reset first")
        self.failure_mode = mode
        self.failure_onset_duration_s = float(onset_seconds)
        self.failure_elapsed_s = 0.0
        logger.info(
            "failure injected: mode=%s onset_s=%.1f",
            mode, onset_seconds,
        )

    def clear_failure(self) -> None:
        if self.failure_mode == "normal":
            return
        previous = self.failure_mode
        self._reset_failure_state()
        logger.info("failure cleared: was %s", previous)

    def _reset_failure_state(self) -> None:
        self.failure_mode = "normal"
        self.failure_onset_duration_s = 0.0
        self.failure_elapsed_s = 0.0

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
        # 1. Advance failure state first; if we just hit severity=1, fail
        #    the cycle BEFORE generating the reading, so the row written
        #    is the first DOWN row with time_to_failure_s = 0.
        in_failure = self.failure_mode != "normal"
        if in_failure:
            # Invariant: 1 tick = 1 simulated second. Holds for live mode
            # at the CLAUDE.md-spec 1Hz tick rate, and for Module 3 fast-gen
            # which decouples wall-clock from simulated time entirely.
            self.failure_elapsed_s += 1.0
            if self.failure_severity >= 1.0 and self.cycle.state != DOWN:
                logger.warning(
                    "failure %s reached severity=1.0; transitioning to DOWN",
                    self.failure_mode,
                )
                self.cycle.fail()

        # 2. Advance the cycle state machine.
        cs = self.cycle.advance()
        progress = self.cycle.progress
        reading = generate_normal_reading(cs.state, progress)

        # 3. Apply failure signature if any (no-op once cs.state == DOWN
        #    since most signature functions early-return on non-target states).
        if in_failure and cs.state != DOWN:
            reading = apply_failure_signature(
                reading, self.failure_mode, self.failure_severity, cs.state,
            )

        row = {
            "timestamp_sim": datetime.utcnow(),
            **asdict(reading),
            "state": cs.state,
            "coil_life_counter": 0,
            "ok_count": cs.cycle_count,
            "ng_count": 0,
            "failure_mode": self.failure_mode,
            "time_to_failure_s": self.time_to_failure_s,
            "will_fail_10min": None,
            "is_anomaly": False,
            "downtime_reason": (
                self.failure_mode if cs.state == DOWN and in_failure else None
            ),
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
            "failure_severity": round(self.failure_severity, 4),
            "time_to_failure_s": self.time_to_failure_s,
            "last_reading": asdict(self.last_reading) if self.last_reading else None,
        }


_engine: Optional[SimulationEngine] = None


def get_engine() -> SimulationEngine:
    global _engine
    if _engine is None:
        _engine = SimulationEngine()
    return _engine
