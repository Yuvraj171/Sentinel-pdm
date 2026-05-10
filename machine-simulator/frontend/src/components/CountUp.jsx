import { useEffect, useRef, useState } from 'react';

export default function CountUp({
  to, decimals = 0, duration = 700, prefix = '', suffix = '', className,
}) {
  const [v, setV] = useState(typeof to === 'number' ? to : 0);
  const fromRef = useRef(0);
  const startRef = useRef(0);
  const rafRef = useRef(0);

  useEffect(() => {
    if (typeof to !== 'number' || Number.isNaN(to)) return undefined;
    cancelAnimationFrame(rafRef.current);
    fromRef.current = v;
    startRef.current = performance.now();
    const tick = (now) => {
      const p = Math.min(1, (now - startRef.current) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setV(fromRef.current + (to - fromRef.current) * eased);
      if (p < 1) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
    // v intentionally omitted — animating from previous v to new to.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [to, duration]);

  return (
    <span className={className}>
      {prefix}{v.toFixed(decimals)}{suffix}
    </span>
  );
}
