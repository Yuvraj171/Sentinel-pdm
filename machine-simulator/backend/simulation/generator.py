from datetime import datetime, timedelta
from sqlalchemy.ext.asyncio import AsyncSession
from backend.models import SimRun, Telemetry
from backend.simulation.machine import MachineState
import asyncio

class SimulationGenerator:
    """
    Handles high-performance batch generation of simulation data.
    """
    def __init__(self, db: AsyncSession):
        self.db = db
        self.machine = MachineState()
        self.batch_size = 50000 
    
    async def generate_batch(self):
        """
        Runs the simulation in 'Fast-Forward' mode for 50,000 steps.
        Saves all data to the database in a bulk insert.
        """
        start_time = datetime.utcnow()
        
        # 1. Create a new Simulation Run record
        sim_run = SimRun(
            start_time=start_time,
            status="GENERATING",
            total_rows=0
        )
        self.db.add(sim_run)
        await self.db.flush() # Flush to get the ID, but don't commit yet
        
        current_sim_time = start_time
        telemetry_buffer = []

        # 2. Key Optimization: Pre-calculate loop for speed
        # We run the physics logic in a tight loop in memory
        for _ in range(self.batch_size):
            # A. Update Machine Physics
            self.machine.update()
            status = self.machine.get_status()
            
            # B. Create Data Point (In Memory)
            # Note: We append dictionaries for bulk_insert_mappings (fastest SQLAlchemy method)
            telemetry_buffer.append({
                "sim_run_id": sim_run.id,
                "timestamp_sim": current_sim_time,
                "induction_power": status["power"],
                "quench_water_temp": status["temp"],
                "quench_water_flow": status["flow"],
                "quench_pressure": 0.0, # Placeholder until pressure logic added to machine.py
                "coil_scan_speed": 0.0, # Placeholder
                "tempering_speed": 0.0, # Placeholder
                "state": status["state"],
                "coil_life_counter": 0, # Placeholder
                "is_anomaly": False
            })
            
            # C. Advance Time
            current_sim_time += timedelta(seconds=1)

        # 3. Bulk Insert (The "Train" method)
        # Instead of 50,000 DB trips, we make 1 massive trip.
        await self.db.run_sync(
            lambda session: session.bulk_insert_mappings(Telemetry, telemetry_buffer)
        )
        
        # 4. Finalize
        sim_run.status = "COMPLETED"
        sim_run.total_rows = len(telemetry_buffer)
        await self.db.commit()
        
        return sim_run.id, len(telemetry_buffer)
