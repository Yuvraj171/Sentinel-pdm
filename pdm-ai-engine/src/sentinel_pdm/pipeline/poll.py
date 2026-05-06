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


async def run_poll_loop(predictor: Predictor) -> None:
    log.info("Poll loop started — interval %.1fs", settings.poll_interval_s)
    while True:
        try:
            async with async_session() as session:
                # Fetch the single latest unscored row
                target = await session.execute(text("""
                    SELECT id FROM telemetry
                    WHERE ai_status IS NULL
                    ORDER BY id DESC
                    LIMIT 1
                """))
                target_row = target.fetchone()

                if target_row is not None:
                    target_id = target_row[0]

                    # Fetch 300 rows ending at target_id for rolling-window context
                    result = await session.execute(text("""
                        SELECT id, timestamp_sim,
                               induction_power, coil_voltage, quench_water_temp,
                               quench_water_flow, quench_pressure, coil_scan_speed,
                               part_temp, vibration
                        FROM telemetry
                        WHERE id <= :target_id
                        ORDER BY id DESC
                        LIMIT 300
                    """), {"target_id": target_id})
                    rows = result.mappings().all()

                    if len(rows) >= 10:
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
                        await session.commit()
                        log.info("id=%d  risk=%.3f  anomaly=%.3f  status=%s",
                                 target_id,
                                 prediction["ai_risk_score"],
                                 prediction["ai_anomaly_score"],
                                 prediction["ai_status"])

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
