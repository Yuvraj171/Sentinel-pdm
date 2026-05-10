// Tiny SVG sparkline. Optional dotted threshold line. Ends with a dot at the
// last sample so the eye finds "now" instantly.

export default function Sparkline({
  values, stroke = '#9ca3af', fill, width = 90, height = 28, threshold,
}) {
  if (!values || values.length === 0) return null;

  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const stepX = width / (values.length - 1);
  const pad = 2;
  const yOf = (v) => pad + (1 - (v - min) / span) * (height - pad * 2);
  const pts = values.map((v, i) => `${i * stepX},${yOf(v)}`).join(' ');
  const areaPts = `${pts} ${width},${height} 0,${height}`;
  const last = values[values.length - 1];

  return (
    <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height} className="spk">
      {threshold != null && threshold >= min && threshold <= max && (
        <line
          x1="0" y1={yOf(threshold)}
          x2={width} y2={yOf(threshold)}
          stroke="#3a3a48" strokeWidth="0.5" strokeDasharray="2 2"
        />
      )}
      {fill && <polygon points={areaPts} fill={fill} opacity="0.18" />}
      <polyline points={pts} fill="none" stroke={stroke} strokeWidth="1.3" strokeLinejoin="round" />
      <circle cx={(values.length - 1) * stepX} cy={yOf(last)} r="1.8" fill={stroke} />
    </svg>
  );
}
