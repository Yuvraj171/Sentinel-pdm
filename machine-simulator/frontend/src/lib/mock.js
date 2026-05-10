// Mock data for things not exposed by the API today: per-alert "why" feature
// contributions, fictional batches/recipes, plain-English issue text. The
// real data sources (sensor readings, drift, parts counters) come from the
// AI engine; these helpers fill in the narrative layer the dashboard wants.

export function buildOperatorIssues(state) {
  if (state === 'OK') {
    return [
      { time: '11:42', text: 'Brief temperature dip resolved itself' },
      { time: '09:15', text: 'Routine sensor calibration completed' },
      { time: '06:00', text: 'Shift handover — line restarted' },
    ];
  }
  if (state === 'WARNING') {
    return [
      { time: '14:31', text: 'Coolant flow trending below normal — keep an eye on it' },
      { time: '13:12', text: 'Quench pressure was soft for a few minutes' },
      { time: '10:48', text: 'Parts came out hotter than usual on a small batch' },
      { time: '08:20', text: 'Vibration baseline shifted slightly overnight' },
    ];
  }
  return [
    { time: 'now',   text: 'Coolant flow is well below safe range' },
    { time: '14:33', text: 'Quench pressure has dropped' },
    { time: '14:26', text: 'Parts are exiting the line too hot' },
    { time: '14:18', text: 'Vibration crossed the warning threshold' },
  ];
}

export function buildAlerts(state, anchorMs = Date.now()) {
  const mk = (offsetMin, severity, risk, suspect, plain) => ({
    ts_ms: anchorMs - offsetMin * 60_000,
    severity, risk, suspect, plain,
  });
  if (state === 'OK') {
    return [
      mk(64,  'WARNING', 0.34, 'vibration',         'Brief vibration spike, recovered on its own'),
      mk(186, 'WARNING', 0.31, 'quench_water_temp', 'Coolant ran slightly warm during shift change'),
      mk(412, 'WARNING', 0.36, 'coil_voltage',      'Voltage dipped briefly during line restart'),
    ];
  }
  if (state === 'WARNING') {
    return [
      mk(2,   'WARNING', 0.46, 'quench_water_flow', 'Coolant flow trending below normal'),
      mk(31,  'WARNING', 0.41, 'quench_pressure',   'Quench pressure soft for 4 minutes'),
      mk(98,  'WARNING', 0.38, 'part_temp',         'Part exit temperature creeping up'),
      mk(243, 'WARNING', 0.33, 'vibration',         'Vibration baseline shifted'),
      mk(620, 'WARNING', 0.31, 'induction_power',   'Power draw fluctuating'),
    ];
  }
  return [
    mk(0,  'CRITICAL', 0.82, 'quench_water_flow', 'Coolant flow well below safe range'),
    mk(3,  'CRITICAL', 0.78, 'quench_pressure',   'Quench pressure dropped'),
    mk(7,  'WARNING',  0.61, 'part_temp',         'Parts exiting too hot'),
    mk(12, 'WARNING',  0.54, 'vibration',         'Vibration crossed warning threshold'),
    mk(34, 'WARNING',  0.42, 'quench_water_flow', 'Coolant flow first dipped'),
  ];
}

