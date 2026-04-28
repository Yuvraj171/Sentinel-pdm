"""
Fast Forward Simulation Module
Generates large datasets for AI/ML training by running accelerated physics.
"""

import random
import uuid
from datetime import datetime, timedelta
from typing import Optional, Dict, List
from backend.database import AsyncSessionLocal
from backend.models import Telemetry, SimRun
from backend.simulation.failure_manager import FailureManager

# === CONFIGURATION ===

# Distribution targets
TARGET_OK_PERCENT = 0.75
TARGET_NG_PERCENT = 0.18
TARGET_DOWN_PERCENT = 0.07

# Repair times (in cycles) for each failure type
REPAIR_TIMES = {
    'hose_burst': (8, 12),
    'pump_failure': (15, 20),
    'power_surge': (20, 30),
    'servo_jam': (10, 15),
    'cooling_fail': (10, 15),
    'coil_failure': (30, 50),
}

# Failure types for random selection
FAILURE_TYPES = ['hose_burst', 'pump_failure', 'power_surge', 'servo_jam', 'cooling_fail', 'coil_failure']

# NG reasons mapped to parameter conditions
NG_REASONS = ['SOFTNESS', 'CRACKING', 'SHALLOW_HARDENING', 'UNEVEN_HARDENING']

# Shift configuration
SHIFTS = {
    'Shift_A': {'start': 8, 'end': 20, 'operator': 'OP_A'},
    'Shift_B': {'start': 20, 'end': 8, 'operator': 'OP_B'},  # Overnight
}

# Cycle time in seconds
CYCLE_TIME_SECONDS = 10

# Parts per day (accounting for ~10% downtime)
PARTS_PER_DAY = 7500


def get_shift_operator(hour: int) -> tuple:
    """Returns (shift_id, operator_id) based on hour of day."""
    if 8 <= hour < 20:
        return 'Shift_A', 'OP_A'
    else:
        return 'Shift_B', 'OP_B'


def generate_ok_parameters() -> Dict:
    """Generate parameters within OK ranges with natural variation."""
    return {
        'power': random.uniform(48.0, 52.0),  # OK: 45-55 kW
        'flow': random.uniform(110.0, 130.0),  # OK: 80-150 LPM
        'pressure': random.uniform(3.2, 3.8),  # OK: 2.0-4.0 bar
        'quench_water_temp': random.uniform(24.0, 28.0),  # OK: < 32 C
        'coil_scan_speed': random.uniform(9.0, 11.0),  # OK: 8-12 mm/s
        'tempering_speed': random.uniform(4.5, 5.5),
        'peak_part_temp': random.uniform(820.0, 880.0),  # OK: 800-900 C
    }


def generate_ng_parameters(ng_type: str) -> Dict:
    """Generate parameters that would cause NG (quality failure)."""
    params = generate_ok_parameters()
    
    if ng_type == 'SOFTNESS':
        # Low temp or low power -> Soft part
        params['peak_part_temp'] = random.uniform(700.0, 780.0)
        params['power'] = random.uniform(40.0, 45.0)
    elif ng_type == 'CRACKING':
        # High pressure -> Cracking
        params['pressure'] = random.uniform(4.2, 5.5)
    elif ng_type == 'SHALLOW_HARDENING':
        # Low scan speed or high flow
        params['coil_scan_speed'] = random.uniform(6.0, 7.5)
    elif ng_type == 'UNEVEN_HARDENING':
        # Temperature variance (simulated by high quench temp)
        params['quench_water_temp'] = random.uniform(33.0, 45.0)
    
    return params


def generate_down_parameters(failure_type: str) -> Dict:
    """Generate parameters that caused machine to break down."""
    params = generate_ok_parameters()
    
    if failure_type == 'hose_burst':
        params['pressure'] = random.uniform(6.5, 9.0)
    elif failure_type == 'pump_failure':
        params['flow'] = random.uniform(10.0, 45.0)
    elif failure_type == 'power_surge':
        params['power'] = random.uniform(82.0, 95.0)
    elif failure_type == 'servo_jam':
        params['coil_scan_speed'] = random.uniform(1.0, 4.5)
    elif failure_type == 'cooling_fail':
        params['quench_water_temp'] = random.uniform(52.0, 65.0)
    elif failure_type == 'coil_failure':
        params['peak_part_temp'] = random.uniform(1200.0, 1350.0)
    
    return params


def get_downtime_reason(failure_type: str) -> str:
    """Map failure type to downtime reason string."""
    reasons = {
        'hose_burst': 'Hose Burst (High Pressure)',
        'pump_failure': 'Pump Failure (Low Flow)',
        'power_surge': 'Inverter Overcurrent',
        'servo_jam': 'Servo Overload',
        'cooling_fail': 'Scalding Risk (High Water Temp)',
        'coil_failure': 'Coil Damage (Part Melted)',
    }
    return reasons.get(failure_type, 'Unknown Failure')


