// Maintenance tab — engineer/quality view. Reads real telemetry, drift, and
// production state. Mocked for now: alert history, alert "why" feature
// contributions, recipe context narrative.

import { Suspense, lazy } from 'react';

import { useRecentPredictions, useDrift, useProduction } from '../lib/api.js';
import { statusFromRiskAndState, statusFromPsi, statusTokens } from '../lib/status.js';
import { CURRENT_RECIPE } from '../lib/mock.js';
import { useAlertLog } from '../lib/alerts.js';
import RiskGauge from '../components/RiskGauge.jsx';
import StatePill from '../components/StatePill.jsx';
import DeltaBadge from '../components/DeltaBadge.jsx';
import CountUp from '../components/CountUp.jsx';
import FlowDiagram from '../components/FlowDiagram.jsx';
import TtfChip from '../components/TtfChip.jsx';
import CoilLifeIndicator from '../components/CoilLifeIndicator.jsx';
import DashboardLoading from '../components/DashboardLoading.jsx';
import SensorChart from './SensorChart.jsx';
import SparklineStrip from './SparklineStrip.jsx';
import AlertsList from './AlertsList.jsx';

const Scene3D = lazy(() => import('../components/Machine3D/index.jsx'));

export default function MaintenanceTab({ accent = '#06b6d4', intensity = 'full' }) {
  const recentQ = useRecentPredictions(60);
  const driftQ = useDrift();
  const prodQ = useProduction();

  // Derive status/risk early (before any early return) so useAlertLog can be
  // called unconditionally at the top level — React's Rules of Hooks require
  // all hooks to run on every render, not conditionally.
  const latestRow = recentQ.data?.[recentQ.data.length - 1];
  const earlyRisk = latestRow?.ai_risk_score ?? 0;
  const earlyMachineState = prodQ.data?.current_state ?? latestRow?.state ?? 'IDLE';
  const earlyState = statusFromRiskAndState(earlyRisk, earlyMachineState);

  // Persistent alert log — entries accumulate as the machine escalates; repair
  // does NOT clear them (only Fresh Start does, via api.js clearing localStorage).
  const alertLog = useAlertLog(
    earlyState,
    earlyRisk,
    prodQ.data?.ng_reason ?? null,
    prodQ.data?.downtime_reason ?? null,
  );

  // Show loading only when we have NO recent-prediction rows. placeholderData
  // (lib/api.js) keeps the previous payload through transient 503s so the
  // sensor charts don't blank out during a fresh-start window.
  if (!recentQ.data || recentQ.data.length === 0) {
    return (
      <div className="mx-wrap">
        <DashboardLoading initialLoading={recentQ.isLoading} hasError={!!recentQ.error} />
      </div>
    );
  }

  const data = recentQ.data;
  const latest = data[data.length - 1];
  const earlier = data[Math.max(0, data.length - 30)];
  const risk = latest.ai_risk_score ?? 0;
  // Prefer prodQ.current_state (latest row from /api/production, updated every
  // 5s) over latest.state (latest SCORED row from recent-predictions) because
  // the scored row can lag 1-2s behind when the machine first trips DOWN.
  // This prevents the state card from momentarily showing HEATING/QUENCH while
  // the machine is actually in DOWN.
  const machineState = prodQ.data?.current_state ?? latest.state ?? 'IDLE';
  // statusFromRiskAndState forces HALTED when cycle is DOWN, so the risk
  // card / alerts / recipe-note all stop showing OK while the machine
  // sits in a tripped state.
  const state = statusFromRiskAndState(risk, machineState);
  const halted = state === 'HALTED';
  const riskDelta = +(risk - (earlier.ai_risk_score ?? risk)).toFixed(2);

  // Drift card — real values from the drift endpoint, plus a derived ranked
  // feature list. The endpoint returns a flat object: feature_name -> psi,
  // plus "overall" and "status" summary fields.
  const driftRaw = driftQ.data;
  const driftStatus = driftRaw?.status ?? 'OK';
  const driftTokens = statusTokens(driftStatus);
  const driftOverall = driftRaw?.overall ?? 0;
  const driftFeatures = driftRaw
    ? Object.entries(driftRaw)
        .filter(([k, v]) => k !== 'overall' && k !== 'status' && typeof v === 'number')
        .sort((a, b) => b[1] - a[1])
        .slice(0, 4)
        .map(([name, psi]) => ({ name, psi }))
    : [];

  // Bar width normalization: when PSI is well past CRITICAL (e.g. 6.7), every
  // top feature would peg at 100% and look identical. Scale against the max
  // of (top feature PSI, 0.4) so the relative ordering stays visible.
  const driftBarMax = Math.max(0.4, ...driftFeatures.map((f) => f.psi));

  const driftDelta = state === 'CRITICAL' ? 0.18 : state === 'WARNING' ? 0.06 : 0.01;

  const alerts = alertLog.slice(0, 5);

  // Recipe context narrative depends on state.
  const recipeNote = (() => {
    if (state === 'OK') {
      return <span className="mx-recipe-note">Drift quiet on this recipe — last 12 batches stable.</span>;
    }
    if (state === 'WARNING') {
      return (
        <span className="mx-recipe-note mx-recipe-note-warn">
          <span className="mx-recipe-note-dot" style={{ background: '#fbbf24' }} />
          Drift began <strong>{CURRENT_RECIPE.switchedMinAgo} min</strong> after switching from{' '}
          <span className="mono">{CURRENT_RECIPE.prevId}</span> → <span className="mono">{CURRENT_RECIPE.id}</span>.
        </span>
      );
    }
    return (
      <span className="mx-recipe-note mx-recipe-note-crit">
        <span className="mx-recipe-note-dot" style={{ background: '#fb7185' }} />
        Risk spike correlates with <span className="mono">{CURRENT_RECIPE.id}</span> recipe — consider rolling back to <span className="mono">{CURRENT_RECIPE.prevId}</span>.
      </span>
    );
  })();

  return (
    <div className="mx-wrap">
      <div className="mx-recipe-band">
        <div className="mx-recipe-l">
          <span className="mx-recipe-eyebrow">RECIPE</span>
          <span className="mx-recipe-id mono">{CURRENT_RECIPE.id}</span>
          <span className="mx-recipe-sep">·</span>
          <span className="mx-recipe-spec">{CURRENT_RECIPE.spec}</span>
        </div>
        <div className="mx-recipe-r">{recipeNote}</div>
      </div>

      <section className="mx-schema-wrap">
        <div className="mx-section-head">
          <div className="mx-section-eyebrow">CELL · IH-04 · LIVE PIPELINE</div>
          <div className="mx-section-title">From sensor to decision in 5 seconds</div>
          <div className="mx-section-sub">
            Eight sensors feed an AI model that returns one risk score · explained below in plain English
          </div>
        </div>
        <div className="mx-schema-card">
          <FlowDiagram state={state} accent={accent} intensity={intensity} riskValue={risk} />
        </div>
      </section>

      <section className="mx-twin-wrap">
        <div className="mx-section-head">
          <div className="mx-section-eyebrow">DIGITAL TWIN · LIVE</div>
          <div className="mx-section-title">Cell IH-04 — what the machine is doing right now</div>
          <div className="mx-section-sub">
            Coil glow follows phase and risk · conveyor stops on DOWN · sparks appear at CRITICAL
          </div>
        </div>
        <div className="mx-twin-card">
          <Suspense fallback={<div className="mx-twin-fallback">Loading 3D scene…</div>}>
            <Scene3D
              compact
              machineState={machineState}
              riskScore={risk}
              aiStatus={state}
              showSensors
              sensorValues={{
                power:     latest.induction_power     != null ? Math.round(latest.induction_power).toString()     : '—',
                part_temp: latest.part_temp           != null ? Math.round(latest.part_temp).toString()           : '—',
                flow:      latest.quench_water_flow   != null ? Math.round(latest.quench_water_flow).toString()   : '—',
                pressure:  latest.quench_pressure     != null ? latest.quench_pressure.toFixed(1)                 : '—',
                vibration: latest.vibration           != null ? latest.vibration.toFixed(1)                       : '—',
              }}
            />
          </Suspense>
        </div>
      </section>

      <section className="mx-band">
        <div className="mx-card mx-card-state">
          <div className="mx-card-eyebrow">STATE</div>
          <div className="mx-state-stack">
            {/* When DOWN, override the raw cycle phase with an explicit DOWN pill
                and surface the failure cause so the maintenance engineer knows
                what to fix — not just "machine is in HEATING state". */}
            <StatePill state={halted ? 'DOWN' : machineState} status={state} />
            {halted && (
              <div className="mx-state-down-reason">
                <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 3 L22 20 L2 20 Z" />
                  <line x1="12" y1="10" x2="12" y2="14" />
                  <circle cx="12" cy="17" r="0.6" fill="currentColor" />
                </svg>
                <span>{prodQ.data?.downtime_reason ?? 'Trip cause unknown'} — repair required</span>
              </div>
            )}
            <div className="mx-state-meta">
              <div className="mx-state-row"><span>Mode</span><span>Auto</span></div>
              <div className="mx-state-row"><span>Recipe</span><span>{CURRENT_RECIPE.id} / 920°C</span></div>
              <div className="mx-state-row"><span>OK today</span><span className="mono">{prodQ.data?.ok_count_total ?? '—'}</span></div>
              <div className="mx-state-row"><span>NG today</span><span className="mono">{prodQ.data?.ng_count_total ?? '—'}</span></div>
              <div className="mx-state-row">
                <span>Coil life</span>
                <span className="mono">{prodQ.data?.coil_life?.pct_remaining ?? '—'}%</span>
              </div>
              <div className="mx-state-row">
                <span>Operator</span>
                <span>{prodQ.data?.identity?.operator_id ?? '—'}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="mx-card mx-card-risk">
          <div className="mx-card-eyebrow">
            <span>RISK</span>
            <DeltaBadge value={riskDelta} />
          </div>
          <div className="mx-gauge-wrap">
            <RiskGauge value={risk} intensity={intensity} size={240} machineState={machineState} />
          </div>
          <div style={{ width: '100%', display: 'flex', justifyContent: 'center', marginTop: -6, marginBottom: 8 }}>
            <TtfChip machineState={machineState} />
          </div>
          <div className="mx-gauge-foot">
            <div className="mx-thr"><span className="mx-thr-band mx-thr-ok" /> OK &lt; 0.3</div>
            <div className="mx-thr"><span className="mx-thr-band mx-thr-warn" /> 0.3–0.7</div>
            <div className="mx-thr"><span className="mx-thr-band mx-thr-crit" /> ≥ 0.7</div>
          </div>
        </div>

        <div className="mx-card mx-card-drift">
          <div className="mx-card-eyebrow">
            <span>SENSOR DRIFT · vs BASELINE</span>
            <DeltaBadge value={driftDelta} />
          </div>
          {driftQ.isLoading || !driftRaw ? (
            <div className="loading-card">Comparing sensors to baseline…</div>
          ) : (
            <>
              <div className="mx-drift-explainer">
                How far today's sensor patterns are from what the AI was
                trained on. Higher = the model is seeing readings outside
                its training experience and may not predict reliably.
              </div>
              <div className="mx-drift-head">
                <div className="mx-drift-num" style={{ color: driftTokens.fg }}>
                  <CountUp to={driftOverall} decimals={2} />
                </div>
                <div
                  className="mx-drift-status"
                  style={{ color: driftTokens.fg, borderColor: driftTokens.soft, background: driftTokens.bg }}
                >
                  {driftStatus}
                </div>
              </div>
              <div className="mx-drift-sub">
                drift score (PSI) · &lt; 0.10 normal · 0.10–0.25 watch · &gt; 0.25 retrain
              </div>
              <div className="mx-drift-list-head">Top sensors drifting most</div>
              <div className="mx-drift-list">
                {driftFeatures.map((f, i) => {
                  const fStatus = statusFromPsi(f.psi);
                  const ft = statusTokens(fStatus);
                  const pct = Math.min(100, (f.psi / driftBarMax) * 100);
                  return (
                    <div key={f.name} className={`mx-drift-feat ${i === 0 ? 'mx-drift-top' : ''}`}>
                      <div className="mx-drift-feat-row">
                        <span className="mx-drift-feat-name mono">{f.name}</span>
                        <span className="mx-drift-feat-psi mono" style={{ color: ft.fg }}>
                          {f.psi.toFixed(2)}
                        </span>
                      </div>
                      <div className="mx-drift-bar">
                        <div className="mx-drift-fill" style={{ width: `${pct}%`, background: ft.ring }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </section>

      <section>
        <div className="mx-section-head">
          <div className="mx-section-eyebrow">SENSORS · ALL EIGHT · LAST 30 SAMPLES</div>
          <div className="mx-section-title">Health-at-a-glance</div>
          <div className="mx-section-sub">One sparkline per sensor. Dotted line marks the nominal baseline.</div>
        </div>
        <SparklineStrip data={data} />
      </section>

      <section>
        <div className="mx-section-head">
          <div className="mx-section-eyebrow">KEY SENSORS · LAST 60s · 4 OF 8</div>
          <div className="mx-section-title">Detail view · most diagnostic sensors</div>
          <div className="mx-section-sub">
            Induction power, coolant flow, quench pressure, part temperature.
            All eight sensors are shown as sparklines above; this chart zooms
            in on the four that move first when a failure starts.
          </div>
        </div>
        <div className="mx-chart-card">
          <SensorChart data={data} accent={accent} />
        </div>
      </section>

      <section>
        <div className="mx-section-head">
          <div className="mx-section-eyebrow">ALERTS · LAST {Math.min(alertLog.length, 5)} OF {alertLog.length}</div>
          <div className="mx-section-title">Alert history</div>
          <div className="mx-section-sub">
            Persists across repair — cleared only on Fresh Start.
            Click an alert to see which features pushed the risk up.
          </div>
        </div>
        {alertLog.length === 0
          ? <div className="mx-alerts-empty">No alerts yet — system is running normally.</div>
          : <AlertsList alerts={alerts} />}
      </section>
    </div>
  );
}
