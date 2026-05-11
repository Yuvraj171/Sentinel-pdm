// useScrollProgress — tracks how far we've scrolled through a target element.
// Returns 0 when the element's top hits the bottom of the viewport, 1 when the
// element's bottom hits the top of the viewport. Used by ScrollyHero to drive
// the 3D camera waypoints.

import { useEffect, useRef, useState } from 'react';

export default function useScrollProgress() {
  const ref = useRef(null);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // Bail out under reduced-motion — just lock to 0 so consumers show the
    // default establishing-shot frame and the page scrolls normally below.
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      setProgress(0);
      return;
    }

    let raf = 0;
    const compute = () => {
      raf = 0;
      const rect = el.getBoundingClientRect();
      const vh = window.innerHeight;
      // The element starts contributing once its top is at vh, finishes once
      // its bottom is at 0. Span = rect.height + vh.
      const span = rect.height + vh;
      const traveled = vh - rect.top;
      const p = Math.max(0, Math.min(1, traveled / span));
      setProgress(p);
    };

    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(compute);
    };

    compute();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return { ref, progress };
}
