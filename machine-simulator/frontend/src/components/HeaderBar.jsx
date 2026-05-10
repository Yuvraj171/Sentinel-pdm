import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';

import { useFreshStart, useRepair, useSimStatus, explainRepairError } from '../lib/api.js';

function fmtClock(ms) {
  return new Date(ms).toLocaleTimeString('en-GB', {
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

const SHIFT_HOURS = { A: '08:00', B: '14:00', C: '22:00' };

export default function HeaderBar({ accent = '#06b6d4', production }) {
  const [now, setNow] = useState(Date.now());
  const [confirmOpen, setConfirmOpen] = useState(false);
  const fresh = useFreshStart();
  const repair = useRepair();
  const simStatus = useSimStatus();
  const engineOffline = simStatus.data && simStatus.data.running === false;
  // Tripped = engine still running but the cycle is in DOWN. Repair is the
  // right action here (preserves counters); fresh-start would over-respond.
  const tripped = simStatus.data?.running === true && simStatus.data?.cycle_state === 'DOWN';
  // Keep the button in "Repairing…" until cycle_state actually leaves DOWN —
  // the API call is instant but the simulator + poll.py take 2-3s to reflect
  // it, and a flickering button label looks broken.
  const repairInFlight = repair.isPending
    || (repair.isSuccess && simStatus.data?.cycle_state === 'DOWN');

  // Auto-clear errors after a few seconds.
  useEffect(() => {
    if (!fresh.error) return undefined;
    const id = setTimeout(() => fresh.reset(), 6000);
    return () => clearTimeout(id);
  }, [fresh.error, fresh]);
  useEffect(() => {
    if (!repair.error) return undefined;
    const id = setTimeout(() => repair.reset(), 6000);
    return () => clearTimeout(id);
  }, [repair.error, repair]);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const partsPerHr = production?.parts_per_hour ?? '—';
  const oeePct = production?.oee_pct ?? '—';
  const shift = production?.identity?.shift_id ?? '—';
  const operator = production?.identity?.operator_id ?? '—';
  const shiftStart = SHIFT_HOURS[shift] ?? '—';

  const onConfirm = () => {
    setConfirmOpen(false);
    fresh.mutate();
  };

  return (
    <>
      {engineOffline && (
        <div className="hdr-offline-banner" role="status">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="9" />
            <line x1="12" y1="8" x2="12" y2="13" />
            <circle cx="12" cy="16" r="0.6" fill="currentColor" />
          </svg>
          <span>Simulator engine is offline — no new telemetry being generated.</span>
          <button
            type="button"
            className="hdr-offline-action"
            onClick={() => setConfirmOpen(true)}
            disabled={fresh.isPending}
          >
            {fresh.isPending ? 'Starting…' : 'Fresh start'}
          </button>
        </div>
      )}
      {tripped && (
        <div className="hdr-tripped-banner" role="status">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 3 L22 20 L2 20 Z" />
            <line x1="12" y1="10" x2="12" y2="14" />
            <circle cx="12" cy="17" r="0.6" fill="currentColor" />
          </svg>
          <span>Machine tripped (DOWN) — production halted. Repair to resume without losing shift counters.</span>
          <button
            type="button"
            className="hdr-tripped-action"
            onClick={() => repair.mutate()}
            disabled={repairInFlight}
          >
            {repairInFlight ? 'Repairing…' : 'Repair'}
          </button>
        </div>
      )}
      {fresh.error && !confirmOpen && (
        <div className="hdr-fresh-err" role="alert">
          <span>Fresh-start failed: {String(fresh.error.message).slice(0, 140)}</span>
        </div>
      )}
      {repair.error && (
        <div className="hdr-fresh-err" role="alert">
          <span>{explainRepairError(repair.error)}</span>
        </div>
      )}
      <header className="hdr">
        <Link to="/" className="hdr-l hdr-l-link" aria-label="Sentinel PdM home">
          <div className="hdr-mark" style={{ background: accent }}>
            <svg viewBox="0 0 16 16" width="14" height="14" fill="none">
              <path d="M3 12 L3 4 L8 9 L13 4 L13 12" stroke="#0a0a10" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <div className="hdr-titleblock">
            <div className="hdr-brand">SENTINEL <span className="hdr-brand-dim">PdM</span></div>
            <div className="hdr-machine">
              <span className="hdr-machine-id">IH-04</span>
              <span className="hdr-sep">·</span>
              <span>Line B</span>
              <span className="hdr-sep">·</span>
              <span>Hardening Cell</span>
            </div>
          </div>
        </Link>
        <div className="hdr-r">
          <div className="hdr-stat" title="Availability (last 1 h): fraction of the past 3 600 telemetry rows where the machine was NOT in a DOWN / tripped state. Drops only when the machine physically trips, not when risk is WARNING or CRITICAL.">
            <div className="hdr-stat-lbl">AVAIL · 1H</div>
            <div className="hdr-stat-val">{typeof oeePct === 'number' ? `${oeePct}%` : oeePct}</div>
          </div>
          <div className="hdr-stat" title="Parts produced per hour over the last 3,600 telemetry rows.">
            <div className="hdr-stat-lbl">PARTS / HR</div>
            <div className="hdr-stat-val">{partsPerHr}</div>
          </div>
          <div className="hdr-stat">
            <div className="hdr-stat-lbl">SHIFT</div>
            <div className="hdr-stat-val">{shift} · {shiftStart}</div>
          </div>
          <div className="hdr-stat">
            <div className="hdr-stat-lbl">OPERATOR</div>
            <div className="hdr-stat-val">{operator}</div>
          </div>
          <button
            type="button"
            className="hdr-fresh"
            onClick={() => setConfirmOpen(true)}
            disabled={fresh.isPending}
            title="Reset live telemetry and restart the simulation"
          >
            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 12 A9 9 0 1 0 6 5.5" />
              <path d="M3 4 V8 H7" />
            </svg>
            {fresh.isPending ? 'Resetting…' : 'Fresh start'}
          </button>
          <Link to="/about" className="hdr-about">ABOUT</Link>
          <div className="hdr-live">
            <span className="hdr-live-dot" />
            <span className="hdr-live-time">{fmtClock(now)}</span>
          </div>
        </div>
      </header>
      {confirmOpen && createPortal(
        <div className="hdr-confirm" role="dialog" aria-modal="true">
          <div className="hdr-confirm-card">
            <div className="hdr-confirm-title">Fresh-start the simulation?</div>
            <div className="hdr-confirm-body">
              This clears all live telemetry rows and restarts the engine. Counters reset to zero, the coil is replaced, batches restart from B-0001. Existing fast-gen training data is untouched.
            </div>
            <div className="hdr-confirm-actions">
              <button type="button" className="hdr-confirm-cancel" onClick={() => setConfirmOpen(false)}>Cancel</button>
              <button type="button" className="hdr-confirm-go" onClick={onConfirm}>Reset and start</button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
