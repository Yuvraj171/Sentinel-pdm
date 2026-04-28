from datetime import datetime, timedelta

class TimeManager:
    """
    Manages the Simulation Clock (FR-03: Shift Logic).
    - Shift A: 08:00 AM - 08:00 PM (Operator A)
    - Shift B: 08:00 PM - 08:00 AM (Operator B)
    - Handles 'Warm-up' delays at shift start.
    """
    def __init__(self, start_hour=None):
        # Use Real System Time (IST) if no hour specified
        if start_hour is not None:
             self.sim_start_time = datetime.now().replace(hour=start_hour, minute=0, second=0, microsecond=0)
        else:
             self.sim_start_time = datetime.now()
             
        self.current_time = self.sim_start_time
        self.day_count = 1
    
    def tick(self, seconds=1):
        """
        Advances simulation clock by `seconds`.
        """
        self.current_time += timedelta(seconds=seconds)
        
    def get_clock(self):
        """
        Returns string formatted clock.
        """
        return self.current_time.strftime("Day " + str(self.day_count) + ", %H:%M:%S")

    def get_shift_info(self):
        """
        Returns {shift_id, operator_id} based on FR-03 rules.
        """
        hour = self.current_time.hour
        
        # Shift A: 08:00 (8) to 20:00 (20)
        if 8 <= hour < 20:
             return {"shift_id": "Shift A", "operator_id": "OP_A"}
        else:
             return {"shift_id": "Shift B", "operator_id": "OP_B"}

    def reset(self):
        """
        FR-07: Master Reset
        Returns clock to Current System Time.
        """
        self.sim_start_time = datetime.now()
        self.current_time = self.sim_start_time
        self.day_count = 1
