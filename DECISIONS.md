# DECISIONS.md — Locked Architectural Choices

This file documents decisions already made and the reasoning behind them. **These are not up for re-discussion** unless a fundamental constraint changes (timeline, resume targets, technical capability).

If Claude Code suggests changing one of these, the answer is no — unless the user explicitly requests reconsideration. Refer back to this file rather than re-litigating.

---

## D1: One GitHub monorepo, two service subdirectories

**Decision:** A single GitHub repository (`Yuvraj171/sentinel-pdm`) contains both services as subdirectories: `machine-simulator/` and `pdm-ai-engine/`. Workspace-level docs (DECISIONS.md, LOGBOOK.md, README.md) live at the repo root. The two services share a Postgres database (see D2) — the prior pattern of "shared DB instead of HTTP between services" is preserved; only the repo structure changed.

**Why:**
- A resume bullet links to one GitHub URL. If that URL goes to a single service, recruiters and screeners won't navigate to a second repo to see the rest of the system — many will only read what's at the first link. One URL revealing the whole system is the portfolio-discoverability win.
- Architectural separation is expressed *inside* the repo: separate directories, separate Dockerfiles, separate Cloud Run deploys, separate venvs (D16). A monorepo doesn't smudge the architecture; it only removes the GitHub-level fragmentation.
- `git subtree` merge preserves the full commit history of both prior repos when consolidating them, so the work narrative survives.
- Shared DB is simpler than HTTP API between services for a portfolio project — that scope decision is unaffected by the repo structure change.

**Rejected alternatives:**
- Two separate GitHub repos, one per service: clean architecture story but invisible to anyone who only clicks the first link. The architectural cleanliness is recoverable inside the monorepo via directory structure; the discoverability loss in two-repo land is not.
- Three repos with an "umbrella" docs repo using submodules: more moving parts; submodules add friction (`git submodule update --init` for fresh clones, broken `Browse code` UI on GitHub) without solving the discoverability problem — there are still multiple URLs.
- Fresh-start single repo with no preserved history: throws away the commit timeline that proves real work happened over time, not a weekend dump.
- HTTP API between the two services: adds latency, network failure modes, more code. Database-as-bus is right-sized for a portfolio project.

**Implication:**
- The two prior GitHub repos (`Yuvraj171/Machine-Simulator`, `Yuvraj171/Pdm-AI-Engine`) are **archived, not deleted**, once migration is verified — preserves URLs for any external links and gives an undo path.
- Internal references in code, docs, and CI use repo-relative paths (`machine-simulator/...`), not the old standalone-repo paths.
- Each service keeps its own `requirements.txt` / `pyproject.toml` and venv at `<service>/.venv` per D16. Each ships its own Dockerfile and its own Cloud Run service per D10.

---

## D2: Postgres only, no SQLite anywhere

**Decision:** Both services use Postgres. Local dev via Docker on port 5433. Production via Supabase. The SQLite fallback in `machine-simulator/backend/database.py` must be removed.

**Why:**
- Production-style infra is a hire signal
- One database choice = one set of operational considerations
- SQLite fallback creates train-serve skew risk: if dev is SQLite and prod is Postgres, edge cases differ
- Postgres async support via `asyncpg` is mature, fast, well-documented

**Rejected alternatives:**
- SQLite for dev, Postgres for prod: the skew risk is real and not worth the convenience
- SQLite everywhere: doesn't support multi-process writes well, doesn't match production architecture
- No DB, in-memory only: doesn't allow the live AI feedback loop (sim writes, AI reads, AI writes back)

---

## D3: Port 5433 for local Postgres

**Decision:** `sentinel-postgres` container runs on host port 5433 (mapped to container 5432).

**Why:**
- Port 5432 is already in use by `ares_postgres` (a different project)
- Both projects need to run simultaneously on the same machine
- 5433 has no conflicts on this user's setup

**Implication:** All `.env` files must use `localhost:5433`. Production Supabase uses its own connection string and host.

---

## D4: Binary classifier + Isolation Forest, not RUL or multi-class

**Decision:** The AI engine ships two models:
1. Binary classifier (XGBoost + Random Forest dual model) → `ai_risk_score`
2. Isolation Forest unsupervised anomaly detector → `ai_anomaly_score`

The target for the classifier is `will_fail_10min` (boolean — fails within 600 seconds).

**Why:**
- Existing models in pdm-ai-engine are binary classifiers — keeping the type minimizes rework
- Binary "will it fail in 10 min" is the most operator-relevant question
- Isolation Forest adds layered detection (classifier catches known patterns, IF catches unknown)
- Together they're 2 model architectures, manageable in a 2-week sprint

