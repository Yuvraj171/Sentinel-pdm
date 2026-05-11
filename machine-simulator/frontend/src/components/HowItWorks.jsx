// HowItWorks — Sense → Engineer → Predict → Translate, reimagined as a
// horizontal flow with a connector line that draws in as the section scrolls
// into view. Each step number/title fades up with a stagger. Cyan accent
// runs through all four steps.

import useReveal from '../lib/useReveal.js';

const ACCENT = '#06b6d4';

const STEPS = [
  { n: '01', t: 'Sense',     d: 'Eight sensors stream every 5 seconds — power, temp, flow, pressure, vibration.' },
  { n: '02', t: 'Engineer',  d: 'Raw readings become 19 features: rolling means, deltas, ratios, drift indicators.' },
  { n: '03', t: 'Predict',   d: 'A trained anomaly model returns one risk score from 0 to 1 — and what looks suspect.' },
  { n: '04', t: 'Translate', d: 'You see a single word: GOOD, WARNING, or CRITICAL. The maintenance view shows why.' },
];

export default function HowItWorks() {
  const { ref, visible } = useReveal({ threshold: 0.25 });

  return (
    <section className="lp-how lp-how-v2" ref={ref}>
      <div className="lp-how-head">
        <div className="lp-routes-eyebrow reveal" data-delay="0">03 · HOW IT WORKS</div>
        <h2 className="lp-routes-title reveal" data-delay="80">No magic. Just numbers.</h2>
      </div>

      <div className={`lp-how-flow ${visible ? 'is-in' : ''}`}>
        {/* The drawing connector line. Single thin SVG path under the row,
            stroke-dashoffset animated via the .is-in class. */}
        <svg
          className="lp-how-line"
          viewBox="0 0 1000 8"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <line
            x1="40" y1="4" x2="960" y2="4"
            stroke={ACCENT}
            strokeWidth="1.4"
            strokeDasharray="920"
            strokeDashoffset="920"
            className="lp-how-line-stroke"
            strokeLinecap="round"
          />
          {STEPS.map((_, i) => {
            const x = 40 + (i / (STEPS.length - 1)) * 920;
            return (
              <circle
                key={i}
                cx={x} cy={4} r="3"
                fill={ACCENT}
                className="lp-how-line-dot"
                style={{ animationDelay: `${500 + i * 220}ms` }}
              />
            );
          })}
        </svg>

        <div className="lp-how-row-v2">
          {STEPS.map((s, i) => (
            <div
              key={s.n}
              className="lp-how-step reveal"
              data-delay={String(160 + i * 120)}
            >
              <div className="lp-how-num" style={{ color: ACCENT }}>{s.n}</div>
              <div className="lp-how-step-t">{s.t}</div>
              <div className="lp-how-step-d">{s.d}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
