// Upcoming work — next 3-4 batches scheduled. Currently a frontend mock
// (the simulator has no schedule concept). Renders as a vertical list of
// batch cards.

export default function UpcomingSchedule({ recipes = [], accent = '#06b6d4' }) {
  if (!recipes.length) {
    return <div className="loading-card">No upcoming work scheduled.</div>;
  }
  return (
    <div className="schedule-list">
      {recipes.map((r, i) => (
        <div key={r.batchId} className={`schedule-row ${i === 0 ? 'schedule-row-next' : ''}`}>
          <div className="schedule-row-l">
            <span className="schedule-when mono">{r.startsHM}</span>
            {i === 0 && <span className="schedule-next-tag" style={{ color: accent, borderColor: accent }}>NEXT</span>}
          </div>
          <div className="schedule-row-m">
            <div className="schedule-batch mono">{r.batchId}</div>
            <div className="schedule-recipe">Recipe {r.recipe} · {r.spec}</div>
          </div>
          <div className="schedule-row-r mono">{r.target} parts</div>
        </div>
      ))}
    </div>
  );
}