**Rejected alternatives:**
- RUL regression: requires run-to-failure sequence training data that's harder to generate correctly. Multiple weeks of additional complexity.
- Multi-class classifier (predict which failure mode): adds confusion when failure modes have similar signatures, harder to defend in interviews
- Anomaly detection only: gives an alert but no risk score for operator decision-making

---

## D5: 3 failure modes (not 5)

**Decision:** Simulate exactly 3 failure modes with distinct sensor signatures:
1. Coolant pump degradation (gradual, 30-60 min onset)
2. Quench system failure (semi-abrupt, 5-15 min onset)
3. Power supply drift (gradual, 20-40 min onset)

**Why:**
- 3 failure modes = enough variety for the model to learn distinct patterns
- 3 modes = enough physics to defend in interviews without deep domain expertise
- Coil insulation breakdown and part misalignment require deeper expertise to simulate plausibly
- Different onset times give the model temporal variety to learn

**The signatures must remain distinct in feature space.** If two failure modes look identical to the model, drop one or modify it. The metrics depend on this.

---

## D6: SQLAlchemy schema is a contract, owned by machine-simulator

**Decision:** The Telemetry table schema lives in `machine-simulator/backend/models.py`. The pdm-ai-engine uses SQLAlchemy reflection or a duplicate model definition that mirrors this. **Column names are a contract.**

**Why:**
- Schema migrations need to happen in one place (Alembic in machine-simulator)
- Single source of truth for the data shape
- Renaming a column in one service without the other = silent breakage

**Rule:** Adding a column is safe (must be nullable with default). Renaming or dropping a column requires updating both services in lockstep.

---

## D7: Alembic for schema migrations

**Decision:** Use Alembic for all Postgres schema changes. No `Base.metadata.create_all()` in production code paths.

**Why:**
- `create_all()` works for greenfield local dev but doesn't track schema versions
- Alembic migrations are reversible and reviewable as SQL
- Production deployments need to apply migrations explicitly, not magically create tables on startup

**Rule:** Every schema change generates an Alembic migration. Migrations are applied via `alembic upgrade head`, not via code on app startup.

---

## D8: Feature engineering shared between training and inference

**Decision:** A single `features.py` module in `pdm-ai-engine/src/sentinel_pdm/training/` is used at both training time and inference time.

**Why:**
- Train-serve skew is the most common silent ML bug
- A bug in feature engineering at training that doesn't exist at inference = model performs worse in production than in offline eval
- Shared module = mathematically identical features in both paths

**Rule:** Never duplicate feature engineering logic. If you find yourself writing rolling window math twice, stop and use the shared module.

---

## D9: MLflow for experiment tracking, local file backend

**Decision:** MLflow tracks all training runs. Tracking URI is local file (`./mlruns/`) for the sprint. Models are saved as joblib files alongside MLflow.

**Why:**
- MLflow is the industry standard — recognizable resume keyword
- Local file backend is free, no setup overhead
- Model joblib files are needed at inference time anyway; MLflow logs are documentation

**Rejected alternatives:**
- Hosted MLflow (Databricks, etc.): overkill for sprint, adds cost
- Weights & Biases: nice but adds another tool to learn during a tight sprint

---

## D10: GCP Cloud Run + Supabase for production

**Decision:** Both services deploy to GCP Cloud Run. Postgres is Supabase free tier.

**Why:**
- Cloud Run scales to zero — costs $0 when not in use
- Supabase free tier auto-pauses after 1 week of inactivity — costs $0 when not in use
- Both are recognizable names on a resume
- Total cost: $0/month for a portfolio demo
- Region: asia-south1 (Mumbai) for latency

**Fallback:** If GCP setup blocks the deploy day, switch to Render.com (loses "Cloud Run" keyword but gains time).

---

## D11: React + Vite + Tailwind + Recharts for the dashboard

**Decision:** machine-simulator/frontend is React + Vite + Tailwind + Recharts. NOT HTMX, NOT Streamlit.

**Why:**
- React/Vite is the modern web standard — recognizable to recruiters
- The user has React Native experience (FaceUPI), so React (web) has low ramp
- Claude Code is genuinely good at scaffolding React + Tailwind
- Recharts plays nicely with React, sufficient for the chart needs

**Rejected alternatives:**
- HTMX: less recognizable, more niche. Was considered earlier but the existing simulator repo already has React/Vite scaffold ready.
- Streamlit: looks like an ML demo, not a production dashboard. Lower hire signal.

**Constraint:** Don't claim to be a frontend developer in interviews. The dashboard is functional, not portfolio-grade. The AI/ML work is the showcase.

---

## D12: 1-week sprint REJECTED, 2-week sprint LOCKED

**Decision:** The sprint runs Mon Apr 27 – Sun May 10 (14 days). Not 7 days.

