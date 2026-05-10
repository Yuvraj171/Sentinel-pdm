// Browser-state preferences. All keys are scoped under sentinel-pdm: so any
// reset just runs `localStorage.clear()` or removes the matching keys.
//
// To re-test the first-visit experience, run in DevTools:
//     Object.keys(localStorage).filter(k => k.startsWith('sentinel-pdm:'))
//       .forEach(k => localStorage.removeItem(k));

const VISITED_KEY = 'sentinel-pdm:visited';
const TAB_KEY     = 'sentinel-pdm:tab';
const BANNER_KEY  = 'sentinel-pdm:tour-banner-dismissed';

function safeGet(key) {
  if (typeof window === 'undefined') return null;
  try { return window.localStorage.getItem(key); } catch { return null; }
}

function safeSet(key, value) {
  if (typeof window === 'undefined') return;
  try { window.localStorage.setItem(key, value); } catch { /* private mode etc. */ }
}

// First-visit gate
export function hasVisited() {
  return safeGet(VISITED_KEY) === '1';
}
export function markVisited() {
  safeSet(VISITED_KEY, '1');
}

// Last-used dashboard tab
const VALID_TABS = ['plant', 'operator', 'maintenance'];

export function loadSavedTab() {
  const v = safeGet(TAB_KEY);
  return VALID_TABS.includes(v) ? v : null;
}
export function saveTab(tab) {
  if (VALID_TABS.includes(tab)) safeSet(TAB_KEY, tab);
}

// First-timer "take the tour" banner
export function isBannerDismissed() {
  return safeGet(BANNER_KEY) === '1';
}
export function dismissBanner() {
  safeSet(BANNER_KEY, '1');
}
