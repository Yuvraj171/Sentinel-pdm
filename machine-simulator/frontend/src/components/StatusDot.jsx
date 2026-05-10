import { statusTokens } from '../lib/status.js';

export default function StatusDot({ status, size = 8, pulse = false }) {
  const t = statusTokens(status);
  return (
    <span
      className="status-dot"
      style={{
        width: size,
        height: size,
        background: t.ring,
        boxShadow: `0 0 0 3px ${t.bg}, 0 0 12px ${t.ring}66`,
      }}
    >
      {pulse && <span className="status-dot-pulse" style={{ borderColor: t.ring }} />}
    </span>
  );
}
