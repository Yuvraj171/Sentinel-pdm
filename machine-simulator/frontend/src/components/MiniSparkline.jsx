// MiniSparkline — fixed-size SVG sparkline for the ticker bar.
// Maintains its own rolling buffer of the most recent N values. Caller
// passes the latest value; we push it onto the buffer on each render.

import { useEffect, useRef } from 'react';

const N = 28;

export default function MiniSparkline({
  value,
  min,
  max,
  width = 84,
  height = 22,
  color = '#06b6d4',
}) {
  // Use a ref so we don't trigger re-renders on every push — we re-render
  // anyway whenever `value` changes from the parent.
  const buf = useRef(Array.from({ length: N }, () => value));

  // Push new value on each render; cap length at N.
  buf.current = [...buf.current.slice(-N + 1), value];

  // Y-axis: prefer caller-supplied min/max for stable scale, otherwise
  // auto-scale from the current buffer so each sparkline fills its space.
  const arr = buf.current;
  const lo = min != null ? min : Math.min(...arr);
  const hi = max != null ? max : Math.max(...arr);
  const span = hi - lo || 1;

  // Build the polyline points. Leave 2px top/bottom padding.
  const padY = 2;
  const innerH = height - padY * 2;
  const pts = arr.map((v, i) => {
    const x = (i / (N - 1)) * width;
    const y = padY + innerH - ((v - lo) / span) * innerH;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');

  // Endpoint dot
  const lastX = width;
  const lastY = padY + innerH - ((arr[arr.length - 1] - lo) / span) * innerH;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      style={{ display: 'block', overflow: 'visible' }}
      aria-hidden="true"
    >
      <polyline
        points={pts}
        fill="none"
        stroke={color}
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.85"
      />
      <circle cx={lastX} cy={lastY} r="1.8" fill={color} />
    </svg>
  );
}
