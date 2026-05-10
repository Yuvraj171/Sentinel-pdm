// Sensor reference data. Two surfaces:
//
// 1. SENSOR_BASELINES — single overall range per sensor for the bottom-of-card
//    footnote in SparklineStrip ("50–150 kW"). Comes from CLAUDE.md spec.
//
// 2. SENSOR_PHASE_RANGES — per-phase OK windows used to compute the status
//    dot. Without phase awareness, the dot falsely flags CRITICAL whenever
//    the cycle is not in the phase that matches the sensor's baseline (e.g.
//    quench_water_flow is 0 during HEATING by design — that's normal, not
//    a failure). The ranges below mirror the physics module's per-state
//    nominals (machine-simulator/backend/simulation/physics.py) with a
//    generous tolerance so normal noise doesn't trip a warning.
//
//    Status decision (in SparklineStrip.statusFromDeviation):
//      value within [ok_min, ok_max]                 -> OK
//      value within ±20% of band beyond              -> WARNING
//      else                                          -> CRITICAL

export const SENSOR_BASELINES = {
  induction_power:   { min: 50,  max: 150,  unit: 'kW',    nominal: 110 },
  coil_voltage:      { min: 200, max: 480,  unit: 'V',     nominal: 380 },
  quench_water_temp: { min: 15,  max: 35,   unit: '°C',    nominal: 22 },
  quench_water_flow: { min: 20,  max: 60,   unit: 'L/min', nominal: 42 },
  quench_pressure:   { min: 3,   max: 8,    unit: 'bar',   nominal: 5.4 },
  coil_scan_speed:   { min: 1,   max: 10,   unit: 'mm/s',  nominal: 6.2 },
  part_temp:         { min: 800, max: 1000, unit: '°C',    nominal: 920 },
  vibration:         { min: 0,   max: 5,    unit: 'mm/s',  nominal: 1.4 },
};

export const SENSOR_KEYS = Object.keys(SENSOR_BASELINES);

// Per-phase OK windows. Each entry is [ok_min, ok_max] for that phase.
// part_temp uses wide ranges during HEATING/QUENCH because it's a ramp
// (25 → 900 → 100), so any single value within the ramp is "expected".
export const SENSOR_PHASE_RANGES = {
  induction_power: {
    IDLE:    [-3, 3],
    HEATING: [80, 140],
    QUENCH:  [-3, 3],
    DOWN:    [-2, 2],
  },
  coil_voltage: {
    IDLE:    [-15, 15],
    HEATING: [340, 420],
    QUENCH:  [-15, 15],
    DOWN:    [-10, 10],
  },
  quench_water_temp: {
    IDLE:    [22, 28],
    HEATING: [22, 28],
    QUENCH:  [25, 32],
    DOWN:    [22, 28],
  },
  quench_water_flow: {
    IDLE:    [-2, 2],
    HEATING: [-2, 2],
    QUENCH:  [35, 50],
    DOWN:    [-1, 1],
  },
  quench_pressure: {
    IDLE:    [-1, 1],
    HEATING: [-1, 1],
    QUENCH:  [4.5, 6.5],
    DOWN:    [-0.5, 0.5],
  },
  coil_scan_speed: {
    IDLE:    [-1, 1],
    HEATING: [8, 12],
    QUENCH:  [8, 12],
    DOWN:    [-0.5, 0.5],
  },
  part_temp: {
    IDLE:    [20, 35],
    HEATING: [20, 1000],   // ramp 25 -> ~900
    QUENCH:  [80, 1000],   // ramp ~900 -> 100
    DOWN:    [20, 35],
  },
  vibration: {
    IDLE:    [0.0, 1.0],
    HEATING: [1.0, 3.5],
    QUENCH:  [1.5, 4.5],
    DOWN:    [0.0, 0.6],
  },
};
