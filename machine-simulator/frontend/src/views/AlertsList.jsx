// Alert list with collapsible "Why" panel showing top contributing features
// and a suggested action. Click a row to expand.

import { useState } from 'react';
import StatusDot from '../components/StatusDot.jsx';
import Sparkline from '../components/Sparkline.jsx';
import { statusTokens } from '../lib/status.js';
import { buildAlertWhy } from '../lib/mock.js';

function fmtTime(ms) {
  return new Date(ms).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

export default function AlertsList({ alerts = [] }) {
  const [openIdx, setOpenIdx] = useState(0);

  return (
    <div className="mx-alerts-card">
      <ul className="mx-alerts-list">
        {alerts.map((a, i) => {
          const t = statusTokens(a.severity);
          const isOpen = openIdx === i;
          const why = buildAlertWhy(a.suspect);

          return (
            <li key={i} className={`mx-alert ${isOpen ? 'mx-alert-open' : ''}`}>
              <button
                type="button"
                className="mx-alert-row"
                onClick={() => setOpenIdx(isOpen ? -1 : i)}
              >
                <StatusDot
                  status={a.severity}
                  size={8}
                  pulse={i === 0 && a.severity === 'CRITICAL'}
                />
                <span className="mx-alert-time mono">{fmtTime(a.ts_ms)}</span>
                <span className="mx-alert-sev" style={{ color: t.fg }}>{a.severity}</span>
                <span className="mx-alert-meta">· risk {a.risk.toFixed(2)} · {a.suspect}</span>
                <span className="mx-alert-plain">{a.plain}</span>
                <span className="mx-alert-chev" aria-hidden="true">
                  <svg viewBox="0 0 12 12" width="10" height="10" style={{ transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.18s' }}>
                    <path d="M4 2 L8 6 L4 10" stroke="currentColor" strokeWidth="1.4" fill="none" />
                  </svg>
                </span>
              </button>
              {isOpen && (
                <div className="mx-alert-why">
                  <div className="mx-alert-why-head">
                    <span className="mx-alert-why-eyebrow">WHY · TOP CONTRIBUTING FEATURES</span>
                    <span className="mx-alert-why-meta mono">model: gbm-v3 · confidence 0.91</span>
                  </div>
                  <div className="mx-alert-why-list">
                    {why.map((w) => (
                      <div key={w.name} className="mx-alert-why-feat">
                        <div className="mx-alert-why-row1">
                          <span className="mx-alert-why-name mono">{w.name}</span>
                          <span className={`mx-alert-why-dir mx-alert-why-dir-${w.dir}`}>
                            {w.dir === 'up' ? '↑ trending up' : '↓ trending down'}
                          </span>
                          <span className="mx-alert-why-pct mono">{(w.contrib * 100).toFixed(0)}%</span>
                        </div>
                        <div className="mx-alert-why-row2">
                          <div className="mx-alert-why-bar">
                            <div
                              className="mx-alert-why-bar-fill"
                              style={{ width: `${w.contrib * 100}%`, background: t.ring }}
                            />
                          </div>
                          <Sparkline
                            values={w.sample}
                            stroke={t.ring}
                            fill={t.ring}
                            width={120}
                            height={28}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="mx-alert-why-foot">
                    <span className="mx-alert-why-action">
                      Suggested action: inspect <span className="mono">{a.suspect}</span>
                      {a.suspect.startsWith('quench') ? ' · check coolant pump pressure manually' : ' · check sensor calibration'}
                    </span>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
