import { statusFromRisk, statusTokens } from '../lib/status.js';

// `machineState` is the cycle phase from the simulator (IDLE/HEATING/QUENCH/DOWN).
// When DOWN we override the gauge to show "HALTED" rather than a numeric risk —
// running the model on DOWN-phase data produces meaningless flickering output
// (sensors are at 0 by design, out-of-distribution for the trained model).
export default function RiskGauge({ value = 0, intensity = 'full', size = 220, machineState }) {
  const halted = machineState === 'DOWN';
  const v = Math.max(0, Math.min(1, value));
  const status = halted ? 'HALTED' : statusFromRisk(v);
  const tokens = statusTokens(status);

  const r = size / 2 - 18;
  const cx = size / 2;
  const cy = size / 2;
  const C = 2 * Math.PI * r;
  const arcFrac = 0.78;
  const dash = C * arcFrac;
  // When halted, the colored arc collapses to nothing — the gauge is no
  // longer reporting a meaningful risk value, so showing a partial fill
  // would be wrong.
  const filled = halted ? 0 : dash * v;
  const rotation = 135;

  const showGlow = intensity !== 'flat';
  const showAnim = intensity === 'full';

  return (
    <div className="gauge-wrap" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <defs>
          <radialGradient id={`g-shade-${size}`} cx="0.5" cy="0.45" r="0.6">
            <stop offset="0"   stopColor="#1a1a22" />
            <stop offset="0.7" stopColor="#0e0e14" />
            <stop offset="1"   stopColor="#070709" />
          </radialGradient>
          <linearGradient id={`g-arc-${size}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor={tokens.ring} stopOpacity="1" />
            <stop offset="1" stopColor={tokens.ring} stopOpacity="0.65" />
          </linearGradient>
          <filter id={`g-glow-${size}`} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="6" />
          </filter>
        </defs>

        <circle cx={cx} cy={cy} r={r + 12} fill={`url(#g-shade-${size})`} stroke="#1f1f2a" strokeWidth="1" />
        <circle cx={cx} cy={cy} r={r - 6} fill="#0a0a10" />

        <g stroke="#2a2a36" strokeWidth="1">
          {Array.from({ length: 41 }).map((_, i) => {
            const a = (rotation + (i / 40) * arcFrac * 360) * Math.PI / 180;
            const r1 = r + 2;
            const r2 = r + (i % 5 === 0 ? 9 : 5);
            return (
              <line
                key={i}
                x1={cx + Math.cos(a) * r1} y1={cy + Math.sin(a) * r1}
                x2={cx + Math.cos(a) * r2} y2={cy + Math.sin(a) * r2}
              />
            );
          })}
        </g>

        <circle
          cx={cx} cy={cy} r={r}
          fill="none" stroke="#1f1f2a" strokeWidth="10"
          strokeDasharray={`${dash} ${C}`}
          transform={`rotate(${rotation - 90} ${cx} ${cy})`}
          strokeLinecap="round"
        />
        {showGlow && (
          <circle
            cx={cx} cy={cy} r={r}
            fill="none" stroke={tokens.ring} strokeWidth="14"
            strokeDasharray={`${filled} ${C}`}
            transform={`rotate(${rotation - 90} ${cx} ${cy})`}
            strokeLinecap="round"
            opacity="0.45"
            filter={`url(#g-glow-${size})`}
          />
        )}
        <circle
          cx={cx} cy={cy} r={r}
          fill="none" stroke={`url(#g-arc-${size})`} strokeWidth="10"
          strokeDasharray={`${filled} ${C}`}
          transform={`rotate(${rotation - 90} ${cx} ${cy})`}
          strokeLinecap="round"
          style={{ transition: 'stroke-dasharray 0.8s cubic-bezier(.4,.1,.2,1)' }}
        />

        {[0.3, 0.7].map((threshold, i) => {
          const a = (rotation + threshold * arcFrac * 360) * Math.PI / 180;
          return (
            <line
              key={i}
              x1={cx + Math.cos(a) * (r - 9)} y1={cy + Math.sin(a) * (r - 9)}
              x2={cx + Math.cos(a) * (r + 9)} y2={cy + Math.sin(a) * (r + 9)}
              stroke="#3a3a48" strokeWidth="1.5"
            />
          );
        })}

        <circle cx={cx} cy={cy} r={r - 22} fill="#0d0d14" stroke="#1f1f2a" strokeWidth="1" />
        {showAnim && (
          <circle cx={cx} cy={cy} r={r - 22} fill="none" stroke={tokens.ring} strokeWidth="1" opacity="0.25">
            <animate attributeName="r" values={`${r - 22};${r - 14};${r - 22}`} dur="3s" repeatCount="indefinite" />
            <animate attributeName="opacity" values="0.0;0.35;0.0" dur="3s" repeatCount="indefinite" />
          </circle>
        )}
      </svg>

      <div className="gauge-center">
        <div
          className="gauge-num"
          style={{
            color: tokens.fg,
            fontSize: Math.round(size * (halted ? 0.13 : 0.22)),
          }}
        >
          {halted ? '—' : v.toFixed(2)}
        </div>
        <div
          className="gauge-status"
          style={{ color: tokens.fg, background: tokens.bg, borderColor: tokens.soft }}
        >
          {halted ? 'HALTED' : status}
        </div>
        <div className="gauge-cap">
          {halted ? 'machine has tripped — risk score N/A' : '10-min failure probability'}
        </div>
      </div>
    </div>
  );
}
