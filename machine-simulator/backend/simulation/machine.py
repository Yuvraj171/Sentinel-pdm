from backend.simulation.physics import ThermalModel
from backend.simulation.time_manager import TimeManager
from backend.simulation.failure_manager import FailureManager
from collections import deque
import random
import uuid

class MachineState:
    """
    Manages the operational lifecycle of the machine (The Conductor).
    """
    # ... (same constants)
    IDLE = "IDLE"
    LOADING = "LOADING"
    HEATING = "HEATING"
    QUENCH = "QUENCH"
    UNLOADING = "UNLOADING"
    DOWN = "DOWN"

    def __init__(self):
        self.state = self.IDLE
        self.timer = 0
        self.physics = ThermalModel()
        self.time_manager = TimeManager() 
        self.failure_manager = FailureManager() 
        
        # Live Event Log (FR-11)
        self.event_log = deque(maxlen=10) # Stores last 10 NG/DOWN events
        
        # Telemetry Snapshot
        self.current_power = 0.0
        self.current_flow = 0.0
        self.current_pressure = 0.0
        self.current_temp_speed = 0.0
        self.current_scan_speed = 0.0
        
        # Cycle Counters
        self.coil_life_counter = 200000 # Start at Max Life, countdown to 0
        self.ok_count = 0
        self.ng_count = 0
        self.cycle_count = 0
        self.total_cycles_planned = 0
        self.is_fast_forwarding = False  # Lock to pause live sim during FF
        
        # Current Part Info
        self._current_part_id = "READY" # Default instead of None
        self.downtime_reason = None
        self.repair_time_remaining = 0.0
        self.ng_reason = None  # NEW: Tracks why a part was NG
        
        # Peak Values for DB Logging (captured during cycle)
        self.peak_power = 0.0
        self.peak_flow = 0.0
        self.peak_pressure = 0.0
        self.peak_scan_speed = 0.0
        self.peak_temp_speed = 0.0
        self.peak_temp_speed = 0.0
        self.peak_quench_temp = 25.0
        self.peak_part_temp = 0.0 # NEW: Tracks max part temp for Quality Check
        
        # Drift Simulation (FR-08)
        self.active_drift = {"param": None, "rate": 0.0}
        self.accumulated_drift = 0.0
        self.quench_water_temp_base = 26.5
        
        # Manual Control (FR-09)
        self.manual_mode = False
        self.manual_mode = False
        self.manual_limits = {"temp_limit": 1000.0, "flow_target": 120.0}
        
        # Override for Fault Injection
        self.override_quench_temp = None
        
    @property
    def current_part_id(self):
        return self._current_part_id
        
    @current_part_id.setter
    def current_part_id(self, value):
        print(f"🕵️ PART ID CHANGED: {self._current_part_id} -> {value}")
        self._current_part_id = value
    
    def update(self):
        # === GUARD: Skip update if Fast Forward is running ===
        if self.is_fast_forwarding:
            return  # Do nothing - Fast Forward is generating data
        
        self.timer += 1
        self.time_manager.tick() 
        
        # DEBUG: Trace the heartbeat of the physics
        print(f"💓 TICK: State={self.state} | Temp={self.physics.temp:.1f} | Power={self.current_power} | Timer={self.timer}", flush=True)
        
        # --- 1. State Logic ---
        if self.state == self.DOWN:
             pass

        elif self.state == self.IDLE:
             pass

        elif self.state == self.LOADING:
            # Reset peak values for new part
            self.peak_power = 0.0
            self.peak_flow = 0.0
            self.peak_pressure = 0.0
            self.peak_scan_speed = 0.0
            self.peak_temp_speed = 0.0
            self.peak_temp_speed = 0.0
            self.peak_quench_temp = 25.0
            self.peak_part_temp = 0.0
            self.ng_reason = None  # Clear NG reason for new part
            # Instant Loading
            self.transition_to(self.HEATING)

        elif self.state == self.HEATING:
            # Determine Heating Target (Physics 850 or Manual Limit)
            target_temp = 850.0
            if self.manual_mode:
                 target_temp = self.manual_limits.get('temp_limit', 850.0)
            
            # Transition when we hit the target
            if self.physics.temp >= target_temp: 
                self.transition_to(self.QUENCH)

        elif self.state == self.QUENCH:
            if self.physics.temp <= 50: 
                self.transition_to(self.UNLOADING)

        elif self.state == self.UNLOADING:
            print(f"🔄 CYCLE COMPLETE. Counters - OK: {self.ok_count}, NG: {self.ng_count}")
            # Instant Unloading (Counter Increment)
            self.cycle_count += 1
            self.coil_life_counter -= 1 # REVERSED: Count DOWN from 200,000
            
            # Phase 7: Check Quality of the COMPLETED part using PEAK (Process) values
            # We must verify the parameters that were active DURING the cycle, not the 0.0s now.
            final_check_data = self.get_telemetry_dict()
            final_check_data['power'] = self.peak_power
            final_check_data['flow'] = self.peak_flow
            final_check_data['pressure'] = self.peak_pressure
            final_check_data['coil_scan_speed'] = self.peak_scan_speed
            final_check_data['tempering_speed'] = self.peak_temp_speed
            final_check_data['peak_part_temp'] = self.peak_part_temp
            final_check_data['quench_water_temp'] = self.peak_quench_temp
            
            health_report = self.failure_manager.check_health(final_check_data, commit=True)
            
            # Capture the ID of the part that JUST FINISHED before we generate a new one
            finished_part_id = self.current_part_id
            
            # --- SIMPLIFIED LOGIC: Continuous Flow ---
            # 1. Update Counters based on health
            if health_report['status'] == 'DOWN':
                print(f"🛑 CRITICAL STOP: {health_report['reason']}")
                self.downtime_reason = health_report['reason']
                self.ng_count += 1
                
                # LOG EVENT
                self.event_log.append({
                    "time": self.time_manager.get_clock(),
                    "part_id": finished_part_id,
                    "status": "DOWN",
                    "reason": health_report['reason']
                })
                
                self.transition_to(self.DOWN)
                return # Stop here
                
            elif health_report['status'] == 'NG':
                print(f"⚠️ NG PART PRODUCED: {health_report['reason']}")
                self.ng_count += 1
                self.ng_reason = health_report['reason']  # Store NG reason for DB
                
                # LOG EVENT
                self.event_log.append({
                    "time": self.time_manager.get_clock(),
                    "part_id": finished_part_id,
                    "status": "NG",
                    "reason": health_report['reason']
                })
                
            else:
                self.ok_count += 1
            
            # 2. Prepare NEXT Part immediately (No IDLE gap)
            self.current_part_id = f"PART-{str(uuid.uuid4())[:8].upper()}"
            
            # 3. Loop back to LOADING directly
            self.transition_to(self.LOADING)
            
            # --- 4. PERSISTENCE & DEBUGGING ---
            
            # Detailed Console Report (User Request)
            print(f"\n⚡ CYCLE FINISHED: {finished_part_id}")
            print(f"   ├─ Status:  {health_report['status']}")
            if health_report['reason']:
                print(f"   ├─ Reason:  {health_report['reason']}")
            print(f"   ├─ Stats:   OK={self.ok_count} | NG={self.ng_count}")
            print(f"   └─ Params:  Temp={self.physics.temp:.1f}C | Press={self.current_pressure:.1f}Bar\n")

            if hasattr(self, 'persistence') and self.persistence:
                # Capture the state at the moment of completion
                data = self.get_telemetry_dict()
                # Ensure it's marked as the finalized state
                data['state'] = "COMPLETED" 
                # FIX: Use the ID of the part that actually finished, not the new one
                data['part_id'] = finished_part_id 
                
                # Override with PEAK values (captured during cycle, not end-of-cycle zeros)
                data['power'] = self.peak_power
                data['flow'] = self.peak_flow
                data['pressure'] = self.peak_pressure
                data['coil_scan_speed'] = self.peak_scan_speed
                data['tempering_speed'] = self.peak_temp_speed
                data['peak_part_temp'] = self.peak_part_temp # NEW: Pass this to check_health
                data['quench_water_temp'] = self.peak_quench_temp
                data['coil_life'] = self.coil_life_counter
                
                # Add NG Reason for parts that failed
                data['ng_reason'] = self.ng_reason
                
                self.persistence.enqueue_telemetry(data)

        # --- 2. Physics & Drift Simulation ---
        self._apply_physics_inputs()
        

        
        if self.active_drift['param']:
            self._apply_drift()

        # Capture Peak (Latest) Values for DB logging (AFTER drift applied)
        # FIX: Only capture when the parameter is actually ACTIVE to avoid overwriting with 0.0
        
        if self.state == self.HEATING:
             self.peak_power = max(self.peak_power, self.current_power)
             self.peak_scan_speed = max(self.peak_scan_speed, self.current_scan_speed)
             # Track Peak Part Temp (Max accumulation)
             if self.physics.temp > self.peak_part_temp:
                 self.peak_part_temp = self.physics.temp

        elif self.state == self.QUENCH:
             self.peak_flow = max(self.peak_flow, self.current_flow)
             self.peak_pressure = max(self.peak_pressure, self.current_pressure)
             self.peak_temp_speed = max(self.peak_temp_speed, self.current_temp_speed)
             # Capture quench temp deviation (Virtual Sensor)
             q_temp = self.quench_water_temp_base + (self.accumulated_drift if self.active_drift['param'] == 'quench_water_temp' else 0)
             self.peak_quench_temp = max(0.0, q_temp)

        if self.state == self.HEATING and self.current_flow > 0.1:
             # Safety: Force Flow to 0 in HEATING to prevent accidental cooling
             self.current_flow = 0.0

        # Calculate Water Temp for Physics (Base + Drift + Override)
        q_temp = self.quench_water_temp_base
        if self.active_drift['param'] == 'quench_water_temp':
            q_temp += self.accumulated_drift
        if self.override_quench_temp is not None:
             q_temp = self.override_quench_temp
             
        # Peak Tracking for DB
        if self.state == self.QUENCH:
             self.peak_quench_temp = max(self.peak_quench_temp, q_temp)

        self.physics.update(self.current_power, self.current_flow, water_temp=q_temp)
        
        # MANUAL OVERRIDE: Clamp Temperature
        if self.manual_mode:
             # If physics put us over the limit, snap back down.
             limit = self.manual_limits.get('temp_limit', 1000.0)
             if self.physics.temp > limit:
                 self.physics.temp = limit
        
        # --- WATCHDOG: Force progression if stuck ---
        # If in HEATING/QUENCH for > 50 ticks (10s), something is wrong with physics (or manual limit stuck)
        if self.state in [self.HEATING, self.QUENCH] and self.timer > 50:
             msg = "⚠️ WATCHDOG" if not self.manual_mode else "ℹ️ MANUAL LIMIT TIMEOUT"
             print(f"{msg}: Stuck in {self.state} for 10s. Forcing transition...")
             if self.state == self.HEATING: self.transition_to(self.QUENCH)
             elif self.state == self.QUENCH: self.transition_to(self.UNLOADING)

        # Defensive: Ensure Part ID exists if we are running
        if self.state in [self.HEATING, self.QUENCH] and not self.current_part_id:
             print("⚠️ DETECTED RUNNING STATE WITHOUT PART ID. REGENERATING...")
             self.current_part_id = f"PART-{str(uuid.uuid4())[:8].upper()}"
        
        if self.state in [self.HEATING, self.QUENCH]:
             critical_check = self.failure_manager.check_health(self.get_telemetry_dict())
             if critical_check['status'] == 'DOWN':
                 print(f"🛑 E-STOP TRIGGERED: {critical_check['reason']}")
                 self.downtime_reason = critical_check['reason']
                 self.ng_count += 1 # FIX: Count this as a failed part
                 
                 # LOG EVENT
                 self.event_log.append({
                    "time": self.time_manager.get_clock(),
                    "part_id": self.current_part_id,
                    "status": "DOWN",
                    "reason": critical_check['reason']
                 })

                 self.transition_to(self.DOWN)
                 
                 # FIX: Log the breakdown to the database immediately
                 if hasattr(self, 'persistence') and self.persistence:
                     data = self.get_telemetry_dict()
                     data['state'] = "DOWN"  # Ensure state is DOWN for the log
                     data['downtime_reason'] = self.downtime_reason  # Explicitly include reason
                     data['ng_reason'] = f"PROCESS FAILURE: {self.downtime_reason}"  # Assign reason to part
                     data['power'] = self.peak_power
                     data['flow'] = self.peak_flow
                     data['pressure'] = self.peak_pressure
                     data['coil_scan_speed'] = self.peak_scan_speed
                     data['tempering_speed'] = self.peak_temp_speed
                     data['peak_part_temp'] = self.peak_part_temp
                     data['quench_water_temp'] = self.peak_quench_temp
                     data['coil_life'] = self.coil_life_counter
                     self.persistence.enqueue_telemetry(data)
                     print(f"📝 BREAKDOWN LOGGED: {self.downtime_reason}")

    def _apply_physics_inputs(self):
        # DEBUG INPUTS (Verbose)
        is_heating = (self.state == self.HEATING)
        print(f"🔌 INPUTS: State='{self.state}' | MatchHEATING={is_heating} | PowerBefore={self.current_power}", flush=True)
        
        if self.state == self.HEATING:
            self.current_power = 50.0 
            self.current_flow = 0.0
            self.current_pressure = 0.0
            self.current_scan_speed = 10.0  # mm/s during heating
            self.current_temp_speed = 0.0
            # print("   -> SET POWER 50.0", flush=True)
        elif self.state == self.QUENCH:
            self.current_power = 0.0
            
            # Determine Flow Target (Physics or Manual)
            target_flow = 120.0
            if self.manual_mode: 
                target_flow = self.manual_limits.get('flow_target', 120.0)
            
            # Apply Noise around the target
            self.current_flow = random.uniform(target_flow - 2.0, target_flow + 2.0) 
            self.current_pressure = random.uniform(3.4, 3.6)
            self.current_scan_speed = 8.0  # mm/s during quench
            self.current_temp_speed = 5.0  # tempering speed
        
        else:
            # IDLE, DOWN, LOADING, UNLOADING
            self.current_power = 0.0
            self.current_flow = 0.0
            self.current_pressure = 0.0
            self.current_scan_speed = 0.0
            self.current_temp_speed = 0.0
            
        # DEBUG: Ensure Flow is 0 in HEATING
        if self.state == self.HEATING and self.current_flow > 0.1:
            print(f"⚠️ LEAK DETECTED: Flow={self.current_flow} in HEATING! Forcing to 0.")
            self.current_flow = 0.0

    def _apply_drift(self):
        # 1. Update Accumulator
        self.accumulated_drift += self.active_drift['rate']
        
        # 2. Apply to Current State (Base + Accumulator)
        p = self.active_drift['param']
        drift = self.accumulated_drift
        
        if p == 'pressure': self.current_pressure = max(0.0, min(10.0, self.current_pressure + drift))
        elif p == 'flow': self.current_flow = max(0.0, min(250.0, self.current_flow + drift))
        elif p == 'power': self.current_power = max(0.0, min(100.0, self.current_power + drift)) # [NEW]
        elif p == 'scan_speed': self.current_scan_speed = max(0.0, min(20.0, self.current_scan_speed + drift)) # [NEW]
        elif p == 'quench_water_temp': pass # Handled in telemetry (virtual sensor) 

    def start_drift(self, param):
        # Determine direction: 50% chance of positive, 50% chance of negative
        # Exception: Coil Life always goes UP (no negative drift)
        direction = 1
        if param != 'coil_life':
            direction = 1 if random.choice([True, False]) else -1
            
        # Moderate drift rate: Fast enough to see, slow enough to catch NG state.
        # 0.8 units/tick (4.0 units/sec) -> ~7-8s to cross NG zone (30 units)
        base_rate = 0.8 
        if param == 'pressure': base_rate = 0.04 # Pressure is sensitive (bar)
        
        # Power needs to drift UP to fail (Overcurrent) -> Removed to allow Low Power (Softness)
        # if param == 'power': direction = 1 
        
        # Speed needs to drift DOWN to fail (Jamming) -> Removed to allow High Speed (Shallow Pattern)
        # if param == 'scan_speed': direction = -1
        
        rate = base_rate * direction
        
        self.active_drift = {"param": param, "rate": rate}
        self.accumulated_drift = 0.0
        
        dir_str = "INCREASING" if direction > 0 else "DECREASING"
        print(f"📉 DRIFT STARTED: {param} is {dir_str} at {rate}/tick...")

    def inject_fault(self, fault_type=None):
        """
        Triggers a specific fault: JUMP to NG Range -> DRIFT to DOWN Range.
        Uses accumulated_drift offset from the base value.
        """
        if fault_type == 'hose_burst':
            # Target: 3.5 bar. NG > 4.0. DOWN > 6.0.
            # Jump to 4.2 -> Offset = 4.2 - 3.5 = +0.7
            self.active_drift = {"param": "pressure", "rate": 0.02}
            self.accumulated_drift = 0.7
            print(f"💥 FAULT INJECTED: HOSE BURST (Offset +0.7 bar)")

        elif fault_type == 'pump_failure':
            # Target: 120 LPM. NG < 80. DOWN < 50.
            # Jump to 75 -> Offset = 75 - 120 = -45
            self.active_drift = {"param": "flow", "rate": -0.5}
            self.accumulated_drift = -45.0
            print(f"📉 FAULT INJECTED: PUMP FAILURE (Offset -45 LPM)")

        elif fault_type == 'power_surge':
            # Target: 50 kW. NG (unsafe high). DOWN > 80.
            # Jump to 65 -> Offset = 65 - 50 = +15
            self.active_drift = {"param": "power", "rate": 0.3}
            self.accumulated_drift = 15.0
            print(f"⚡ FAULT INJECTED: POWER SURGE (Offset +15 kW)")

        elif fault_type == 'servo_jam':
            # Target: 10 (HEATING) or 8 (QUENCH). NG < 8. DOWN < 5.
            # Jump to 7 -> Offset = 7 - 10 = -3
            self.active_drift = {"param": "scan_speed", "rate": -0.05}
            self.accumulated_drift = -3.0
            print(f"🛑 FAULT INJECTED: SERVO JAM (Offset -3 mm/s)")

        elif fault_type == 'cooling_fail':
            # Target: 26.5 C. NG > 32. DOWN > 50.
            # Jump to 34 -> Offset = 34 - 26.5 = +7.5
            self.active_drift = {"param": "quench_water_temp", "rate": 0.3}
            self.accumulated_drift = 7.5
            self.override_quench_temp = None 
            print(f"🔥 FAULT INJECTED: COOLING FAIL (Offset +7.5 C)")
            
        else:
            # Legacy Random Behavior
            options = ['pressure', 'flow', 'power', 'scan_speed']
            target = random.choice(options)
            self.start_drift(target)

    def start_slow_leak(self):
        """
        AI-Calibrated Drift Scenario: "Slow Hydraulic Leak" (DEMO MODE)
        
        Fast timeline for live demonstrations:
        - Drift Rate: -0.75 Bar/min = -0.0025 Bar/tick (at 5Hz)
        - NG Detection: ~1 minute (pressure drops from 3.5 → 3.0 Bar)
        - Breakdown: ~2 minutes (pressure drops from 3.5 → 2.0 Bar)
        
        This creates a LINEAR pressure decline that:
        1. Is fast enough for live demos
        2. Still produces detectable drift velocity (~-0.75 Bar/min)
        3. Gives AI time to calculate trend before breakdown
        """
        # Calculate rate: -0.75 Bar/min → -0.0125 Bar/sec → -0.0025 Bar/tick (5Hz)
        drift_rate = -0.0025  # Bar per tick (2.5x faster for demo)
        
        self.active_drift = {"param": "pressure", "rate": drift_rate}
        self.accumulated_drift = 0.0  # Start from normal (no jump)
        
        print(f"🔴 SLOW LEAK STARTED (DEMO MODE): Pressure will decay at -0.75 Bar/min")
        print(f"   ├─ Expected NG:   ~1 minute (pressure < 3.0 Bar)")
        print(f"   ├─ Expected DOWN: ~2 minutes (pressure < 2.0 Bar)")
        print(f"   └─ Drift Rate:    {drift_rate} Bar/tick")

    def repair(self):
        """
        Fixes the active fault/drift but keeps the production state.
        Use this to 'Repair' the machine after an NG run or Breakdown.
        """
        self.active_drift = {"param": None, "rate": 0.0}
        self.accumulated_drift = 0.0
        self.override_quench_temp = None # Clear override
        self.failure_manager.reset() # Clears consecutive NG count
        
        # If machine was DOWN, return to IDLE to allow restart.
        # If machine was RUNNING, it continues running but with corrected values.
        if self.state == self.DOWN:
            self.state = self.IDLE
            print("🛠️ SIMULATION REPAIRED: Machine is now IDLE.")
        else:
            print("🛠️ SIMULATION REPAIRED: Hot Fix applied. Drift cleared.")

    def transition_to(self, new_state):
        print(f"🔀 TRANSITION: {self.state} -> {new_state}")
        self.state = new_state
        self.timer = 0
        
        # FAILSAFE: Force inputs immediately on transition
        if new_state == self.HEATING:
             self.current_power = 50.0
        elif new_state == self.QUENCH:
             self.current_pressure = 3.5
             self.current_flow = 120.0
        elif new_state == self.DOWN:
             # FIX: Clear NG reason if we crash, so it doesn't look like an NG part caused the crash
             self.ng_reason = None
        
    def stop(self):
        """
        Safely halts the machine, returning to IDLE.
        Preserves counters (OK/NG) and Coil Life.
        Resets physics and active drifts.
        """
        print("🛑 STOP COMMAND RECEIVED. Halting machine...")
        self.state = self.IDLE
        self.timer = 0
        self.physics = ThermalModel() # cool down
        self.active_drift = {"param": None, "rate": 0.0}
        self.current_power = 0.0
        self.current_flow = 0.0
        self.current_pressure = 0.0
        self.current_scan_speed = 0.0
        self.current_temp_speed = 0.0
        self.current_part_id = "READY"
        self.downtime_reason = None
        self.ng_reason = None
        
    def reset(self):
        self.state = "IDLE"
        self.timer = 0
        self.time_manager.reset()
        self.failure_manager.reset()
        self.physics = ThermalModel()
        self.active_drift = {"param": None, "rate": 0.0}
        self.coil_life_counter = 200000
        self.ok_count = 0
        self.ng_count = 0
        self.cycle_count = 0
        self.event_log.clear() # FR-11: Clear Live Log on Reset
        self.current_power = 0.0
        self.current_flow = 0.0
        self.current_pressure = 0.0
        self.current_part_id = "READY"
        self.downtime_reason = None
        print("SYSTEM RESET: Machine state and counters fully cleared.")

    def start_cycle(self):
        if self.state == self.IDLE:
            self.current_part_id = f"PART-{str(uuid.uuid4())[:8].upper()}"
            print(f"🟢 STARTING NEW CYCLE. Part ID: {self.current_part_id}")
            self.transition_to(self.LOADING)

    def get_status(self):
        shift_info = self.time_manager.get_shift_info()
        return {
            "state": self.state,
            "telemetry": self.get_telemetry_dict(shift_info),
            "event_log": list(self.event_log) # FR-11: Expose Live Log
        }

    def get_telemetry_dict(self, shift_info=None):
        if not shift_info: shift_info = self.time_manager.get_shift_info()
        
        noise = {
            "p": random.gauss(0, 0.05) if self.current_pressure > 0 else 0, 
            "f": random.gauss(0, 2.0) if self.current_flow > 0 else 0,     
            "w": random.gauss(0, 0.5) if self.current_power > 0 else 0      
        }

        # Calculate Virtual Quench Temp (Base + Drift)
        # Telemetry Construction
        
        # Calculate Quench Water Temp (Virtual)
        # Base + Drift + Noise
        q_temp = self.quench_water_temp_base
        if self.active_drift['param'] == 'quench_water_temp':
            q_temp += self.accumulated_drift
        
        # Override takes precedence (for faults)
        if self.override_quench_temp is not None:
             q_temp = self.override_quench_temp
        else:
             q_temp += random.uniform(-0.2, 0.2)

        # Update Peak (Internal tracking)
        if q_temp > self.peak_quench_temp: self.peak_quench_temp = q_temp

        return {
                "timer": self.timer,
                "temp": round(self.physics.temp, 2),
                "quench_water_temp": round(q_temp, 2), # Virtual sensor
                "peak_part_temp": self.peak_part_temp, 
                "power": round(self.current_power + noise['w'], 1),
                "flow": round(self.current_flow + noise['f'], 1),
                "pressure": round(self.current_pressure + noise['p'], 2),
                "coil_scan_speed": self.current_scan_speed, 
                "tempering_speed": self.current_temp_speed,
                "state": self.state,
                "sim_run_id": "LIVE-VIEW",
                "timestamp_sim": self.time_manager.get_clock(),
                "timestamp_sim_raw": self.time_manager.current_time,
                "shift_id": shift_info["shift_id"],
                "operator_id": shift_info["operator_id"],
                "part_id": self.current_part_id,
                "ok_count": self.ok_count,
                "ng_count": self.ng_count,
                "coil_life": int(self.coil_life_counter),
                
                "downtime_reason": self.downtime_reason if self.state == self.DOWN else None,
                "repair_time": self.repair_time_remaining if self.state == self.DOWN else 0.0,
                "ng_reason": self.ng_reason
        }

    def force_sync_counters(self, ok_count, ng_count, coil_life):
        """
        Explicitly updates internal counters to match an external source (e.g. Fast Forward).
        Prevents the machine from reverting to old counts when it resumes.
        """
        print(f"🔄 SYNCING COUNTERS: OK {self.ok_count}->{ok_count} | NG {self.ng_count}->{ng_count} | Coil {self.coil_life_counter}->{coil_life}")
        self.ok_count = int(ok_count)
        self.ng_count = int(ng_count)
        self.coil_life_counter = int(coil_life)
