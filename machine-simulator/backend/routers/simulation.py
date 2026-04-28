from fastapi import APIRouter, Depends, BackgroundTasks, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from backend.database import get_db
from backend.simulation.generator import SimulationGenerator
from backend.simulation.machine import MachineState

router = APIRouter(
    prefix="/simulation",
    tags=["simulation"]
)

# Import Singleton State
from backend.state import active_machine, persistence_layer 

import asyncio
import threading
import time

@router.post("/start")
async def start_simulation(db: AsyncSession = Depends(get_db)): # Removed BackgroundTasks arg
    """
    Starts a LIVE simulation cycle (Real-time).
    """
    if active_machine.state != "IDLE":
        # Force restart behavior might be safer or just return running
        pass
    
    # 1. Start the DB Worker (if not running)
    if not persistence_layer.is_running:
        asyncio.create_task(persistence_layer.start_worker())
    
    # 2. Start Cycle
    print(f"🆔 START ENDPOINT MACHINE ID: {id(active_machine)}", flush=True)
    active_machine.start_cycle()
    
    # 3. Launch Simulation Loop (Robust)
    sim_thread = threading.Thread(target=run_live_simulation_thread, daemon=True)
    sim_thread.start()
    
    return {"message": "Live Simulation Started", "mode": "REAL_TIME"}

def run_live_simulation_thread():
    """
    Ticks the machine every 0.2 seconds (5Hz).
    Running in a THREAD allows it to survive past the HTTP request.
    """
    print("🚀 LIVE SIMULATION THREAD STARTED", flush=True)
    print(f"🆔 THREAD MACHINE ID: {id(active_machine)}", flush=True)
    try:
        while active_machine.state != "IDLE" and active_machine.state != "DOWN":
            # PAUSE if Fast Forward is running
            if active_machine.is_fast_forwarding:
                time.sleep(0.1)  # Wait for FF to complete
                continue
            
            active_machine.update()
            time.sleep(0.2) # Sync sleep in thread
        
        print(f"🏁 LIVE SIMULATION ENDED. State: {active_machine.state}", flush=True)
        
    except Exception as e:
        import traceback
        print(f"❌ CRITICAL SIMULATION CRASH: {e}", flush=True)
        traceback.print_exc()
        active_machine.transition_to("DOWN") # Safe Fallback
    
    finally:
        # This part needs to be async, but we are in a sync thread.
        # We need to run it in the event loop.
        # A common pattern is to get the event loop and run the async function.
        # However, for a simple stop_worker, if it's just setting a flag, it might be okay.
        # If it involves actual async I/O, it needs to be awaited in an async context.
        # For now, assuming persistence_layer.stop_worker() can be called from a thread
        # or that it internally handles its async nature (e.g., by scheduling on the event loop).
        # A more robust solution would involve a queue or a dedicated async thread executor.
        try:
            loop = asyncio.get_event_loop()
            if loop.is_running():
                loop.call_soon_threadsafe(lambda: asyncio.create_task(persistence_layer.stop_worker()))
            else:
                # If the event loop is not running (e.g., app shutdown),
                # we might not be able to stop it cleanly.
                # For simplicity, we'll just call it directly if no loop is running,
                # assuming it's safe or will be handled by app shutdown.
                asyncio.run(persistence_layer.stop_worker())
        except RuntimeError:
            # No running event loop, try to run it directly if possible
            asyncio.run(persistence_layer.stop_worker())


@router.post("/reset")
async def reset_simulation(db: AsyncSession = Depends(get_db)):
    """
    HARD RESET: 
    1. Resets machine to IDLE state.
    2. Clears ALL telemetry data (Database Truncate).
    3. Resets filters and counters.
    """
    from datetime import datetime
    from backend.models import SimRun, Telemetry
    from sqlalchemy import select, delete
    
    # 1. Reset Machine Logic
    active_machine.reset()
    
    # 2. Clear Database (Telemetry)
    # Using `delete` instead of `truncate` for cross-db compatibility (SQLite doesn't support truncate)
    await db.execute(delete(Telemetry))
    
    # 3. Reset SimRun Stats
    result = await db.execute(select(SimRun).where(SimRun.id == 1))
    sim_run = result.scalars().first()
    if sim_run:
        sim_run.session_start_time = datetime.now() # Use Local System Time (matches UI)
        sim_run.total_rows = 0 # Reset counter
        await db.commit()
        print(f"🧹 DATABASE CLEARED. Session start time updated for run_id=1")
    
    return {"message": "Machine HARD RESET: Database cleared.", "new_state": active_machine.state}

@router.post("/stop")
async def stop_simulation():
    """
    Safely halts the machine (IDLE) but preserves counters/coil life.
    """
    active_machine.stop()
    return {"message": "Machine Stopped", "new_state": active_machine.state}

