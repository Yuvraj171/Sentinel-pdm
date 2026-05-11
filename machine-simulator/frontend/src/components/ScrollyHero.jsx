// ScrollyHero — wraps the hero in a tall scroll zone with a sticky inner
// viewport. As the user scrolls, useScrollProgress returns 0→1 and we feed
// that into:
//   - the 3D Scene3D camera (cameraProgress prop)
//   - cross-faded caption captions overlaid on the canvas
// On reduced-motion, the spacer collapses and the hero behaves like a
// regular static section.

import { useMemo } from 'react';
import useScrollProgress from '../lib/useScrollProgress.js';

const CAPTIONS = [
  { from: 0.10, to: 0.32, text: 'Watching an induction-hardening cell every five seconds.' },
  { from: 0.32, to: 0.58, text: 'Eight sensors. Nineteen features. One model.' },
  { from: 0.58, to: 0.82, text: 'One risk score — between 0 and 1 — a person can act on.' },
  { from: 0.82, to: 1.00, text: 'Catch the failure before it happens.' },
];

// Smooth fade-in/out window for a caption.
function captionOpacity(p, from, to) {
  if (p < from || p > to) return 0;
  const span = to - from;
  const local = (p - from) / span;
  // Triangle wave: 0 → 1 in first half, 1 → 0 in second half, with a flat top.
  if (local < 0.25) return local / 0.25;
  if (local > 0.75) return (1 - local) / 0.25;
  return 1;
}

export default function ScrollyHero({ children, onProgress }) {
  const { ref, progress } = useScrollProgress();

  // Push progress out to whoever needs it (LandingPage forwards to Scene3D).
  useMemo(() => { onProgress?.(progress); }, [progress, onProgress]);

  return (
    <div className="scrolly" ref={ref}>
      <div className="scrolly-sticky">
        {children}
        <div className="scrolly-captions" aria-hidden="true">
          {CAPTIONS.map((c, i) => (
            <div
              key={i}
              className="scrolly-caption"
              style={{ opacity: captionOpacity(progress, c.from, c.to) }}
            >
              {c.text}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
