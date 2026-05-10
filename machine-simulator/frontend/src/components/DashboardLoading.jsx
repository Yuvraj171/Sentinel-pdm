// Shared loading/error placeholder for the three dashboard tabs.
// Differentiates four situations based on what the simulator's
// /simulation/status reports and how long we've been waiting:
//   1. Initial connect — both services unknown.
//   2. Engine stopped — simulator running=false.
//   3. Simulator unreachable on :8000.
//   4. Simulator running but no scored predictions yet.
//
// Case 4 has two sub-states keyed off elapsed time:
//   <25s: "Starting up" — friendly, expected post-Fresh-start window.
//   >25s: "No predictions arriving" — actionable diagnostic naming the
//         most likely cause (poll.py isn't running) with the exact command
//         to start it. Without this escape hatch the friendly message
//         lingers indefinitely and looks like a stuck app.

import { useEffect, useState } from 'react';
import { useSimStatus } from '../lib/api.js';

const STARTING_UP_GRACE_SEC = 25;

export default function DashboardLoading({ initialLoading = false, hasError = false }) {
  const sim = useSimStatus();
  const [mountedAt] = useState(() => Date.now());
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 2000);
    return () => clearInterval(id);
  }, []);

  const elapsedSec = Math.floor((nowMs - mountedAt) / 1000);
  const simRunning = sim.data?.running === true;
  const simStopped = sim.data && sim.data.running === false;
  const simUnreachable = sim.isError || (!sim.data && !sim.isLoading);

  // Initial page load — we don't know yet what's happening.
  if (initialLoading && !sim.data) {
    return <div className="loading-card">Connecting…</div>;
  }

  // Engine explicitly stopped.
  if (simStopped) {
    return (
      <div className="loading-card-warm">
        <div className="loading-card-warm-title">Engine offline</div>
        <div className="loading-card-warm-sub">
          The simulator engine is stopped. Use Fresh start in the header to
          begin generating telemetry.
        </div>
      </div>
    );
  }

  // Simulator unreachable on :8000 (process down).
  if (simUnreachable) {
    return (
      <div className="loading-card">
        Simulator unreachable on :8000. Make sure the simulator service is
        running.
      </div>
    );
  }

  // Engine running but the AI engine has no scored rows yet. Two sub-cases.
  if (simRunning && hasError) {
    if (elapsedSec < STARTING_UP_GRACE_SEC) {
      return (
        <div className="loading-card-warm">
          <div className="loading-card-warm-title">Starting up</div>
          <div className="loading-card-warm-sub">
            Simulator is running. Waiting for the first scored prediction
            (usually 5–10 seconds after a fresh start).
          </div>
        </div>
      );
    }
    // Past the grace period — the prediction loop almost certainly isn't
    // running. Tell the user that explicitly, with the exact command.
    return (
      <div className="loading-card-warm loading-card-diag">
        <div className="loading-card-warm-title">No predictions arriving</div>
        <div className="loading-card-warm-sub">
          Telemetry is being generated, but the AI engine hasn't scored any
          rows in {elapsedSec}s. The most likely cause is the prediction
          loop (poll.py) isn't running.
        </div>
        <div className="loading-card-warm-hint">
          <div>Open a fresh terminal in the workspace root and run:</div>
          <code>cd pdm-ai-engine &amp;&amp; python -m sentinel_pdm.pipeline.poll</code>
          <div className="loading-card-warm-hint-foot">
            Also check that <span className="mono">pdm-ai-engine/models/</span> contains
            <span className="mono"> classifier.joblib</span> and
            <span className="mono"> anomaly.joblib</span>. If poll.py crashes on
            startup, the model files are missing or out of sync.
          </div>
        </div>
      </div>
    );
  }

  // AI engine error path (sim is fine, AI engine is broken or has no data).
  return (
    <div className="loading-card">
      AI engine returned no scored rows. Make sure the prediction loop
      (poll.py) is running.
    </div>
  );
}