export function buildAlertWhy(suspect) {
  const features = {
    quench_water_flow: [
      { name: 'flow_5min_avg',         contrib: 0.42, dir: 'down', sample: [42,41,40,38,36,32,28,24,22,18,16,15] },
      { name: 'flow_delta_1min',       contrib: 0.28, dir: 'down', sample: [-0.2,-0.4,-0.8,-1.4,-2.1,-2.8,-3.2,-3.6,-3.9,-4.1,-4.0,-3.8] },
      { name: 'pressure_correlation',  contrib: 0.18, dir: 'down', sample: [0.92,0.88,0.85,0.82,0.78,0.72,0.66,0.61,0.55,0.52,0.50,0.48] },
    ],
    quench_pressure: [
      { name: 'pressure_5min_avg',     contrib: 0.46, dir: 'down', sample: [5.4,5.3,5.2,5.0,4.8,4.6,4.4,4.2,4.0,3.9,3.8,3.7] },
      { name: 'pressure_min',          contrib: 0.30, dir: 'down', sample: [5.2,5.1,4.9,4.8,4.5,4.3,4.0,3.8,3.6,3.4,3.3,3.2] },
      { name: 'flow_pressure_ratio',   contrib: 0.16, dir: 'up',   sample: [7.8,8.0,8.2,8.5,8.8,9.0,9.3,9.5,9.6,9.7,9.8,9.9] },
    ],
    part_temp: [
      { name: 'temp_5min_avg',         contrib: 0.40, dir: 'up',   sample: [918,920,922,925,930,936,944,950,955,960,965,968] },
      { name: 'temp_max',              contrib: 0.28, dir: 'up',   sample: [925,927,930,934,940,948,956,964,970,976,980,983] },
      { name: 'temp_target_diff',      contrib: 0.20, dir: 'up',   sample: [0,2,4,7,12,18,26,34,40,46,50,53] },
    ],
    vibration: [
      { name: 'vib_5min_avg',          contrib: 0.38, dir: 'up',   sample: [1.2,1.3,1.3,1.4,1.5,1.7,1.9,2.1,2.3,2.5,2.6,2.7] },
      { name: 'vib_peaks',             contrib: 0.30, dir: 'up',   sample: [1,2,2,3,4,6,8,11,14,17,19,21] },
      { name: 'vib_baseline_drift',    contrib: 0.18, dir: 'up',   sample: [0.0,0.0,0.1,0.1,0.2,0.3,0.4,0.5,0.6,0.7,0.8,0.9] },
    ],
    coil_voltage: [
      { name: 'voltage_dip_count',     contrib: 0.40, dir: 'up',   sample: [0,0,1,1,2,2,3,3,4,4,5,5] },
      { name: 'voltage_5min_avg',      contrib: 0.26, dir: 'down', sample: [380,378,376,374,371,368,365,362,360,358,357,356] },
      { name: 'voltage_stddev',        contrib: 0.20, dir: 'up',   sample: [2,3,3,4,5,7,9,11,13,15,16,17] },
    ],
    quench_water_temp: [
      { name: 'coolant_temp_avg',      contrib: 0.36, dir: 'up',   sample: [22,22,23,24,25,26,27,28,29,30,30,31] },
    ],
    induction_power: [
      { name: 'power_fluct',           contrib: 0.34, dir: 'up',   sample: [2,3,3,4,5,6,7,8,9,10,10,11] },
    ],
  };
  return features[suspect] ?? features.vibration;
}

export function buildBatches(state) {
  return Array.from({ length: 12 }).map((_, i) => {
    const yieldPct = 96 + Math.sin(i * 1.7) * 2.5 + (i === 11 && state !== 'OK' ? -8 : 0);
    return {
      id: 'B-' + (1240 + i),
      yield: Math.max(60, Math.min(100, yieldPct)),
      count: 110 + Math.round(Math.sin(i * 0.9) * 18),
    };
  });
}

export const CURRENT_RECIPE = {
  id: 'HR-440',
  spec: '920 °C · 4.0s dwell · oil quench',
  prevId: 'HR-380',
  switchedMinAgo: 12,
};

export const CURRENT_BATCH_DEFAULTS = {
  id: 'B-1252',
  recipe: 'HR-440',
  target: 450,
  started: '14:00',
  etaHM: '19:40',
};

export function buildUpcomingSchedule() {
  return [
    { batchId: 'B-0033', recipe: 'HR-440', startsHM: '20:15', target: 60, spec: '920 °C · 4.0s dwell' },
    { batchId: 'B-0034', recipe: 'HR-380', startsHM: '21:30', target: 60, spec: '880 °C · 3.5s dwell' },
    { batchId: 'B-0035', recipe: 'HR-380', startsHM: '22:45', target: 60, spec: '880 °C · 3.5s dwell' },
    { batchId: 'B-0036', recipe: 'HR-275', startsHM: '00:00', target: 80, spec: '760 °C · 2.8s dwell · gentle' },
  ];
}
