// Status colour tokens + threshold helpers. Read once from a palette object so
// the accent colour (set elsewhere) never bleeds into the OK/WARNING/CRITICAL
// signals.

export const RISK_THRESHOLDS = {
  WARNING: 0.3,
  CRITICAL: 0.7,
};

export const PSI_THRESHOLDS = {
  WARNING: 0.1,
  CRITICAL: 0.2,
};

export function statusFromRisk(r) {
  if (r >= RISK_THRESHOLDS.CRITICAL) return 'CRITICAL';
  if (r >= RISK_THRESHOLDS.WARNING) return 'WARNING';
  return 'OK';
}

export function statusFromPsi(p) {
  if (p >= PSI_THRESHOLDS.CRITICAL) return 'CRITICAL';
  if (p >= PSI_THRESHOLDS.WARNING) return 'WARNING';
  return 'OK';
}

// Combined status that respects the cycle phase. Use this everywhere the
// dashboard shows a status pill / colour — passing only `risk` gives you
// "OK / Line running normally" while the machine is sitting in DOWN, which
// is the wrong story to tell an operator. HALTED takes precedence over
// any AI signal: when production is stopped, the only useful action is
// repair, regardless of what the model thinks.
export function statusFromRiskAndState(risk, machineState) {
  if (machineState === 'DOWN') return 'HALTED';
  return statusFromRisk(risk ?? 0);
}

export function statusTokens(status) {
  if (status === 'HALTED') {
    // Distinct from CRITICAL: same red family but darker/desaturated so
    // it visually reads as "stopped" rather than "alarming". Pairs with
    // explicit "Production halted" copy elsewhere in the UI.
    return {
      fg: '#fca5a5',
      bg: 'rgba(127,29,29,0.20)',
      ring: '#dc2626',
      soft: 'rgba(220,38,38,0.30)',
    };
  }
  if (status === 'CRITICAL') {
    return {
      fg: '#f87171',
      bg: 'rgba(239,68,68,0.12)',
      ring: '#ef4444',
      soft: 'rgba(239,68,68,0.20)',
    };
  }
  if (status === 'WARNING') {
    return {
      fg: '#fbbf24',
      bg: 'rgba(234,179,8,0.10)',
      ring: '#eab308',
      soft: 'rgba(234,179,8,0.20)',
    };
  }
  return {
    fg: '#86efac',
    bg: 'rgba(34,197,94,0.10)',
    ring: '#22c55e',
    soft: 'rgba(34,197,94,0.20)',
  };
}

// Plain-English label used in pills/banners. Centralised so the three
// dashboards say the same thing for the same state.
export function statusHeadline(status) {
  if (status === 'HALTED')   return 'PRODUCTION HALTED';
  if (status === 'CRITICAL') return 'CRITICAL';
  if (status === 'WARNING')  return 'WARNING';
  return 'OK';
}

export function statusSubline(status) {
  if (status === 'HALTED')   return 'Machine tripped — Repair to resume';
  if (status === 'CRITICAL') return 'Stop · call maintenance';
  if (status === 'WARNING')  return 'Watch closely';
  return 'Line running normally';
}

