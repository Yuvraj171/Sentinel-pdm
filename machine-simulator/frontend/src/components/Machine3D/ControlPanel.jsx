import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { colorModel } from './colorModel.js';

const GREEN = new THREE.Color('#22c55e');
const AMBER = new THREE.Color('#f59e0b');
const RED   = new THREE.Color('#ef4444');

export default function ControlPanel({ machineState = 'IDLE', aiStatus = 'OK' }) {
  const cabinetGLTF = useGLTF('/models/kenney/machine-fortified.glb');
  const screenGLTF  = useGLTF('/models/kenney/screen-panel-small.glb');

  const cabinetScene = useMemo(() =>
    colorModel(cabinetGLTF.scene, '#2a3447', 0.58, 0.50), [cabinetGLTF.scene]);
  const screenScene  = useMemo(() =>
    colorModel(screenGLTF.scene,  '#1a2030', 0.50, 0.55), [screenGLTF.scene]);

  const ledMatRef = useRef();
  const lightRef  = useRef();
  const t = useRef(0);

  const targetColor = useMemo(() => {
    if (aiStatus === 'CRITICAL' || aiStatus === 'HALTED' || machineState === 'DOWN') return RED;
    if (aiStatus === 'WARNING') return AMBER;
    return GREEN;
  }, [machineState, aiStatus]);

  useFrame((_, dt) => {
    t.current += dt;
    if (ledMatRef.current) {
      const pulse = (Math.sin(t.current * 3.2) + 1) * 0.5;
      ledMatRef.current.emissive.lerp(targetColor, Math.min(1, dt * 5));
      ledMatRef.current.emissiveIntensity = 0.7 + pulse * 1.8;
    }
    if (lightRef.current) {
      lightRef.current.color.lerp(targetColor, Math.min(1, dt * 5));
    }
  });

  // machine-fortified is ~1 unit wide × ~1.8 tall. scale 1.3, rotated to face +Z.
  return (
    <group position={[-3.8, 0, 0]} rotation={[0, Math.PI, 0]}>
      <primitive object={cabinetScene} scale={1.3} />
      <primitive object={screenScene}  scale={0.9} position={[0, 2.0, -0.38]} />
      {/* Status LED */}
      <mesh position={[0, 1.1, -0.55]}>
        <sphereGeometry args={[0.042, 16, 16]} />
        <meshStandardMaterial ref={ledMatRef} color="#000" emissive={GREEN} emissiveIntensity={1} />
      </mesh>
      <pointLight ref={lightRef} position={[0, 1.1, -0.7]} color={GREEN} intensity={0.55} distance={2.0} />
    </group>
  );
}
