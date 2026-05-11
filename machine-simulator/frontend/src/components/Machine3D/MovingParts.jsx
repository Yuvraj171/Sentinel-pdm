import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

const COUNT   = 4;
const SPEED   = 0.42;
// Travel left → right.  Parts enter at X_ENTER and exit at X_EXIT.
// A part becomes fully visible at X_SHOW and starts fading at X_FADE.
const X_ENTER = -4.4;
const X_EXIT  =  4.4;
const X_SHOW  = -3.8;   // fully opaque by here
const X_FADE  =  3.8;   // start fading out here
const RANGE   = X_EXIT - X_ENTER;
const SPACING = RANGE / COUNT;

// Hot-steel color constants
const COOL_COLOR = new THREE.Color('#5a3a1c');
const HOT_COLOR  = new THREE.Color('#ff7a30');

// Infeed stack: 3 stacked raw-stock cylinders at the entry side
function InfeedStack() {
  return (
    <group position={[-5.1, 0, 0]}>
      {[0, 0.19, 0.38].map((dy, i) => (
        <mesh key={i} position={[0, 0.10 + dy, 0]} castShadow>
          <cylinderGeometry args={[0.11, 0.11, 0.17, 18]} />
          <meshStandardMaterial color="#4a3018" metalness={0.6} roughness={0.5} />
        </mesh>
      ))}
      {/* Label platform */}
      <mesh position={[0, 0.01, 0]}>
        <boxGeometry args={[0.5, 0.03, 0.5]} />
        <meshStandardMaterial color="#2a3040" metalness={0.5} roughness={0.6} />
      </mesh>
    </group>
  );
}

// Outfeed bin: a shallow open box receiving completed parts on the exit side
function OutfeedBin() {
  const w = 0.82, d = 0.55, h = 0.22, t = 0.03;
  return (
    <group position={[5.1, 0, 0]}>
      {/* Floor */}
      <mesh position={[0, t / 2, 0]}>
        <boxGeometry args={[w, t, d]} />
        <meshStandardMaterial color="#1e3a2a" metalness={0.55} roughness={0.55} />
      </mesh>
      {/* Back wall */}
      <mesh position={[0, h / 2, -d / 2 + t / 2]}>
        <boxGeometry args={[w, h, t]} />
        <meshStandardMaterial color="#1e3a2a" metalness={0.55} roughness={0.55} />
      </mesh>
      {/* Left wall */}
      <mesh position={[-w / 2 + t / 2, h / 2, 0]}>
        <boxGeometry args={[t, h, d]} />
        <meshStandardMaterial color="#1e3a2a" metalness={0.55} roughness={0.55} />
      </mesh>
      {/* Right wall */}
      <mesh position={[w / 2 - t / 2, h / 2, 0]}>
        <boxGeometry args={[t, h, d]} />
        <meshStandardMaterial color="#1e3a2a" metalness={0.55} roughness={0.55} />
      </mesh>
      {/* Two finished parts resting inside — slightly glowing teal to signal "hardened" */}
      {[-0.18, 0.18].map((ox, i) => (
        <mesh key={i} position={[ox, 0.10, 0]} castShadow>
          <cylinderGeometry args={[0.10, 0.10, 0.16, 18]} />
          <meshStandardMaterial
            color="#2a4a3a"
            metalness={0.75}
            roughness={0.35}
            emissive="#00e5a0"
            emissiveIntensity={0.18}
          />
        </mesh>
      ))}
    </group>
  );
}

export default function MovingParts({ machineState = 'IDLE' }) {
  const groupRef = useRef();
  const t = useRef(0);

  useFrame((_, dt) => {
    const moving = machineState !== 'IDLE' && machineState !== 'DOWN';
    if (moving) t.current += dt * SPEED;
    if (!groupRef.current) return;

    groupRef.current.children.forEach((child, i) => {
      // Each part starts at a different phase so they're evenly spaced.
      const x = ((t.current + i * SPACING) % RANGE) + X_ENTER;
      child.position.x = x;

      // Opacity: fade in from X_ENTER→X_SHOW, full in middle, fade out X_FADE→X_EXIT
      const fadeIn  = THREE.MathUtils.clamp((x - X_ENTER) / (X_SHOW - X_ENTER), 0, 1);
      const fadeOut = THREE.MathUtils.clamp((X_EXIT - x) / (X_EXIT - X_FADE),   0, 1);
      const alpha   = Math.min(fadeIn, fadeOut);
      child.material.opacity  = alpha;
      child.material.transparent = true;

      // Color + emissive: cool brown → hot orange as part passes through the coil at x≈0
      const heat = THREE.MathUtils.clamp(1 - Math.abs(x) / 1.0, 0, 1);
      child.material.color.copy(COOL_COLOR).lerp(HOT_COLOR, heat * 0.6);
      const targetE = heat * 1.4;
      child.material.emissiveIntensity = THREE.MathUtils.lerp(
        child.material.emissiveIntensity,
        targetE,
        Math.min(1, dt * 6),
      );
    });
  });

  const parts = [];
  for (let i = 0; i < COUNT; i++) {
    parts.push(
      <mesh key={i} position={[X_ENTER + i * SPACING, 0.16, 0]} castShadow>
        <cylinderGeometry args={[0.1, 0.1, 0.16, 18]} />
        <meshStandardMaterial
          color="#5a3a1c"
          metalness={0.7}
          roughness={0.45}
          emissive="#ff5a14"
          emissiveIntensity={0}
          transparent
          opacity={1}
        />
      </mesh>,
    );
  }

  return (
    <>
      <InfeedStack />
      <group ref={groupRef}>{parts}</group>
      <OutfeedBin />
    </>
  );
}
