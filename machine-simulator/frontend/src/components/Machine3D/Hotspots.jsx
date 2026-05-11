import { useState, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import { DoubleSide } from 'three';
import { HOTSPOT_3D } from '../../lib/hotspots.js';

const ACCENT = '#06b6d4';

function Marker({ id, label, desc }) {
  const [hover, setHover] = useState(false);
  const ringRef = useRef();
  const ringMatRef = useRef();
  const t = useRef(0);

  const pos = HOTSPOT_3D[id] || [0, 0, 0];

  useFrame((_, dt) => {
    t.current += dt;
    if (ringRef.current && ringMatRef.current && !hover) {
      const s = 1 + ((Math.sin(t.current * 2.5) + 1) * 0.5) * 1.2;
      ringRef.current.scale.set(s, s, s);
      ringMatRef.current.opacity = 0.6 - (s - 1) * 0.5;
    }
  });

  return (
    <group
      position={pos}
      onPointerEnter={(e) => { e.stopPropagation(); setHover(true); }}
      onPointerLeave={() => setHover(false)}
    >
      {/* Hit target — invisible but catches pointer events */}
      <mesh>
        <sphereGeometry args={[0.18, 12, 12]} />
        <meshBasicMaterial transparent opacity={0} />
      </mesh>
      {/* Visible core dot */}
      <mesh>
        <sphereGeometry args={[0.05, 16, 16]} />
        <meshBasicMaterial color={ACCENT} toneMapped={false} />
      </mesh>
      {/* Ring */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.001, 0]}>
        <ringGeometry args={[0.08, 0.095, 32]} />
        <meshBasicMaterial color={ACCENT} transparent opacity={0.9} side={DoubleSide} />
      </mesh>
      {/* Pulsing ripple (hides on hover) */}
      {!hover && (
        <mesh ref={ringRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.001, 0]}>
          <ringGeometry args={[0.08, 0.1, 32]} />
          <meshBasicMaterial
            ref={ringMatRef}
            color={ACCENT}
            transparent
            opacity={0.6}
            side={DoubleSide}
          />
        </mesh>
      )}
      {hover && (
        <Html
          position={[0, 0.28, 0]}
          center
          zIndexRange={[100, 0]}
          style={{ pointerEvents: 'none', userSelect: 'none' }}
        >
          <div className="lp-tip lp-tip-3d">
            <div className="lp-tip-eyebrow">{id.toUpperCase()}</div>
            <div className="lp-tip-title">{label}</div>
            <div className="lp-tip-desc">{desc}</div>
          </div>
        </Html>
      )}
    </group>
  );
}

export default function Hotspots({ hotspots = [] }) {
  return (
    <group>
      {hotspots.map((h) => (
        <Marker key={h.id} {...h} />
      ))}
    </group>
  );
}