@router.post("/manual-control")
async def manual_control(enabled: bool, temp_limit: float = 1000.0, flow_target: float = 120.0):
    """
    Sets Manual Process Limits.
    enabled: True to override physics limits.
    temp_limit: Max Temp (Ceiling).
    flow_target: Target Flow (Center).
    """
    active_machine.manual_mode = enabled
    active_machine.manual_limits = {
        "temp_limit": temp_limit,
        "flow_target": flow_target
    }
    mode = "MANUAL" if enabled else "AUTO"
    print(f"🎛️ MANUAL CONTROL: {mode} | Temp<={temp_limit} | Flow~={flow_target}")
    return {"message": f"Manual Mode set to {mode}", "limits": active_machine.manual_limits}

@router.post("/inject-fault")
async def inject_fault(type: str = None):
    """
    Manually triggers a breakdown in the active machine.
    type: Optional specific fault (hose_burst, power_surge, etc)
    """
    active_machine.inject_fault(fault_type=type)
    return {"message": f"Fault injected: {type or 'Random'}", "new_state": active_machine.state}

@router.post("/repair")
async def repair_simulation():
    """
    Fixes the machine (clears drift/faults) without resetting counters.
    """
    active_machine.repair()
    return {"message": "Machine Repaired", "new_state": active_machine.state}

@router.post("/start-drift-test")
async def start_drift_test():
    """
    Triggers an AI-calibrated slow leak scenario.
    
    Timeline:
    - 0-2 min: Pressure drifts from 3.5 → 3.0 Bar (AI detects WARNING → NG)
    - 2-5 min: Pressure drifts from 3.0 → 2.0 Bar (AI detects NG → DOWN)
    
    The simulator continues running normally with this drift overlay.
    Use /repair to stop the drift without resetting the machine.
    """
    if active_machine.state not in ["HEATING", "QUENCH", "LOADING", "UNLOADING"]:
        return {
            "message": "Machine must be running to start drift test. Start simulation first.",
            "current_state": active_machine.state
        }
    
    active_machine.start_slow_leak()
    return {
        "message": "Drift Test Started: Slow Hydraulic Leak",
        "timeline": {
            "ng_expected": "~2 minutes",
            "down_expected": "~5 minutes",
            "drift_rate": "-0.30 Bar/min"
        },
        "tip": "Use /repair to stop the drift at any time"
    }




@router.get("/status")
async def get_status():
    """
    Returns the current live status of the machine.
    """
    return active_machine.get_status()


# === FAST FORWARD ENDPOINTS ===

from backend.simulation.fast_forward import simulate_day, get_last_timestamp

@router.post("/fast-forward/day")
async def fast_forward_one_day():
    """
    Simulate one full day of production data (~7,500 parts).
    Appends to existing data. Can be called multiple times to stack days.
    """
    import asyncio
    
    # 1. Concurrency Lock: Prevent FF if already running
    if active_machine.is_fast_forwarding:
        raise HTTPException(status_code=409, detail="Fast Forward already in progress. Please wait.")

    try:
        # LOCK the live machine so it doesn't produce data mid-calculation
        print(f"🆔 FF ENDPOINT MACHINE ID: {id(active_machine)}", flush=True)
        print(f"🚦 FF: Setting flag=True | Current OK={active_machine.ok_count}", flush=True)
        active_machine.is_fast_forwarding = True
        
        # Wait a tick to let any current live loop finish
        print("🚦 FF: Waiting 0.5s for thread to pause...", flush=True)
        await asyncio.sleep(0.5)
        
        # Flush pending Live data to ensure clean cutoff
        print("🚦 FF: Flushing persistence queue...", flush=True)
        await persistence_layer.flush()
        
        # 2. Get Start Time
        last_ts = await get_last_timestamp()
        
        if last_ts:
            from datetime import timedelta
            start_time = last_ts + timedelta(seconds=10)
        else:
            from datetime import datetime
            start_time = datetime.now()
        
        # 3. Run Simulation - Pass MACHINE counters as source of truth
        print(f"🚦 FF: Passing machine counters to simulate_day: OK={active_machine.ok_count}, NG={active_machine.ng_count}, Coil={active_machine.coil_life_counter}", flush=True)
        result = await simulate_day(
            start_time,
            initial_ok=active_machine.ok_count,
            initial_ng=active_machine.ng_count,
            initial_coil_life=active_machine.coil_life_counter
        )
        
        # Store debug info BEFORE sync
        global _last_ff_debug
        _last_ff_debug = {
            "passed_to_simulate_day": {
                "initial_ok": active_machine.ok_count,  # This was passed before simulate_day changed anything
                "initial_ng": active_machine.ng_count,
                "initial_coil_life": active_machine.coil_life_counter
            },
            "simulate_day_result": result,
            "machine_before_sync": {
                "ok_count": active_machine.ok_count,
                "ng_count": active_machine.ng_count
            }
        }
        
        # 4. SYNC COUNTERS (The Fix)
        # Update the live machine with the new totals from the simulation run
        print(f"🔁 FF RESULT: ok={result['ok']}, ng={result['ng']}, coil={result['coil_life']}", flush=True)
        print(f"🔁 BEFORE SYNC: machine.ok={active_machine.ok_count}, ng={active_machine.ng_count}", flush=True)
        active_machine.force_sync_counters(
            result['ok'], 
            result['ng'], 
            result['coil_life']
        )
        print(f"🔁 AFTER SYNC: machine.ok={active_machine.ok_count}, ng={active_machine.ng_count}", flush=True)
        
        # Update debug info AFTER sync
        _last_ff_debug["machine_after_sync"] = {
            "ok_count": active_machine.ok_count,
            "ng_count": active_machine.ng_count
        }
        
        return {
            "message": "Fast Forward Complete: 1 Day Simulated",
            "stats": result
        }

    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))
        
    finally:
        # UNLOCK: Allow live simulation to resume
        active_machine.is_fast_forwarding = False

