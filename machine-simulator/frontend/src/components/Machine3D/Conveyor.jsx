import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import { colorModel } from './colorModel.js';

const SEGMENTS = 7;
const SEG_W    = 2.0;
const SEG_S    = 0.52;
const OFFSET   = -(SEGMENTS * SEG_W * SEG_S) / 2;

export default function Conveyor({ machineState = 'IDLE' }) {
  const { scene } = useGLTF('/models/kenney/conveyor-long-sides.glb');

  // One dark-steel clone per segment — low-poly so memory cost is trivial.
  const segments = useMemo(
    () => Array.from({ length: SEGMENTS }, () =>
      colorModel(scene, '#3e4658', 0.72, 0.46)
    ),
    [scene],
  );

  const groupRef = useRef();
  useFrame(() => {
    if (!groupRef.current) return;
    // Subtle Y vibration while running — makes the belt feel alive.
    const running = machineState !== 'IDLE' && machineState !== 'DOWN';
    groupRef.current.position.y = running ? Math.sin(Date.now() / 380) * 0.0015 : 0;
  });

  return (
    <group ref={groupRef}>
      {segments.map((seg, i) => (
        <primitive
          key={i}
          object={seg}
          scale={SEG_S}
          position={[OFFSET + i * SEG_W * SEG_S, 0, 0]}
        />
      ))}
    </group>
  );
}
