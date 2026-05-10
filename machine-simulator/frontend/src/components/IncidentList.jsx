// Recent incidents — derives from the parts ticker, filtered to NG events.
// Each entry shows when, what reason, and the part_id when available.

import StatusDot from './StatusDot.jsx';

function fmtTime(ts) {
  return new Date(ts).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

const REASON_PLAIN = {
  under_quenched:  'Part under-quenched (coolant pump)',
  soft_part:       'Soft part (quench pressure)',
  uneven_hardness: 'Uneven hardness (power instability)',
  out_of_spec:     'Part out of spec',
  sensor_noise:    'Brief sensor noise — recovered',
};

export default function IncidentList({ incidents = [] }) {
  if (!incidents.length) {
    return (
      <div className="loading-card">
        No incidents. The line is producing OK parts.
      </div>
    );
  }
  // Keep most recent first.
  const sorted = [...incidents].sort((a, b) => (b.id ?? 0) - (a.id ?? 0)).slice(0, 8);
  return (
    <div className="incident-list">
      {sorted.map((i) => (
        <div key={i.id} className="incident-row">
          <StatusDot status="WARNING" size={8} />
          <span className="incident-time mono">{fmtTime(i.timestamp_sim)}</span>
          <span className="incident-reason">
            {REASON_PLAIN[i.ng_reason] ?? i.ng_reason ?? 'Reason not recorded'}
          </span>
        </div>
      ))}
    </div>
  );
}
