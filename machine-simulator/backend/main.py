import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

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

origins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:5174",
    "http://127.0.0.1:5174",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(simulation.router)
app.include_router(export.router)


@app.get("/health")
async def health_check():
    return {"status": "ok", "service": "machine-simulator"}


@app.get("/")
async def root():
    return {"message": "Induction Hardening Simulator API. See /docs."}
