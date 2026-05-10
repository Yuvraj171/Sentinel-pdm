// Small dismissible banner for first-timers who landed on /dashboard
// directly (e.g. came back via the smart redirect after a previous visit but
// never actually walked through the tour). Dismissal persists in localStorage.

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { isBannerDismissed, dismissBanner } from '../lib/visited.js';

export default function TourBanner() {
  const [hidden, setHidden] = useState(() => isBannerDismissed());

  if (hidden) return null;

  const close = () => {
    dismissBanner();
    setHidden(true);
  };

  return (
    <div className="tour-banner" role="status">
      <span className="tour-banner-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="9" />
          <line x1="12" y1="11" x2="12" y2="16" />
          <circle cx="12" cy="8" r="0.6" fill="currentColor" />
        </svg>
      </span>
      <span className="tour-banner-text">
        New to Sentinel PdM? Take a 30-second tour to see how the AI scores risk.
      </span>
      <Link to="/about" className="tour-banner-cta">
        Open tour
        <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M5 12 H19 M13 6 L19 12 L13 18" />
        </svg>
      </Link>
      <button
        type="button"
        className="tour-banner-close"
        onClick={close}
        aria-label="Dismiss tour banner"
      >
        <svg viewBox="0 0 12 12" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="1.6">
          <line x1="3" y1="3" x2="9" y2="9" />
          <line x1="9" y1="3" x2="3" y2="9" />
        </svg>
      </button>
    </div>
  );
}
