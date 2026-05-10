// First-pass yield trend — yield% per id-bucket over the last 24h of sim time.
// Buckets with no parts are gracefully skipped (fpy_pct === null).

import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ReferenceArea,
} from 'recharts';

function CustomTip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="mx-tip">
      <div className="mx-tip-time mono">{label}</div>
      <div className="mx-tip-row">
        <span className="mx-tip-k">FPY</span>
        <span className="mx-tip-v mono">{d.fpy_pct == null ? '—' : `${d.fpy_pct}%`}</span>
      </div>
      <div className="mx-tip-row">
        <span className="mx-tip-k">parts</span>
        <span className="mx-tip-v mono">{d.ok}/{d.ok + d.ng}</span>
      </div>
    </div>
  );
}

export default function YieldTrendChart({ buckets = [], accent = '#06b6d4' }) {
  if (!buckets.length) {
    return <div className="loading-card">Not enough rows for a trend yet.</div>;
  }

  // API returns oldest-bucket-first via SQL ORDER BY bucket ASC where bucket
  // counts BACKWARD from now (0 = now). Reverse for chronological display:
  // leftmost = oldest, rightmost = now.
  const data = [...buckets].reverse().map((b) => ({
    label: b.label,
    ok: b.ok,
    ng: b.ng,
    fpy_pct: b.fpy_pct,
  }));

  return (
    <div style={{ width: '100%', height: 260 }}>
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 12, right: 24, left: 0, bottom: 8 }}>
          <CartesianGrid stroke="#1f1f2a" strokeDasharray="2 4" vertical={false} />
          <ReferenceArea y1={95} y2={100} fill="#84cc16" fillOpacity="0.06" stroke="none" />
          <ReferenceArea y1={0}  y2={85}  fill="#fb7185" fillOpacity="0.05" stroke="none" />
          <ReferenceLine y={95} stroke="#84cc16" strokeDasharray="3 3" strokeOpacity="0.6" />
          <XAxis
            dataKey="label"
            stroke="#5b5666"
            tick={{ fontSize: 10, fontFamily: 'ui-monospace, monospace' }}
            interval={Math.max(1, Math.floor(data.length / 6))}
            tickLine={false}
            axisLine={{ stroke: '#1f1f2a' }}
          />
          <YAxis
            domain={[80, 100]}
            stroke="#5b5666"
            tick={{ fontSize: 10, fontFamily: 'ui-monospace, monospace' }}
            tickLine={false}
            axisLine={{ stroke: '#1f1f2a' }}
            tickFormatter={(v) => `${v}%`}
          />
          <Tooltip content={<CustomTip />} cursor={{ stroke: '#3a3a48', strokeDasharray: '2 3' }} />
          <Line
            type="monotone"
            dataKey="fpy_pct"
            stroke={accent}
            strokeWidth={2}
            dot={{ r: 2.5, fill: accent }}
            connectNulls
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
