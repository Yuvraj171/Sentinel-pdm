// Bottom-right demo control: triggers a failure-mode degradation on the
// simulator. Available on both Operator and Maintenance views — the button
// label is explicit about being a DEMO so it doesn't read as a real
// production control.

import { useEffect, useState } from 'react';
import { useInjectFailure, useClearFailure } from '../lib/api.js';

const MODES = [
  {
    id: 'coolant_pump',
    name: 'Coolant pump degradation',
    desc: 'Flow drops, pressure follows, parts under-quenched',
  },
  {
    id: 'quench_system',
    name: 'Quench system fault',
    desc: 'Pressure drop; soft parts',
  },
  {
    id: 'power_supply',
    name: 'Power supply drift',
    desc: 'Power instability; uneven hardness',
  },
];

// 300s ramp gives the AI clear lead time over the visible failure cascade:
// ~90s OK production while sensors drift and AI risk climbs into WARNING,
// ~30-60s of CRITICAL with growing alarm, then NGs start appearing, then
// trip. Without this lead time the warning arrives at the same time as
// the first defect, which defeats the point of predictive maintenance.
const DEFAULT_ONSET_S = 300;

// Map raw error strings into something an operator can act on. The simulator
// returns FastAPI-style {"detail": "..."} 4xx bodies; useInjectFailure throws
// with the body included.
function explainError(err) {
  const msg = String(err?.message ?? '');
  if (msg.includes('engine is not running')) {
    return 'Engine is offline. Click Fresh start in the header first, then retry.';
  }
  if (msg.includes('failure already active')) {
    return 'A failure is already active. Use "Clear active failure" first.';
  }
  if (msg.includes('machine is DOWN')) {
    return 'Machine has tripped. Use Repair (in the header or cycle card) to resume.';
  }
  if (msg.includes('Failed to fetch')) {
    return 'Simulator unreachable on :8000.';
  }
  return msg.slice(0, 120) || 'Request failed.';
}

export default function InjectFailureButton({ onsetSeconds = DEFAULT_ONSET_S }) {
  const [open, setOpen] = useState(false);
  const inject = useInjectFailure();
  const clear = useClearFailure();
  const busy = inject.isPending || clear.isPending;

  // Auto-clear stale errors after a few seconds so the UI doesn't accumulate.
  useEffect(() => {
    const t = inject.error || clear.error;
    if (!t) return undefined;
    const id = setTimeout(() => {
      inject.reset();
      clear.reset();
    }, 6000);
    return () => clearTimeout(id);
  }, [inject.error, clear.error, inject, clear]);

  const trigger = (mode) => {
    setOpen(false);
    inject.reset();
    clear.reset();
    inject.mutate({ mode, onsetSeconds });
  };

  const errorText = inject.error
    ? explainError(inject.error)
    : clear.error
      ? explainError(clear.error)
      : null;

  return (
    <>
      {open && (
        <div className="mx-inject-menu" role="menu">
          <div className="mx-inject-menu-head">
            <span className="mx-inject-menu-eyebrow">PICK A FAILURE MODE</span>
            <span className="mx-inject-menu-sub">
              Sensors degrade over ~{Math.round(onsetSeconds / 60)} min.
              AI flags WARNING / CRITICAL first (sensor drift), then NG parts
              start appearing, then the machine trips DOWN.
            </span>
          </div>
          {MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              className="mx-inject-item"
              onClick={() => trigger(m.id)}
              disabled={busy}
              role="menuitem"
            >
              <div className="mx-inject-item-name">{m.name}</div>
              <div className="mx-inject-item-desc">{m.desc}</div>
            </button>
          ))}
          <div className="mx-inject-menu-divider" />
          <button
            type="button"
            className="mx-inject-item mx-inject-item-clear"
            onClick={() => { setOpen(false); inject.reset(); clear.reset(); clear.mutate(); }}
            disabled={busy}
            role="menuitem"
          >
            <div className="mx-inject-item-name">Clear active failure</div>
            <div className="mx-inject-item-desc">Restore baseline sensors (machine stays in DOWN until reset)</div>
          </button>
        </div>
      )}
      {errorText && (
        <div className="mx-inject-err" role="alert">
          <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="9" />
            <line x1="12" y1="8" x2="12" y2="13" />
            <circle cx="12" cy="16" r="0.6" fill="currentColor" />
          </svg>
          <span>{errorText}</span>
        </div>
      )}
      <button
        type="button"
        className="mx-inject"
        onClick={() => setOpen((v) => !v)}
        disabled={busy}
        aria-haspopup="menu"
        aria-expanded={open}
        title="Trigger a simulated failure to see how the AI reacts"
      >
        <span className="mx-inject-badge">DEMO</span>
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M9 3 L15 3 L15 9 L20 14 L20 20 L4 20 L4 14 L9 9 Z" />
        </svg>
        {busy ? 'sending…' : 'Simulate failure'}
        <svg viewBox="0 0 12 12" width="9" height="9" fill="none" stroke="currentColor" strokeWidth="1.6"
             style={{ transform: open ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.18s' }}>
          <path d="M3 5 L6 8 L9 5" />
        </svg>
      </button>
    </>
  );
}
