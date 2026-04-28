import random
import statistics
from datetime import datetime, timedelta
from typing import List, Dict, Tuple
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.models import Telemetry
from backend.simulation.fast_forward import (
    simulate_day, 
    get_downtime_reason, 
    REPAIR_TIMES, 
    FAILURE_TYPES,
    NG_REASONS,
    PARTS_PER_DAY, 
    CYCLE_TIME_SECONDS,
    get_shift_operator
)

class ProductionAI:
    """
    AI Module for Digital Twin Simulation.
    Learns from historical data to predict/generate future machine behavior.
    """
    
    def __init__(self):
        # Learned Parameters (Defaults used if no data)
        self.stats = {
            'power': {'mean': 50.0, 'stdev': 1.0},
            'flow': {'mean': 120.0, 'stdev': 2.0},
            'pressure': {'mean': 3.5, 'stdev': 0.1},
            'temp': {'mean': 850.0, 'stdev': 10.0},
            'scan_speed': {'mean': 10.0, 'stdev': 0.5},
        }
        self.transition_matrix = {
            'OK': {'OK': 0.95, 'NG': 0.04, 'DOWN': 0.01},
            'NG': {'OK': 0.60, 'NG': 0.30, 'DOWN': 0.10}, 
            # DOWN escapes via repair, so we model probability of *entering* DOWN
        }
    
    async def train_model(self, session: AsyncSession) -> bool:
        """
        Analyzes historical data to update internal statistical models.
        Returns True if enough data was found to train (>100 records).
        """
        # Fetch up to 10,000 recent records for training
        result = await session.execute(
            select(Telemetry).order_by(Telemetry.timestamp_sim.desc()).limit(10000)
        )
        data = result.scalars().all()
        
        if len(data) < 100:
            print("⚠️ AI: Insufficient data to train (<100 records). Using defaults.")
            return False
            
        print(f"🧠 AI: Training on {len(data)} records...")
        
        # 1. Extract Arrays for OK parts only (to learn "Normal" behavior)
        ok_parts = [r for r in data if not r.is_anomaly and r.state != 'DOWN']
        
        if ok_parts:
            # Helper to safely calc stats
            def calc_stat(dataset):
                if not dataset: return 0, 0
                return statistics.mean(dataset), statistics.stdev(dataset) if len(dataset) > 1 else 0
                
            p_mean, p_std = calc_stat([r.induction_power for r in ok_parts])
            f_mean, f_std = calc_stat([r.quench_water_flow for r in ok_parts])
            pr_mean, pr_std = calc_stat([r.quench_pressure for r in ok_parts])
            t_mean, t_std = calc_stat([r.part_temp for r in ok_parts])
            
            # Update Knowledge Base
            self.stats['power'] = {'mean': p_mean, 'stdev': p_std}
            self.stats['flow'] = {'mean': f_mean, 'stdev': f_std}
            self.stats['pressure'] = {'mean': pr_mean, 'stdev': pr_std}
            self.stats['temp'] = {'mean': t_mean, 'stdev': t_std}
            
        # 2. Learn State Transitions (Markov Chain)
        # Count transitions: OK->OK, OK->NG, OK->DOWN
        transitions = {'OK': 0, 'NG': 0, 'DOWN': 0}
        total = len(data)
        
        for r in data:
            if r.downtime_reason: transitions['DOWN'] += 1
            elif r.ng_reason: transitions['NG'] += 1
            else: transitions['OK'] += 1
            
        # Normalize to probabilities
        if total > 0:
            p_ok = transitions['OK'] / total
            p_ng = transitions['NG'] / total
            p_down = transitions['DOWN'] / total
            
            # Simple 1st order approximation: Probability of randomly generating this state
            # (Refining full Markov chain requires sequential analysis, but distribution matching is sufficient for this scope)
            self.transition_matrix['OK'] = {'OK': p_ok, 'NG': p_ng, 'DOWN': p_down}
            
        print(f"🧠 AI: Learned Stats -> Power: {self.stats['power']['mean']:.1f}±{self.stats['power']['stdev']:.1f}")
        return True

    def generate_parameter(self, param_name: str, drift_factor: float = 0.0) -> float:
        """Generates a value based on learned normal distribution + drift."""
        stat = self.stats.get(param_name, {'mean': 0, 'stdev': 1})
        val = random.gauss(stat['mean'], stat['stdev'])
        return val + drift_factor

    async def predict_week(self, session: AsyncSession, start_time: datetime, days: int = 7) -> dict:
        """
        Generates N days of data based on learned patterns.
        Optimized for bulk insertion speed.
        """
        # 1. Train first
        await self.train_model(session)
        
        # 2. Settings
        days_to_predict = days
        total_parts = PARTS_PER_DAY * days_to_predict
        
        # 3. Pre-calculate Loop Constants to save CPU cycles
        current_time = start_time
        ok_count = 0
        ng_count = 0
        down_count = 0
        coil_life = 200000 
        repair_cycles_remaining = 0
        
        print(f"🔮 AI: Generating {days_to_predict} days (~{total_parts} parts)...")
        
        probs = self.transition_matrix['OK']
        prob_down = probs['DOWN']
        prob_ng = probs['DOWN'] + probs['NG']
        
        batch_size = 5000
        records_batch = []
        
        import uuid
        from sqlalchemy import insert
        
        for i in range(total_parts):
            # Advance Time roughly (10s per part)
            current_time += timedelta(seconds=CYCLE_TIME_SECONDS)
            
            # Simple Shift Calculation (save function call overhead if possible, but func is cleaner)
            h = current_time.hour
            is_shift_a = 8 <= h < 20
            shift_id = 'Shift_A' if is_shift_a else 'Shift_B'
            operator_id = 'OP_A' if is_shift_a else 'OP_B'
            
            # Handle Repair
            if repair_cycles_remaining > 0:
                repair_cycles_remaining -= 1
                continue
            
            coil_life -= 1
            if coil_life <= 0: coil_life = 200000
            
            # Determine Outcome (Fast)
            roll = random.random()
            
            params = {}
            outcome = 'OK'
            state = 'COMPLETED'
            downtime_reason = None
            ng_reason = None
            repair_time = 0.0
            
            if roll < prob_down:
                outcome = 'DOWN'
                state = 'DOWN'
                fail_type = random.choice(FAILURE_TYPES)
                downtime_reason = get_downtime_reason(fail_type)
                ng_reason = f"PROCESS FAILURE: {downtime_reason}"
                repair_cycles_remaining = random.randint(*REPAIR_TIMES[fail_type])
                repair_time = float(repair_cycles_remaining * CYCLE_TIME_SECONDS)
                # Parameters go wild
                params = {k: self.generate_parameter(k, drift_factor=random.uniform(-10, 10)) for k in self.stats}
                down_count += 1
                
            elif roll < prob_ng:
                outcome = 'NG'
                ng_reason = random.choice(NG_REASONS)
                params = {k: self.generate_parameter(k) for k in self.stats}
                if ng_reason == 'SOFTNESS': params['power'] *= 0.8
                elif ng_reason == 'CRACKING': params['pressure'] *= 1.5
                ng_count += 1
                
            else:
                outcome = 'OK'
                params = {k: self.generate_parameter(k) for k in self.stats}
                ok_count += 1
            
            # Create Dictionary (dict creation is faster than ORM Object)
            record_dict = {
                'sim_run_id': 1,
                'timestamp_sim': current_time,
                'induction_power': params['power'],
                'quench_water_temp': random.uniform(25.0, 30.0), 
                'quench_water_flow': params['flow'],
                'quench_pressure': params['pressure'],
                'coil_scan_speed': params['scan_speed'],
                'tempering_speed': 5.0,
                'part_temp': params['temp'],
                'state': state,
                'part_id': f"AI-{str(uuid.uuid4())[:8]}",
                'shift_id': shift_id,
                'operator_id': operator_id,
                'coil_life_counter': coil_life,
                'ok_count': ok_count,
                'ng_count': ng_count + down_count,
                'is_anomaly': (outcome != 'OK'),
                'downtime_reason': downtime_reason,
                'ng_reason': ng_reason,
                'repair_time': repair_time
            }
            records_batch.append(record_dict)
            
            # Flush Batch
            if len(records_batch) >= batch_size:
                # Use Core INSERT for massive speedup vs ORM add_all
                await session.execute(insert(Telemetry), records_batch)
                records_batch = []
                # print(f"   ...AI generated {i+1} records") 
        
        # Insert remaining
        if records_batch:
            await session.execute(insert(Telemetry), records_batch)
            
        await session.commit()
        
        # VERIFICATION: Confirm records actually exist
        from sqlalchemy import func, select
        count_verify = await session.execute(select(func.count(Telemetry.id)))
        total_now = count_verify.scalar()
        
        # Calculate Delta if possible (approximation, or just trust the detailed flow)
        
        return {
            'total_records': total_parts,
            'ok_count': ok_count,
            'ng_count': ng_count,
            'down_count': down_count,
            'days': days_to_predict,
            'db_total_now': total_now
        }
