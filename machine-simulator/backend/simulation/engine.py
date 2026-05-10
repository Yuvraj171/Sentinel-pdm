"""Single tick loop driving the cycle + physics + persistence.

Module 1: live mode only (1Hz with asyncio.sleep).
Module 2: failure-mode injection with linear severity ramp; auto-transition
to DOWN when severity reaches 1.0.
Module 3 will add fast-gen mode (no sleep, batched writes, look-ahead labels).
"""

import asyncio
import logging
import random
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

# Consumable wear: a fresh induction coil is rated for ~5000 quench cycles
# in this simulator. Counter increments per completed cycle; dashboard shows
# remaining %% as a maintenance heads-up.
COIL_EXPECTED_PARTS = 5000

# Production batches roll every BATCH_SIZE completed cycles. Lets the
# dashboard show "current batch progress" without requiring a real schedule.
BATCH_SIZE = 60

# Operator name per shift. Plant-floor demo: rotating crew, one per shift.
# Shift mapping: hour 0-7 -> C, 8-15 -> A, 16-23 -> B.
OPERATORS_BY_SHIFT = {"A": "Maya Chen", "B": "Ravi P.", "C": "S. O'Brien"}


class SimulationEngine:
    # Map failure mode -> the most plausible "ng_reason" tag that appears on
    # rejected parts during that mode. This is the same string the ticker /
    # alert UI surfaces to operators so the rejection cause is legible.
    NG_REASON_BY_MODE = {
        "coolant_pump":  "under_quenched",
        "quench_system": "soft_part",
        "power_supply":  "uneven_hardness",
    }

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
        # Running production counters since /start (or /reset). Each completed
        # cycle increments exactly one of these based on the OK/NG decision.
        self.ok_count: int = 0
        self.ng_count: int = 0
        self.last_ng_reason: Optional[str] = None
        # Consumable + identity tracking. All increment on cycle completion;
        # batch_index rolls up every BATCH_SIZE parts. Reset on start/reset
        # but NOT on clear_failure (clearing a failure shouldn't replace the coil).
        self.coil_life_counter: int = 0
        self.batch_index: int = 1
        self.part_seq_in_batch: int = 0
        # Post-peak burn-through: once severity reaches 1.0 the machine does
        # NOT trip immediately. Instead it runs 2-4 more cycles (all NG) so
        # the parts ticker shows a clean run of solid-red boxes before DOWN.
        # _post_peak_limit is randomised on first peak; _post_peak_cycles
        # counts completed cycles since then.
        self._post_peak_cycles: int = 0
        self._post_peak_limit: int = 0
        # Last known downtime cause, persisted through repair() so it survives
        # even if failure_mode is cleared before repair is called. Cleared only
        # on reset() (Fresh Start), not on repair().
        self._last_downtime_reason: Optional[str] = None
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
            self.ok_count = 0
            self.ng_count = 0
            self.last_ng_reason = None
            self.coil_life_counter = 0
            self.batch_index = 1
            self.part_seq_in_batch = 0
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
            self.ok_count = 0
            self.ng_count = 0
            self.last_ng_reason = None
            self.coil_life_counter = 0
            self.batch_index = 1
            self.part_seq_in_batch = 0
            self.last_reading = None
            self.last_state = "IDLE"
            self._last_downtime_reason = None
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

    def repair(self) -> bool:
        """Recover from a tripped/degraded state without resetting counters.

        Differs from `/reset` (which truncates telemetry + zeroes coil life,
        batch index, ok/ng totals) and from `/clear-failure` (which only
        clears the failure ramp but leaves the cycle in DOWN). Repair does
        BOTH atomically: clears the failure AND, if the cycle is DOWN,
        transitions it back to IDLE so the engine resumes producing parts.

        Counters (coil_life_counter, batch_index, ok/ng totals) are
        preserved — repairing a tripped line shouldn't replace the coil or
        wipe the shift's production history.

        Returns True if anything actually changed (failure was active OR
        cycle was DOWN). Idempotent — repeated calls are no-ops.
        """
        was_failing = self.failure_mode != "normal"
        was_down = self.cycle.state == DOWN
        if not was_failing and not was_down:
            return False
        if was_failing:
            self._reset_failure_state()
        else:
            # Failure was already cleared (e.g. via clear_failure()) before
            # repair was called. Post-peak counters could still be non-zero;
            # reset them so they don't carry into the next failure injection.
            self._post_peak_cycles = 0
            self._post_peak_limit = 0
        if was_down:
            # Reset cycle to IDLE without clobbering the cycle counter —
            # MachineCycle.reset() resets cycle_count too, which we want
            # to keep so OEE/yield calculations stay stable.
            preserved_count = self.cycle.s.cycle_count
            self.cycle.reset()
            self.cycle.s.cycle_count = preserved_count
            self.last_state = "IDLE"
        logger.info(
            "repair: failing=%s, down=%s -> resumed",
            was_failing, was_down,
        )
        return True

    def _reset_failure_state(self) -> None:
        self.failure_mode = "normal"
        self.failure_onset_duration_s = 0.0
        self.failure_elapsed_s = 0.0
        self._post_peak_cycles = 0
        self._post_peak_limit = 0

    @staticmethod
    def _current_shift_id() -> str:
        """Map UTC hour to a shift letter. 0-7 -> C, 8-15 -> A, 16-23 -> B."""
        h = datetime.utcnow().hour
        return ("C", "A", "B")[h // 8]

    def _current_operator_id(self) -> str:
        return OPERATORS_BY_SHIFT[self._current_shift_id()]

    def _current_batch_id(self) -> str:
        return f"B-{self.batch_index:04d}"

    def _current_part_id(self) -> str:
        return f"P-{self.batch_index:04d}-{self.part_seq_in_batch:03d}"

    @property
    def coil_pct_remaining(self) -> float:
        return max(0.0, (1.0 - self.coil_life_counter / COIL_EXPECTED_PARTS) * 100.0)

    @staticmethod
    def _ng_probability(severity: float) -> float:
        """Probability a completed cycle produces an NG part at this severity.

        Escalating curve — three distinct regions designed for the 300s ramp:

            severity 0.00 -> 0.30  : 0.5%       (~90s clean production; AI
                                                  flags WARNING while sensors
                                                  drift but parts are still OK)
            severity 0.30 -> 0.60  : 0.5% -> 50%  (first NGs appear; mix of
                                                    OK and NG; cascade begins)
            severity 0.60 -> 0.85  : 50% -> 95%   (NGs dominate; occasional
                                                    lucky OK cycle possible)
            severity 0.85 -> 1.00  : 95% -> 100%  (virtually all NG; machine
                                                    nearing trip threshold)

        After severity=1.0 the post-peak burn-through runs 2-4 more cycles
        at 100% NG before the actual DOWN trip — so the ticker always shows
        a run of solid-red NG boxes right before the machine halts.
        """
        if severity <= 0.30:
            return 0.005
        if severity <= 0.60:
            t = (severity - 0.30) / 0.30
            return 0.005 + 0.495 * t          # 0.5% → 50%
        if severity <= 0.85:
            t = (severity - 0.60) / 0.25
            return 0.50 + 0.45 * t            # 50% → 95%
        t = (severity - 0.85) / 0.15
        return 0.95 + 0.05 * t                # 95% → 100%

    async def _run_loop(self) -> None:
        period = 1.0 / settings.simulator_tick_rate_hz
        try:
            while self.running:
                try:
                    await self._tick()
                except Exception:
                    logger.exception("tick failed; halting engine")
                    self.running = False
                    self._last_downtime_reason = self.failure_mode if self.failure_mode != "normal" else "internal_error"
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
                # Post-peak burn-through: on first tick past severity=1.0,
                # pick how many MORE cycles to run before tripping. This
                # ensures the parts ticker always shows a run of solid-red NG
                # boxes right before DOWN — rather than an abrupt mid-cycle trip.
                if self._post_peak_limit == 0:
                    self._post_peak_limit = random.randint(2, 4)
                    logger.warning(
                        "failure %s reached severity=1.0; burn-through %d cycle(s) before DOWN",
                        self.failure_mode, self._post_peak_limit,
                    )

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

        # 4. Score the part if a cycle just completed. During a failure ramp
        #    we roll NG probabilistically against severity — this is what
        #    produces the realistic "defect rate climbs before machine trips"
        #    cascade that the dashboard's parts ticker reflects.
        ng_reason_for_row: Optional[str] = None
        if cs.cycle_just_completed:
            severity = self.failure_severity if in_failure else 0.0
            if random.random() < self._ng_probability(severity):
                self.ng_count += 1
                self.last_ng_reason = (
                    self.NG_REASON_BY_MODE.get(self.failure_mode, "out_of_spec")
                    if in_failure else "sensor_noise"
                )
                ng_reason_for_row = self.last_ng_reason
            else:
                self.ok_count += 1
            # Wear + identity step forward exactly once per completed part.
            self.coil_life_counter += 1
            self.part_seq_in_batch += 1
            if (self.ok_count + self.ng_count) % BATCH_SIZE == 0:
                self.batch_index += 1
                self.part_seq_in_batch = 0

            # Post-peak trip: if we're past severity=1.0, count down the
            # burn-through cycles and trip once exhausted. Done AFTER scoring
            # so the final NG parts are recorded before the machine halts.
            if self._post_peak_limit > 0 and self.cycle.state != DOWN:
                self._post_peak_cycles += 1
                if self._post_peak_cycles >= self._post_peak_limit:
                    logger.warning(
                        "post-peak burn-through complete (%d cycles); tripping to DOWN",
                        self._post_peak_cycles,
                    )
                    self._last_downtime_reason = self.failure_mode
                    self.cycle.fail()

        row = {
            "timestamp_sim": datetime.utcnow(),
            **asdict(reading),
            "state": cs.state,
            "coil_life_counter": self.coil_life_counter,
            "ok_count": self.ok_count,
            "ng_count": self.ng_count,
            "part_id": self._current_part_id(),
            "shift_id": self._current_shift_id(),
            "operator_id": self._current_operator_id(),
            "failure_mode": self.failure_mode,
            "time_to_failure_s": self.time_to_failure_s,
            "will_fail_10min": None,
            "is_anomaly": False,
            "downtime_reason": self._last_downtime_reason if cs.state == DOWN else None,
            "ng_reason": ng_reason_for_row,
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
            # Cycle-anatomy widget reads these to render the current phase
            # and progress bar. phase_total_s = 0 for IDLE (no progress shown)
            # and DOWN.
            "cycle_state": self.cycle.s.state,
            "elapsed_in_state": self.cycle.s.elapsed_in_state,
            "phase_total_s": self.cycle.phase_duration,
            # Identity + consumable surfaces.
            "ok_count": self.ok_count,
            "ng_count": self.ng_count,
            "coil_life_counter": self.coil_life_counter,
            "coil_expected_parts": COIL_EXPECTED_PARTS,
            "coil_pct_remaining": round(self.coil_pct_remaining, 1),
            "batch_id": self._current_batch_id(),
            "batch_size": BATCH_SIZE,
            "part_id": self._current_part_id(),
            "part_seq_in_batch": self.part_seq_in_batch,
            "shift_id": self._current_shift_id(),
            "operator_id": self._current_operator_id(),
        }


_engine: Optional[SimulationEngine] = None


def get_engine() -> SimulationEngine:
    global _engine
    if _engine is None:
        _engine = SimulationEngine()
    return _engine