# Store last FF debug info for API access
_last_ff_debug = {}

@router.get("/fast-forward/debug")
async def get_ff_debug():
    """Returns debug info from the last Fast Forward operation."""
    return {
        "last_ff_result": _last_ff_debug,
        "current_machine_state": {
            "ok_count": active_machine.ok_count,
            "ng_count": active_machine.ng_count,
            "coil_life": active_machine.coil_life_counter,
            "is_fast_forwarding": active_machine.is_fast_forwarding
        }
    }

@router.post("/predict")
async def predict_failure(data: dict):
    """
    Mock AI prediction endpoint to prevent 404s.
    Returns a dummy risk score.
    """
    return {"risk_score": 0.05, "status": "HEALTHY"}


@router.get("/fast-forward/record-count")
async def get_record_count():
    """
    Returns the total number of telemetry records in the database.
    """
    from sqlalchemy import select, func
    from backend.models import Telemetry
    
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(func.count(Telemetry.id))
        )
        count = result.scalar()
    
    return {"total_records": count}


@router.get("/stats")
async def get_db_stats():
    """
    Returns production statistics from the database.
    Use this for accurate totals after Fast Forward.
    """
    from sqlalchemy import select, func
    from backend.models import Telemetry
    
    async with AsyncSessionLocal() as session:
        # Total records
        total_result = await session.execute(
            select(func.count(Telemetry.id))
        )
        total = total_result.scalar() or 0
        
        # OK count (no ng_reason and no downtime_reason)
        ok_result = await session.execute(
            select(func.count(Telemetry.id)).where(
                Telemetry.ng_reason.is_(None),
                Telemetry.downtime_reason.is_(None)
            )
        )
        ok_count = ok_result.scalar() or 0
        
        # NG count (has ng_reason but no downtime_reason)
        ng_result = await session.execute(
            select(func.count(Telemetry.id)).where(
                Telemetry.ng_reason.isnot(None),
                Telemetry.downtime_reason.is_(None)
            )
        )
        ng_count = ng_result.scalar() or 0
        
        # DOWN count (has downtime_reason)
        down_result = await session.execute(
            select(func.count(Telemetry.id)).where(
                Telemetry.downtime_reason.isnot(None)
            )
        )
        down_count = down_result.scalar() or 0
    
    return {
        "total": total,
        "ok_count": ok_count,
        "ng_count": ng_count,
        "down_count": down_count
    }


@router.post("/fast-forward/ai")
async def fast_forward_ai(days: int = 7):
    """
    Simulates N DAYS of production using Statistical AI.
    Learns from existing data in DB to model patterns.
    """
    from backend.ai.prediction import ProductionAI
    from backend.simulation.fast_forward import get_last_timestamp
    from datetime import datetime
    
    # 1. Determine Start Time
    last_ts = await get_last_timestamp()
    start_time = last_ts if last_ts else datetime.now()
    
    # 2. Run AI Prediction
    ai = ProductionAI()
    
    async with AsyncSessionLocal() as session:
        # Pass session for training AND inserting
        result = await ai.predict_week(session, start_time, days=days)
        
    return {
        "message": f"AI Prediction Complete: {days} Days Generated",
        "stats": result
    }


@router.get("/events")
async def get_db_events():
    """
    Returns the last 10 NG or DOWN events from the database.
    """
    from sqlalchemy import select, or_
    from backend.models import Telemetry
    
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(Telemetry).where(
                or_(
                    Telemetry.state == 'NG',
                    Telemetry.state == 'DOWN',
                    Telemetry.is_anomaly == True
                )
            ).order_by(Telemetry.timestamp_sim.desc()).limit(10)
        )
        events = result.scalars().all()
        
        # Format for frontend
        return [
            {
                "timestamp": e.timestamp_sim.isoformat(),
                "part_id": e.part_id,
                "status": e.state if e.state in ['NG', 'DOWN'] else 'NG', # Normalize
                "reason": e.downtime_reason or e.ng_reason or "Unknown Anomaly"
            }
            for e in events
        ]

# Import for record count endpoint
from backend.database import AsyncSessionLocal