async def simulate_day(start_time: Optional[datetime] = None, 
                       initial_ok: int = 0, 
                       initial_ng: int = 0, 
                       initial_coil_life: int = 200000) -> Dict:
    """
    Simulate one full day of production data.
    
    Args:
        start_time: Starting timestamp. If None, uses current time.
        initial_ok: Starting OK count (from Live machine).
        initial_ng: Starting NG count (from Live machine).
        initial_coil_life: Starting coil life (from Live machine).
        
    Returns:
        Dict with statistics: ok, ng, down_count, coil_life, total_records
    """
    if start_time is None:
        start_time = datetime.now()
    
    # Use provided counters (from machine) as starting point
    ok_count = initial_ok
    ng_count = initial_ng
    coil_life = initial_coil_life
    
    print(f"📊 FAST FORWARD: Starting from OK={ok_count}, NG={ng_count}, Coil={coil_life}")
    
    # Track down events generated in this run (starts at 0 for this batch)
    down_count = 0
    
    # Calculate target counts based on distribution
    target_ng = int(PARTS_PER_DAY * TARGET_NG_PERCENT)
    target_down = int(PARTS_PER_DAY * TARGET_DOWN_PERCENT)
    
    # Distribute failures evenly across the day
    ng_interval = PARTS_PER_DAY // target_ng if target_ng > 0 else 999999
    down_interval = PARTS_PER_DAY // target_down if target_down > 0 else 999999
    
    # Track repair cycles (skip parts during repair)
    repair_cycles_remaining = 0
    current_failure_type = None
    
    records_to_insert = []
    current_time = start_time
    
    for cycle in range(PARTS_PER_DAY):
        # Generate timestamp
        current_time = start_time + timedelta(seconds=cycle * CYCLE_TIME_SECONDS)
        hour = current_time.hour
        shift_id, operator_id = get_shift_operator(hour)
        
        # Generate part ID
        part_id = f"PART-{str(uuid.uuid4())[:8].upper()}"
        
        # Handle ongoing repair
        if repair_cycles_remaining > 0:
            repair_cycles_remaining -= 1
            continue  # Skip this cycle (machine is down)
        
        # Determine outcome for this part
        if cycle > 0 and cycle % down_interval == 0 and down_count < target_down:
            # Generate DOWN event
            failure_type = random.choice(FAILURE_TYPES)
            
            # Check for proactive coil replacement (20% chance)
            if failure_type == 'coil_failure' and random.random() < 0.2:
                coil_life = 200000  # Proactive replacement
                # Still count as down but shorter repair
                repair_cycles_remaining = random.randint(15, 25)
            else:
                repair_cycles_remaining = random.randint(*REPAIR_TIMES[failure_type])
            
            params = generate_down_parameters(failure_type)
            state = 'DOWN'
            downtime_reason = get_downtime_reason(failure_type)
            ng_reason = f"PROCESS FAILURE: {downtime_reason}"
            down_count += 1
            
        elif cycle > 0 and cycle % ng_interval == 0 and ng_count < target_ng:
            # Generate NG event
            ng_type = random.choice(NG_REASONS)
            params = generate_ng_parameters(ng_type)
            state = 'COMPLETED'
            downtime_reason = None
            ng_reason = ng_type
            ng_count += 1
            
        else:
            # Generate OK event
            params = generate_ok_parameters()
            state = 'COMPLETED'
            downtime_reason = None
            ng_reason = None
            ok_count += 1
        
        # Decrement coil life
        coil_life -= 1
        if coil_life <= 0:
            coil_life = 200000  # Auto-replace
        
        # Create record
        record = {
            'timestamp_sim': current_time,
            'part_id': part_id,
            'shift_id': shift_id,
            'operator_id': operator_id,
            'state': state,
            'coil_life': coil_life,
            'ok_count': ok_count,
            'ng_count': ng_count + down_count,
            'downtime_reason': downtime_reason,
            'ng_reason': ng_reason,
            'repair_time': float(repair_cycles_remaining * CYCLE_TIME_SECONDS) if state == 'DOWN' else 0.0,
            **params
        }
        records_to_insert.append(record)
    
    # Batch insert to database
    async with AsyncSessionLocal() as session:
        async with session.begin():
            for rec in records_to_insert:
                entry = Telemetry(
                    sim_run_id=1,
                    timestamp_sim=rec['timestamp_sim'],
                    induction_power=rec['power'],
                    quench_water_temp=rec['quench_water_temp'],
                    quench_water_flow=rec['flow'],
                    quench_pressure=rec['pressure'],
                    coil_scan_speed=rec['coil_scan_speed'],
                    tempering_speed=rec['tempering_speed'],
                    part_temp=rec['peak_part_temp'],
                    state=rec['state'],
                    part_id=rec['part_id'],
                    shift_id=rec['shift_id'],
                    operator_id=rec['operator_id'],
                    coil_life_counter=rec['coil_life'],
                    ok_count=rec['ok_count'],
                    ng_count=rec['ng_count'],
                    is_anomaly=rec['ng_reason'] is not None,
                    downtime_reason=rec['downtime_reason'],
                    ng_reason=rec['ng_reason'],
                    repair_time=rec['repair_time']
                )
                session.add(entry)
    
    return {
        'ok': ok_count,
        'ng': ng_count + down_count,  # Total NG includes DOWN events
        'down_count': down_count,
        'coil_life': coil_life,
        'total_records': len(records_to_insert),
        'start_time': start_time.isoformat(),
        'end_time': current_time.isoformat(),
    }


async def get_last_timestamp() -> Optional[datetime]:
    """Get the last timestamp from the database for continuation."""
    async with AsyncSessionLocal() as session:
        from sqlalchemy import select, func
        result = await session.execute(
            select(func.max(Telemetry.timestamp_sim))
        )
        return result.scalar()


async def get_last_state() -> Dict:
    """
    Get the last counter values from the database.
    Returns ok_count, ng_count, and coil_life from the most recent record.
    """
    async with AsyncSessionLocal() as session:
        from sqlalchemy import select, desc
        result = await session.execute(
            select(Telemetry.ok_count, Telemetry.ng_count, Telemetry.coil_life_counter)
            .order_by(desc(Telemetry.id))
            .limit(1)
        )
        row = result.first()
        if row:
            return {
                'ok_count': row.ok_count or 0,
                'ng_count': row.ng_count or 0,
                'coil_life': row.coil_life_counter or 200000
            }
        return {'ok_count': 0, 'ng_count': 0, 'coil_life': 200000}
