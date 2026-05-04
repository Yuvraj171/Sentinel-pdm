"""Sensor physics. State-dependent baselines plus Gaussian noise,
plus three mechanical failure-mode signatures.

Module 1 shipped normal-operation only. Module 2 fills in the three
failure modes per CLAUDE.md:

  - coolant_pump:  quench_water_flow drops + water_temp rises +
                   part_temp elevated/noisier (mostly QUENCH-phase)
  - quench_system: quench_pressure drops sharply + flow drops +
                   part_temp rises post-quench (QUENCH-phase only)
  - power_supply:  induction_power noisier + drifts down +
                   coil_scan_speed fluctuates + part_temp drops slightly
                   (mostly HEATING-phase)

Each signature is state-aware: only mutates sensors that are active
during the relevant cycle phase. Applying a flow drop during HEATING
(when flow is 0 anyway) would be a meaningless signal.

Severity is 0.0 (onset start, no effect) -> 1.0 (failure point, full effect).
"""

import random
from dataclasses import dataclass, replace

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
            induction_power=0.0 + _noise(0.2),
            coil_voltage=0.0 + _noise(1.0),
            quench_water_temp=_AMBIENT_C + _noise(0.3),
            quench_water_flow=0.0 + _noise(0.1),
            quench_pressure=0.0 + _noise(0.05),
            coil_scan_speed=0.0 + _noise(0.05),
            part_temp=_AMBIENT_C + _noise(0.3),
            vibration=0.1 + _noise(0.05),
        )

    raise ValueError(f"unknown state: {state}")


def apply_failure_signature(
    reading: SensorReading,
    failure_mode: str,
    severity: float,
    state: str,
) -> SensorReading:
    """Apply a failure-mode signature on top of a baseline reading.

    Returns a new SensorReading; the original is not mutated.
    `severity` is clamped to [0, 1]. severity=0 is a no-op.
    """
    if failure_mode == "normal" or severity <= 0.0:
        return reading
    s = max(0.0, min(1.0, severity))

    if failure_mode == "coolant_pump":
        return _apply_coolant_pump(reading, s, state)
    if failure_mode == "quench_system":
        return _apply_quench_system(reading, s, state)
    if failure_mode == "power_supply":
        return _apply_power_supply(reading, s, state)
    raise ValueError(f"unknown failure_mode: {failure_mode}")


def _apply_coolant_pump(r: SensorReading, s: float, state: str) -> SensorReading:
    # Coolant tank temperature rises in every state — pump degradation
    # warms the reservoir continuously even when not pumping.
    new_water_temp = r.quench_water_temp + 15.0 * s + _noise(0.5 * s)

    if state == QUENCH:
        # Flow drops by up to 70% with rising noise (cavitation-like behaviour).
        flow_factor = 1.0 - 0.7 * s
        new_flow = r.quench_water_flow * flow_factor + _noise(3.0 * s)
        # Part temperature is elevated and noisier (less effective cooling).
        new_part_temp = r.part_temp + 30.0 * s + _noise(20.0 * s)
        return replace(
            r,
            quench_water_temp=new_water_temp,
            quench_water_flow=new_flow,
            part_temp=new_part_temp,
        )

    return replace(r, quench_water_temp=new_water_temp)


def _apply_quench_system(r: SensorReading, s: float, state: str) -> SensorReading:
    # Quench system failure only manifests during the QUENCH phase —
    # pressure and flow are 0 elsewhere anyway.
    if state != QUENCH:
        return r
    pressure_factor = 1.0 - 0.85 * s
    flow_factor = 1.0 - 0.6 * s
    new_pressure = r.quench_pressure * pressure_factor + _noise(0.15 * s)
    new_flow = r.quench_water_flow * flow_factor + _noise(2.0 * s)
    # Part isn't quenched properly — temperature rises substantially.
    new_part_temp = r.part_temp + 150.0 * s + _noise(25.0 * s)
    return replace(
        r,
        quench_pressure=new_pressure,
        quench_water_flow=new_flow,
        part_temp=new_part_temp,
    )


def _apply_power_supply(r: SensorReading, s: float, state: str) -> SensorReading:
    # Power supply drift only manifests when the supply is loaded —
    # HEATING (full draw) and QUENCH (scan motor still active).
    if state == HEATING:
        # Induction power drifts down with rising noise.
        power_factor = 1.0 - 0.25 * s
        new_power = r.induction_power * power_factor + _noise(12.0 * s)
        # Scan speed fluctuates (power instability affects servo).
        new_scan = r.coil_scan_speed + _noise(1.5 * s)
        # Less heating energy reaches the part — peak temp drops ~15%.
        delta_above_ambient = r.part_temp - _AMBIENT_C
        new_part_temp = _AMBIENT_C + delta_above_ambient * (1.0 - 0.15 * s)
        return replace(
            r,
            induction_power=new_power,
            coil_scan_speed=new_scan,
            part_temp=new_part_temp,
        )
    if state == QUENCH:
        # Scan motor still affected even though power is off.
        new_scan = r.coil_scan_speed + _noise(1.5 * s)
        return replace(r, coil_scan_speed=new_scan)
    return r
