import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { colorModel } from './colorModel.js';

const WATER = new THREE.Color('#0ea5b7');
const TANK_S = 1.35;
// Kenney hopper-high-square: approx 1 unit wide × ~1.85 tall × 1 deep at scale 1.
// Water sits just below the top rim.
const WATER_Y = 1.85 * TANK_S * 0.52;

export default function QuenchTank({ machineState = 'IDLE' }) {
  const { scene } = useGLTF('/models/kenney/hopper-high-square.glb');
  const tankScene = useMemo(() =>
    colorModel(scene, '#384a5e', 0.7, 0.4), [scene]);

  const planeRef = useRef();
  const lightRef = useRef();
  const t = useRef(0);

  const baseGeom = useMemo(() => {
    const g = new THREE.PlaneGeometry(1.25 * TANK_S, 0.95 * TANK_S, 28, 20);
    g.userData.base = Float32Array.from(g.attributes.position.array);
    return g;
  }, []);

  useFrame((_, dt) => {
    t.current += dt;
    if (!planeRef.current) return;
    const amp  = machineState === 'QUENCH' ? 0.032 : 0.008;
    const pos  = planeRef.current.geometry.attributes.position;
    const base = planeRef.current.geometry.userData.base;
    for (let i = 0; i < pos.count; i++) {
      const ix = i * 3;
      pos.array[ix + 2] =
        Math.sin(base[ix] * 7 + t.current * 2.6) * amp +
        Math.cos(base[ix + 1] * 5 + t.current * 2.0) * amp * 0.7;
    }
    pos.needsUpdate = true;
    planeRef.current.geometry.computeVertexNormals();
    if (lightRef.current) {
      lightRef.current.intensity = machineState === 'QUENCH' ? 1.6 : 0.3;
    }
  });

  return (
    <group position={[2.6, 0, 0]}>
      <primitive object={tankScene} scale={TANK_S} />
      <mesh ref={planeRef} position={[0, WATER_Y, 0]} rotation={[-Math.PI / 2, 0, 0]} geometry={baseGeom}>
        <meshStandardMaterial
          color={WATER}
          emissive={WATER}
          emissiveIntensity={0.65}
          metalness={0.05}
          roughness={0.1}
          transparent
          opacity={0.92}
        />
      </mesh>
      <pointLight ref={lightRef} position={[0, WATER_Y + 0.3, 0]} color={WATER} intensity={0.3} distance={3.5} />
    </group>
  );
}
