"""FastAPI app — /health, /status, /predict endpoints."""
from __future__ import annotations

from contextlib import asynccontextmanager

import pandas as pd
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from sqlalchemy import text

from sentinel_pdm.config import settings
from sentinel_pdm.database import async_session
from sentinel_pdm.services.predictor import Predictor

predictor: Predictor | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global predictor
    predictor = Predictor()
    yield


app = FastAPI(title="Sentinel PdM AI Engine", lifespan=lifespan)


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
            ORDER BY id DESC
            LIMIT 1
        """))
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
            SELECT id, timestamp_sim, ai_risk_score, ai_anomaly_score, ai_status,
                   induction_power, quench_water_flow, quench_pressure, part_temp
            FROM telemetry
            WHERE ai_status IS NOT NULL
            ORDER BY id DESC
            LIMIT :limit
        """), {"limit": limit})
        rows = result.mappings().all()
    return list(reversed([dict(r) for r in rows]))
