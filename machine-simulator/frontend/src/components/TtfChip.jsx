// Predicted time-to-failure chip. Reads time_to_failure_s from the latest
// scored telemetry row — only shows a value when a failure is actively
// ramping. Otherwise displays "—" / "no failure forecast".

import { useRecentPredictions } from '../lib/api.js';

function fmtSeconds(s) {
  if (s == null || Number.isNaN(s)) return '—';
  if (s < 60) return `${Math.round(s)}s`;
  const m = Math.floor(s / 60);
  const rs = Math.round(s % 60);
  return rs ? `${m}m ${rs}s` : `${m}m`;
}

// machineStateProp: optional override from the parent. Use this when the
// parent already has a fresher machine state (e.g. from useProduction) so
// the TRIPPED display activates immediately rather than waiting for the next
// useRecentPredictions refetch to catch up.
export default function TtfChip({ size = 'medium', machineState: machineStateProp }) {
  const q = useRecentPredictions(1);
  const latest = q.data?.[q.data.length - 1];
  const ttf = latest?.time_to_failure_s;
  const aiRisk = latest?.ai_risk_score ?? 0;
  const machineState = machineStateProp ?? latest?.state;
  const halted = machineState === 'DOWN';
  // Gate on AI risk ≥ 0.3 (WARNING threshold): showing a simulator-ground-truth
  // countdown while the gauge reads OK (risk 0.05) directly contradicts the AI.
  // The chip only makes sense once the model has also detected the failure onset.
  const active = !halted && ttf != null && ttf > 0 && aiRisk >= 0.3;

  if (size === 'large') {
    // Three mutually exclusive states for the big tile:
    //   - halted: machine has already tripped, the future-tense forecast
    //     is meaningless. Don't say "line healthy".
    //   - active: a failure ramp is underway, count down to the trip.
    //   - healthy: no failure forecast, line is operating normally.
    let num = '—';
    let foot = 'No failure forecast — line healthy';
    let cls = '';
    if (halted) {
      num = 'TRIPPED';
      foot = 'Machine already failed — Repair to resume';
      cls = 'ttf-tile-halted';
    } else if (active) {
      num = fmtSeconds(ttf);
      foot = 'AI predicts time until trip';
      cls = 'ttf-tile-active';
    }
    return (
      <div className="ttf-tile">
        <div className={`ttf-tile-num ${cls}`}>{num}</div>
        <div className="ttf-tile-foot">{foot}</div>
      </div>
    );
  }

  if (!active) return null;
  return (
    <div className="ttf-chip">
      <span className="ttf-chip-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7 V12 L15 14" />
        </svg>
      </span>
      <span className="ttf-chip-k">predicted trip in</span>
      <span className="ttf-chip-v mono">{fmtSeconds(ttf)}</span>
    </div>
  );
}
