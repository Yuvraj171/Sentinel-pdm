// BackgroundMesh — atmospheric backdrop. Two soft glows + a grid + vignette.
// Glows breathe slowly (10s loop) via a CSS keyframe but stay cyan — the
// 3D scene carries the status colour, the page chrome stays calm.

export default function BackgroundMesh({ accent = '#06b6d4', intensity = 'full' }) {
  if (intensity === 'flat') return null;
  return (
    <div className="bg-mesh" aria-hidden="true">
      <div className="bg-mesh-grid" />
      <div
        className="bg-mesh-glow bg-mesh-glow-1 bg-mesh-breathe"
        style={{ background: `radial-gradient(closest-side, ${accent}26, transparent 70%)` }}
      />
      <div
        className="bg-mesh-glow bg-mesh-glow-2 bg-mesh-breathe bg-mesh-breathe-off"
        style={{ background: 'radial-gradient(closest-side, #22d3ee18, transparent 70%)' }}
      />
      <div className="bg-mesh-vignette" />
    </div>
  );
}