**Why:**
- Honest estimate of work: ~50 hours
- User availability: ~2-3 hrs weeknights, 5-6 hrs weekends ≈ 25 hrs/week
- 1 week = 25 hrs available, 50 hrs of work = guaranteed slip
- 2 weeks at honest pace > 1 week of cut-scope slop
- The resume isn't going out until the sprint completes anyway

**Rule:** No squeezing the timeline. If something slips inside the 2 weeks, cut scope per the SPRINT.md risk register, don't extend the deadline.

---

## D13: AI is primary, simulator is infrastructure

**Decision:** When trade-offs arise between simulator quality and AI quality, AI wins. The simulator's only job is to generate data good enough to train models that produce defensible metrics.

**Why:**
- Resume targets AI Engineer roles — the AI is the product
- A perfect simulator with mediocre models = wrong story
- A simple simulator with strong models = correct story
- The simulator is internal infrastructure, not a portfolio piece on its own

**Rule:** Don't add simulator features that don't directly improve training data quality. No fancy machine UI animations. No simulator API documentation polish. Spend the time on model quality and the AI prediction loop.

---

## D14: All metrics on the resume must be real

**Decision:** Whatever the trained models output on Day 7 is what goes on the resume. No fabrication, no aspiration.

**Why:**
- A senior engineer asking "walk me through your evaluation" = the conversation that determines hire/no-hire
- Inflated metrics get caught in 30 seconds by anyone who can read the code
- The trust gap is the single biggest risk in the application process
- An honest 0.83 ROC-AUC + a defensible methodology > a fabricated 0.91 with no defense

**Rule:** Day 7 metrics → RESUME_UPDATES.md → resume bullet. Period.

---

## D15: No browser localStorage for production data

**Decision:** All persistence happens in Postgres. No localStorage, sessionStorage, or browser-side state for actual data. UI state (last selected tab, theme preference) is fine.

**Why:**
- Browser storage is local to one machine, one browser — not real persistence
- A "live demo" that depends on browser storage doesn't show what was actually built
- Postgres is the correct persistence layer; doubling up adds confusion

---

## D16: Separate venv per service, never a shared workspace venv

**Decision:** Each service has its own virtual environment at `<service-root>/.venv`, created with Python 3.11 via `pyenv`. No shared workspace-level venv.

- `machine-simulator/.venv` — created Day 1 from `machine-simulator/backend/requirements.txt`
- `pdm-ai-engine/.venv` — created Day 2 from `pdm-ai-engine/pyproject.toml` via `pip install -e ".[dev]"`

**Why:**
- **Production parity.** Each service deploys as its own Docker image (Cloud Run per D10) with its own dep set. A shared local venv hides which deps actually belong to which service — bugs only surface at deploy time.
- **Dep sets diverge sharply.** Simulator: fastapi, uvicorn, sqlalchemy[asyncio], asyncpg, pandas. AI engine adds xgboost (~400MB), scikit-learn, mlflow, joblib. Crossing them creates noise and slow re-installs.
- **Reflects D1.** Two repos, two services, two deployment artifacts — two venvs.
- **Test isolation.** A test that accidentally imports a foreign dep would pass locally and fail in CI; separate venvs catch this immediately.

**Rejected alternatives:**
- Single shared `.venv` at workspace root: small convenience win (one `source activate`); real loss in production parity and dep hygiene. The "convenience" is also solvable with shell aliases or a Makefile target.
- Conda environment: more tooling to learn during a tight sprint, no clear win over `pyenv` + venv at this scope.
- Poetry / uv / pdm shared workspace: overkill for two services with simple dep needs.

**Implication:** `docker compose up` is the canonical "boot the whole system" command — not a merged venv. Local dev activates one venv at a time per service. Each service's `requirements.txt` / `pyproject.toml` is the single source of truth for its deps.

**Implementation notes (Day 2 — 2026-04-28):**
- Both venvs are now Python 3.11.9 via `pyenv exec python -m venv .venv` (rebuilt from pyenv on Day 2; the Day 1 simulator venv had silently used Homebrew's 3.11.13 — fixed). See [LOGBOOK.md](LOGBOOK.md) Day 2 venv-state entry for the incident that surfaced this.
- `pdm-ai-engine/pyproject.toml` declares `requires-python = ">=3.11,<3.12"`, narrow enough that a future Python 3.12+ cannot accidentally satisfy the install constraint and re-introduce drift.
- Activation is automated via `direnv` — each service has a `.envrc` that runs `source .venv/bin/activate`. Cd into a service directory, the right venv loads; cd out, it unloads. No manual `source` step. The `.envrc` files are gitignored (per-developer tooling, not project code).
