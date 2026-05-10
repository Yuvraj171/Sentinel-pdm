// Animated AI-flow diagram: 8 sensors -> 19 features -> AI model -> risk score.
// SVG with travelling data packets along the edges.

import { statusTokens } from '../lib/status.js';

export default function FlowDiagram({ state = 'WARNING', accent = '#06b6d4', intensity = 'full', riskValue }) {
  const tokens = statusTokens(state);
  const showAnim = intensity !== 'flat';
  const showPulse = intensity === 'full';

  const sensors = [
    { id: 'induction_power',   label: 'Induction power', unit: 'kW',    flag: state === 'CRITICAL' ? 'WARNING' : 'OK' },
    { id: 'coil_voltage',      label: 'Coil voltage',    unit: 'V',     flag: 'OK' },
    { id: 'quench_water_temp', label: 'Coolant temp',    unit: '°C',    flag: state === 'OK' ? 'OK' : 'WARNING' },
    { id: 'quench_water_flow', label: 'Coolant flow',    unit: 'L/min', flag: state === 'OK' ? 'OK' : 'CRITICAL' },
    { id: 'quench_pressure',   label: 'Quench pressure', unit: 'bar',   flag: state === 'OK' ? 'OK' : (state === 'WARNING' ? 'WARNING' : 'CRITICAL') },
    { id: 'coil_scan_speed',   label: 'Scan speed',      unit: 'mm/s',  flag: 'OK' },
    { id: 'part_temp',         label: 'Part temperature',unit: '°C',    flag: state === 'CRITICAL' ? 'WARNING' : 'OK' },
    { id: 'vibration',         label: 'Vibration',       unit: 'mm/s',  flag: state === 'OK' ? 'OK' : 'WARNING' },
  ];

  const W = 1200;
  const H = 440;
  const sensorX = 60;
  const sensorXend = 250;
  const featureX = 470;
  const featureXend = 540;
  const modelCx = 720;
  const modelCy = H / 2;
  const modelR = 78;
  const outputX = 920;
  const sy = (i) => 30 + i * (H - 60) / 7;

  const summary = state === 'CRITICAL'
    ? 'Coolant flow has dropped well below normal. Risk of overheat.'
    : state === 'WARNING'
    ? 'Coolant readings are drifting. Watching closely.'
    : 'All sensors steady. Machine running normally.';

  const displayRisk = riskValue != null
    ? riskValue.toFixed(2)
    : (state === 'CRITICAL' ? '0.82' : state === 'WARNING' ? '0.42' : '0.12');

  return (
    <div className="flow-wrap">
      <svg viewBox={`0 0 ${W} ${H}`} className="flow-svg" preserveAspectRatio="xMidYMid meet">
        <defs>
          <radialGradient id="flow-model-bg" cx="0.5" cy="0.5" r="0.5">
            <stop offset="0"   stopColor={accent} stopOpacity="0.35" />
            <stop offset="0.6" stopColor={accent} stopOpacity="0.10" />
            <stop offset="1"   stopColor={accent} stopOpacity="0" />
          </radialGradient>
          <radialGradient id="flow-out-bg" cx="0.5" cy="0.5" r="0.5">
            <stop offset="0"   stopColor={tokens.ring} stopOpacity="0.30" />
            <stop offset="0.7" stopColor={tokens.ring} stopOpacity="0.04" />
            <stop offset="1"   stopColor={tokens.ring} stopOpacity="0" />
          </radialGradient>
        </defs>

        <g opacity="0.4">
          {Array.from({ length: 12 }).map((_, i) => (
            <line
              key={`fg${i}`}
              x1="0" y1={H - 4 - i * 3}
              x2={W} y2={H - 4 - i * 3}
              stroke="#1f1f2a" strokeWidth="0.5" opacity={1 - i * 0.08}
            />
          ))}
        </g>

        <g fontFamily="ui-monospace, monospace" fontSize="10" fill="#5b5666">
          <text x={sensorX} y="14" letterSpacing="0.16em">01 · SENSORS</text>
          <text x={featureX} y="14" letterSpacing="0.16em">02 · FEATURES</text>
          <text x={modelCx - 50} y="14" letterSpacing="0.16em">03 · AI MODEL</text>
          <text x={outputX} y="14" letterSpacing="0.16em">04 · OUTPUT</text>
        </g>

        {/* Edges sensors -> feature pillar */}
        <g>
          {sensors.map((s, i) => {
            const y1 = sy(i);
            const x1 = sensorXend;
            const x2 = featureX;
            const y2 = H / 2;
            const cx1 = (x1 + x2) / 2;
            const cy1 = y1;
            const cx2 = (x1 + x2) / 2;
            const cy2 = y2;
            return (
              <path
                key={s.id}
                d={`M ${x1} ${y1} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${x2} ${y2}`}
                fill="none" stroke="#262630" strokeWidth="1"
              />
            );
          })}
          {showAnim && sensors.map((s, i) => {
            const y1 = sy(i);
            const x1 = sensorXend;
            const x2 = featureX;
            const y2 = H / 2;
            const cx1 = (x1 + x2) / 2;
            const cy1 = y1;
            const cx2 = (x1 + x2) / 2;
            const cy2 = y2;
            const path = `M ${x1} ${y1} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${x2} ${y2}`;
            const t = statusTokens(s.flag);
            return (
              <g key={`p-${s.id}`}>
                <circle r="2.5" fill={t.ring} opacity="0.9">
                  <animateMotion dur={`${2.4 + i * 0.18}s`} repeatCount="indefinite" path={path} />
                  <animate attributeName="opacity" values="0;1;1;0" keyTimes="0;0.1;0.9;1" dur={`${2.4 + i * 0.18}s`} repeatCount="indefinite" />
                </circle>
              </g>
            );
          })}
        </g>

        {/* Edge feature pillar -> model */}
        <g>
          <line x1={featureXend} y1={H / 2} x2={modelCx - modelR} y2={H / 2} stroke="#262630" strokeWidth="1" />
          {showAnim && [0, 0.4, 0.8].map((d, i) => (
            <circle key={`fp${i}`} r="2" fill={accent} opacity="0.9">
              <animateMotion dur="1.6s" begin={`${d}s`} repeatCount="indefinite"
                path={`M ${featureXend} ${H / 2} L ${modelCx - modelR} ${H / 2}`} />
              <animate attributeName="opacity" values="0;1;0" dur="1.6s" begin={`${d}s`} repeatCount="indefinite" />
            </circle>
          ))}
        </g>

        {/* Edge model -> output */}
        <g>
          <line x1={modelCx + modelR} y1={H / 2} x2={outputX - 20} y2={H / 2} stroke="#262630" strokeWidth="1" />
          {showAnim && (
            <circle r="3" fill={tokens.ring} opacity="0.95">
              <animateMotion dur="1.2s" repeatCount="indefinite"
                path={`M ${modelCx + modelR} ${H / 2} L ${outputX - 20} ${H / 2}`} />
            </circle>
          )}
        </g>

        {/* Sensor nodes */}
        {sensors.map((s, i) => {
          const y = sy(i);
          const t = statusTokens(s.flag);
          return (
            <g key={s.id} transform={`translate(${sensorX} ${y})`}>
              <rect
                x="-4" y="-13"
                width={sensorXend - sensorX - 4} height="26"
                rx="13"
                fill="rgba(13,13,20,0.75)"
                stroke={s.flag === 'OK' ? '#262630' : t.soft}
                strokeWidth="1"
              />
              <circle cx="6" cy="0" r="4" fill={t.ring} />
              {showPulse && s.flag !== 'OK' && (
                <circle cx="6" cy="0" r="4" fill="none" stroke={t.ring} strokeWidth="1" opacity="0.6">
                  <animate attributeName="r" values="4;10;4" dur="1.8s" repeatCount="indefinite" />
                  <animate attributeName="opacity" values="0.6;0;0.6" dur="1.8s" repeatCount="indefinite" />
                </circle>
              )}
              <text x="22" y="4" fontFamily="ui-sans-serif, system-ui" fontSize="11" fill="#e8e3d8" fontWeight="500">{s.label}</text>
              <text x={sensorXend - sensorX - 14} y="4" textAnchor="end" fontFamily="ui-monospace, monospace" fontSize="9.5" fill="#5b5666">{s.unit}</text>
            </g>
          );
        })}

        {/* Feature pillar — narrow column with stacked rows representing
            the 19 engineered features. Text inside the pillar is kept to
            short tokens that fit ~70px width; longer descriptive text
            ("rolling stats, deltas, ratios") goes BELOW the pillar so it
            isn't clipped against the column. */}
        <g>
          <rect x={featureX} y="60" width={featureXend - featureX} height={H - 120} rx="8" fill="rgba(13,13,20,0.85)" stroke="#262630" />
          {Array.from({ length: 19 }).map((_, i) => {
            const y = 80 + i * (H - 160) / 18;
            return (
              <line key={i} x1={featureX + 8} y1={y} x2={featureXend - 8} y2={y} stroke="#2a2a36" strokeWidth="0.5" />
            );
          })}
          {/* Inside-pillar text: just the count, fits within column width */}
          <text x={(featureX + featureXend) / 2} y={H / 2 - 4}  textAnchor="middle" fontFamily="ui-sans-serif, system-ui" fontSize="22" fill="#e8e3d8" fontWeight="700" letterSpacing="-0.02em">19</text>
          <text x={(featureX + featureXend) / 2} y={H / 2 + 14} textAnchor="middle" fontFamily="ui-monospace, monospace" fontSize="9" fill="#8a8275" letterSpacing="0.14em">FEATURES</text>
          {/* Outside-pillar caption: descriptive text goes BELOW the pillar
              with a wider text-anchor so it doesn't have to fit 70px. */}
          <text x={(featureX + featureXend) / 2} y={H - 46} textAnchor="middle" fontFamily="ui-sans-serif, system-ui" fontSize="11" fill="#e8e3d8" fontWeight="600">Engineered</text>
          <text x={(featureX + featureXend) / 2} y={H - 30} textAnchor="middle" fontFamily="ui-sans-serif, system-ui" fontSize="10" fill="#8a8275">rolling · deltas · ratios</text>
        </g>

        {/* AI model node */}
        <g transform={`translate(${modelCx} ${modelCy})`}>
          <circle r={modelR + 60} fill="url(#flow-model-bg)" />
          {showAnim && (
            <>
              <circle r={modelR + 8} fill="none" stroke={accent} strokeWidth="0.5" opacity="0.4">
                <animate attributeName="r" values={`${modelR + 8};${modelR + 32};${modelR + 8}`} dur="3.5s" repeatCount="indefinite" />
                <animate attributeName="opacity" values="0.5;0;0.5" dur="3.5s" repeatCount="indefinite" />
              </circle>
              <circle r={modelR + 8} fill="none" stroke={accent} strokeWidth="0.5" opacity="0.3">
                <animate attributeName="r" values={`${modelR + 8};${modelR + 50};${modelR + 8}`} dur="3.5s" begin="1.2s" repeatCount="indefinite" />
                <animate attributeName="opacity" values="0.3;0;0.3" dur="3.5s" begin="1.2s" repeatCount="indefinite" />
              </circle>
            </>
          )}
          <circle r={modelR} fill="rgba(13,13,20,0.95)" stroke={accent} strokeWidth="1.2" />
          <circle r={modelR - 12} fill="none" stroke={accent} strokeWidth="0.5" opacity="0.4" strokeDasharray="3 4">
            {showAnim && <animateTransform attributeName="transform" type="rotate" from="0" to="360" dur="22s" repeatCount="indefinite" />}
          </circle>
          <circle r={modelR - 22} fill="none" stroke={accent} strokeWidth="0.5" opacity="0.25" strokeDasharray="2 6">
            {showAnim && <animateTransform attributeName="transform" type="rotate" from="360" to="0" dur="14s" repeatCount="indefinite" />}
          </circle>
          <text x="0" y="-12" textAnchor="middle" fontFamily="ui-monospace, monospace" fontSize="9" fill="#8a8275" letterSpacing="0.16em">XGB · ANOMALY</text>
          <text x="0" y="8"   textAnchor="middle" fontFamily="ui-sans-serif, system-ui" fontSize="20" fill="#e8e3d8" fontWeight="700" letterSpacing="-0.02em">AI Model</text>
          <text x="0" y="26"  textAnchor="middle" fontFamily="ui-sans-serif, system-ui" fontSize="10" fill="#8a8275">scores every row · 1Hz</text>
        </g>

        {/* Output */}
        <g transform={`translate(${outputX} ${H / 2 - 70})`}>
          <rect x="0" y="0" width="220" height="140" rx="12" fill="rgba(13,13,20,0.85)" stroke={tokens.soft} strokeWidth="1" />
          <rect x="0" y="0" width="220" height="140" rx="12" fill="url(#flow-out-bg)" />
          <text x="16" y="22" fontFamily="ui-monospace, monospace" fontSize="9" fill="#8a8275" letterSpacing="0.16em">RISK SCORE</text>
          <text x="16" y="68" fontFamily="ui-sans-serif, system-ui" fontSize="48" fill={tokens.fg} fontWeight="700" letterSpacing="-0.025em">
            {displayRisk}
          </text>
          <g transform="translate(16, 88)">
            <rect x="0" y="0" width="80" height="22" rx="11" fill={tokens.bg} stroke={tokens.soft} />
            <circle cx="11" cy="11" r="3" fill={tokens.ring} />
            <text x="20" y="15" fontFamily="ui-sans-serif, system-ui" fontSize="11" fill={tokens.fg} fontWeight="700" letterSpacing="0.10em">{state}</text>
          </g>
          <text x="16" y="128" fontFamily="ui-sans-serif, system-ui" fontSize="11" fill="#8a8275">
            {state === 'CRITICAL' ? 'Stop · call maintenance' : state === 'WARNING' ? 'Watch · keep running' : 'All clear'}
          </text>
        </g>
      </svg>

      <div className="flow-caption">
        <div className="flow-caption-l">
          <span className="flow-caption-eyebrow">In plain English</span>
          <span className="flow-caption-text">{summary}</span>
        </div>
        <div className="flow-caption-r">
          <span className="flow-stat"><span className="flow-stat-num">8</span><span className="flow-stat-lbl">sensors live</span></span>
          <span className="flow-stat"><span className="flow-stat-num">19</span><span className="flow-stat-lbl">features</span></span>
          <span className="flow-stat"><span className="flow-stat-num">1s</span><span className="flow-stat-lbl">AI tick</span></span>
        </div>
      </div>
    </div>
  );
}
