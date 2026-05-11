// LiveTickerBar — full-width strip just below the hero. Houses:
//   - five live sensor cards with mini sparklines
//   - the "Show me a failure" demo trigger
//
// Reads everything from useDemoMode so jitter, demo, and reset all flow
// through the same source of truth that drives the 3D scene.

import { useDemoMode, startDemo, resetDemo, BASELINES } from '../lib/demoMode.js';
import MiniSparkline from './MiniSparkline.jsx';

// Per-sensor scale ranges so sparklines stay readable when values are stable.
// Slightly wider than the demo's worst-case so we don't peg the y-axis.
const RANGES = {
  power:     { min: 85,  max: 105 },
  part_temp: { min: 880, max: 1080 },
  flow:      { min: 18,  max: 50 },
  pressure:  { min: 5.0, max: 8.5 },
  vibration: { min: 0.4, max: 3.2 },
};

const SENSORS = [
  { id: 'power',     label: 'POWER',        unit: 'kW',    decimals: 0 },
  { id: 'part_temp', label: 'PART TEMP',    unit: '°C',    decimals: 0 },
  { id: 'flow',      label: 'COOLANT FLOW', unit: 'L/min', decimals: 0 },
  { id: 'pressure',  label: 'PRESSURE',     unit: 'bar',   decimals: 1 },
  { id: 'vibration', label: 'VIBRATION',    unit: 'mm/s',  decimals: 1 },
];

function colorFor(aiStatus) {
  if (aiStatus === 'CRITICAL') return '#ef4444';
  if (aiStatus === 'WARNING')  return '#f59e0b';
  return '#06b6d4';
}

export default function LiveTickerBar() {
  const demo = useDemoMode();
  const lineColor = colorFor(demo.aiStatus);
  const isDemo = demo.mode === 'demo' || demo.mode === 'resetting';

  return (
    <section className="ticker">
      <div className="ticker-inner">
        <div className="ticker-rail" aria-live="polite">
          {SENSORS.map((s) => {
            const v = demo.sensors[s.id] ?? BASELINES[s.id];
            const range = RANGES[s.id];
            return (
              <div key={s.id} className="ticker-card" role="group" aria-label={s.label}>
                <div className="ticker-card-l">
                  <div className="ticker-card-eyebrow">{s.label}</div>
                  <div className="ticker-card-value">
                    {v.toFixed(s.decimals)}
                    <span className="ticker-card-unit">{s.unit}</span>
                  </div>
                </div>
                <MiniSparkline
                  value={v}
                  min={range.min}
                  max={range.max}
                  color={lineColor}
                />
              </div>
            );
          })}
        </div>

        <div className="ticker-cta">
          {!isDemo && (
            <button
              type="button"
              className="ticker-cta-btn ticker-cta-demo"
              onClick={startDemo}
              aria-label="Run a staged failure demonstration"
            >
              <span className="ticker-cta-dot" />
              Show me a failure
            </button>
          )}
          {isDemo && (
            <button
              type="button"
              className="ticker-cta-btn ticker-cta-reset"
              onClick={resetDemo}
              disabled={demo.mode === 'resetting'}
            >
              {demo.mode === 'resetting' ? 'Recovering…' : 'Reset'}
            </button>
          )}
        </div>
      </div>

      {demo.caption && (
        <div className="ticker-caption" role="status">
          <span className={`ticker-caption-dot ticker-caption-dot-${demo.aiStatus.toLowerCase()}`} />
          {demo.caption}
        </div>
      )}
    </section>
  );
}
