// StickyRiskGauge — small fixed-position risk indicator that follows the
// user once they've scrolled past the hero. Subscribes to demoMode so it
// climbs during a staged failure exactly in sync with the ticker and the
// 3D coil.

import { useEffect, useRef, useState } from 'react';
import RiskGauge from './RiskGauge.jsx';
import { useDemoMode } from '../lib/demoMode.js';

export default function StickyRiskGauge() {
  const [visible, setVisible] = useState(false);
  const demo = useDemoMode();
  const sentinelRef = useRef(null);

  useEffect(() => {
    // Place a sentinel ~80vh down the page; when it leaves the top of the
    // viewport (user has scrolled past the hero), reveal the gauge.
    const el = sentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => setVisible(!entry.isIntersecting),
      { rootMargin: '-15% 0px 0px 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const scrollToTop = () => window.scrollTo({ top: 0, behavior: 'smooth' });

  return (
    <>
      <div ref={sentinelRef} aria-hidden="true" style={{ position: 'absolute', top: '60vh', height: 1, width: 1, pointerEvents: 'none' }} />
      <button
        type="button"
        className={`sticky-gauge ${visible ? 'is-in' : ''}`}
        onClick={scrollToTop}
        aria-label={`Current risk score ${demo.risk.toFixed(2)}, status ${demo.aiStatus}. Click to return to top.`}
      >
        <RiskGauge value={demo.risk} intensity="flat" size={96} />
      </button>
    </>
  );
}
