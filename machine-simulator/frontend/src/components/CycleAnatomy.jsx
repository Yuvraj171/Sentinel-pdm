// Cycle anatomy widget — visualizes one part's full lifecycle
// (IDLE → HEATING → QUENCH) as a stepper, with a single progress bar
// underneath showing position in the 18-second cycle. Polls the simulator's
// /simulation/status for sub-second freshness.

import { useEffect } from 'react';
import { useSimStatus, useRepair, explainRepairError } from '../lib/api.js';

// Must match the constants in machine-simulator/backend/simulation/cycle.py.
const PHASES = [
  { id: 'IDLE',    name: 'IDLE',    duration: 4, desc: 'Loading next part' },
  { id: 'HEATING', name: 'HEATING', duration: 8, desc: 'Inducing heat' },
  { id: 'QUENCH',  name: 'QUENCH',  duration: 6, desc: 'Cooling' },
];
const TOTAL_S = PHASES.reduce((s, p) => s + p.duration, 0);  // 18

const PHASE_COLOR = {
  IDLE:    '#64748b',
  HEATING: '#f97316',
  QUENCH:  '#06b6d4',
  DOWN:    '#ef4444',
};

function statusOf(phaseId, currentPhase) {
  if (currentPhase === 'DOWN') return 'pending'; // unreachable: component returns early for DOWN
  const order = ['IDLE', 'HEATING', 'QUENCH'];
  const ci = order.indexOf(currentPhase);
  const pi = order.indexOf(phaseId);
  if (pi < ci) return 'complete';
  if (pi === ci) return 'current';
  return 'pending';
}

export default function CycleAnatomy() {
  const q = useSimStatus();
  const repair = useRepair();
  const s = q.data;

  // Auto-clear repair errors so a stale failure doesn't sit in the UI.
  useEffect(() => {
    if (!repair.error) return undefined;
    const id = setTimeout(() => repair.reset(), 6000);
    return () => clearTimeout(id);
  }, [repair.error, repair]);

  // The repair API call returns ~immediately, but the simulator takes a tick
  // (1s) to write the next IDLE row, and poll.py another to score it. Keep
  // the button in "Repairing…" state until cycle_state actually leaves DOWN
  // so the user gets continuous feedback instead of a flicker.
  const cycleState = s?.cycle_state;
  const repairInFlight = repair.isPending
    || (repair.isSuccess && cycleState === 'DOWN');

  if (!s) {
    return <div className="loading-card">Connecting to simulator…</div>;
  }

  const phase = s.cycle_state ?? 'IDLE';
  const elapsed = s.elapsed_in_state ?? 0;

  // Cumulative seconds elapsed in the WHOLE cycle (not just current phase).
  const completedDuration = PHASES
    .slice(0, ['IDLE', 'HEATING', 'QUENCH'].indexOf(phase))
    .reduce((sum, p) => sum + p.duration, 0);
  const totalElapsed = phase === 'DOWN' ? 0 : completedDuration + Math.min(elapsed, PHASES.find((p) => p.id === phase)?.duration ?? 0);
  const totalProgress = phase === 'DOWN' ? 0 : (totalElapsed / TOTAL_S) * 100;

  const isDown = phase === 'DOWN';
  const desc = isDown ? 'Machine halted' : (PHASES.find((p) => p.id === phase)?.desc ?? '');
  const phaseColor = PHASE_COLOR[phase] ?? '#64748b';

  const partSeq = s.part_seq_in_batch ?? 0;
  const batchSize = s.batch_size ?? 60;

  if (isDown) {
    return (
      <div className="cycle-anatomy cycle-anatomy-down">
        <div className="cycle-anatomy-row">
          <div className="cycle-anatomy-l">
            <div className="cycle-anatomy-eyebrow">CURRENT PART · CYCLE HALTED</div>
            <div className="cycle-anatomy-phase">
              <span className="cycle-anatomy-phase-dot" style={{ background: phaseColor, boxShadow: `0 0 12px ${phaseColor}80` }} />
              <span className="cycle-anatomy-phase-name">DOWN</span>
              <span className="cycle-anatomy-phase-desc">
                Machine tripped — Repair to resume (keeps coil life, batch and shift counters)
              </span>
            </div>
          </div>
          <div className="cycle-anatomy-r">
            <button
              type="button"
              className="cycle-repair-btn"
              onClick={() => repair.mutate()}
              disabled={repairInFlight}
              title="Clear the failure and resume the cycle without resetting counters"
            >
              <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M14.7 6.3a4 4 0 0 0-5.4 5.4l-6 6a1 1 0 0 0 1.4 1.4l6-6a4 4 0 0 0 5.4-5.4l-2.5 2.5-1.9-1.9 2.5-2.5z" />
              </svg>
              {repairInFlight ? 'Repairing…' : 'Repair'}
            </button>
          </div>
        </div>
        {repair.error && (
          <div className="cycle-repair-err" role="alert">
            {explainRepairError(repair.error)}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="cycle-anatomy">
      <div className="cycle-anatomy-row">
        <div className="cycle-anatomy-l">
          <div className="cycle-anatomy-eyebrow">
            CURRENT PART · BATCH {s.batch_id ?? '—'} · {partSeq} of {batchSize}
          </div>
          <div className="cycle-anatomy-context mono">{desc}</div>
        </div>
        <div className="cycle-anatomy-r">
          <span className="cycle-anatomy-ts mono">{totalElapsed}s / {TOTAL_S}s</span>
        </div>
      </div>

      {/* Stepper — one box per phase, weighted by phase duration */}
      <div className="cycle-stepper">
        {PHASES.map((p) => {
          const st = statusOf(p.id, phase);
          const color = PHASE_COLOR[p.id];
          return (
            <div
              key={p.id}
              className={`cycle-step cycle-step-${st}`}
              style={{ flex: p.duration, '--step-color': color }}
            >
              <div className="cycle-step-head">
                <span className={`cycle-step-marker cycle-step-marker-${st}`}>
                  {st === 'complete'
                    ? <svg viewBox="0 0 12 12" width="9" height="9"><path d="M2 6 L5 9 L10 3" stroke="currentColor" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
                    : st === 'current'
                      ? <span className="cycle-step-marker-pulse" />
                      : null}
                </span>
                <span className="cycle-step-name">{p.name}</span>
                <span className="cycle-step-dur mono">{p.duration}s</span>
              </div>
              {/* Per-step progress bar — only the CURRENT step shows fractional fill */}
              <div className="cycle-step-bar">
                <div
                  className="cycle-step-bar-fill"
                  style={{
                    width: st === 'complete' ? '100%' : st === 'current'
                      ? `${Math.min(100, (elapsed / p.duration) * 100)}%`
                      : '0%',
                    background: st === 'pending' ? 'transparent' : color,
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Total cycle progress bar — single 18-second axis */}
      <div className="cycle-anatomy-total">
        <div className="cycle-anatomy-total-bar">
          <div
            className="cycle-anatomy-total-fill"
            style={{ width: `${totalProgress}%`, background: phaseColor }}
          />
        </div>
        <div className="cycle-anatomy-total-meta">
          <span>part <span className="mono">{s.part_id ?? '—'}</span></span>
          <span className="cycle-anatomy-meta-sep">·</span>
          <span>{Math.round(totalProgress)}% through cycle</span>
        </div>
      </div>
    </div>
  );
}
