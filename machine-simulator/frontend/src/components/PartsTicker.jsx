// Live ticker showing the last N parts as colored cells (green = OK, red = NG).
// Updates as the production polling hook returns new data. When running, the
// newest part gets a ring so the eye finds "now" instantly. When halted, the
// ring is suppressed — nothing is in progress — and a HALTED pill is shown
// instead so it's clear the machine has stopped making parts.

const SLOTS = 30;

export default function PartsTicker({ parts = [], halted = false }) {
  // Pad to SLOTS so the row width is stable when the line first starts up.
  const padded = parts.length >= SLOTS
    ? parts.slice(-SLOTS)
    : [...Array(SLOTS - parts.length).fill(null), ...parts];

  const okCount = parts.filter((p) => p && p.part_status === 'OK').length;
  const ngCount = parts.filter((p) => p && p.part_status === 'NG').length;
  const total = okCount + ngCount;

  const headLabel = parts.length === 0
    ? `Last ${SLOTS} parts · awaiting first part`
    : parts.length < SLOTS
      ? `Last ${parts.length} parts · ${halted ? 'halted' : 'live'}`
      : `Last ${SLOTS} parts · ${halted ? 'halted' : 'live'}`;

  return (
    <div className="op-ticker">
      <div className="op-ticker-head">
        <div className="op-ticker-eyebrow">{headLabel}</div>
        <div className="op-ticker-meta">
          {halted
            ? <span className="op-ticker-halted-pill">● HALTED — no new parts</span>
            : total > 0 ? `${okCount} OK · ${ngCount} NG` : 'awaiting data'}
        </div>
      </div>
      <div className="op-ticker-row" role="list">
        {padded.map((p, i) => {
          if (p == null) {
            return <div key={i} className="op-ticker-cell op-ticker-cell-empty" role="listitem" />;
          }
          const cls = p.part_status === 'OK'
            ? 'op-ticker-cell op-ticker-cell-ok'
            : 'op-ticker-cell op-ticker-cell-ng';
          // Suppress the "newest" ring when halted: nothing is being produced
          // and the ring would imply a cycle is currently in progress.
          const newest = !halted && i === padded.length - 1;
          const title = `${p.part_status}${p.ng_reason ? ` · ${p.ng_reason}` : ''}`;
          return (
            <div
              key={p.id ?? i}
              className={`${cls}${newest ? ' op-ticker-cell-newest' : ''}`}
              title={title}
              role="listitem"
            />
          );
        })}
      </div>
      <div className="op-ticker-foot">
        <span><span className="op-ticker-foot-sw" style={{ background: 'rgba(34,197,94,0.55)' }} />OK part</span>
        <span><span className="op-ticker-foot-sw" style={{ background: 'rgba(239,68,68,0.65)' }} />NG part</span>
        <span><span className="op-ticker-foot-sw" style={{ background: 'rgba(255,255,255,0.04)' }} />no data</span>
      </div>
    </div>
  );
}
