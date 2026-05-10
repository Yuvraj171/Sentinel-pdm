"""Live prediction loop — polls Postgres every second, writes AI scores back."""
from __future__ import annotations

import asyncio
import logging

import pandas as pd
from sqlalchemy import text

from sentinel_pdm.config import settings
from sentinel_pdm.database import async_session
from sentinel_pdm.services.predictor import Predictor

log = logging.getLogger(__name__)


# Hard cap on how many unscored rows we'll catch up on per tick. Prevents the
# loop from sitting on one giant batch if the simulator outpaced poll for a
# while. 60 rows = ~1 minute of live-rate telemetry per second of wall-clock
# work — fast enough to drain a fresh-start gap, slow enough that a single
# bad row can't stall the loop.
MAX_CATCHUP_PER_TICK = 60

# poll.py is the LIVE prediction loop only. Fast-gen training runs are written
# under sim_run_id >= 2 and have no need for ai_status (they're for training,
# not the dashboard). Without this filter the loop wastes cycles on training
# backlog and live rows pile up unscored.
LIVE_SIM_RUN_ID = 1


async def run_poll_loop(predictor: Predictor) -> None:
    """Score every unscored LIVE row from oldest to newest.

    Original implementation only scored the LATEST unscored row. If the
    simulator ever outran the predictor (typical right after a fresh start
    while the model warms up), in-between rows stayed `ai_status=NULL`
    permanently — and `/api/recent-predictions` filters those out, leaving
    visible gaps in the live chart.

    Now: pull the next batch of unscored ids from sim_run_id=1 in ascending
    order and score them in sequence, capped per tick so we never block on
    a huge backlog. Other sim_run_ids (training data) are ignored.
    """
    log.info("Poll loop started — interval %.1fs (live sim_run_id=%d only)",
             settings.poll_interval_s, LIVE_SIM_RUN_ID)
    while True:
        try:
            async with async_session() as session:
                # Oldest unscored LIVE ids first — closes the NULL gap.
                # Pull (id, state) so DOWN rows can short-circuit without
                # invoking the model. Running the classifier on DOWN-phase
                # rows produces meaningless flickering predictions because
                # all sensors collapse to 0 (out-of-distribution for the
                # training set, which only saw operating-cycle data).
                target_q = await session.execute(text("""
                    SELECT id, state FROM telemetry
                    WHERE ai_status IS NULL
                      AND sim_run_id = :sim_run_id
                    ORDER BY id ASC
                    LIMIT :cap
                """), {"cap": MAX_CATCHUP_PER_TICK, "sim_run_id": LIVE_SIM_RUN_ID})
                target_rows = target_q.fetchall()
                target_ids = [r[0] for r in target_rows]
                target_states = {r[0]: r[1] for r in target_rows}

                for target_id in target_ids:
                    # DOWN-phase short-circuit: machine has already failed,
                    # so "risk of failure" is meaningless. Write a fixed
                    # HALTED status with risk=0 and skip the model entirely.
                    # The dashboard treats HALTED as a distinct visual state
                    # so the UI doesn't keep flickering between OK/WARNING.
                    if target_states.get(target_id) == "DOWN":
                        await session.execute(text("""
                            UPDATE telemetry
                            SET ai_risk_score    = 0,
                                ai_anomaly_score = 0,
                                ai_status        = 'HALTED'
                            WHERE id = :id
                        """), {"id": target_id})
                        continue

                    # Fetch 300 rows ending at target_id for rolling features.
                    # Must scope to the same sim_run as the target — otherwise
                    # the first ~300 live rows after a fresh-start would pull
                    # training-run rows into the rolling window, polluting
                    # features with a different simulation regime.
                    result = await session.execute(text("""
                        SELECT id, timestamp_sim,
                               induction_power, coil_voltage, quench_water_temp,
                               quench_water_flow, quench_pressure, coil_scan_speed,
                               part_temp, vibration
                        FROM telemetry
                        WHERE id <= :target_id
                          AND sim_run_id = :sim_run_id
                        ORDER BY id DESC
                        LIMIT 300
                    """), {"target_id": target_id, "sim_run_id": LIVE_SIM_RUN_ID})
                    rows = result.mappings().all()

                    if len(rows) < 10:
                        # Not enough history yet — leave NULL, retry next tick.
                        continue

                    df = pd.DataFrame(rows)
                    df = df.sort_values("id").reset_index(drop=True)
                    prediction = predictor.predict(df)

                    await session.execute(text("""
                        UPDATE telemetry
                        SET ai_risk_score    = :risk,
                            ai_anomaly_score = :anomaly,
                            ai_status        = :status
                        WHERE id = :id
                    """), {
                        "risk":    prediction["ai_risk_score"],
                        "anomaly": prediction["ai_anomaly_score"],
                        "status":  prediction["ai_status"],
                        "id":      target_id,
                    })

                if target_ids:
                    await session.commit()
                    log.info("scored %d row(s); ids=%d..%d",
                             len(target_ids), target_ids[0], target_ids[-1])

        except Exception:
            log.exception("Poll loop error — continuing")

        await asyncio.sleep(settings.poll_interval_s)


async def main() -> None:
    logging.basicConfig(level=logging.INFO,
                        format="%(asctime)s %(levelname)s %(message)s")
    predictor = Predictor()
    await run_poll_loop(predictor)


if __name__ == "__main__":
    asyncio.run(main())
