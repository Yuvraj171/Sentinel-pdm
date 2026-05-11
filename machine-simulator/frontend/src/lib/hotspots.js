// Shared hotspot data — consumed by the LandingPage hero scene.
// `x` / `y` are in the legacy 0..960 / 0..420 SVG viewbox so callers can either
// keep the SVG overlay or project the same anchors into 3D world space.

export const HOTSPOTS = [
  { id: 'coil',     x: 420, y: 200, label: 'Induction coil',  desc: 'A copper coil generates a magnetic field that heats the steel part to ~920 °C in seconds.' },
  { id: 'quench',   x: 640, y: 240, label: 'Quench tank',     desc: 'Cool water is sprayed onto the hot part to lock in hardness. Coolant flow is critical.' },
  { id: 'conveyor', x: 250, y: 300, label: 'Conveyor',        desc: 'Carries each part through the coil at a precise speed.' },
  { id: 'control',  x: 160, y: 280, label: 'Control cabinet', desc: 'Reads every sensor and runs the AI model that scores risk every 5 seconds.' },
  { id: 'sensors',  x: 760, y: 260, label: 'Sensor array',    desc: 'Eight sensors monitor power, voltage, temperature, flow, pressure, speed and vibration.' },
];

// 3D world-space anchors used by <Hotspots> in the new R3F scene.
// Coordinates are tuned to sit on the corresponding mesh in Machine3D/index.jsx.
export const HOTSPOT_3D = {
  coil:     [ 0.0,  1.55,  0.0],
  quench:   [ 2.6,  1.05,  0.0],
  conveyor: [-1.4,  0.45,  0.0],
  control:  [-3.4,  1.45,  0.0],
  sensors:  [ 2.6,  1.35, -0.65],
};
