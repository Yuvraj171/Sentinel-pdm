// Plant tab — cumulative roll-up for plant-head/supervisor users. Distinct
// from Operator (per-hour KPIs) and Maintenance (per-sensor technical):
// answers "are we on plan, is quality holding, is equipment healthy?"

import { useProduction, useNgPareto, useYieldTrend } from '../lib/api.js';
import { statusFromRiskAndState, statusTokens, statusHeadline, statusSubline } from '../lib/status.js';
import { buildUpcomingSchedule } from '../lib/mock.js';
import CountUp from '../components/CountUp.jsx';
import StatusDot from '../components/StatusDot.jsx';
import CoilLifeIndicator from '../components/CoilLifeIndicator.jsx';
import TtfChip from '../components/TtfChip.jsx';
import NgParetoChart from '../components/NgParetoChart.jsx';
import YieldTrendChart from '../components/YieldTrendChart.jsx';
import UpcomingSchedule from '../components/UpcomingSchedule.jsx';
import IncidentList from '../components/IncidentList.jsx';
import DashboardLoading from '../components/DashboardLoading.jsx';

const SHIFT_TARGET = 1200;

export default function PlantTab({ accent = '#06b6d4' }) {
  const prodQ = useProduction();
  const paretoQ = useNgPareto();
  const trendQ = useYieldTrend();

  // Show loading only when we have NO data at all. With placeholderData
  // keepPreviousData on the hook, transient 503s keep the previous payload
  // around so the UI doesn't flash blank during a fresh-start window.
  if (!prodQ.data) {
    return (
      <div className="plant-wrap">
        <DashboardLoading initialLoading={prodQ.isLoading} hasError={!!prodQ.error} />
      </div>
    );
  }

  const prod = prodQ.data;
  const risk = prod.current_risk ?? 0;
  const machineState = prod.current_state ?? 'IDLE';
  // statusFromRiskAndState returns 'HALTED' when machine is DOWN regardless
  // of risk score — this is what fixes the "OK / Line running normally"
  // bug that appeared while the machine was tripped.
  const state = statusFromRiskAndState(risk, machineState);
  const tokens = statusTokens(state);
  const halted = state === 'HALTED';
  const made = prod.ok_count_total + prod.ng_count_total;
  const progressPct = Math.min(100, (made / SHIFT_TARGET) * 100);
  const fpyPct = made > 0 ? (prod.ok_count_total / made * 100) : 100;

  const upcoming = buildUpcomingSchedule();
  const ttfSeconds = prod.current_status === 'OK' ? null : null; // surfaced via TtfChip from recent-predictions if active

  return (
    <div className="plant-wrap">
      {/* Hero — plant status at a glance */}
      <section className="plant-hero">
        <div className="plant-hero-l">
          <div className="plant-hero-eyebrow">PLANT STATUS · IH-04 · LINE B</div>
          <div className="plant-hero-row">
            <div className="plant-hero-prog-num">
              <CountUp to={made} className="plant-hero-prog-made" />
              <span className="plant-hero-prog-of">of {SHIFT_TARGET}</span>
              <span className="plant-hero-prog-pct">parts produced today</span>
            </div>
          </div>
          <div className="plant-hero-bar">
            <div
              className="plant-hero-bar-fill"
              style={{ width: `${progressPct}%`, background: state === 'OK' ? accent : tokens.fg }}
            />
          </div>
          <div className="plant-hero-meta">
            <span><CountUp to={progressPct} decimals={1} suffix="%" /> of shift target</span>
            <span className="plant-hero-meta-sep">·</span>
            <span>FPY <CountUp to={fpyPct} decimals={1} suffix="%" /></span>
          </div>
          <div className="plant-hero-counts">
            <div className="plant-hero-count plant-hero-count-ok">
              <div className="plant-hero-count-val"><CountUp to={prod.ok_count_total} /></div>
              <div className="plant-hero-count-lbl">OK</div>
            </div>
            <div className="plant-hero-count-sep">·</div>
            <div className="plant-hero-count plant-hero-count-ng">
              <div className="plant-hero-count-val"><CountUp to={prod.ng_count_total} /></div>
              <div className="plant-hero-count-lbl">NG</div>
            </div>
          </div>
        </div>
        <div className="plant-hero-r">
          <div className="plant-status-pill" style={{ borderColor: tokens.soft, background: tokens.bg }}>
            <StatusDot status={state} size={12} pulse={!halted} />
            <div>
              <div className="plant-status-word" style={{ color: tokens.fg }}>
                {statusHeadline(state)}
              </div>
              <div className="plant-status-meta">{statusSubline(state)}</div>
            </div>
          </div>
          <div className="plant-identity">
            <span className="plant-identity-k">Shift</span>
            <span className="plant-identity-v">{prod.identity?.shift_id ?? '—'}</span>
            <span className="plant-identity-sep">·</span>
            <span className="plant-identity-k">Operator</span>
            <span className="plant-identity-v">{prod.identity?.operator_id ?? '—'}</span>
          </div>
          <div className="plant-identity">
            <span className="plant-identity-k">Batch</span>
            <span className="plant-identity-v mono">{prod.identity?.batch_id ?? '—'}</span>
            <span className="plant-identity-sep">·</span>
            <span className="plant-identity-k">Part</span>
            <span className="plant-identity-v mono">{prod.identity?.part_id ?? '—'}</span>
          </div>
        </div>
      </section>

      {/* Reliability strip */}
      <section className="plant-reliability">
        <div className="plant-rel-tile">
          <div className="plant-rel-eyebrow">COIL LIFE</div>
          <CoilLifeIndicator
            used={prod.coil_life?.used ?? 0}
            expected={prod.coil_life?.expected ?? 5000}
            pctRemaining={prod.coil_life?.pct_remaining ?? 100}
            size="large"
          />
        </div>
        <div className="plant-rel-tile">
          <div className="plant-rel-eyebrow">PREDICTED FAILURE</div>
          <TtfChip size="large" machineState={machineState} />
        </div>
        <div className="plant-rel-tile">
          <div className="plant-rel-eyebrow">DOWNTIME TODAY</div>
          <div className="plant-rel-big">
            <CountUp to={prod.downtime_min} decimals={0} />
            <span className="plant-rel-unit">min</span>
          </div>
          <div className="plant-rel-foot">
            {prod.downtime_reason ? `cause · ${prod.downtime_reason}` : 'no events'}
          </div>
        </div>
      </section>

      {/* Quality row */}
      <section className="plant-quality">
        <div className="plant-quality-card">
          <div className="mx-section-head">
            <div className="mx-section-eyebrow">QUALITY · LAST HOUR</div>
            <div className="mx-section-title">Top NG reasons</div>
            <div className="mx-section-sub">What's costing us yield right now</div>
          </div>
          {paretoQ.isLoading
            ? <div className="loading-card">Computing Pareto…</div>
            : <NgParetoChart reasons={paretoQ.data?.reasons ?? []} accent={accent} />}
        </div>
        <div className="plant-quality-card">
          <div className="mx-section-head">
            <div className="mx-section-eyebrow">YIELD · LAST 24H</div>
            <div className="mx-section-title">First-pass yield trend</div>
            <div className="mx-section-sub">Hourly FPY% with 95% threshold band</div>
          </div>
          {trendQ.isLoading
            ? <div className="loading-card">Loading trend…</div>
            : <YieldTrendChart buckets={trendQ.data?.buckets ?? []} accent={accent} />}
        </div>
      </section>

      {/* Upcoming schedule */}
      <section>
        <div className="mx-section-head">
          <div className="mx-section-eyebrow">UPCOMING WORK · NEXT 4 BATCHES</div>
          <div className="mx-section-title">Production schedule</div>
        </div>
        <UpcomingSchedule recipes={upcoming} accent={accent} />
      </section>

      {/* Recent incidents */}
      <section>
        <div className="mx-section-head">
          <div className="mx-section-eyebrow">RECENT INCIDENTS</div>
          <div className="mx-section-title">Production halts and quality events</div>
        </div>
        <IncidentList incidents={(prod.recent_parts ?? []).filter((p) => p.part_status === 'NG')} />
      </section>
    </div>
  );
}
