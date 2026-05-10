// Up/down delta badge. `invert` flips the good/bad mapping (e.g., for cycle
// time, going UP is bad — pass invert).

export default function DeltaBadge({ value, decimals = 2, suffix = '', invert = false, label = 'vs 1h' }) {
  if (value === 0 || value == null || Number.isNaN(value)) {
    return <span className="dlt dlt-zero">— flat</span>;
  }
  const positive = value > 0;
  const bad = invert ? !positive : positive;
  return (
    <span className={`dlt ${bad ? 'dlt-bad' : 'dlt-good'}`}>
      <svg viewBox="0 0 10 10" width="9" height="9">
        {positive
          ? <path d="M5 1.5 L9 7 L1 7 Z" fill="currentColor" />
          : <path d="M5 8.5 L9 3 L1 3 Z" fill="currentColor" />}
      </svg>
      {Math.abs(value).toFixed(decimals)}{suffix} {label}
    </span>
  );
}
