// Persistent alert log — accumulates state-change events across the session.
//
// Design contract:
//   - Entries are appended when machine status escalates (OK→WARNING, WARNING→CRITICAL,
//     anything→HALTED) or when the first NG part appears in a new failure cascade.
//   - Entries are NEVER removed when the machine recovers (repair). This matches how
//     a real plant historian works: you can repair the machine but you can't erase
//     the event from the log.
//   - The log IS cleared on Fresh Start (useFreshStart onSuccess does this in api.js).
//   - Stored in localStorage so the log survives browser refresh.

import { useEffect, useRef, useState } from 'react';

const STORAGE_KEY = 'sentinel-pdm:alerts';
const MAX_LOG = 50; // keep at most N entries to avoid unbounded growth

function loadLog() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveLog(log) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(log.slice(-MAX_LOG)));
  } catch {
    // localStorage quota exceeded — drop silently
  }
}

// severity ordering: higher = worse
const SEV_ORDER = { OK: 0, WARNING: 1, CRITICAL: 2, HALTED: 3 };

// Suspect sensor per status (rough heuristic for the plain-English copy).
function suspectOf(status, downtime_reason, ng_reason) {
  if (status === 'HALTED') return downtime_reason ?? 'machine tripped';
  if (ng_reason) return ng_reason;
  if (status === 'CRITICAL') return 'quench_water_flow';
  return 'sensor drift';
}

function plainOf(status, risk, ng_reason, downtime_reason) {
  if (status === 'HALTED') return `Machine tripped — ${downtime_reason ?? 'failure'}`;
  if (status === 'CRITICAL') return `Risk ${risk.toFixed(2)} — stop production`;
  if (status === 'WARNING') return `Risk ${risk.toFixed(2)} — sensor drift detected`;
  return 'System OK';
}

// useAlertLog(status, risk, ng_reason, downtime_reason)
// Returns a stable array of alert objects, newest first.
// Objects: { ts_ms, severity, risk, suspect, plain }
export function useAlertLog(status, risk, ng_reason, downtime_reason) {
  const [log, setLog] = useState(loadLog);
  const prevStatusRef = useRef(status);
  const prevNgReasonRef = useRef(ng_reason);

  useEffect(() => {
    const prevStatus = prevStatusRef.current;
    const prevNg = prevNgReasonRef.current;
    prevStatusRef.current = status;
    prevNgReasonRef.current = ng_reason;

    const newEntries = [];
    const now = Date.now();

    // Escalation: status got worse
    if (SEV_ORDER[status] > SEV_ORDER[prevStatus]) {
      newEntries.push({
        ts_ms: now,
        severity: status,
        risk: risk ?? 0,
        suspect: suspectOf(status, downtime_reason, ng_reason),
        plain: plainOf(status, risk ?? 0, ng_reason, downtime_reason),
      });
    }

    // New NG reason appeared — log it regardless of AI status so the first NG
    // is captured even before the risk score has climbed past the OK threshold.
    if (ng_reason && ng_reason !== prevNg) {
      newEntries.push({
        ts_ms: now - 1, // 1ms before so it sorts below the status event
        severity: 'WARNING',
        risk: risk ?? 0,
        suspect: ng_reason,
        plain: `NG part — ${ng_reason}`,
      });
    }

    if (newEntries.length === 0) return;

    setLog((prev) => {
      const next = [...prev, ...newEntries].slice(-MAX_LOG);
      saveLog(next);
      return next;
    });
  }, [status, risk, ng_reason, downtime_reason]);

  // Return newest first (most recent at the top of the list).
  return [...log].reverse();
}
