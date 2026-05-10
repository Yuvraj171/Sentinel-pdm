// Landing page (also reachable as /about) — hero with the isometric machine,
// a primary "Open dashboard" CTA, and a feature explainer below.

import { useState } from 'react';
import { Link } from 'react-router-dom';

import BackgroundMesh from '../components/BackgroundMesh.jsx';
import Machine3D from '../components/Machine3D.jsx';
import { markVisited } from '../lib/visited.js';

const ACCENT = '#06b6d4';

const HOTSPOTS = [
  { id: 'coil',     x: 420, y: 200, label: 'Induction coil',  desc: 'A copper coil generates a magnetic field that heats the steel part to ~920 °C in seconds.' },
  { id: 'quench',   x: 640, y: 240, label: 'Quench tank',     desc: 'Cool water is sprayed onto the hot part to lock in hardness. Coolant flow is critical.' },
  { id: 'conveyor', x: 250, y: 300, label: 'Conveyor',        desc: 'Carries each part through the coil at a precise speed.' },
  { id: 'control',  x: 160, y: 280, label: 'Control cabinet', desc: 'Reads every sensor and runs the AI model that scores risk every 5 seconds.' },
  { id: 'sensors',  x: 760, y: 260, label: 'Sensor array',    desc: 'Eight sensors monitor power, voltage, temperature, flow, pressure, speed and vibration.' },
];

const HOW_STEPS = [
  { n: '01', t: 'Sense',     d: 'Eight sensors stream every 5 seconds — power, temp, flow, pressure, speed, vibration.' },
  { n: '02', t: 'Engineer',  d: 'Raw readings become 19 features: rolling means, deltas, ratios, drift indicators.' },
  { n: '03', t: 'Predict',   d: 'A trained anomaly model returns one risk score from 0 to 1 — and what looks suspect.' },
  { n: '04', t: 'Translate', d: 'You see a single word: GOOD, WARNING, or CRITICAL. The maintenance view shows why.' },
];

