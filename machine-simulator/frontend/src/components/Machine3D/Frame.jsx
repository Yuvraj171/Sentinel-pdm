import { useMemo } from 'react';
import { useGLTF } from '@react-three/drei';
import { colorModel } from './colorModel.js';

export default function Frame() {
  const structGLTF  = useGLTF('/models/kenney/structure-high.glb');
  const pipeGLTF    = useGLTF('/models/kenney/pipe-large-long.glb');
  const pipeBGLTF   = useGLTF('/models/kenney/pipe-large-bend.glb');
  const bedGLTF     = useGLTF('/models/kenney/machine-bed.glb');
  const warnGLTF    = useGLTF('/models/kenney/warning-orange.glb');

  const bed     = useMemo(() => colorModel(bedGLTF.scene,   '#384358', 0.78, 0.36), [bedGLTF.scene]);
  const structA = useMemo(() => colorModel(structGLTF.scene,'#404a60', 0.74, 0.44), [structGLTF.scene]);
  const structB = useMemo(() => colorModel(structGLTF.scene,'#404a60', 0.74, 0.44), [structGLTF.scene]);
  const pipeA   = useMemo(() => colorModel(pipeGLTF.scene,  '#586478', 0.82, 0.3),  [pipeGLTF.scene]);
  const pipeB   = useMemo(() => colorModel(pipeGLTF.scene,  '#586478', 0.82, 0.3),  [pipeGLTF.scene]);
  const pipeBnd = useMemo(() => colorModel(pipeBGLTF.scene, '#586478', 0.82, 0.3),  [pipeBGLTF.scene]);
  // Warning markers: keep Kenney orange
  const warnA   = useMemo(() => colorModel(warnGLTF.scene,  null, 0.3, 0.7, true),  [warnGLTF.scene]);
  const warnB   = useMemo(() => colorModel(warnGLTF.scene,  null, 0.3, 0.7, true),  [warnGLTF.scene]);

  return (
    <group>
      {/* Dark concrete floor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]} receiveShadow>
        <planeGeometry args={[30, 18]} />
        <meshStandardMaterial color="#0e1422" metalness={0.18} roughness={0.9} />
      </mesh>
      {/* Subtle grid lines for depth reference */}
      <gridHelper args={[30, 30, '#1a2438', '#121828']} position={[0, 0.002, 0]} />

      {/* Coil station pedestal */}
      <primitive object={bed} scale={0.58} position={[0, 0, 0]} />

      {/* Structural columns behind the line */}
      <primitive object={structA} scale={0.52} position={[-3.8, 0, -0.6]} />
      <primitive object={structB} scale={0.52} position={[ 3.8, 0, -0.6]} />

      {/* Coolant pipes: control panel → coil */}
      <primitive object={pipeA}   scale={0.5} position={[-2.3, 0.48, 0.42]} rotation={[0, 0, Math.PI / 2]} />
      <primitive object={pipeB}   scale={0.5} position={[-2.3, 0.3,  0.42]} rotation={[0, 0, Math.PI / 2]} />
      <primitive object={pipeBnd} scale={0.5} position={[-0.5, 0.48, 0.42]} rotation={[0, Math.PI / 2, 0]} />

      {/* Safety warnings at the coil work zone */}
      <primitive object={warnA} scale={0.6} position={[-1.0, 0, 0.58]} />
      <primitive object={warnB} scale={0.6} position={[ 1.0, 0, 0.58]} />

      {/* Yellow floor safety stripe along the whole line */}
      <mesh position={[0, 0.004, 0.5]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[9.0, 0.07]} />
        <meshStandardMaterial color="#d97706" emissive="#d97706" emissiveIntensity={0.2} roughness={0.9} />
      </mesh>
    </group>
  );
}
