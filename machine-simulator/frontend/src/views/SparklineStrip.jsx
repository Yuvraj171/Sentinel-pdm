// Sparkline strip — one mini chart per sensor, with current value, unit,
// nominal-range footnote, and a status dot.
//
// Status is computed PHASE-AWARE: each sensor has different "expected" values
// during IDLE/HEATING/QUENCH/DOWN (e.g. quench_water_flow is 0 during HEATING
// by design). We compare the latest value to the phase-specific OK window;
// using a single overall nominal would falsely flag normal IDLE/HEATING
// readings as CRITICAL.

import StatusDot from '../components/StatusDot.jsx';
import Sparkline from '../components/Sparkline.jsx';
import { SENSOR_BASELINES, SENSOR_KEYS, SENSOR_PHASE_RANGES } from '../lib/sensors.js';
import { statusTokens } from '../lib/status.js';

function statusFromValue(value, phase, key) {
  if (value == null || Number.isNaN(value)) return 'OK';
  const range = SENSOR_PHASE_RANGES[key]?.[phase];
  if (!range) return 'OK';
  const [lo, hi] = range;
  if (value >= lo && value <= hi) return 'OK';
  // 20% of the band beyond the OK window is WARNING; further is CRITICAL.
  const band = hi - lo;
  const tolerance = Math.max(0.5, band * 0.20);
  if (value >= lo - tolerance && value <= hi + tolerance) return 'WARNING';
  return 'CRITICAL';
}

export default function SparklineStrip({ data = [] }) {
  // The data array is oldest-first (see api.py reversal). The latest sample's
  // `state` tells us which cycle phase to score the current values against.
  const lastRow = data.length ? data[data.length - 1] : null;
  const phase = lastRow?.state ?? 'IDLE';

  return (
    <div className="mx-spk-grid">
      {SENSOR_KEYS.map((key) => {
        const baseline = SENSOR_BASELINES[key];
        const values = data
          .map((row) => row[key])
          .filter((v) => v != null && !Number.isNaN(v));
        const last = values.length ? values[values.length - 1] : null;
        const status = statusFromValue(last, phase, key);
        const tokens = statusTokens(status);
        const decimals = key === 'part_temp' || key === 'coil_voltage' ? 0 : 1;

        return (
          <div key={key} className="mx-spk-cell">
            <div className="mx-spk-head">
              <div className="mx-spk-name mono">{key}</div>
              <StatusDot status={status} size={6} />
            </div>
            <div className="mx-spk-row">
              <div className="mx-spk-val">
                <span className="mx-spk-num mono">
                  {last == null ? '—' : last.toFixed(decimals)}
                </span>
                <span className="mx-spk-unit mono">{baseline.unit}</span>
              </div>
              {values.length > 1 && (
                <Sparkline
                  values={values.slice(-30)}
                  stroke={tokens.ring}
                  fill={tokens.ring}
                  threshold={baseline.nominal}
                  width={120} height={36}
                />
              )}
            </div>
            <div className="mx-spk-foot mono">
              {baseline.min}–{baseline.max} {baseline.unit}
            </div>
          </div>
        );
      })}
    </div>
  );
}
