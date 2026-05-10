// Isometric SVG schematic of the induction-hardening cell. Pure SVG —
// conveyor + induction coil + quench tank + control cabinet + animated
// hot parts moving along the line.

import { statusTokens } from '../lib/status.js';

// Heat colour stays warm regardless of dashboard accent — induction-coil
// glow is physically warm-toned, swapping it to cyan would read wrong.
const HEAT_COLOR = '#f59e0b';

export default function Machine3D({ state = 'OK', accent = HEAT_COLOR, intensity = 'full' }) {
  // Override: Machine3D ignores the passed accent and always uses HEAT_COLOR
  // for the part/coil/quench heat gradients. The accent prop is accepted for
  // backward compatibility with callers that pass it.
  void accent;
  accent = HEAT_COLOR;
  const showGlow = intensity !== 'flat';
  const showPulse = intensity === 'full';
  const tokens = statusTokens(state);

  const sensors = [
    { id: 'coil',     x: 380, y: 178, status: state === 'CRITICAL' ? 'WARNING' : 'OK' },
    { id: 'quench',   x: 600, y: 220, status: state === 'OK' ? 'OK' : 'CRITICAL' },
    { id: 'conv-in',  x: 200, y: 260, status: 'OK' },
    { id: 'conv-out', x: 760, y: 280, status: state === 'CRITICAL' ? 'WARNING' : 'OK' },
  ];

  return (
    <div className="machine3d-wrap">
      <svg viewBox="0 0 960 420" className="machine3d-svg" preserveAspectRatio="xMidYMid meet">
        <defs>
          <linearGradient id="m-floor" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#1a1a22" />
            <stop offset="1" stopColor="#0c0c12" />
          </linearGradient>
          <linearGradient id="m-conv-top" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0"   stopColor="#2a2a36" />
            <stop offset="0.5" stopColor="#3b3b48" />
            <stop offset="1"   stopColor="#262630" />
          </linearGradient>
          <linearGradient id="m-conv-side" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#1f1f28" />
            <stop offset="1" stopColor="#0f0f15" />
          </linearGradient>
          <linearGradient id="m-coil" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0"   stopColor="#d97757" />
            <stop offset="0.5" stopColor="#a85a3d" />
            <stop offset="1"   stopColor="#5e2f1d" />
          </linearGradient>
          <radialGradient id="m-heat" cx="0.5" cy="0.5" r="0.5">
            <stop offset="0"   stopColor={accent} stopOpacity="0.85" />
            <stop offset="0.4" stopColor={accent} stopOpacity="0.35" />
            <stop offset="1"   stopColor={accent} stopOpacity="0" />
          </radialGradient>
          <linearGradient id="m-water" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#22d3ee" stopOpacity="0.55" />
            <stop offset="1" stopColor="#0e7490" stopOpacity="0.85" />
          </linearGradient>
          <linearGradient id="m-tank" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#2a2a36" />
            <stop offset="1" stopColor="#0e0e14" />
          </linearGradient>
          <filter id="m-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="8" />
          </filter>
        </defs>

        {/* Floor grid */}
        <g opacity="0.5">
          {Array.from({ length: 16 }).map((_, i) => {
            const t = i / 15;
            return (
              <line
                key={`gh${i}`}
                x1={120 + t * 720} y1={400 - t * 60}
                x2={20 + t * 720}  y2={350 - t * 60}
                stroke="#1f1f2a" strokeWidth="1"
              />
            );
          })}
          {Array.from({ length: 12 }).map((_, i) => {
            const t = i / 11;
            return (
              <line
                key={`gv${i}`}
                x1={120 + t * 100} y1={400 - t * 50}
                x2={840 + t * 100} y2={340 - t * 50}
                stroke="#1f1f2a" strokeWidth="1"
              />
            );
          })}
        </g>

        {/* Base platform */}
        <g>
          <polygon points="80,360 880,290 940,330 140,400" fill="url(#m-floor)" stroke="#262630" strokeWidth="1" />
          <polygon points="140,400 940,330 940,344 140,414" fill="#0a0a10" />
        </g>

        {/* Conveyor */}
        <g>
          <polygon points="120,318 820,260 840,272 140,330" fill="url(#m-conv-side)" />
          <polygon points="120,318 820,260 830,254 130,312" fill="url(#m-conv-top)" />
          {Array.from({ length: 28 }).map((_, i) => {
            const t = i / 27;
            const x1 = 130 + t * 700;
            const y1 = 312 - t * 53;
            return (
              <line
                key={`bs${i}`}
                x1={x1} y1={y1} x2={x1 + 12} y2={y1 - 1}
                stroke="#4a4a58" strokeWidth="1.2" opacity="0.55"
              />
            );
          })}
          <ellipse cx="135" cy="332" rx="20" ry="8" fill="#1c1c24" stroke="#3a3a48" strokeWidth="1" />
          <ellipse cx="828" cy="274" rx="20" ry="8" fill="#1c1c24" stroke="#3a3a48" strokeWidth="1" />
        </g>

        {/* Animated parts moving along the conveyor */}
        <g className="m-parts">
          {[0, 0.25, 0.5, 0.75].map((phase, i) => (
            <g key={i} className={`m-part m-part-${i}`} style={{ animationDelay: `${-phase * 8}s` }}>
              <ellipse cx="0" cy="-2" rx="14" ry="5" fill="#1a1a22" />
              <rect x="-13" y="-12" width="26" height="10" fill={state === 'CRITICAL' ? '#fb7185' : accent} opacity="0.88" />
              <ellipse cx="0" cy="-12" rx="13" ry="4.5" fill={state === 'CRITICAL' ? '#fda4af' : '#fde68a'} />
              {showGlow && <ellipse cx="0" cy="-7" rx="22" ry="10" fill="url(#m-heat)" opacity="0.6" />}
            </g>
          ))}
        </g>

        {/* Induction coil */}
        <g transform="translate(420, 220)">
          {showGlow && (
            <>
              <ellipse cx="0" cy="0" rx="92" ry="50" fill="url(#m-heat)" opacity="0.85" filter="url(#m-glow)" />
              <ellipse cx="0" cy="0" rx="60" ry="32" fill={accent} opacity={state === 'CRITICAL' ? 0.20 : 0.42}>
                {showPulse && (
                  <animate
                    attributeName="opacity"
                    values={`${state === 'CRITICAL' ? 0.18 : 0.30};${state === 'CRITICAL' ? 0.28 : 0.55};${state === 'CRITICAL' ? 0.18 : 0.30}`}
                    dur="2.6s" repeatCount="indefinite"
                  />
                )}
              </ellipse>
            </>
          )}
          {[-18, 0, 18].map((dy, i) => (
            <g key={i}>
              <ellipse cx="0" cy={dy} rx="58" ry="20" fill="none" stroke="url(#m-coil)" strokeWidth="6" />
              <ellipse cx="0" cy={dy} rx="58" ry="20" fill="none" stroke="#f4cfa3" strokeWidth="1" opacity="0.35" />
            </g>
          ))}
          <line x1="-58" y1="-22" x2="-58" y2="22" stroke="#3a3a48" strokeWidth="3" />
          <line x1=" 58" y1="-22" x2=" 58" y2="22" stroke="#3a3a48" strokeWidth="3" />
        </g>

        {/* Quench tank */}
        <g transform="translate(640, 240)">
          <polygon points="-70,-10 70,-30 100,-18 -40,2"   fill="#181820" stroke="#3a3a48" strokeWidth="1" />
          <polygon points="-70,-10 -40,2 -40,52 -70,40"    fill="url(#m-tank)" stroke="#2a2a36" strokeWidth="1" />
          <polygon points="-40,2 100,-18 100,32 -40,52"    fill="#15151c" stroke="#2a2a36" strokeWidth="1" />
          <polygon points="-66,-8 66,-26 96,-16 -38,0"     fill="url(#m-water)" />
          {showPulse && (
            <g opacity="0.6">
              <line x1="-50" y1="-12" x2="40" y2="-22" stroke="#bef0ff" strokeWidth="0.8">
                <animate attributeName="opacity" values="0.1;0.6;0.1" dur="3s" repeatCount="indefinite" />
              </line>
              <line x1="-30" y1="-6" x2="60" y2="-18" stroke="#bef0ff" strokeWidth="0.8">
                <animate attributeName="opacity" values="0.6;0.1;0.6" dur="3.4s" repeatCount="indefinite" />
              </line>
            </g>
          )}
          <line x1="-20" y1="-50" x2="-20" y2="-12" stroke="#3a3a48" strokeWidth="2" />
          <circle cx="-20" cy="-50" r="3" fill="#3a3a48" />
          {state === 'CRITICAL' && (
            <text x="30" y="20" fill="#f87171" fontSize="11" fontFamily="ui-monospace, monospace" fontWeight="600">
              FLOW LOW
            </text>
          )}
        </g>

        {/* Control cabinet */}
        <g transform="translate(120, 220)">
          <polygon points="0,40 40,28 40,90 0,102"  fill="#1a1a22" stroke="#2a2a36" />
          <polygon points="40,28 80,16 80,78 40,90" fill="#13131a" stroke="#2a2a36" />
          <rect x="6" y="50" width="28" height="14" fill="#0a0a10" stroke="#2a2a36" />
          <text x="20" y="60" textAnchor="middle" fill={tokens.fg} fontSize="7" fontFamily="ui-monospace, monospace">
            {state}
          </text>
          <circle cx="50" cy="38" r="2.5" fill={tokens.ring}>
            <animate attributeName="opacity" values="0.3;1;0.3" dur="1.6s" repeatCount="indefinite" />
          </circle>
          <circle cx="58" cy="34" r="2.5" fill="#3a3a48" />
          <circle cx="66" cy="30" r="2.5" fill="#3a3a48" />
        </g>

        {/* Sensor pulse points */}
        {showPulse && sensors.map((s) => {
          const t = statusTokens(s.status);
          return (
            <g key={s.id} transform={`translate(${s.x}, ${s.y})`}>
              <circle r="4" fill={t.ring} />
              <circle r="4" fill="none" stroke={t.ring} strokeWidth="1.5" opacity="0.6">
                <animate attributeName="r" values="4;18;4" dur="2.4s" repeatCount="indefinite" />
                <animate attributeName="opacity" values="0.6;0;0.6" dur="2.4s" repeatCount="indefinite" />
              </circle>
            </g>
          );
        })}

        {/* Component labels */}
        <g fontFamily="ui-monospace, monospace" fontSize="10" fill="#8a8275" opacity="0.75">
          <text x="120" y="190">CONTROL</text>
          <text x="372" y="142">INDUCTION COIL</text>
          <text x="608" y="184">QUENCH</text>
          <text x="200" y="376">CONVEYOR</text>
        </g>
      </svg>

      <style>{`
        .machine3d-wrap { position: relative; width: 100%; }
        .machine3d-svg  { display: block; width: 100%; height: auto; }
        .m-parts .m-part { animation: m-travel 8s linear infinite; }
        @keyframes m-travel {
          0%   { transform: translate(140px, 312px); opacity: 0; }
          8%   { opacity: 1; }
          92%  { opacity: 1; }
          100% { transform: translate(820px, 260px); opacity: 0; }
        }
      `}</style>
    </div>
  );
}
