import { Suspense, useRef } from 'react';
import { Canvas } from '@react-three/fiber';
import { Environment, ContactShadows, OrbitControls, useGLTF } from '@react-three/drei';
import { EffectComposer, Bloom, Vignette, ChromaticAberration } from '@react-three/postprocessing';
import { BlendFunction } from 'postprocessing';
import * as THREE from 'three';

import Coil from './Coil.jsx';
import QuenchTank from './QuenchTank.jsx';
import Conveyor from './Conveyor.jsx';
import MovingParts from './MovingParts.jsx';
import ControlPanel from './ControlPanel.jsx';
import Sparks from './Sparks.jsx';
import Frame from './Frame.jsx';
import Hotspots from './Hotspots.jsx';
import SensorOverlays from './SensorOverlays.jsx';
import CameraRig from './CameraRig.jsx';

useGLTF.preload('/models/kenney/conveyor-long-sides.glb');
useGLTF.preload('/models/kenney/machine-fortified.glb');
useGLTF.preload('/models/kenney/machine-bed.glb');
useGLTF.preload('/models/kenney/hopper-high-square.glb');
useGLTF.preload('/models/kenney/structure-high.glb');
useGLTF.preload('/models/kenney/pipe-large-long.glb');
useGLTF.preload('/models/kenney/pipe-large-bend.glb');
useGLTF.preload('/models/kenney/warning-orange.glb');
useGLTF.preload('/models/kenney/screen-panel-small.glb');

export default function Scene3D({
  machineState = 'IDLE',
  riskScore = 0,
  aiStatus = 'OK',
  compact = false,
  showHotspots = false,
  showSensors = true,
  sensorValues = null,
  hotspots = [],
  demoMode = 'idle',         // 'idle' | 'demo' | 'resetting'
  demoCoilMood = 'idle',     // 'idle' | 'warn' | 'crit'
}) {
  const orbitRef = useRef(null);

  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      gl={{
        antialias: true,
        alpha: false,
        powerPreference: 'high-performance',
        toneMapping: THREE.ACESFilmicToneMapping,
        toneMappingExposure: 1.0,
      }}
      camera={{
        position: compact ? [5.4, 3.6, 5.6] : [6.2, 4.0, 6.5],
        fov: compact ? 44 : 42,
      }}
      style={{ width: '100%', height: '100%', display: 'block', background: '#060912' }}
    >
      <color attach="background" args={['#060912']} />
      <fog attach="fog" args={['#060a14', 20, 42]} />

      <Suspense fallback={null}>
        <ambientLight intensity={0.05} />
        <directionalLight
          position={[6, 12, 4]}
          intensity={1.6}
          castShadow
          shadow-mapSize={[2048, 2048]}
          shadow-camera-left={-9}
          shadow-camera-right={9}
          shadow-camera-top={6}
          shadow-camera-bottom={-3}
          shadow-bias={-0.001}
        />
        <directionalLight position={[-8, 5, -7]} intensity={0.42} color="#5aa8e0" />
        <directionalLight position={[0, -2, 4]}  intensity={0.10} color="#d97742" />
        <Environment preset="warehouse" background={false} />

        <Frame />
        <Conveyor machineState={machineState} />
        <Coil
          machineState={machineState}
          riskScore={riskScore}
          aiStatus={aiStatus}
          demoCoilMood={demoMode !== 'idle' ? demoCoilMood : null}
        />
        <QuenchTank machineState={machineState} />
        <MovingParts machineState={machineState} />
        <ControlPanel machineState={machineState} aiStatus={aiStatus} />
        <Sparks aiStatus={aiStatus} riskScore={riskScore} />

        <ContactShadows
          position={[0, 0.01, 0]}
          opacity={0.9}
          scale={22}
          blur={3.5}
          far={7}
          resolution={512}
          color="#000020"
        />

        {showHotspots && <Hotspots hotspots={hotspots} />}
        {showSensors && (
          <SensorOverlays
            values={sensorValues}
            machineState={machineState}
            aiStatus={aiStatus}
            demoMode={demoMode}
          />
        )}

        <CameraRig
          mode={demoMode}
          coilMood={demoCoilMood}
          orbitRef={orbitRef}
        />

        <EffectComposer multisampling={0}>
          <Bloom luminanceThreshold={0.35} luminanceSmoothing={0.45} intensity={2.6} radius={0.85} />
          <ChromaticAberration blendFunction={BlendFunction.NORMAL} offset={[0.0008, 0.0008]} />
          <Vignette eskil={false} offset={0.15} darkness={0.7} />
        </EffectComposer>
      </Suspense>

      <OrbitControls
        ref={orbitRef}
        enablePan={false}
        enableZoom={true}
        enableRotate={true}
        minDistance={4}
        maxDistance={15}
        minPolarAngle={Math.PI / 5}
        maxPolarAngle={Math.PI / 2.15}
        target={[0, 0.7, 0]}
        zoomSpeed={0.7}
        rotateSpeed={0.5}
      />
    </Canvas>
  );
}
