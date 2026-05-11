import { useMemo } from 'react';
import { Html, Line } from '@react-three/drei';

/**
 * Sensor HUD cards anchored to 3D points on the machine.
 *
 * Strategy: keep the idle hero quiet by showing ONE always-on card
 * (PART TEMP — the most diagnostic reading for an induction-hardening
 * cell). When the failure demo runs, expand to show the two diverging
 * sensors (coolant flow and pressure) so the failure story is legible.
 * Reset collapses back to just PART TEMP.
 */

const CARDS = {
  part_temp: {
    label:  'PART TEMP',
    unit:   '°C',
    // Coil mid-height. Card floats above-right, prominent solo position.
    anchor: [ 0.0, 0.85,  0.0],
    card:   [ 3.4, 3.0, -0.6],
  },
  flow: {
    label:  'COOLANT FLOW',
    unit:   'L/min',
    // Coolant pipes between control panel and coil.
    anchor: [-1.8, 0.46, 0.42],
    card:   [-4.8, 1.6,  0.0],
  },
  pressure: {
    label:  'PRESSURE',
    unit:   'bar',
    // Quench tank top.
    anchor: [ 2.6, 1.05, 0.0],
    card:   [ 5.0, 0.6,  0.0],
  },
};

const IDLE_VALUES = {
  part_temp: '921',
  flow:      '42',
  pressure:  '7.2',
};

function statusDot(aiStatus) {
  if (aiStatus === 'CRITICAL' || aiStatus === 'HALTED') return 'crit';
  if (aiStatus === 'WARNING')                           return 'warn';
  return '';
}

export default function SensorOverlays({
  values = null,
  machineState = 'IDLE',
  aiStatus = 'OK',
  demoMode = 'idle',
}) {
  const lineColor = useMemo(() => {
    if (aiStatus === 'CRITICAL' || machineState === 'DOWN') return '#ef4444';
    if (aiStatus === 'WARNING')  return '#f59e0b';
    return '#06b6d4';
  }, [aiStatus, machineState]);

  // Idle = just PART TEMP. Demo or recovery = expand to 3 cards.
  const visibleIds = demoMode === 'idle'
    ? ['part_temp']
    : ['part_temp', 'flow', 'pressure'];

  const dotClass = statusDot(aiStatus);

  return (
    <group>
      {visibleIds.map((id) => {
        const s = CARDS[id];
        const v = values?.[id] ?? IDLE_VALUES[id];
        return (
          <group key={id}>
            <Line
              points={[s.anchor, s.card]}
              color={lineColor}
              lineWidth={1}
              transparent
              opacity={0.45}
            />
            <mesh position={s.anchor}>
              <sphereGeometry args={[0.025, 10, 10]} />
              <meshBasicMaterial color={lineColor} toneMapped={false} />
            </mesh>
            <Html position={s.card} zIndexRange={[80, 0]} style={{ pointerEvents: 'none' }}>
              <div className="hud-card hud-card-anim">
                <div className="hud-card-stack">
                  <div className="hud-card-eyebrow">{s.label}</div>
                  <div className="hud-card-value">
                    {v}
                    <span className="hud-card-unit">{s.unit}</span>
                  </div>
                </div>
                <div className={`hud-card-dot ${dotClass}`} />
              </div>
            </Html>
          </group>
        );
      })}
    </group>
  );
}
