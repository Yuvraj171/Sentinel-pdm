// Sensor time-series chart using Recharts. Threshold bands behind the lines
// for the LEFT axis (induction_power baseline 50-150 kW). Part_temp lives on
// the RIGHT axis since its scale is wildly different.

import {
  ResponsiveContainer, AreaChart, Area, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, ReferenceArea,
} from 'recharts';

function CustomTip({ active, payload, label }) {
  if (!active || !payload || !payload.length) return null;
  return (
    <div className="mx-tip">
      <div className="mx-tip-time mono">{label}</div>
      {payload.map((p) => (
        <div key={p.dataKey} className="mx-tip-row">
          <span className="mx-tip-sw" style={{ background: p.color }} />
          <span className="mx-tip-k mono">{p.dataKey}</span>
          <span className="mx-tip-v mono">{p.value}</span>
        </div>
      ))}
    </div>
  );
}

const PALETTE = {
  induction_power:   null,  // accent — fed in
  quench_water_flow: '#7dd3fc',
  quench_pressure:   '#a5b4fc',
  part_temp:         '#fda4af',
};

export default function SensorChart({ data = [], accent = '#06b6d4' }) {
  if (!data.length) {
    return <div className="loading-card">Waiting for sensor data…</div>;
  }

  const series = data.map((d) => ({
    t: new Date(d.timestamp_sim).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    induction_power:   d.induction_power != null ? +d.induction_power.toFixed(2) : null,
    quench_water_flow: d.quench_water_flow != null ? +d.quench_water_flow.toFixed(2) : null,
    quench_pressure:   d.quench_pressure != null ? +d.quench_pressure.toFixed(2) : null,
    part_temp:         d.part_temp != null ? +d.part_temp.toFixed(2) : null,
  }));

  const palette = { ...PALETTE, induction_power: accent };

  // Left-axis envelope: derive from data so the reference bands sit sensibly.
  const leftValues = series.flatMap((s) => [s.induction_power, s.quench_water_flow, s.quench_pressure].filter((v) => v != null));
  const leftMax = leftValues.length ? Math.max(...leftValues) * 1.15 : 200;

  return (
    <div className="mx-chart-inner">
      <div className="mx-chart-legend">
        {Object.entries(palette).map(([k, v]) => (
          <span key={k} className="mx-chart-leg">
            <span className="mx-chart-leg-sw" style={{ background: v }} />
            <span className="mono">{k}</span>
          </span>
        ))}
        <span className="mx-chart-leg">
          <span className="mx-chart-leg-band-sw" />
          <span className="mono">advisory threshold band (induction_power)</span>
        </span>
      </div>
      <div style={{ width: '100%', height: 320 }}>
        <ResponsiveContainer>
          <AreaChart data={series} margin={{ top: 12, right: 18, left: 0, bottom: 8 }}>
            <defs>
              <linearGradient id="cg-power" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%"   stopColor={accent} stopOpacity="0.32" />
                <stop offset="100%" stopColor={accent} stopOpacity="0" />
              </linearGradient>
              <linearGradient id="cg-flow" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%"   stopColor="#7dd3fc" stopOpacity="0.20" />
                <stop offset="100%" stopColor="#7dd3fc" stopOpacity="0" />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="#1f1f2a" strokeDasharray="2 4" vertical={false} />
            <ReferenceArea yAxisId="left" y1={50}    y2={150}    fill="#84cc16" fillOpacity="0.05" stroke="none" />
            <ReferenceArea yAxisId="left" y1={150}   y2={leftMax} fill="#fbbf24" fillOpacity="0.05" stroke="none" />
            <ReferenceArea yAxisId="left" y1={0}     y2={50}     fill="#fb7185" fillOpacity="0.05" stroke="none" />
            <XAxis
              dataKey="t" stroke="#5b5666"
              tick={{ fontSize: 10, fontFamily: 'ui-monospace, monospace' }}
              interval={Math.max(1, Math.floor(series.length / 5))}
              tickLine={false}
              axisLine={{ stroke: '#1f1f2a' }}
            />
            <YAxis
              yAxisId="left" domain={[0, leftMax]}
              stroke="#5b5666" tick={{ fontSize: 10, fontFamily: 'ui-monospace, monospace' }}
              tickLine={false} axisLine={{ stroke: '#1f1f2a' }}
            />
            <YAxis
              yAxisId="right" orientation="right"
              stroke="#5b5666" tick={{ fontSize: 10, fontFamily: 'ui-monospace, monospace' }}
              tickLine={false} axisLine={{ stroke: '#1f1f2a' }}
            />
            <Tooltip content={<CustomTip />} cursor={{ stroke: '#3a3a48', strokeDasharray: '2 3' }} />
            <Area yAxisId="left"  type="monotone" dataKey="induction_power"   stroke={palette.induction_power}   strokeWidth={1.8} fill="url(#cg-power)" dot={false} isAnimationActive={false} />
            <Area yAxisId="left"  type="monotone" dataKey="quench_water_flow" stroke={palette.quench_water_flow} strokeWidth={1.4} fill="url(#cg-flow)"  dot={false} isAnimationActive={false} />
            <Line yAxisId="left"  type="monotone" dataKey="quench_pressure"   stroke={palette.quench_pressure}   strokeWidth={1.4} dot={false} isAnimationActive={false} />
            <Line yAxisId="right" type="monotone" dataKey="part_temp"         stroke={palette.part_temp}         strokeWidth={1.4} dot={false} isAnimationActive={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
