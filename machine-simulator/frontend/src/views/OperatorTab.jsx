// Operator tab — production-focused. Reads real production stats from
// /api/production (parts/hr, defect rate, OEE, ticker) and falls back to
// placeholders if the API hasn't responded yet. Mocks the things that don't
// have an API source: recipe context, batch yield bars, plain-English issues.

import { useEffect } from 'react';
import { useProduction, useRepair, useSimStatus, explainRepairError } from '../lib/api.js';
import { statusFromRiskAndState, statusTokens } from '../lib/status.js';
import { buildOperatorIssues, buildBatches, CURRENT_BATCH_DEFAULTS } from '../lib/mock.js';
import CountUp from '../components/CountUp.jsx';
import DeltaBadge from '../components/DeltaBadge.jsx';
import Sparkline from '../components/Sparkline.jsx';
import StatusDot from '../components/StatusDot.jsx';
import PartsTicker from '../components/PartsTicker.jsx';
import CycleAnatomy from '../components/CycleAnatomy.jsx';
import DashboardLoading from '../components/DashboardLoading.jsx';

const SHIFT_TARGET = 1200;
const SHIFT_HOURS = 8;

// Map simulator failure-mode IDs to operator-facing plain English.
const FAILURE_LABELS = {
  coolant_pump:  'Coolant pump degradation',
  quench_system: 'Quench system fault',
  power_supply:  'Power supply drift',
};

