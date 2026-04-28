from sqlalchemy.ext.asyncio import AsyncSession
from backend.database import get_db, AsyncSessionLocal
from backend.models import SimRun, Telemetry
from datetime import datetime
import asyncio

class SimulationPersistence:
    """
    Bridge between Sync Simulation Logic and Async Database.
    Runs a worker loop to consume telemetry/events from a queue.
    """
    def __init__(self):
        self.queue = asyncio.Queue()
        self.is_running = False
        self._main_loop = None  # Store reference to main event loop
        
    async def start_worker(self):
        self.is_running = True
        self._main_loop = asyncio.get_running_loop()  # Capture the correct loop
        print("💾 DB WORKER STARTED (Event Loop captured)")
        while self.is_running:
            item = await self.queue.get()
            if item is None: break
            
            try:
                await self._save_to_db(item)
                print(f"💾 SAVED TO DB: {item.get('part_id', 'unknown')}")
            except Exception as e:
                print(f"❌ DB SAVE ERROR: {e}")
                import traceback
                traceback.print_exc()
            finally:
                self.queue.task_done()
                
    async def stop_worker(self):
        self.is_running = False
        await self.queue.put(None)
    
    async def flush(self):
        """Wait for all queued items to be processed."""
        if self.queue.qsize() > 0:
            print(f"🔄 FLUSH: Waiting for {self.queue.qsize()} items to drain...")
            await self.queue.join()
            print("✅ FLUSH: Queue drained")
        
    def enqueue_telemetry(self, telemetry_data):
        # Called from Sync Logic (potentially from another thread)
        try:
            if self._main_loop and self._main_loop.is_running():
                # Use the stored main loop reference for thread-safe queueing
                self._main_loop.call_soon_threadsafe(self.queue.put_nowait, telemetry_data)
                print(f"📤 QUEUED FOR DB: {telemetry_data.get('part_id', 'unknown')}")
            else:
                print("⚠️ PERSISTENCE: Main loop not available yet")
        except Exception as e:
            print(f"⚠️ PERSISTENCE QUEUE FAIL: {e}")
            import traceback
            traceback.print_exc()
        
    async def _save_to_db(self, data):
        async with AsyncSessionLocal() as session:
             async with session.begin():
                 # Create Telemetry Record
                 # Ensure we have a valid SimRun ID first (Assuming ID 1 for Live View for now)
                 # In a full app, we would manage Run IDs dynamically.
                 
                 # Using a fixed ID=1 for "Live Dashboard" bucket
                 entry = Telemetry(
                     sim_run_id=1, 
                     timestamp_sim=datetime.now(), # Use Local System Time (matches UI)
                     induction_power=float(data.get('power', 0.0)),
                     quench_water_temp=float(data.get('quench_water_temp', 25.0)),  # Use correct field
                     quench_water_flow=float(data.get('flow', 0.0)),
                     quench_pressure=float(data.get('pressure', 0.0)),
                     coil_scan_speed=float(data.get('coil_scan_speed', 0.0)),
                     tempering_speed=float(data.get('tempering_speed', 0.0)),
                     part_temp=float(data.get('peak_part_temp', 0.0)), # NEW: Persist Part Temp
                     state=data.get('state', 'UNKNOWN'),
                     
                     # Identity
                     part_id=data.get('part_id'),
                     shift_id=data.get('shift_id'),
                     operator_id=data.get('operator_id'),
                     
                     # Counters
                     coil_life_counter=int(data.get('coil_life', 0)),
                     ok_count=int(data.get('ok_count', 0)),
                     ng_count=int(data.get('ng_count', 0)),

                     # Failure - NG Reason is the physical defect reason
                     is_anomaly=data.get('ng_reason') is not None or data.get('downtime_reason') is not None,
                     downtime_reason=data.get('downtime_reason'),
                     ng_reason=data.get('ng_reason'),  # NEW: Why part was NG
                     repair_time=float(data.get('repair_time', 0.0))
                 )
                 session.add(entry)
                 # print(f"💾 SAVED: {data['part_id']}")
