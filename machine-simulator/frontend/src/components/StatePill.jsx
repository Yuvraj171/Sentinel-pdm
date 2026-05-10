import { statusTokens } from '../lib/status.js';
import StatusDot from './StatusDot.jsx';

export default function StatePill({ state, status }) {
  const t = statusTokens(status);
  return (
    <div className="state-pill" style={{ borderColor: t.soft, background: t.bg }}>
      <StatusDot status={status} size={10} pulse />
      <span className="state-pill-label" style={{ color: t.fg }}>{state}</span>
    </div>
  );
}
