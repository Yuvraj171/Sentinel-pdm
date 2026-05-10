// Three-tab bar: Plant (cumulative roll-up) | Operator (production) |
// Maintenance (engineer). Plant is the new default for repeat visitors;
// the saved-tab preference still wins if set.

const TABS = [
  { id: 'plant',       num: '01', label: 'Plant',       sub: 'Cumulative roll-up' },
  { id: 'operator',    num: '02', label: 'Operator',    sub: 'Production view' },
  { id: 'maintenance', num: '03', label: 'Maintenance', sub: 'Engineer view' },
];

export default function TabBar({ tab, onChange }) {
  return (
    <div className="tabbar">
      <div className="tabbar-inner">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`tab ${tab === t.id ? 'tab-on' : ''}`}
            onClick={() => onChange(t.id)}
          >
            <span className="tab-num">{t.num}</span>
            <span className="tab-label">{t.label}</span>
            <span className="tab-sub">{t.sub}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
