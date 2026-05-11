// useCursor — global cursor tracker. Returns normalized {x, y} in [-1, 1]
// where (0, 0) is the centre of the viewport. Disabled on coarse-pointer
// (touch) devices since cursor parallax there is meaningless.

import { useEffect, useRef } from 'react';

export default function useCursor() {
  // Ref instead of state so we don't re-render on every mouse move.
  // Consumers read the current value imperatively (e.g. inside useFrame).
  const cursor = useRef({ x: 0, y: 0 });

  useEffect(() => {
    if (window.matchMedia?.('(pointer: coarse)').matches) return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;

    const onMove = (e) => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      cursor.current.x = (e.clientX / w) * 2 - 1;
      cursor.current.y = (e.clientY / h) * 2 - 1;
      // Push to CSS variables so non-React DOM can react (text counter-parallax).
      document.documentElement.style.setProperty('--mx', cursor.current.x.toFixed(3));
      document.documentElement.style.setProperty('--my', cursor.current.y.toFixed(3));
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    return () => window.removeEventListener('pointermove', onMove);
  }, []);

  return cursor;
}
