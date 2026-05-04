"""Fast-generation mode.

Generates N hours of telemetry into a fresh SimRun in a tight Python loop
(no asyncio.sleep). Used to build the training dataset that pdm-ai-engine
trains on. Two phases:

  1. Generate rows in memory, batch-insert in chunks of BATCH_SIZE.
     Failures sampled stochastically per failure_probability/hour;
     onset durations sampled from CLAUDE.md ranges; auto-recover from
     DOWN after REPAIR_DURATION_S simulated seconds so a single run
     produces many failure events.

  2. Compute will_fail_10min via look-ahead pass: for every non-DOWN
     row, look forward in time; if a DOWN row exists within the next
     600 simulated seconds (same SimRun), label TRUE; else FALSE.
     DOWN rows themselves stay NULL (they're not training inputs —
     model's job is to predict before failure, not after).

The same physics + cycle modules used in live mode are used here; no
train-serve skew.
"""

import bisect
import logging
import random
from dataclasses import asdict
from datetime import datetime, timedelta
from typing import Optional

from sqlalchemy import insert, select, update

from backend.database import AsyncSessionLocal
from backend.models import SimRun, Telemetry
from backend.simulation.cycle import DOWN, MachineCycle
from backend.simulation.physics import (
    apply_failure_signature,
    generate_normal_reading,
)

logger = logging.getLogger(__name__)


VALID_FAILURE_MODES = ("coolant_pump", "quench_system", "power_supply")

# Per CLAUDE.md: onset duration ranges per mode (in simulated seconds).
ONSET_RANGES_S = {
    "coolant_pump":  (1800, 3600),  # 30-60 min, gradual
    "quench_system": (300, 900),    # 5-15 min, semi-abrupt
    "power_supply":  (1200, 2400),  # 20-40 min, gradual
}

# Time the machine sits in DOWN before auto-recovering to IDLE.
# 5 simulated minutes — short enough to fit many failure events into
# 168h, long enough that DOWN rows are present in the dataset.
REPAIR_DURATION_S = 300

# Rows per multi-row INSERT. Postgres handles 1000-row inserts efficiently;
# memory cost ~250 KB per batch.
BATCH_SIZE = 1000

# Look-ahead horizon for the will_fail_10min label.
WILL_FAIL_HORIZON_S = 600

# Update batch size for the labelling phase.
LABEL_UPDATE_BATCH = 5000


async def run_fast_gen(
    duration_hours: float,
    failure_probability: float,
    start_time: Optional[datetime] = None,
) -> dict:
    """Generate `duration_hours` of telemetry into a new SimRun.
    Returns counts: rows, failure_events, rows_will_fail_10min, sim_run_id.
    """
    if duration_hours <= 0:
        raise ValueError("duration_hours must be > 0")
    if not 0.0 <= failure_probability <= 1.0:
        raise ValueError("failure_probability must be in [0, 1]")

    if start_time is None:
        start_time = datetime.utcnow()
    total_seconds = int(duration_hours * 3600)

    # Per-hour probability -> per-second probability for the Bernoulli sample
    # at each tick. (1 - p_hour) = (1 - p_sec)^3600  =>  p_sec = 1 - (1-p_hour)^(1/3600).
    p_per_sec = (
        0.0 if failure_probability == 0.0
        else 1.0 - (1.0 - failure_probability) ** (1.0 / 3600.0)
    )

    sim_run_id = await _create_sim_run(start_time)
    logger.info(
        "fast-gen started: sim_run_id=%d duration_h=%.2f p=%.4f total_s=%d",
        sim_run_id, duration_hours, failure_probability, total_seconds,
    )

    cycle = MachineCycle()
    failure_mode = "normal"
    failure_onset_s = 0.0
    failure_elapsed_s = 0.0
    repair_elapsed_s = 0
    failure_count = 0
    rows_written = 0
    batch: list[dict] = []

    for tick in range(total_seconds):
        sim_time = start_time + timedelta(seconds=tick)

        # 1. Schedule a new failure if eligible: not in failure, not DOWN.
        if (
            failure_mode == "normal"
            and cycle.state != DOWN
            and p_per_sec > 0.0
            and random.random() < p_per_sec
        ):
            failure_mode = random.choice(VALID_FAILURE_MODES)
            lo, hi = ONSET_RANGES_S[failure_mode]
            failure_onset_s = float(random.randint(lo, hi))
            failure_elapsed_s = 0.0
            failure_count += 1

        # 2. Advance failure progression. Same invariant as engine.py:
        #    1 tick = 1 simulated second.
        in_failure = failure_mode != "normal"
        if in_failure:
            failure_elapsed_s += 1.0
            severity = min(1.0, failure_elapsed_s / failure_onset_s)
            if severity >= 1.0 and cycle.state != DOWN:
                cycle.fail()
                repair_elapsed_s = 0
        else:
            severity = 0.0

        # 3. Auto-recover from DOWN after the repair window so the run
        #    can produce more failure events. Cycle restarts in IDLE.
        if cycle.state == DOWN:
            repair_elapsed_s += 1
            if repair_elapsed_s >= REPAIR_DURATION_S:
                cycle.reset()
                failure_mode = "normal"
                failure_onset_s = 0.0
                failure_elapsed_s = 0.0
                repair_elapsed_s = 0
                in_failure = False
                severity = 0.0

        # 4. Cycle advance + reading generation (same physics module
        #    as live mode — zero train-serve skew).
        cs = cycle.advance()
        progress = cycle.progress
        reading = generate_normal_reading(cs.state, progress)
        if in_failure and cs.state != DOWN:
            reading = apply_failure_signature(
                reading, failure_mode, severity, cs.state,
            )

        ttf = (
            max(0.0, failure_onset_s - failure_elapsed_s)
            if in_failure else None
        )

        batch.append({
            "sim_run_id": sim_run_id,
            "timestamp_sim": sim_time,
            **asdict(reading),
            "state": cs.state,
            "coil_life_counter": 0,
            "ok_count": cs.cycle_count,
            "ng_count": 0,
            "failure_mode": failure_mode,
            "time_to_failure_s": ttf,
            "will_fail_10min": None,  # filled by post-pass below
            "is_anomaly": False,
            "downtime_reason": (
                failure_mode if cs.state == DOWN and in_failure else None
            ),
            "ng_reason": None,
            "repair_time": 0.0,
        })

        if len(batch) >= BATCH_SIZE:
            await _flush_batch(batch)
            rows_written += len(batch)
            batch = []
            if rows_written % (BATCH_SIZE * 50) == 0:
                logger.info(
                    "fast-gen progress: %d / %d rows (%.0f%%)",
                    rows_written, total_seconds,
                    100.0 * rows_written / total_seconds,
                )

    if batch:
        await _flush_batch(batch)
        rows_written += len(batch)

    logger.info(
        "fast-gen rows complete: %d rows, %d failure events. labelling...",
        rows_written, failure_count,
    )

    labelled_true = await _label_will_fail_10min(sim_run_id)

    await _mark_run_completed(sim_run_id, rows_written)

    logger.info(
        "fast-gen complete: sim_run_id=%d rows=%d failures=%d "
        "rows_will_fail_10min=%d",
        sim_run_id, rows_written, failure_count, labelled_true,
    )
    return {
        "sim_run_id": sim_run_id,
        "rows": rows_written,
        "failure_events": failure_count,
        "rows_will_fail_10min": labelled_true,
    }


