import random

class ThermalModel:
    """
    Simulates the thermal dynamics of the part using a simplified discrete 
    implementation of Newton's Law of Cooling / Heating.
    """
    def __init__(self, ambient_temp: float = 25.0):
        self.temp = ambient_temp
        self.ambient_temp = ambient_temp
        self.noise_enabled = True

        # Physics Constants (Tuned for Observable 5Hz Loop)
        # Goal: Reach 850C in ~3-4 seconds (15-20 ticks)
        # 850C / 50kW / 15 ticks ~= 1.2
        self.C_HEAT = 1.3    # Tuned for gradual rise to 850C
        self.C_COOL = 5.0    # Was 15.0
        self.C_LOSS = 0.05    # Reduced to allow reaching 850C easier
        
    def update(self, power_kw: float, water_flow_lpm: float, **kwargs) -> float:
        """
        Calculates the new temperature for the next second (1Hz step).
        Formula: T_new = T_prev + (Heat_In) - (Cooling_Out) - (Ambient_Loss) + Noise
        """
        
        # 1. Heat Input Energy
        heat_gain = self.C_HEAT * power_kw
        
        # 2. Cooling (Quenching) Energy
        # Only effective if flow is active.
        # Scale cooling based on temperature difference (Newton's Law of Cooling)
        # Factor = (PartTemp - WaterTemp) / (Typical_Hot_Temp - Typical_Water_Temp)
        # This ensures that if WaterTemp approaches PartTemp, cooling efficiency drops to 0.
        water_temp = kwargs.get('water_temp', 25.0)
        delta_t_factor = max(0.0, (self.temp - water_temp) / (850.0 - 25.0))
        
        heat_loss_quench = self.C_COOL * water_flow_lpm * delta_t_factor
        
        # 3. Ambient Loss (Natural convection)
        # Proportional to difference between current temp and room temp.
        # The hotter it is, the faster it loses heat naturally.
        natural_cooling = self.C_LOSS * (self.temp - self.ambient_temp)
        
        # 4. Integrate
        delta_temp = heat_gain - heat_loss_quench - natural_cooling
        
        # DEBUG PHYSICS KERNEL
        print(f"🧮 PHYSICS: Pwr={power_kw} -> Gain={heat_gain} | Loss={natural_cooling} | Delta={delta_temp}", flush=True)

        self.temp += delta_temp
        
        # 5. Add Noise (Sensor flicker)
        if self.noise_enabled:
             # Random flicker between -0.5 and +0.5 C
            noise = random.uniform(-0.5, 0.5)
            self.temp += noise

        # Physics Constraint: Check for absolute zero limit or unrealistic drops
        if self.temp < self.ambient_temp:
             # Just for this sim, we assume water doesn't freeze the part below room temp arbitrarily
             # (Unless using chiller, but we assume ambient water for now)
             self.temp = max(self.temp, self.ambient_temp)

        return self.temp
