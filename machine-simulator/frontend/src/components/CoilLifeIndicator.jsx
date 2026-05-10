// Consumable wear indicator — radial gauge showing %% of expected coil life
// remaining. Color shifts: green > 50%, amber 20-50%, red < 20%.

import CountUp from './CountUp.jsx';

function lifeColor(pct) {
  if (pct < 20) return '#ef4444';
  if (pct < 50) return '#fbbf24';
  return '#22c55e';
}

export default function CoilLifeIndicator({ used = 0, expected = 5000, pctRemaining = 100, size = 'medium' }) {
  const r = size === 'large' ? 56 : 38;
  const stroke = size === 'large' ? 8 : 6;
  const c = 2 * Math.PI * r;
  const filled = c * (Math.max(0, Math.min(100, pctRemaining)) / 100);
  const color = lifeColor(pctRemaining);
  const dim = size === 'large' ? 140 : 96;

  return (
    <div className={`coil-life coil-life-${size}`}>
      <svg width={dim} height={dim} viewBox={`0 0 ${dim} ${dim}`}>
        <circle cx={dim / 2} cy={dim / 2} r={r} fill="none" stroke="#1f1f2a" strokeWidth={stroke} />
        <circle
          cx={dim / 2} cy={dim / 2} r={r}
          fill="none" stroke={color} strokeWidth={stroke}
          strokeDasharray={`${filled} ${c}`}
          transform={`rotate(-90 ${dim / 2} ${dim / 2})`}
          strokeLinecap="round"
          style={{ transition: 'stroke-dasharray 0.6s ease' }}
        />
      </svg>
      <div className="coil-life-center">
        <div className="coil-life-pct" style={{ color }}>
          <CountUp to={pctRemaining} decimals={0} suffix="%" />
        </div>
        <div className="coil-life-cap">remaining</div>
      </div>
      <div className="coil-life-foot mono">{used} / {expected} parts</div>
    </div>
  );
}