async def _create_sim_run(start_time: datetime) -> int:
    async with AsyncSessionLocal() as session:
        async with session.begin():
            run = SimRun(
                status="GENERATING",
                start_time=start_time,
                session_start_time=start_time,
            )
            session.add(run)
            await session.flush()
            return run.id


async def _flush_batch(batch: list[dict]) -> None:
    """Single multi-row INSERT — much faster than session.add_all() loops."""
    async with AsyncSessionLocal() as session:
        async with session.begin():
            await session.execute(insert(Telemetry).values(batch))


async def _mark_run_completed(sim_run_id: int, rows: int) -> None:
    async with AsyncSessionLocal() as session:
        async with session.begin():
            run = await session.get(SimRun, sim_run_id)
            if run is not None:
                run.status = "COMPLETED"
                run.total_rows = rows


async def _label_will_fail_10min(sim_run_id: int) -> int:
    """Compute will_fail_10min for every non-DOWN row in this SimRun.

    O(N) algorithm: collect DOWN timestamps sorted, then for each row
    bisect to find the next DOWN; if it's within WILL_FAIL_HORIZON_S,
    label TRUE, else FALSE. Updates issued in batches.

    Returns the count of TRUE-labelled rows.
    """
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(Telemetry.id, Telemetry.timestamp_sim, Telemetry.state)
            .where(Telemetry.sim_run_id == sim_run_id)
            .order_by(Telemetry.timestamp_sim)
        )
        rows = result.all()

    down_timestamps = [ts for (_, ts, st) in rows if st == DOWN]
    horizon = timedelta(seconds=WILL_FAIL_HORIZON_S)

    true_ids: list[int] = []
    false_ids: list[int] = []

    for row_id, ts, state in rows:
        if state == DOWN:
            continue  # leave NULL — not a training input
        idx = bisect.bisect_right(down_timestamps, ts)
        if idx < len(down_timestamps):
            next_down = down_timestamps[idx]
            if next_down - ts <= horizon:
                true_ids.append(row_id)
                continue
        false_ids.append(row_id)

    async with AsyncSessionLocal() as session:
        async with session.begin():
            await _bulk_update_label(session, true_ids, True)
            await _bulk_update_label(session, false_ids, False)

    return len(true_ids)


async def _bulk_update_label(session, ids: list[int], value: bool) -> None:
    if not ids:
        return
    for i in range(0, len(ids), LABEL_UPDATE_BATCH):
        chunk = ids[i:i + LABEL_UPDATE_BATCH]
        await session.execute(
            update(Telemetry)
            .where(Telemetry.id.in_(chunk))
            .values(will_fail_10min=value)
        )
