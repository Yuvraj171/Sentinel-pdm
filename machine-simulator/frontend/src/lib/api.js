// TanStack Query hooks against the AI engine + simulator.
//
// API endpoints come from Vite env vars so the same build can target local
// (default) or a deployed Cloud Run URL later.

import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';

const AI_BASE = import.meta.env.VITE_AI_API_URL ?? 'http://localhost:8100';
const SIM_BASE = import.meta.env.VITE_SIM_API_URL ?? 'http://localhost:8000';

async function getJSON(url) {
  const r = await fetch(url);
  if (!r.ok) {
    const body = await r.text().catch(() => '');
    throw new Error(`${r.status} ${r.statusText} ${body}`);
  }
  return r.json();
}

// All dashboard queries use placeholderData: keepPreviousData so transient
// 503s (e.g. the 5–10s window after Fresh start while poll.py catches up,
// or while reset is mid-flight) don't blank the UI. Without this, every
// failed refetch wipes data back to undefined and the page flashes blank
// before the next successful poll.
const KEEP_PREV = { placeholderData: keepPreviousData };

export function useRecentPredictions(limit = 60) {
  return useQuery({
    queryKey: ['recent-predictions', limit],
    queryFn: () => getJSON(`${AI_BASE}/api/recent-predictions?limit=${limit}`),
    refetchInterval: 2000,
    staleTime: 1500,
    ...KEEP_PREV,
  });
}

export function useDrift() {
  return useQuery({
    queryKey: ['drift'],
    queryFn: () => getJSON(`${AI_BASE}/api/drift`),
    refetchInterval: 30_000,
    staleTime: 25_000,
    ...KEEP_PREV,
  });
}

export function useProduction() {
  return useQuery({
    queryKey: ['production'],
    queryFn: () => getJSON(`${AI_BASE}/api/production`),
    refetchInterval: 5000,
    staleTime: 4500,
    ...KEEP_PREV,
  });
}

export function useNgPareto(windowRows = 3600) {
  return useQuery({
    queryKey: ['ng-pareto', windowRows],
    queryFn: () => getJSON(`${AI_BASE}/api/ng-pareto?window=${windowRows}`),
    refetchInterval: 10_000,
    staleTime: 9000,
    ...KEEP_PREV,
  });
}

export function useYieldTrend(buckets = 24, bucketSize = 3600) {
  return useQuery({
    queryKey: ['yield-trend', buckets, bucketSize],
    queryFn: () => getJSON(`${AI_BASE}/api/yield-trend?buckets=${buckets}&bucket_size=${bucketSize}`),
    refetchInterval: 30_000,
    staleTime: 25_000,
    ...KEEP_PREV,
  });
}

// Polls the simulator (NOT the AI engine) for real-time cycle anatomy data
// — phase, elapsed_in_state, batch progress. Keep refetch tight (1s) so the
// progress bar moves smoothly.
export function useSimStatus() {
  return useQuery({
    queryKey: ['sim-status'],
    queryFn: () => getJSON(`${SIM_BASE}/simulation/status`),
    refetchInterval: 1000,
    staleTime: 800,
  });
}

export function useInjectFailure() {
  return useMutation({
    mutationFn: async ({ mode, onsetSeconds }) => {
      const url = new URL(`${SIM_BASE}/simulation/inject-failure`);
      url.searchParams.set('mode', mode);
      url.searchParams.set('onset_seconds', String(onsetSeconds));
      const r = await fetch(url, { method: 'POST' });
      if (!r.ok) {
        const body = await r.text().catch(() => '');
        throw new Error(`${r.status} ${r.statusText} ${body}`);
      }
      return r.json();
    },
  });
}

export function useClearFailure() {
  return useMutation({
    mutationFn: async () => {
      const r = await fetch(`${SIM_BASE}/simulation/clear-failure`, { method: 'POST' });
      if (!r.ok) throw new Error(`${r.status}`);
      return r.json();
    },
  });
}

// Repair: operator-style recovery from DOWN. Clears any active failure AND
// transitions the cycle from DOWN back to IDLE without resetting coil life,
// batch index, or ok/ng totals. Use this instead of fresh-start when you
// want to resume after a trip without losing shift production history.
// Translates raw repair error messages into operator-facing plain English.
// The endpoint now auto-restarts a crashed engine instead of 409-ing, so
// this is mainly a last-resort safety net for truly unexpected failures.
export function explainRepairError(err) {
  const msg = String(err?.message ?? '');
  if (msg.includes('engine is not running')) {
    return 'Simulator is offline. Use "Fresh start" in the header to restart it.';
  }
  if (msg.includes('Failed to fetch')) {
    return 'Simulator unreachable on :8000. Check that the backend is running.';
  }
  return msg.slice(0, 140) || 'Repair request failed.';
}

export function useRepair() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const r = await fetch(`${SIM_BASE}/simulation/repair`, { method: 'POST' });
      if (!r.ok) {
        const body = await r.text().catch(() => '');
        throw new Error(`${r.status} ${r.statusText} ${body}`);
      }
      return r.json();
    },
    onSuccess: () => {
      // Same query set as fresh-start — reflect post-repair state immediately.
      qc.invalidateQueries({ queryKey: ['recent-predictions'] });
      qc.invalidateQueries({ queryKey: ['production'] });
      qc.invalidateQueries({ queryKey: ['sim-status'] });
    },
  });
}

// Fresh-start: reset live telemetry, then start the engine again. Chains the
// two simulator calls and invalidates dashboard queries on success so the UI
// re-fetches immediately rather than waiting for the next polling tick.
export function useFreshStart() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const r1 = await fetch(`${SIM_BASE}/simulation/reset`, { method: 'POST' });
      if (!r1.ok) {
        const body = await r1.text().catch(() => '');
        throw new Error(`reset failed: ${r1.status} ${body}`);
      }
      const r2 = await fetch(`${SIM_BASE}/simulation/start`, { method: 'POST' });
      if (!r2.ok) {
        const body = await r2.text().catch(() => '');
        throw new Error(`start failed: ${r2.status} ${body}`);
      }
      return r2.json();
    },
    onSuccess: () => {
      // Clear the persisted alert log so the Maintenance tab starts fresh.
      localStorage.removeItem('sentinel-pdm:alerts');
      // Force-refresh the polling queries so the dashboard reflects the
      // post-reset state without waiting up to 30s for the next tick.
      qc.invalidateQueries({ queryKey: ['recent-predictions'] });
      qc.invalidateQueries({ queryKey: ['drift'] });
      qc.invalidateQueries({ queryKey: ['production'] });
      qc.invalidateQueries({ queryKey: ['ng-pareto'] });
      qc.invalidateQueries({ queryKey: ['yield-trend'] });
      qc.invalidateQueries({ queryKey: ['sim-status'] });
    },
  });
}
