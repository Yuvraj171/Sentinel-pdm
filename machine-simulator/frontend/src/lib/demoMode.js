// demoMode — single source of truth for the landing page's staged "live"
// state. Every subscriber (ticker bar, sticky risk gauge, 3D coil, sensor
// HUD cards, background mesh) reads from this so a single state change
// animates the whole page in lockstep.
//
// Two modes:
//   'idle' — sensors jitter around baseline, risk ≈ 0.18, status OK
//   'demo' — scripted ~10s failure sequence driven by a rAF loop
//
// Subscriptions use useSyncExternalStore so consumers re-render only when
// the relevant slice changes. No new dependency.

import { useSyncExternalStore } from 'react';

// ------- Baselines ----------------------------------------------------------

export const BASELINES = {
  power:     94,    // kW
  part_temp: 921,   // °C
  flow:      42,    // L/min
  pressure:  7.2,   // bar
  vibration: 1.2,   // mm/s
};

// Small per-sensor jitter amplitudes used in idle mode.
const JITTER = {
  power:     1.4,
  part_temp: 4.0,
  flow:      0.6,
  pressure:  0.12,
  vibration: 0.18,
};

// ------- Failure sequence keyframes ----------------------------------------
// Each entry: { t, sensors, risk, aiStatus, coilMood, caption }. The runtime
// lerps linearly between consecutive entries on each rAF tick.
const SEQUENCE = [
  { t: 0.0, sensors: { ...BASELINES },
    risk: 0.18, aiStatus: 'OK',       coilMood: 'idle',  caption: 'Watching the system in real time.' },
  { t: 1.5, sensors: { power: 94, part_temp: 945, flow: 31, pressure: 7.1, vibration: 1.3 },
    risk: 0.32, aiStatus: 'WARNING',  coilMood: 'warn',  caption: 'Coolant flow dipping. Pattern matches coolant-pump degradation.' },
  { t: 4.5, sensors: { power: 92, part_temp: 980, flow: 27, pressure: 6.6, vibration: 1.6 },
    risk: 0.68, aiStatus: 'WARNING',  coilMood: 'warn',  caption: 'Model alert: predicted failure in ~11 min.' },
  { t: 7.0, sensors: { power: 90, part_temp: 1020, flow: 24, pressure: 5.9, vibration: 2.4 },
    risk: 0.88, aiStatus: 'CRITICAL', coilMood: 'crit',  caption: 'Risk crossed CRITICAL. In production, the line would auto-halt.' },
  { t: 9.5, sensors: { power: 90, part_temp: 1020, flow: 24, pressure: 5.9, vibration: 2.4 },
    risk: 0.88, aiStatus: 'CRITICAL', coilMood: 'crit',  caption: 'Caught 11 minutes before failure.' },
];
export const DEMO_DURATION_S = SEQUENCE[SEQUENCE.length - 1].t + 0.5;

// ------- Store --------------------------------------------------------------

let state = {
  mode:      'idle',         // 'idle' | 'demo' | 'resetting'
  sensors:   { ...BASELINES },
  risk:      0.18,
  aiStatus:  'OK',
  coilMood:  'idle',         // 'idle' | 'warn' | 'crit'
  caption:   null,
  demoElapsed: 0,            // seconds into demo / reset
};

const listeners = new Set();
function emit() {
  // Replace the state object so useSyncExternalStore can shallow-compare.
  state = { ...state };
  listeners.forEach((l) => l());
}
function subscribe(l) { listeners.add(l); return () => listeners.delete(l); }
function getSnapshot() { return state; }

// ------- Idle jitter --------------------------------------------------------
// Once per ~500ms, perturb each sensor toward a small random offset from
// baseline. Cheap; runs always (even during demo) but the demo-mode setter
// overrides sensors so jitter is invisible there.
let jitterInterval = null;
let lastJitter = { ...BASELINES };

function tickJitter() {
  if (state.mode !== 'idle') return;
  const next = {};
  for (const key of Object.keys(BASELINES)) {
    // Random walk that drifts back toward baseline.
    const prev = lastJitter[key];
    const towardBaseline = (BASELINES[key] - prev) * 0.25;
    const wobble = (Math.random() - 0.5) * 2 * JITTER[key];
    next[key] = prev + towardBaseline + wobble;
  }
  lastJitter = next;
  state.sensors = next;
  emit();
}

