"""FastAPI app — /health, /status, /predict endpoints."""
from __future__ import annotations

from contextlib import asynccontextmanager

import pandas as pd
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlalchemy import text

from sentinel_pdm.config import settings
from sentinel_pdm.database import async_session
from sentinel_pdm.services.predictor import Predictor

# Fallback used only if the machine_config table hasn't been seeded yet
# (e.g. first boot before the simulator has run). The simulator writes the
# authoritative value to machine_config.coil_expected_parts on startup.
_COIL_EXPECTED_PARTS_FALLBACK = 5000

# Live mode always writes to sim_run_id=1; fast-gen training runs use ids >= 2.
# Every dashboard endpoint must filter on this so a fast-gen export run never
# bleeds into the live operator/plant views. /api/ng-pareto and
# /api/yield-trend already do this; /api/production was historically missing
# the filter.
LIVE_SIM_RUN_ID = 1

from sentinel_pdm.monitoring.drift import compute_psi, _load_reference
from sentinel_pdm.training.features import compute_features


predictor: Predictor | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global predictor
    predictor = Predictor()
    yield


app = FastAPI(title="Sentinel PdM AI Engine", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5174",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class SensorPayload(BaseModel):
    induction_power: float
    coil_voltage: float
    quench_water_temp: float
    quench_water_flow: float
    quench_pressure: float
    coil_scan_speed: float
    part_temp: float
    vibration: float


@app.get("/health")
async def health():
    return {"status": "ok", "models_loaded": predictor is not None}


@app.get("/status")
async def status():
    async with async_session() as session:
        result = await session.execute(text("""
            SELECT id, timestamp_sim, ai_risk_score, ai_anomaly_score, ai_status
            FROM telemetry
            WHERE ai_status IS NOT NULL
              AND sim_run_id = :sim_run_id
            ORDER BY id DESC
            LIMIT 1
        """), {"sim_run_id": LIVE_SIM_RUN_ID})
        row = result.mappings().fetchone()
    if row is None:
        raise HTTPException(status_code=503, detail="No predictions yet")
    return dict(row)


@app.post("/predict")
async def predict(payload: SensorPayload):
    if predictor is None:
        raise HTTPException(status_code=503, detail="Models not loaded")
    df = pd.DataFrame([payload.model_dump()])
    df["timestamp_sim"] = pd.Timestamp.utcnow()
    return predictor.predict(df)


@app.get("/api/recent-predictions")
async def recent_predictions(limit: int = 60):
    async with async_session() as session:
        result = await session.execute(text("""
            SELECT id, timestamp_sim, state, ai_risk_score, ai_anomaly_score, ai_status,
                   induction_power, coil_voltage, quench_water_temp, quench_water_flow,
                   quench_pressure, coil_scan_speed, part_temp, vibration,
                   time_to_failure_s, failure_mode
            FROM telemetry
            WHERE ai_status IS NOT NULL
              AND ai_risk_score IS NOT NULL
              AND sim_run_id = :sim_run_id
            ORDER BY id DESC
            LIMIT :limit
        """), {"limit": limit, "sim_run_id": LIVE_SIM_RUN_ID})
        rows = result.mappings().all()
    return list(reversed([dict(r) for r in rows]))


@app.get("/api/drift")
async def drift():
    async with async_session() as session:
        result = await session.execute(text("""
            SELECT *
            FROM telemetry
            WHERE ai_status IS NOT NULL
              AND sim_run_id = :sim_run_id
            ORDER BY id DESC
            LIMIT 300
        """), {"sim_run_id": LIVE_SIM_RUN_ID})
        rows = result.mappings().all()
    if not rows:
        raise HTTPException(status_code=503, detail="No scored rows yet")
    live_df = pd.DataFrame([dict(r) for r in rows])
    live_df = compute_features(live_df)
    reference = _load_reference()
    return compute_psi(reference, live_df)


@app.get("/api/production")
async def production():
    """Production stats derived from the telemetry counters.

    ok_count and ng_count are running totals on each row. To get rate-style
    metrics (parts/hr, defect rate) we compute deltas across the latest ~3600
    rows of sim time. The "recent_parts" ticker reconstructs individual part
    outcomes by detecting counter increments row-over-row.
    """
    async with async_session() as session:
        latest_q = await session.execute(text("""
            SELECT id, timestamp_sim, ok_count, ng_count, state,
                   ai_risk_score, ai_status, downtime_reason, ng_reason,
                   coil_life_counter, part_id, shift_id, operator_id
            FROM telemetry
            WHERE ai_status IS NOT NULL
              AND sim_run_id = :sim_run_id
            ORDER BY id DESC
            LIMIT 1
        """), {"sim_run_id": LIVE_SIM_RUN_ID})
        latest_row = latest_q.mappings().fetchone()
        if latest_row is None:
            raise HTTPException(status_code=503, detail="No scored rows yet")
        latest = dict(latest_row)

        # Smoothed risk: average of the last 30 NON-HALTED scored rows.
        # The raw classifier output naturally swings ±0.2 across one cycle
        # (different sensor profiles in IDLE vs HEATING vs QUENCH), which
        # reads as "the AI keeps changing its mind" to operators. A 30-row
        # window covers ~1.7 cycles so the cycle-phase noise averages out
        # while a real trend during a failure ramp still moves the score
        # from ~0.1 to ~0.7 over its 180s duration.
        # HALTED rows are excluded so a recent trip doesn't anchor the
        # smoothed value at 0 once production resumes.
        smooth_q = await session.execute(text("""
            SELECT AVG(ai_risk_score) AS smooth_risk
            FROM telemetry
            WHERE ai_status IS NOT NULL
              AND ai_status != 'HALTED'
              AND sim_run_id = :sim_run_id
              AND id > :since_id
        """), {"sim_run_id": LIVE_SIM_RUN_ID, "since_id": latest["id"] - 30})
        smooth_row = smooth_q.mappings().fetchone()
        smoothed_risk = (
            float(smooth_row["smooth_risk"])
            if smooth_row and smooth_row["smooth_risk"] is not None
            else (latest["ai_risk_score"] or 0.0)
        )

        since_id = latest["id"] - 3600

        hour_q = await session.execute(text("""
            SELECT
                COALESCE(MIN(ok_count), 0) AS ok_min,
                COALESCE(MAX(ok_count), 0) AS ok_max,
                COALESCE(MIN(ng_count), 0) AS ng_min,
                COALESCE(MAX(ng_count), 0) AS ng_max,
                COUNT(*) AS row_count,
                COUNT(*) FILTER (WHERE state = 'DOWN') AS down_rows
            FROM telemetry
            WHERE id > :since_id
              AND sim_run_id = :sim_run_id
        """), {"since_id": since_id, "sim_run_id": LIVE_SIM_RUN_ID})
        hour_row = hour_q.mappings().fetchone()
        # COUNT(*) always returns one row even over an empty set.
        assert hour_row is not None
        hour = dict(hour_row)

        ok_in_hour = hour["ok_max"] - hour["ok_min"]
        ng_in_hour = hour["ng_max"] - hour["ng_min"]
        parts_in_hour = ok_in_hour + ng_in_hour

        # Scale the part count to a true parts/hour RATE based on actual running
        # rows (excluding DOWN rows). Without this, parts_per_hour is a raw count
        # (e.g. 27 parts in a partial 500-row window) and the frontend computes
        # cycleTime = 3600 / 27 = 133s instead of the real ~18s.
        # With scaling: 27 parts in 488 running rows → 199 parts/hr → 18.1s ✓
        running_rows = max(1, hour["row_count"] - hour["down_rows"])
        parts_per_hour = round(parts_in_hour * 3600 / running_rows) if running_rows > 0 else 0

        ticker_q = await session.execute(text("""
            WITH rows AS (
                SELECT id, timestamp_sim, ok_count, ng_count, ng_reason,
                       LAG(ok_count, 1, 0) OVER (ORDER BY id) AS prev_ok,
                       LAG(ng_count, 1, 0) OVER (ORDER BY id) AS prev_ng
                FROM telemetry
                WHERE id > :wide_since
                  AND sim_run_id = :sim_run_id
            )
            SELECT id, timestamp_sim,
                CASE
                    WHEN ok_count > prev_ok THEN 'OK'
                    WHEN ng_count > prev_ng THEN 'NG'
                END AS part_status,
                ng_reason
            FROM rows
            WHERE ok_count > prev_ok OR ng_count > prev_ng
            ORDER BY id DESC
            LIMIT 30
        """), {"wide_since": latest["id"] - 7200, "sim_run_id": LIVE_SIM_RUN_ID})
        ticker = list(reversed([dict(r) for r in ticker_q.mappings().all()]))

        defect_rate = (ng_in_hour / parts_in_hour * 100) if parts_in_hour else 0.0
        oee = (
            (hour["row_count"] - hour["down_rows"]) / hour["row_count"] * 100
            if hour["row_count"] else 0.0
        )

        coil_cfg_q = await session.execute(text(
            "SELECT value FROM machine_config WHERE key = 'coil_expected_parts'"
        ))
        coil_cfg_row = coil_cfg_q.fetchone()
        coil_expected = int(coil_cfg_row[0]) if coil_cfg_row else _COIL_EXPECTED_PARTS_FALLBACK

        coil_used = latest.get("coil_life_counter") or 0
        coil_pct = max(0.0, (1.0 - coil_used / coil_expected) * 100.0)

        # Engine writes part_id="P-0003-014" with batch_index=3. The batch_id
        # surface uses a "B-" prefix to match the engine's _current_batch_id()
        # convention ("B-0003"), not the part_id's own prefix.
        part_id = latest.get("part_id")
        batch_id = None
        if part_id:
            parts = part_id.split("-")
            if len(parts) >= 2:
                batch_id = f"B-{parts[1]}"

        # current_status is derived from current_state + smoothed_risk so the
        # dashboard always reflects the truth-of-now, not whatever ai_status
        # the latest row happens to have written. In particular: cycle DOWN
        # always reads as HALTED, regardless of what the last classifier
        # output was.
        if latest["state"] == "DOWN":
            current_status = "HALTED"
        elif smoothed_risk >= 0.7:
            current_status = "CRITICAL"
        elif smoothed_risk >= 0.3:
            current_status = "WARNING"
        else:
            current_status = "OK"

        return {
            "current_state": latest["state"],
            # current_risk is the SMOOTHED 30-row average (see above) — what
            # the dashboard consumes for the gauge + status pill. The raw
            # last-row score is also returned for diagnostic use.
            "current_risk": round(smoothed_risk, 3),
            "current_risk_raw": latest["ai_risk_score"],
            "current_status": current_status,
            "ok_count_total": latest["ok_count"],
            "ng_count_total": latest["ng_count"],
            "parts_per_hour": parts_per_hour,
            "ok_in_hour": ok_in_hour,
            "ng_in_hour": ng_in_hour,
            "defect_rate_pct": round(defect_rate, 2),
            "oee_pct": round(oee, 1),
            "downtime_min": round(hour["down_rows"] / 60, 1),
            "recent_parts": ticker,
            "downtime_reason": latest["downtime_reason"],
            "ng_reason": latest["ng_reason"],
            "coil_life": {
                "used": coil_used,
                "expected": coil_expected,
                "pct_remaining": round(coil_pct, 1),
            },
            "identity": {
                "part_id": part_id,
                "batch_id": batch_id,
                "shift_id": latest.get("shift_id"),
                "operator_id": latest.get("operator_id"),
            },
        }


@app.get("/api/ng-pareto")
async def ng_pareto(window: int = 3600):
    """Top NG reasons across the last `window` rows of the live SimRun.

    Detects per-part NG events the same way /api/production's ticker does:
    a row where ng_count > prev_ng (i.e. the cycle just produced an NG part).
    Groups those by ng_reason for a Pareto bar chart on the dashboard.
    """
    async with async_session() as session:
        latest_q = await session.execute(text("""
            SELECT MAX(id) AS max_id FROM telemetry
            WHERE ai_status IS NOT NULL AND sim_run_id = :sim_run_id
        """), {"sim_run_id": LIVE_SIM_RUN_ID})
        latest_row = latest_q.mappings().fetchone()
        if latest_row is None or latest_row["max_id"] is None:
            raise HTTPException(status_code=503, detail="No scored rows yet")
        max_id = latest_row["max_id"]

        result = await session.execute(text("""
            WITH rows AS (
                SELECT ng_reason, ng_count,
                       LAG(ng_count, 1, 0) OVER (ORDER BY id) AS prev_ng
                FROM telemetry
                WHERE id > :since_id
                  AND sim_run_id = :sim_run_id
            )
            SELECT ng_reason, COUNT(*) AS count
            FROM rows
            WHERE ng_count > prev_ng AND ng_reason IS NOT NULL
            GROUP BY ng_reason
            ORDER BY count DESC
            LIMIT 10
        """), {"since_id": max_id - window, "sim_run_id": LIVE_SIM_RUN_ID})
        rows = [dict(r) for r in result.mappings().all()]

    total = sum(r["count"] for r in rows) or 1
    return {
        "window_rows": window,
        "total_ng": sum(r["count"] for r in rows),
        "reasons": [
            {
                "reason": r["ng_reason"],
                "count": r["count"],
                "pct": round(r["count"] / total * 100, 1),
            }
            for r in rows
        ],
    }


@app.get("/api/yield-trend")
async def yield_trend(buckets: int = 24, bucket_size: int = 3600):
    """First-Pass Yield % per id-bucket. Each bucket is `bucket_size` rows of
    sim time; default 24 buckets * 3600 rows ~ 24 sim-hours.

    Uses MIN/MAX of ok_count/ng_count within each bucket to derive deltas
    (running counters). Buckets are numbered 0 (now) backward.
    """
    async with async_session() as session:
        latest_q = await session.execute(text("""
            SELECT MAX(id) AS max_id FROM telemetry
            WHERE ai_status IS NOT NULL AND sim_run_id = :sim_run_id
        """), {"sim_run_id": LIVE_SIM_RUN_ID})
        latest_row = latest_q.mappings().fetchone()
        if latest_row is None or latest_row["max_id"] is None:
            raise HTTPException(status_code=503, detail="No scored rows yet")
        max_id = latest_row["max_id"]
        floor_id = max_id - (buckets * bucket_size)

        result = await session.execute(text("""
            WITH bucketed AS (
                SELECT
                    ok_count, ng_count,
                    ((:max_id - id) / :bsize)::int AS bucket
                FROM telemetry
                WHERE id > :floor_id
                  AND sim_run_id = :sim_run_id
            )
            SELECT
                bucket,
                MAX(ok_count) - MIN(ok_count) AS ok_delta,
                MAX(ng_count) - MIN(ng_count) AS ng_delta
            FROM bucketed
            GROUP BY bucket
            ORDER BY bucket ASC
        """), {"max_id": max_id, "bsize": bucket_size, "floor_id": floor_id, "sim_run_id": LIVE_SIM_RUN_ID})
        rows = result.mappings().all()

    out = []
    for r in rows:
        ok = int(r["ok_delta"] or 0)
        ng = int(r["ng_delta"] or 0)
        total = ok + ng
        fpy = (ok / total * 100) if total else None
        b = int(r["bucket"])
        out.append({
            "bucket": b,
            "label": "now" if b == 0 else f"-{b}h",
            "ok": ok,
            "ng": ng,
            "fpy_pct": round(fpy, 1) if fpy is not None else None,
        })
    return {"buckets": out}
