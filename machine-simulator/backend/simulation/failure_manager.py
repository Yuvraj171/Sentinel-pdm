class FailureManager:
    """
    Phase 7: Central Brain for Health & Quality Logic.
    Enforces SOR Section 3.2 and 3.3 Rules.
    """
    def __init__(self):
        # 1. Configuration (The "Rules")
        self.THRESHOLDS = {
            "pressure": {"min": 2.0, "max": 4.0}, # Bar (Quality)
            "temp":     {"min": 25.0, "max": 32.0}, # Celsius (Quality)
            "flow":     {"min": 80.0, "max": 150.0}, # LPM (Quality)
            "scan_speed": {"min": 8.0, "max": 12.0}, # mm/s
            "temp_speed": {"min": 20.0, "max": 30.0}, # mm/s
            "part_temp":  {"min": 800.0, "max": 880.0}, # Celsius (Part Quality) [NEW]
            "coil_life":  {"max": 200000} # Cycles
        }
        
        # Safety Limits (Machine Protection - Trigger DOWN)
        # NOTE: Safety limits should be MORE EXTREME than Quality limits to allow an NG zone.
        # Example: Quality flow_min=80, Safety flow_min=50. 
        # Flow 50-80 = NG (Softness), Flow <50 = Breakdown (Pump Failure).
        self.SAFETY_LIMITS = {
            "pressure_max": 6.0, # Hose Burst (BD) - Quality max is 4.0
            "pressure_min": 1.0, # Complete Loss (MS) - Quality min is 2.0
            "flow_min": 50.0,    # Pump Failure (MS) - Quality min is 80.0 (Zone: 50-80 = NG)
            "temp_max": 50.0,    # Scalding/Boiling (BD) - Quench Water
            "part_temp_max": 1200.0, # Melt Down (BD) - Coil Damage [NEW]
            "power_max": 80.0,   # Inverter Overcurrent (BD)
            "speed_min": 5.0     # Servo Overload/Jam (MS)
        }
        
        # 2. State Tracking (For "5 NG" Rule)
        self.consecutive_ng_counter = 0
        self.active_fault = None
        self.active_drift_param = None # Which param is currently drifting?

    def check_health(self, telemetry, commit=False):
        """
        Evaluates current telemetry against rules.
        commit: If True, updates internal counters (use only at End of Cycle).
        Returns: { "status": "OK" | "NG" | "DOWN", "reason": str | None }
        """
        issues = []
        
        # --- A. Critical Checks (Priority 1 & 2 - Instant Stop) ---
        # 1. Coil Life (BD)
        if telemetry.get('coil_life', 200000) <= 0:
            return self._trigger_failure("BD", "Coil Failure (Life Exceeded)", 60)

        # 0. Part Melt Check (BD) [NEW]
        pt = telemetry.get('temp', 0)
        if pt > self.SAFETY_LIMITS['part_temp_max']:
             return self._trigger_failure("BD", f"Coil Damage (Part Melted: {pt:.1f}°C)", 60)

        # 2. Power System (BD) [NEW]
        power = telemetry.get('power', 0)
        if power > self.SAFETY_LIMITS['power_max']:
             return self._trigger_failure("BD", f"Inverter Overcurrent ({power:.1f} kW)", 45)

        # 3. Pressure Safety (BD/MS)
        p = telemetry.get('pressure', 0)
        # Note: Pressure is 0 during IDLE/LOADING, so only check if state is QUENCH
        if telemetry['state'] == 'QUENCH':
            if p > self.SAFETY_LIMITS['pressure_max']:
                 return self._trigger_failure("BD", f"Hose Burst (Pressure {p:.1f})", 45)
            # Only trigger Pressure Drop if we are deep into Quench (timer > 2) to avoid noise at start
            if p < self.SAFETY_LIMITS['pressure_min'] and telemetry.get('timer', 0) > 2:
                 return self._trigger_failure("MS", f"Severe Pressure Drop ({p:.1f})", 15) 
            
            # 4. Flow Safety (MS) [NEW]
            f = telemetry.get('flow', 0)
            if f < self.SAFETY_LIMITS['flow_min'] and telemetry.get('timer', 0) > 2:
                 return self._trigger_failure("MS", f"Pump Failure (Flow {f:.1f})", 30)

            # 5. Temperature Safety (BD) [NEW]
            qt = telemetry.get('quench_water_temp', 25.0)
            if qt > self.SAFETY_LIMITS['temp_max']:
                 return self._trigger_failure("BD", f"Scalding Risk (Temp {qt:.1f})", 45)

        # 6. Motion Safety (MS) [NEW]
        # Check speed only during active motion (HEATING or QUENCH)
        # 6. Motion Safety (MS) [NEW]
        # Check speed only during active motion (HEATING or QUENCH)
        if telemetry['state'] == 'HEATING':
             # Enable Servo Check in Heating
             s = telemetry.get('coil_scan_speed', 0)
             if s < self.SAFETY_LIMITS['speed_min'] and telemetry.get('timer', 0) > 2:
                  return self._trigger_failure("MS", f"Servo Overload (Speed {s:.1f})", 20)
        elif telemetry['state'] == 'QUENCH':
             s = telemetry.get('coil_scan_speed', 0) # Quench also has scan speed
             if s < self.SAFETY_LIMITS['speed_min'] and telemetry.get('timer', 0) > 2:
                  return self._trigger_failure("MS", f"Servo Overload (Speed {s:.1f})", 20) 

        # --- B. Quality Checks (Priority 3 - Drift & Count) ---
        # Only check these during active processing
        is_ng = False
        ng_reasons = []

        if telemetry['state'] in ['HEATING', 'QUENCH', 'UNLOADING', 'COMPLETED']:
            # 0. Part Temperature Check [NEW]
            # Must assume we have 'peak_part_temp' in telemetry
            pt = telemetry.get('peak_part_temp', 0.0)
            # Only check if temp is significant OR if the process is finishing (to catch cold parts)
            if pt > 100 or telemetry['state'] in ['UNLOADING', 'COMPLETED']: 
                if pt < self.THRESHOLDS['part_temp']['min']:
                    is_ng = True; ng_reasons.append(f"NG: UNDERHEATED Part ({pt:.1f}°C) -> SOFTNESS")
                elif pt > self.THRESHOLDS['part_temp']['max']:
                    is_ng = True; ng_reasons.append(f"NG: OVERHEATED Part ({pt:.1f}°C) -> BRITTLENESS")

            # Quench Water Temp Check (Softness/Cracking)
            # User Rule: Temp between 25-32 is OK. <25 Crack, >32 Soft.
            # We must check 'quench_water_temp', NOT 'temp' (Part Temp).
            # 1. Quench Water Temp Check
            # Rule: Cold Water (<25) -> Thermal Shock -> CRACKING
            # Rule: Hot Water (>32) -> Slow Cooling -> SOFTNESS. 
            qt = telemetry.get('quench_water_temp', 25.0) 
            if qt < self.THRESHOLDS['temp']['min']:
                is_ng = True; ng_reasons.append(f"CRACKING (Water Too Cold: {qt:.1f}°C)")
            elif qt > self.THRESHOLDS['temp']['max']:
                is_ng = True; ng_reasons.append(f"SOFTNESS (Water Too Hot: {qt:.1f}°C)")
            
            # 2. Flow Check
            # Rule: Low Flow -> Insufficient Heat Removal -> SOFTNESS
            # Rule: High Flow -> Too Aggressive -> CRACKING (or Distortion)
            f = telemetry.get('flow', 0)
            if f > 10.0: 
                if f < self.THRESHOLDS['flow']['min']:
                     is_ng = True; ng_reasons.append(f"SOFTNESS (Low Flow: {f:.1f} lpm)")
                elif f > self.THRESHOLDS['flow']['max']:
                     is_ng = True; ng_reasons.append(f"CRACKING (High Flow: {f:.1f} lpm)")

            # 3. Pressure Check
            # Rule: Low Pressure -> Vapor Blanket persists -> SOFTNESS (Spotty)
            # Rule: High Pressure -> Too Aggressive -> CRACKING
            p = telemetry.get('pressure', 0)
            if p > 0.1: 
                if p < self.THRESHOLDS['pressure']['min']:
                     is_ng = True; ng_reasons.append(f"SOFTNESS (Low Pressure: {p:.1f} bar)")
                elif p > self.THRESHOLDS['pressure']['max']:
                     is_ng = True; ng_reasons.append(f"CRACKING (High Pressure: {p:.1f} bar)")

        # --- C. Decision Logic ---
        if is_ng:
            reason_str = ", ".join(ng_reasons)
            
            if commit:
                self.consecutive_ng_counter += 1
                # FR-08: Hard Stop after 5 NG parts (DISABLED FOR DEV VARIABILITY TESTING)
                # if self.consecutive_ng_counter >= 5:
                #    return self._trigger_failure("QL", f"Quality Stop (5 Consecutive NG): {reason_str}", 15)
            
            return {"status": "NG", "reason": reason_str}
        else:
            # Reset counter if a good part is produced
            if commit: 
                self.consecutive_ng_counter = 0
            
            return {"status": "OK", "reason": None}

    def _trigger_failure(self, code, reason, repair_time):
        """
        Helper to format breakdown response.
        Code: BD (Breakdown), MS (Machine Stop), QL (Quality Limit)
        """
        self.active_fault = reason
        return {
            "status": "DOWN",
            "code": code,
            "reason": reason,
            "repair_time": repair_time
        }

    def reset(self):
        self.consecutive_ng_counter = 0
        self.active_fault = None
