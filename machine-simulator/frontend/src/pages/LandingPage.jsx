// Landing page — hero with the live 3D digital twin, live ticker bar, route
// cards, animated "how it works".

import { Suspense, lazy } from 'react';
import { Link } from 'react-router-dom';

import BackgroundMesh from '../components/BackgroundMesh.jsx';
import { HOTSPOTS } from '../lib/hotspots.js';
import { markVisited } from '../lib/visited.js';
import LiveTickerBar from '../components/LiveTickerBar.jsx';
import HowItWorks from '../components/HowItWorks.jsx';
import useReveal from '../lib/useReveal.js';
import { useDemoMode } from '../lib/demoMode.js';

const Scene3D = lazy(() => import('../components/Machine3D/index.jsx'));

const ACCENT = '#06b6d4';

export default function LandingPage() {
  const handleCta = () => markVisited();
  const demo = useDemoMode();

  // While the demo runs, staged sensor values drive both the ticker *and* the
  // 3D HUD cards. In idle, just show the jittered baselines.
  const sensorValues = {
    power:     demo.sensors.power.toFixed(0),
    part_temp: demo.sensors.part_temp.toFixed(0),
    flow:      demo.sensors.flow.toFixed(0),
    pressure:  demo.sensors.pressure.toFixed(1),
    vibration: demo.sensors.vibration.toFixed(1),
  };

  const routesReveal   = useReveal({ threshold: 0.2 });
  const routesEyebrow  = useReveal({ threshold: 0.4 });
  const opCardReveal   = useReveal({ threshold: 0.25 });
  const mxCardReveal   = useReveal({ threshold: 0.25 });

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
              <svg className="lp-hero-cta-chev" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.4">
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
            <Suspense fallback={<div className="lp-machine-fallback">Loading machine…</div>}>
              <Scene3D
                machineState="HEATING"
                riskScore={demo.risk}
                aiStatus={demo.aiStatus}
                showHotspots
                hotspots={HOTSPOTS}
                showSensors
                sensorValues={sensorValues}
                demoMode={demo.mode}
                demoCoilMood={demo.coilMood}
              />
            </Suspense>
          </div>
          <div className="lp-machine-hint">
            {demo.mode === 'idle'
              ? 'Hover the markers · drag to rotate · scroll inside the frame to zoom'
              : 'Watching the system respond in real time'}
          </div>
        </div>
      </section>

      <LiveTickerBar />

      <section className="lp-routes" id="views" ref={routesReveal.ref}>
        <div className="lp-routes-head">
          <div
            className={`lp-routes-eyebrow reveal ${routesEyebrow.visible ? 'is-in' : ''}`}
            ref={routesEyebrow.ref}
          >
            02 · CHOOSE YOUR VIEW
          </div>
          <h2 className={`lp-routes-title reveal ${routesReveal.visible ? 'is-in' : ''}`} data-delay="60">
            Two surfaces. Same machine.
          </h2>
          <p className={`lp-routes-sub reveal ${routesReveal.visible ? 'is-in' : ''}`} data-delay="120">
            One question gets one answer. The right answer depends on who&apos;s asking.
          </p>
        </div>

        <div className="lp-cards">
          <Link
            to="/dashboard?tab=operator"
            className={`lp-card lp-card-op reveal ${opCardReveal.visible ? 'is-in' : ''}`}
            onClick={handleCta}
            ref={opCardReveal.ref}
            data-delay="180"
          >
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
              <svg className="lp-card-cta-chev" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M5 12 H19 M13 6 L19 12 L13 18" />
              </svg>
            </div>
          </Link>

          <Link
            to="/dashboard?tab=maintenance"
            className={`lp-card lp-card-mx reveal ${mxCardReveal.visible ? 'is-in' : ''}`}
            onClick={handleCta}
            ref={mxCardReveal.ref}
            data-delay="260"
          >
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
              <svg className="lp-card-cta-chev" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M5 12 H19 M13 6 L19 12 L13 18" />
              </svg>
            </div>
          </Link>
        </div>
      </section>

      <HowItWorks />

      <footer className="lp-footer">
        <div className="lp-footer-l">SENTINEL PdM · IH-04 · LINE B</div>
        <div className="lp-footer-r">© 2026 · INTERNAL DEMO</div>
      </footer>
    </div>
  );
}