export default function LandingPage() {
  const [hover, setHover] = useState(null);

  // Any path into the dashboard counts as "I've seen this product" — set the
  // flag so future visits to / skip the tour.
  const handleCta = () => markVisited();

  return (
    <div className="lp-app">
      <BackgroundMesh accent={ACCENT} intensity="full" />

      <header className="lp-hdr">
        <Link to="/" className="lp-hdr-l lp-hdr-l-link" aria-label="Sentinel PdM home">
          <div className="lp-hdr-mark" style={{ background: ACCENT }}>
            <svg viewBox="0 0 16 16" width="14" height="14" fill="none">
              <path d="M3 12 L3 4 L8 9 L13 4 L13 12" stroke="#0a0a10" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <div className="lp-hdr-brand">SENTINEL <span className="lp-hdr-brand-dim">PdM</span></div>
        </Link>
        <div className="lp-hdr-r">
          <span className="lp-hdr-link mono">v0.4.1 · BUILD 2026.05.10</span>
          <Link className="lp-hdr-link mono" to="/dashboard" onClick={handleCta}>OPEN DASHBOARD →</Link>
        </div>
      </header>

      <section className="lp-hero">
        <div className="lp-hero-text">
          <div className="lp-hero-eyebrow">PREDICTIVE MAINTENANCE · INDUCTION HARDENING</div>
          <h1 className="lp-hero-title">
            Catch the failure
            <br />
            <span className="lp-hero-title-accent" style={{ color: ACCENT }}>before it happens.</span>
          </h1>
          <p className="lp-hero-sub">
            Sentinel PdM watches an induction-hardening cell every five seconds and
            translates eight sensor streams into one number a person can act on:
            a risk score from 0 to 1.
          </p>

          <div className="lp-hero-ctas">
            <Link
              to="/dashboard?tab=plant"
              className="lp-hero-cta lp-hero-cta-primary"
              onClick={handleCta}
              style={{ background: ACCENT }}
            >
              Open dashboard
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.4">
                <path d="M5 12 H19 M13 6 L19 12 L13 18" />
              </svg>
            </Link>
            <a href="#views" className="lp-hero-cta lp-hero-cta-secondary">
              See both views
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M6 9 L12 15 L18 9" />
              </svg>
            </a>
          </div>

          <div className="lp-hero-stats">
            <div className="lp-stat"><div className="lp-stat-num">8</div><div className="lp-stat-lbl">sensors</div></div>
            <div className="lp-stat-sep" />
            <div className="lp-stat"><div className="lp-stat-num">5s</div><div className="lp-stat-lbl">refresh</div></div>
            <div className="lp-stat-sep" />
            <div className="lp-stat"><div className="lp-stat-num">98<span className="lp-stat-pct">%</span></div><div className="lp-stat-lbl">uptime</div></div>
            <div className="lp-stat-sep" />
            <div className="lp-stat"><div className="lp-stat-num">19</div><div className="lp-stat-lbl">features</div></div>
          </div>
        </div>

        <div className="lp-machine">
          <div className="lp-machine-frame">
            <Machine3D state="OK" accent={ACCENT} intensity="full" />

            <svg className="lp-hotspot-layer" viewBox="0 0 960 420" preserveAspectRatio="xMidYMid meet">
              {HOTSPOTS.map((h) => {
                const isOn = hover === h.id;
                return (
                  <g
                    key={h.id}
                    transform={`translate(${h.x} ${h.y})`}
                    onMouseEnter={() => setHover(h.id)}
                    onMouseLeave={() => setHover(null)}
                    style={{ cursor: 'pointer' }}
                  >
                    <circle r="22" fill="rgba(6,182,212,0.0)" />
                    <circle r={isOn ? 11 : 8} fill="none" stroke={ACCENT} strokeWidth="1.5" opacity="0.9" />
                    <circle r="3" fill={ACCENT} />
                    {!isOn && (
                      <circle r="8" fill="none" stroke={ACCENT} strokeWidth="1" opacity="0.6">
                        <animate attributeName="r" values="8;18;8" dur="2.4s" repeatCount="indefinite" />
                        <animate attributeName="opacity" values="0.6;0;0.6" dur="2.4s" repeatCount="indefinite" />
                      </circle>
                    )}
                  </g>
                );
              })}
            </svg>

            {hover && (() => {
              const h = HOTSPOTS.find((x) => x.id === hover);
              return (
                <div
                  className="lp-tip"
                  style={{ left: `${(h.x / 960) * 100}%`, top: `${(h.y / 420) * 100}%` }}
                >
                  <div className="lp-tip-eyebrow">{h.id.toUpperCase()}</div>
                  <div className="lp-tip-title">{h.label}</div>
                  <div className="lp-tip-desc">{h.desc}</div>
                </div>
              );
            })()}
          </div>
          <div className="lp-machine-hint">Hover the markers to learn about each part</div>
        </div>
      </section>

      <section className="lp-routes" id="views">
        <div className="lp-routes-head">
          <div className="lp-routes-eyebrow">02 · CHOOSE YOUR VIEW</div>
          <h2 className="lp-routes-title">Two surfaces. Same machine.</h2>
          <p className="lp-routes-sub">
            One question gets one answer. The right answer depends on who&apos;s asking.
          </p>
        </div>

        <div className="lp-cards">
          <Link to="/dashboard?tab=operator" className="lp-card lp-card-op" onClick={handleCta}>
            <div className="lp-card-head">
              <div className="lp-card-num">01</div>
              <div className="lp-card-tag">OPERATOR</div>
            </div>
            <div className="lp-card-q">&ldquo;Should I keep the line running?&rdquo;</div>
            <div className="lp-card-list">
              <div className="lp-card-li">Production-focused — parts made, OK vs NG, OEE</div>
              <div className="lp-card-li">Live ticker of the last 30 parts</div>
              <div className="lp-card-li">Issues in plain English — no jargon</div>
            </div>
            <div className="lp-card-cta">
              Open Operator view
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M5 12 H19 M13 6 L19 12 L13 18" />
              </svg>
            </div>
          </Link>

          <Link to="/dashboard?tab=maintenance" className="lp-card lp-card-mx" onClick={handleCta}>
            <div className="lp-card-head">
              <div className="lp-card-num">02</div>
              <div className="lp-card-tag" style={{ color: ACCENT }}>MAINTENANCE</div>
            </div>
            <div className="lp-card-q">&ldquo;Where is risk coming from, and why?&rdquo;</div>
            <div className="lp-card-list">
              <div className="lp-card-li">Live AI flow — sensors → model → risk score</div>
              <div className="lp-card-li">8-sensor sparkline strip + main chart</div>
              <div className="lp-card-li">Drift, alert history, suspect components</div>
            </div>
            <div className="lp-card-cta" style={{ color: ACCENT }}>
              Open Maintenance view
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M5 12 H19 M13 6 L19 12 L13 18" />
              </svg>
            </div>
          </Link>
        </div>
      </section>

      <section className="lp-how">
        <div className="lp-how-head">
          <div className="lp-routes-eyebrow">03 · HOW IT WORKS</div>
          <h2 className="lp-routes-title">No magic. Just numbers.</h2>
        </div>
        <div className="lp-how-row">
          {HOW_STEPS.map((s) => (
            <div key={s.n} className="lp-how-step">
              <div className="lp-how-num" style={{ color: ACCENT }}>{s.n}</div>
              <div className="lp-how-step-t">{s.t}</div>
              <div className="lp-how-step-d">{s.d}</div>
            </div>
          ))}
        </div>
      </section>

      <footer className="lp-footer">
        <div className="lp-footer-l">SENTINEL PdM · IH-04 · LINE B</div>
        <div className="lp-footer-r">© 2026 · INTERNAL DEMO</div>
      </footer>
    </div>
  );
}
