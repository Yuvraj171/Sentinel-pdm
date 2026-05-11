import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

const ORANGE = new THREE.Color('#ff6a1a');
const AMBER  = new THREE.Color('#ffa033');
const RED    = new THREE.Color('#ff2a2a');

export default function Coil({ machineState = 'IDLE', riskScore = 0, aiStatus = 'OK', demoCoilMood = null }) {
  const lightRef = useRef();
  const targetColor = useMemo(() => new THREE.Color(), []);

  const material = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: '#b56b2a',
        metalness: 0.85,
        roughness: 0.32,
        emissive: ORANGE.clone(),
        emissiveIntensity: 0,
      }),
    [],
  );

  useFrame((_, dt) => {
    let target = 0;
    // Demo-mood overrides cycle-phase so the landing-page failure sequence
    // can drive the coil even though the page never enters HEATING etc.
    if (demoCoilMood === 'idle')      target = 1.1;
    else if (demoCoilMood === 'warn') target = 1.4;
    else if (demoCoilMood === 'crit') target = 1.6;
    else if (machineState === 'HEATING') target = 1.1;
    else if (machineState === 'QUENCH') target = 0.4;
    else if (machineState === 'IDLE') target = 0.2;
    else if (machineState === 'DOWN' || aiStatus === 'HALTED') target = 0;

    // Color: prefer demo mood, fall back to risk-driven lerp.
    if (demoCoilMood === 'warn') {
      targetColor.copy(AMBER);
    } else if (demoCoilMood === 'crit') {
      targetColor.copy(RED);
    } else {
      const tCol = THREE.MathUtils.clamp((riskScore - 0.3) / 0.4, 0, 1);
      targetColor.copy(ORANGE).lerp(RED, tCol);
    }

    const k = Math.min(1, dt * 4);
    material.emissiveIntensity = THREE.MathUtils.lerp(material.emissiveIntensity, target, k);
    material.emissive.lerp(targetColor, k);

    if (lightRef.current) {
      lightRef.current.intensity = material.emissiveIntensity * 1.8;
      lightRef.current.color.copy(material.emissive);
    }
  });

  return (
    <group position={[0, 0.55, 0]}>
      {/* 6 copper rings — enlarged 1.4×, more imposing solenoid */}
      {[0, 0.18, 0.36, 0.54, 0.72, 0.90].map((y, i) => (
        <mesh
          key={i}
          position={[0, y, 0]}
          rotation={[Math.PI / 2, 0, 0]}
          castShadow
          material={material}
        >
          <torusGeometry args={[0.72, 0.08, 24, 90]} />
        </mesh>
      ))}
      {/* Copper bus bars connecting rings on each side */}
      <mesh position={[ 0.72, 0.45, 0]} castShadow>
        <boxGeometry args={[0.04, 1.0, 0.04]} />
        <meshStandardMaterial color="#c2762e" metalness={0.92} roughness={0.22} />
      </mesh>
      <mesh position={[-0.72, 0.45, 0]} castShadow>
        <boxGeometry args={[0.04, 1.0, 0.04]} />
        <meshStandardMaterial color="#c2762e" metalness={0.92} roughness={0.22} />
      </mesh>
      {/* Center interior glow light — drives the dramatic glow effect */}
      <pointLight
        ref={lightRef}
        position={[0, 0.45, 0]}
        color={ORANGE}
        intensity={0}
        distance={6}
        decay={1.8}
      />
    </group>
  );
}
