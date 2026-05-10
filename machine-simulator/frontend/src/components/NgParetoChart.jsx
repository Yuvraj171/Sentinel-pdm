// NG Pareto bar chart — top rejection reasons ranked by count over the
// query window. Reads ng_reason values written by the simulator engine.

import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell,
} from 'recharts';

const REASON_LABEL = {
  under_quenched:    'Under-quenched',
  soft_part:         'Soft part',
  uneven_hardness:   'Uneven hardness',
  out_of_spec:       'Out of spec',
  sensor_noise:      'Sensor noise',
};

function CustomTip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="mx-tip">
      <div className="mx-tip-time mono">{d.label}</div>
      <div className="mx-tip-row">
        <span className="mx-tip-k">count</span>
        <span className="mx-tip-v mono">{d.count}</span>
      </div>
      <div className="mx-tip-row">
        <span className="mx-tip-k">share</span>
        <span className="mx-tip-v mono">{d.pct.toFixed(1)}%</span>
      </div>
    </div>
  );
}

export default function NgParetoChart({ reasons = [], accent = '#06b6d4' }) {
  if (!reasons.length) {
    return (
      <div className="loading-card">
        No NG events in the window. Yield is holding clean.
      </div>
    );
  }

  const data = reasons.map((r) => ({
    label: REASON_LABEL[r.reason] ?? r.reason,
    raw: r.reason,
    count: r.count,
    pct: r.pct,
  }));

  // Top entry coloured accent, rest fall back to a muted slate. The visual
  // hierarchy carries the "what's costing us most" signal without legend.
  const barColor = (idx) => idx === 0 ? accent : '#475569';

  return (
    <div style={{ width: '100%', height: 260 }}>
      <ResponsiveContainer>
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 24, left: 4, bottom: 8 }}>
          <CartesianGrid stroke="#1f1f2a" strokeDasharray="2 4" horizontal={false} />
          <XAxis
            type="number"
            stroke="#5b5666"
            tick={{ fontSize: 10, fontFamily: 'ui-monospace, monospace' }}
            tickLine={false}
            axisLine={{ stroke: '#1f1f2a' }}
          />
          <YAxis
            type="category" dataKey="label"
            stroke="#8a8275"
            tick={{ fontSize: 11, fontFamily: 'ui-sans-serif' }}
            tickLine={false}
            axisLine={{ stroke: '#1f1f2a' }}
            width={130}
          />
          <Tooltip content={<CustomTip />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
          <Bar dataKey="count" radius={[0, 4, 4, 0]} isAnimationActive={false}>
            {data.map((_, i) => <Cell key={i} fill={barColor(i)} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
