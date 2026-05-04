"""Sensor physics. State-dependent baselines plus Gaussian noise.

Module 1 ships normal-operation only. Module 2 will add three failure modes
(coolant_pump, quench_system, power_supply) by mutating the per-tick reading
inside `apply_failure_signature`.

Sensor ranges follow CLAUDE.md. Values are per-row, not per-cycle.
"""

import random
from dataclasses import dataclass

from backend.simulation.cycle import DOWN, HEATING, IDLE, QUENCH


@dataclass
class SensorReading:
    induction_power: float
    coil_voltage: float
    quench_water_temp: float
    quench_water_flow: float
    quench_pressure: float
    coil_scan_speed: float
    part_temp: float
    vibration: float


_AMBIENT_C = 25.0
_PEAK_PART_TEMP = 900.0


def _noise(std: float) -> float:
    return random.gauss(0.0, std)


def generate_normal_reading(state: str, progress: float) -> SensorReading:
    """One sensor sample for a normal-operation tick, given cycle state.

    `progress` is 0.0..1.0 within the current state, used for ramping
    part_temp during HEATING and QUENCH.
    """
    if state == IDLE:
        return SensorReading(
            induction_power=0.0 + _noise(0.5),
            coil_voltage=0.0 + _noise(2.0),
            quench_water_temp=_AMBIENT_C + _noise(0.5),
            quench_water_flow=0.0 + _noise(0.3),
            quench_pressure=0.0 + _noise(0.1),
            coil_scan_speed=0.0 + _noise(0.1),
            part_temp=_AMBIENT_C + _noise(0.5),
            vibration=0.3 + _noise(0.1),
        )

    if state == HEATING:
        return SensorReading(
            induction_power=110.0 + _noise(3.0),
            coil_voltage=380.0 + _noise(8.0),
            quench_water_temp=_AMBIENT_C + _noise(0.5),
            quench_water_flow=0.0 + _noise(0.3),
            quench_pressure=0.0 + _noise(0.1),
            coil_scan_speed=10.0 + _noise(0.4),
            part_temp=_AMBIENT_C + (_PEAK_PART_TEMP - _AMBIENT_C) * progress + _noise(8.0),
            vibration=2.0 + _noise(0.4),
        )

    if state == QUENCH:
        return SensorReading(
            induction_power=0.0 + _noise(0.8),
            coil_voltage=0.0 + _noise(3.0),
            quench_water_temp=28.0 + _noise(0.6),
            quench_water_flow=42.0 + _noise(1.5),
            quench_pressure=5.5 + _noise(0.25),
            coil_scan_speed=10.0 + _noise(0.4),
            part_temp=_PEAK_PART_TEMP - (_PEAK_PART_TEMP - 100.0) * progress + _noise(10.0),
            vibration=2.8 + _noise(0.5),
        )

    if state == DOWN:
        return SensorReading(
            induction_power=0.0,
            coil_voltage=0.0,
            quench_water_temp=_AMBIENT_C,
            quench_water_flow=0.0,
            quench_pressure=0.0,
            coil_scan_speed=0.0,
            part_temp=_AMBIENT_C,
            vibration=0.0,
        )

    raise ValueError(f"unknown state: {state}")


def apply_failure_signature(
    reading: SensorReading,
    failure_mode: str,
    severity: float,
) -> SensorReading:
    """Module 2 will implement. For Module 1 this is a passthrough."""
    if failure_mode == "normal":
        return reading
    raise NotImplementedError(f"failure_mode={failure_mode} not implemented (Module 2)")