export default function OperatorTab({ accent = '#06b6d4' }) {
  const prodQ = useProduction();
  const repair = useRepair();
  const simStatus = useSimStatus();
  const prod = prodQ.data;

  useEffect(() => {
    if (!repair.error) return undefined;
    const id = setTimeout(() => repair.reset(), 6000);
    return () => clearTimeout(id);
  }, [repair.error, repair]);

  // Same linger pattern as HeaderBar — keep button in pending state until
  // the cycle has actually moved out of DOWN, otherwise the label flickers
  // back to "Repair" while the dashboard still shows DOWN.
  const repairInFlight = repair.isPending
    || (repair.isSuccess && simStatus.data?.cycle_state === 'DOWN');

  // Derive the current high-level state from the production payload.
  const risk = prod?.current_risk ?? 0;
  const machineState = prod?.current_state ?? 'IDLE';
  // HALTED takes precedence over OK/WARNING/CRITICAL — when the cycle is
  // DOWN we show the red banner regardless of what the (paused) AI risk
  // score was last saying.
  const state = statusFromRiskAndState(risk, machineState);
  const tokens = statusTokens(state);

  // Show loading only when we have NO data at all (placeholderData keeps
  // the previous payload around through transient 503s — see lib/api.js).
  if (!prod) {
    return (
      <div className="op-wrap">
        <DashboardLoading initialLoading={prodQ.isLoading} hasError={!!prodQ.error} />
      </div>
    );
  }

  const issues = buildOperatorIssues(state);

  // CRITICAL or HALTED: replace hero with the red banner. CRITICAL is the
  // pre-trip "AI strongly suggests stopping" state; HALTED is post-trip.
  // Both show the same operator action surface — only the title changes.
  if (state === 'CRITICAL' || state === 'HALTED') {
    // failure_mode comes from useSimStatus which polls /simulation/status.
    // It's the most current source for what's degrading — downtime_reason is
    // only set once the machine actually trips (state=DOWN).
    const failureMode = simStatus.data?.failure_mode;
    const failureLabel = FAILURE_LABELS[failureMode] ?? prod.downtime_reason ?? 'Sensor drift';

    return (
      <div className="op-wrap">
        <div className="op-banner">
          <div className="op-banner-bar" />
          <div className="op-banner-body">
            <div className="op-banner-head">
              <div className="op-banner-icon">
                <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 3 L22 20 L2 20 Z" />
                  <line x1="12" y1="10" x2="12" y2="14" />
                  <circle cx="12" cy="17" r="0.6" fill="currentColor" />
                </svg>
              </div>
              <div className="op-banner-title">
                {state === 'HALTED'
                  ? `Machine tripped · ${failureLabel}`
                  : `AI says stop · risk ${risk.toFixed(2)} · ${failureLabel}`}
              </div>
            </div>
            <div className="op-banner-cause">
              {state === 'HALTED'
                ? <>
                    <strong>{failureLabel}</strong> caused a production halt.
                    Wait for maintenance to repair before resuming.
                  </>
                : <>
                    <strong>{failureLabel}</strong> detected — sensors are degrading.
                    Stop production now and call maintenance.
                    Do not attempt to repair while the machine is still running.
                  </>}
            </div>
            <div className="op-banner-action-row">
              <button
                type="button"
                className="op-banner-repair"
                onClick={() => repair.mutate()}
                disabled={repairInFlight}
                title={state === 'HALTED'
                  ? 'Clear the failure and resume the cycle, keeping shift counters'
                  : 'Force-clear the active failure (maintenance override — use only if authorised)'}
              >
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M14.7 6.3a4 4 0 0 0-5.4 5.4l-6 6a1 1 0 0 0 1.4 1.4l6-6a4 4 0 0 0 5.4-5.4l-2.5 2.5-1.9-1.9 2.5-2.5z" />
                </svg>
                {repairInFlight
                  ? 'Repairing…'
                  : state === 'HALTED'
                    ? 'Repair and resume'
                    : 'Maintenance repair'}
              </button>
            </div>
            {repair.error && (
              <div className="op-banner-repair-err" role="alert">
                {explainRepairError(repair.error)}
              </div>
            )}
            <div className="op-banner-meta">
              <span className="op-banner-meta-k">{state === 'HALTED' ? 'Halted' : 'Status'}</span>
              <span className="op-banner-meta-v">{state === 'HALTED' ? 'just now' : 'CRITICAL'}</span>
              <span className="op-banner-sep">·</span>
              <span className="op-banner-meta-k">OK today</span>
              <span className="op-banner-meta-v">{prod.ok_count_total}</span>
              <span className="op-banner-sep">·</span>
              <span className="op-banner-meta-k">NG today</span>
              <span className="op-banner-meta-v">{prod.ng_count_total}</span>
              <span className="op-banner-sep">·</span>
              <span className="op-banner-meta-k">Downtime</span>
              <span className="op-banner-meta-v">{prod.downtime_min}m</span>
            </div>
          </div>
        </div>

        <ProductionStrip prod={prod} muted />

        <PartsTicker parts={prod.recent_parts ?? []} halted />

        <div className="op-issues op-issues-critical">
          <div className="op-issues-head">
            <div className="op-issues-title">Recent issues · last 24h</div>
          </div>
          <ul className="op-issues-list">
            {issues.map((i, idx) => (
              <li key={idx} className="op-issue">
                <span className={`op-issue-time ${i.time === 'now' ? 'op-issue-now' : ''}`}>{i.time}</span>
                <span className="op-issue-text">{i.text}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    );
  }

  // OK / WARNING — production-forward layout.
  const made = prod.ok_count_total + prod.ng_count_total;
  const partsThisShift = Math.min(made, SHIFT_TARGET);
  const progressPct = (partsThisShift / SHIFT_TARGET) * 100;

  // Cycle time: the API now returns a properly scaled parts/hour rate
  // (adjusted for actual running rows vs the fixed 3600-row window), so
  // 3600 / parts_per_hour gives a correct cycle time even when the session
  // is short or has downtime. Only hide it when the machine hasn't made any
  // parts yet (divide-by-zero guard).
  const cycleNow = prod.parts_per_hour > 0
    ? +(3600 / prod.parts_per_hour).toFixed(1)
    : null;
  const cycleTarget = 25.0;
  const cycleDelta = cycleNow != null ? +(cycleNow - cycleTarget).toFixed(1) : null;

  // Synthetic hourly trend for the parts/hr sparkline.
  const hourly = Array.from({ length: 12 }).map((_, i) => {
    const base = 140 + Math.sin(i * 0.9) * 12;
    return Math.round(base);
  });
  hourly[hourly.length - 1] = prod.parts_per_hour;

  const batches = buildBatches(state);
  const onTarget = state === 'OK';

  return (
    <div className="op-wrap">
      <CycleAnatomy />
      <div className="op-hero">
        <div className="op-hero-l">
          <div className="op-hero-eyebrow">SHIFT B · 14:00 – 22:00 · TARGET {SHIFT_TARGET}</div>
          <div className="op-hero-prog-num">
            <CountUp to={partsThisShift} className="op-hero-prog-made" />
            <span className="op-hero-prog-of">of {SHIFT_TARGET}</span>
            <span className="op-hero-prog-pct">parts made</span>
          </div>
          <div className="op-hero-bar">
            <div
              className="op-hero-bar-fill"
              style={{ width: `${progressPct}%`, background: onTarget ? accent : tokens.fg }}
            />
            <div className="op-hero-bar-tick" style={{ left: `${(SHIFT_HOURS / 22) * 100}%` }} />
          </div>
          <div className="op-hero-bar-meta">
            <span><CountUp to={progressPct} decimals={1} suffix="%" /> of shift target</span>
            <span className="op-hero-bar-meta-sep">·</span>
            <span>{onTarget ? 'on pace' : 'slightly behind pace'}</span>
          </div>
          <div className="op-hero-counts">
            <div className="op-hero-count op-hero-count-ok">
              <div className="op-hero-count-val"><CountUp to={prod.ok_count_total} /></div>
              <div className="op-hero-count-lbl">OK</div>
            </div>
            <div className="op-hero-count-sep">·</div>
            <div className="op-hero-count op-hero-count-ng">
              <div className="op-hero-count-val"><CountUp to={prod.ng_count_total} /></div>
              <div className="op-hero-count-lbl">NG</div>
            </div>
          </div>
        </div>
        <div className="op-hero-r">
          <div className="op-go">
            <div className="op-go-ring" style={{ borderColor: tokens.fg }}>
              <StatusDot status={state} size={18} pulse />
            </div>
            <div className="op-go-body">
              <div className="op-go-word" style={{ color: tokens.fg }}>
                {state === 'OK' ? 'GO' : 'CAUTION'}
              </div>
              <div className="op-go-meta">
                {state === 'OK' ? 'Keep the line running' : 'Run but flag maintenance'}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="op-kpi-row">
        <div className="op-kpi">
          <div className="op-kpi-lbl">PARTS / HOUR</div>
          <div className="op-kpi-val"><CountUp to={prod.parts_per_hour} /></div>
          <DeltaBadge value={prod.parts_per_hour - 142} decimals={0} />
          <div className="op-kpi-spk">
            <Sparkline values={hourly} stroke={accent} fill={accent} width={140} height={32} />
          </div>
        </div>
        <div className="op-kpi">
          <div className="op-kpi-lbl">CYCLE TIME</div>
          {cycleNow != null
            ? <>
                <div className="op-kpi-val"><CountUp to={cycleNow} decimals={1} suffix="s" /></div>
                <DeltaBadge value={cycleDelta} decimals={1} suffix="s" invert />
              </>
            : <div className="op-kpi-val op-kpi-val-dim">—</div>}
          <div className="op-kpi-foot mono">target {cycleTarget.toFixed(1)}s</div>
        </div>
        <div className="op-kpi">
          <div className="op-kpi-lbl">DEFECT RATE</div>
          <div className="op-kpi-val"><CountUp to={prod.defect_rate_pct} decimals={2} suffix="%" /></div>
          <div className="op-kpi-foot mono">{prod.ng_in_hour} of {prod.ok_in_hour + prod.ng_in_hour} this hour</div>
        </div>
        <div className="op-kpi">
          <div className="op-kpi-lbl">OEE</div>
          <div className="op-kpi-val"><CountUp to={prod.oee_pct} decimals={1} suffix="%" /></div>
          <div className="op-kpi-bar">
            <div
              className="op-kpi-bar-fill"
              style={{ width: `${prod.oee_pct}%`, background: prod.oee_pct >= 85 ? accent : tokens.fg }}
            />
          </div>
          <div className="op-kpi-foot mono">downtime {prod.downtime_min}m</div>
        </div>
      </div>

      <PartsTicker parts={prod.recent_parts ?? []} />

      <div className="op-row-2">
        <div className="op-batch">
          <div className="op-batch-head">
            <div className="op-batch-eyebrow">CURRENT BATCH</div>
            <div className="op-batch-id mono">{prod.identity?.batch_id ?? CURRENT_BATCH_DEFAULTS.id}</div>
          </div>
          <div className="op-batch-recipe">
            <div className="op-batch-recipe-name">Recipe {CURRENT_BATCH_DEFAULTS.recipe}</div>
            <div className="op-batch-recipe-sub">920 °C · 4.0s dwell · oil quench</div>
          </div>
          <div className="op-batch-prog">
            {(() => {
              const seq = simStatus.data?.part_seq_in_batch ?? 0;
              const batchSize = simStatus.data?.batch_size ?? 60;
              return (
                <>
                  <div className="op-batch-prog-num">
                    <CountUp to={seq} />
                    <span className="op-batch-prog-of"> / {batchSize}</span>
                  </div>
                  <div className="op-batch-bar">
                    <div
                      className="op-batch-bar-fill"
                      style={{ width: `${(seq / batchSize) * 100}%`, background: accent }}
                    />
                  </div>
                </>
              );
            })()}
            <div className="op-batch-foot mono">started {CURRENT_BATCH_DEFAULTS.started} · ETA {CURRENT_BATCH_DEFAULTS.etaHM}</div>
          </div>
        </div>

        <div className="op-batches">
          <div className="op-batches-head">
            <div className="op-batches-eyebrow">LAST 12 BATCHES · YIELD</div>
            <div className="op-batches-meta mono">
              avg {(batches.reduce((s, b) => s + b.yield, 0) / batches.length).toFixed(1)}%
            </div>
          </div>
          <div className="op-batches-bars">
            {batches.map((b, i) => (
              <div key={b.id} className="op-batches-col" title={`${b.id} · ${b.count} parts · ${b.yield.toFixed(1)}% yield`}>
                <div
                  className="op-batches-bar"
                  style={{
                    height: `${b.yield}%`,
                    background: b.yield < 90 ? '#fda4af' : b.yield < 95 ? '#fbbf24' : accent,
                  }}
                />
                {i === batches.length - 1 && <div className="op-batches-tag mono">now</div>}
              </div>
            ))}
          </div>
          <div className="op-batches-axis">
            <span>−12h</span><span>−6h</span><span>now</span>
          </div>
        </div>
      </div>

      <div className="op-issues">
        <div className="op-issues-head">
          <div className="op-issues-title">Recent issues · last 24h</div>
          <div className="op-issues-count">{issues.length}</div>
        </div>
        <ul className="op-issues-list">
          {issues.map((i, idx) => (
            <li key={idx} className="op-issue">
              <span className="op-issue-time">{i.time}</span>
              <span className="op-issue-text">{i.text}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function ProductionStrip({ prod, muted }) {
  return (
    <div className={`op-strip ${muted ? 'op-strip-muted' : ''}`}>
      <div className="op-strip-cell">
        <div className="op-strip-lbl">OK TODAY</div>
        <div className="op-strip-val">{prod.ok_count_total}</div>
      </div>
      <div className="op-strip-cell">
        <div className="op-strip-lbl">NG TODAY</div>
        <div className="op-strip-val">{prod.ng_count_total}</div>
      </div>
      <div className="op-strip-cell">
        <div className="op-strip-lbl">RATE</div>
        <div className="op-strip-val">{prod.parts_per_hour}<span className="op-strip-of"> /hr</span></div>
      </div>
      <div className="op-strip-cell">
        <div className="op-strip-lbl">DOWNTIME</div>
        <div className="op-strip-val mono">{prod.downtime_min}m</div>
      </div>
      <div className="op-strip-cell">
        <div className="op-strip-lbl">OEE</div>
        <div className="op-strip-val mono">{prod.oee_pct}%</div>
      </div>
    </div>
  );
}
