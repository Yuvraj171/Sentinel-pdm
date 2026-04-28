# Sentinel-PdM

**Predictive maintenance system for industrial induction hardening equipment.**

Two-service architecture: a physics-based machine simulator generates realistic sensor telemetry, and an ML engine runs continuous risk scoring and anomaly detection — writing predictions back to the same database the dashboard reads from.

---

## Architecture

```
┌─────────────────────────────────────┐     ┌──────────────────────────────────────┐
│        machine-simulator            │     │          pdm-ai-engine               │
│                                     │     │                                      │
│  Physics engine (3 failure modes)   │     │  XGBoost + Random Forest classifier  │
│  ─ Coolant pump degradation         │     │  → ai_risk_score (0.0–1.0)           │
│  ─ Quench system failure            │     │                                      │
│  ─ Power supply drift               │     │  Isolation Forest anomaly detector   │
│                                     │     │  → ai_anomaly_score                  │
│  FastAPI (async) + SQLAlchemy       │     │                                      │
│  Writes: sensor columns + labels    │     │  Polls Postgres every 1s             │
│  Reads:  ai_risk_score (dashboard)  │     │  Writes: ai_* columns only           │
│                                     │     │                                      │
│  React + Vite operator dashboard    │     │  MLflow experiment tracking          │
└──────────────┬──────────────────────┘     └────────────────┬─────────────────────┘
               │                                             │
               └──────────────────┬──────────────────────────┘
                                  │
                        ┌─────────▼──────────┐
                        │  Postgres (shared)  │
                        │  telemetry table    │
                        │  sim_runs table     │
                        └─────────────────────┘
```

Both services share one Postgres database. The simulator owns sensor columns; the AI engine owns prediction columns. No HTTP between services — database as bus.

---

## Services

### machine-simulator
- Simulates an induction hardening machine at 1Hz with physics-based sensor noise
- Three failure modes with distinct sensor signatures and configurable onset times
- **Fast-gen mode**: generates 100,000+ training rows at CPU speed (no sleep)
- FastAPI async backend + React/Vite operator dashboard

### pdm-ai-engine
- Polls the last 300 telemetry rows every second
- Computes rolling window features (60s mean, std, rate-of-change)
- Runs XGBoost + RF ensemble classifier → `ai_risk_score`
- Runs Isolation Forest → `ai_anomaly_score`
- Writes predictions back; dashboard reads them in the same loop

---

## Tech stack

| Layer | Technology |
|---|---|
| Simulator backend | Python 3.11, FastAPI, SQLAlchemy async, asyncpg |
| Operator dashboard | React, Vite, Tailwind CSS, Recharts |
| ML engine | scikit-learn, XGBoost, MLflow |
| Database | PostgreSQL 15 |
| Infra | Docker, GCP Cloud Run, Supabase |

---

## Local setup

**Prerequisites:** Docker, Python 3.11 (via pyenv), Node 18+

```bash
# 1. Boot Postgres
docker compose up postgres -d

# 2. Start simulator backend
cd machine-simulator
source .venv/bin/activate
uvicorn backend.main:app --reload

# 3. Start AI engine
cd pdm-ai-engine
source .venv/bin/activate
uvicorn src.sentinel_pdm.services.api:app --port 8100 --reload

# 4. Start frontend (separate terminal)
cd machine-simulator/frontend
npm install && npm run dev
```

Dashboard: http://localhost:5173  
Simulator API: http://localhost:8000/docs  
AI Engine API: http://localhost:8100/docs

**Generate training data (fast mode):**
```bash
curl -X POST "http://localhost:8000/simulation/generate-training-data?duration_hours=168&failure_probability=0.15"
```

---

## Model metrics

> Trained on 100,000+ rows of fast-gen simulator data. Metrics updated after sprint Day 7.

| Model | Metric | Score |
|---|---|---|
| XGBoost + RF classifier | ROC-AUC | — |
| XGBoost + RF classifier | F1 (failure class) | — |
| Isolation Forest | Precision@10% contamination | — |

---

## Project structure

```
sentinel-pdm/
├── machine-simulator/       # Service 1: data factory + operator dashboard
│   ├── backend/             # FastAPI app, SQLAlchemy models, simulation engine
│   └── frontend/            # React + Vite dashboard
├── pdm-ai-engine/           # Service 2: ML prediction engine
│   └── src/sentinel_pdm/   # Python package: training, inference, monitoring
├── DECISIONS.md             # Locked architectural decisions with reasoning
├── LOGBOOK.md               # Engineering incident log
└── docker-compose.yml       # Boots both services + Postgres
```

---

## Limitations

- Simulator physics are simplified (not calibrated against real machine data)
- Models trained on synthetic data — production deployment would require real failure history
- Supabase free tier auto-pauses after 1 week of inactivity