function ensureJitter() {
  if (jitterInterval) return;
  jitterInterval = setInterval(tickJitter, 500);
}

// ------- Demo runtime -------------------------------------------------------

let demoRaf = 0;
let demoStartedAt = 0;

function lerp(a, b, t) { return a + (b - a) * t; }
function lerpSensors(s0, s1, t) {
  const out = {};
  for (const k of Object.keys(BASELINES)) out[k] = lerp(s0[k] ?? BASELINES[k], s1[k] ?? BASELINES[k], t);
  return out;
}

function sampleSequence(elapsed) {
  if (elapsed <= SEQUENCE[0].t) return { ...SEQUENCE[0], elapsed };
  for (let i = 0; i < SEQUENCE.length - 1; i++) {
    const a = SEQUENCE[i], b = SEQUENCE[i + 1];
    if (elapsed >= a.t && elapsed <= b.t) {
      const span = b.t - a.t;
      const t = span > 0 ? (elapsed - a.t) / span : 1;
      // Categorical fields snap to the leading keyframe so captions don't blend.
      return {
        sensors:  lerpSensors(a.sensors, b.sensors, t),
        risk:     lerp(a.risk, b.risk, t),
        aiStatus: b.aiStatus,
        coilMood: b.coilMood,
        caption:  b.caption,
        elapsed,
      };
    }
  }
  return { ...SEQUENCE[SEQUENCE.length - 1], elapsed };
}

function tickDemo(now) {
  const elapsed = (now - demoStartedAt) / 1000;
  const snap = sampleSequence(elapsed);
  state.sensors    = snap.sensors;
  state.risk       = snap.risk;
  state.aiStatus   = snap.aiStatus;
  state.coilMood   = snap.coilMood;
  state.caption    = snap.caption;
  state.demoElapsed = elapsed;
  emit();
  if (elapsed < DEMO_DURATION_S) {
    demoRaf = requestAnimationFrame(tickDemo);
  } else {
    // Demo hits its hold-frame; we let the user click Reset.
    demoRaf = 0;
  }
}

let resetRaf = 0;
let resetStartedAt = 0;
const RESET_DURATION_S = 2.0;
let resetFrom = null;
function tickReset(now) {
  const elapsed = (now - resetStartedAt) / 1000;
  const t = Math.min(1, elapsed / RESET_DURATION_S);
  // Ease-out cubic so it settles softly.
  const eased = 1 - Math.pow(1 - t, 3);
  state.sensors  = lerpSensors(resetFrom.sensors,  BASELINES, eased);
  state.risk     = lerp(resetFrom.risk, 0.18, eased);
  state.aiStatus = eased > 0.8 ? 'OK' : resetFrom.aiStatus;
  state.coilMood = eased > 0.8 ? 'idle' : resetFrom.coilMood;
  state.caption  = eased < 0.6 ? 'System recovering…' : null;
  emit();
  if (t < 1) {
    resetRaf = requestAnimationFrame(tickReset);
  } else {
    state.mode = 'idle';
    state.caption = null;
    lastJitter = { ...BASELINES };
    emit();
    resetRaf = 0;
  }
}

// ------- Public API --------------------------------------------------------

export function startDemo() {
  if (state.mode === 'demo' || state.mode === 'resetting') return;
  state.mode = 'demo';
  demoStartedAt = performance.now();
  demoRaf = requestAnimationFrame(tickDemo);
  emit();
}

export function resetDemo() {
  if (state.mode === 'idle') return;
  if (demoRaf) { cancelAnimationFrame(demoRaf); demoRaf = 0; }
  resetFrom = {
    sensors:  { ...state.sensors },
    risk:     state.risk,
    aiStatus: state.aiStatus,
    coilMood: state.coilMood,
  };
  state.mode = 'resetting';
  resetStartedAt = performance.now();
  resetRaf = requestAnimationFrame(tickReset);
  emit();
}

export function useDemoMode() {
  ensureJitter();
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

// Compatibility: directly read once (e.g. for a one-shot SSR-safe init).
export function getDemoState() { return state; }
