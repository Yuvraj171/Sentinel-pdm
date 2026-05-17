import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

from backend.config import settings
from backend.logging_config import configure_logging
from backend.routers import export, simulation
from backend.simulation.engine import get_engine

configure_logging()
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info(
        "simulator starting up | tick_rate_hz=%s failure_probability=%s db=%s",
        settings.simulator_tick_rate_hz,
        settings.failure_probability,
        settings.database_url.split("@")[-1],
    )
    yield
    engine = get_engine()
    if engine.running:
        await engine.stop()
    logger.info("simulator shutting down")


app = FastAPI(title="Induction Hardening Machine Simulator", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(simulation.router)
app.include_router(export.router)


@app.get("/health")
async def health_check():
    return {"status": "ok", "service": "machine-simulator"}


# Serve the React frontend. Registered LAST so /simulation/*, /export/*, /health
# take priority. The catch-all serves real files when they exist (assets, vite.svg)
# and falls back to index.html for everything else so React Router can handle
# client-side routes like /dashboard?tab=maintenance — without this fallback,
# a page refresh or pasted URL on any non-root path 404s.
_static_dir = Path(__file__).resolve().parent.parent / "static"


@app.get("/{full_path:path}", include_in_schema=False)
async def spa_catch_all(full_path: str, request: Request):
    if not _static_dir.exists():
        raise HTTPException(status_code=404)
    candidate = _static_dir / full_path
    if full_path and candidate.is_file():
        return FileResponse(candidate)
    # Only fall back to index.html for browser navigation. Without this guard
    # a typo'd API URL would return HTML and confuse JSON clients with an
    # "Unexpected token <" parse error.
    if "text/html" not in request.headers.get("accept", ""):
        raise HTTPException(status_code=404)
    index_html = _static_dir / "index.html"
    if index_html.is_file():
        return FileResponse(index_html)
    raise HTTPException(status_code=404)
