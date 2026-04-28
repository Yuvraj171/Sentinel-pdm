from fastapi import FastAPI
from contextlib import asynccontextmanager
from backend.database import engine, Base
from backend.routers import simulation, export
from fastapi.middleware.cors import CORSMiddleware

@asynccontextmanager
async def lifespan(app: FastAPI):
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    
    # Initialize Default SimRun for Live View
    from sqlalchemy import select
    from backend.models import SimRun
    from backend.database import AsyncSessionLocal
    
    async with AsyncSessionLocal() as session:
        async with session.begin():
            result = await session.execute(select(SimRun).where(SimRun.id == 1))
            run = result.scalar()
            if not run:
                print("🆕 INITIALIZING DEFAULT SIMULATION RUN (ID=1)")
                new_run = SimRun(id=1, status="RUNNING", total_rows=0)
                session.add(new_run)
                await session.commit()
    yield

app = FastAPI(title="Induction Hardening Machine Simulator", lifespan=lifespan)

# CORS Configuration
origins = [
    "http://localhost:5174",
    "http://127.0.0.1:5174",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include Routers
app.include_router(simulation.router)
app.include_router(export.router)

@app.get("/health")
async def health_check():
    return {"status": "ok", "service": "backend"}

@app.get("/")
async def root():
    return {"message": "Induction Hardening Simulator API is running. Go to /health for status."}
