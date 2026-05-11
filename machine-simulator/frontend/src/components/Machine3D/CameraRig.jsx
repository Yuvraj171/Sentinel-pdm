// CameraRig — drives the camera during the demo failure sequence.
// Outside the demo, OrbitControls owns the camera so the user can freely
// zoom/rotate. Cursor parallax is applied via a tiny additive offset only
// while idle (so it doesn't fight a user drag).

import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

// Demo-mode scripted camera (per coilMood).
const DEMO_CAMERA = {
  idle: { pos: [ 6.2, 4.0,  6.5], look: [0, 0.7, 0] },
  warn: { pos: [ 4.2, 3.0,  5.0], look: [0, 0.9, 0] },
  crit: { pos: [ 3.2, 2.4,  4.0], look: [0, 1.0, 0] },
};

export default function CameraRig({
  mode = 'idle',         // 'idle' | 'demo' | 'resetting'
  coilMood = 'idle',     // 'idle' | 'warn' | 'crit'
  orbitRef,              // ref to the OrbitControls instance
}) {
  const { camera } = useThree();
  const lookTarget = useRef(new THREE.Vector3(0, 0.7, 0));
  const tmpPos = useMemo(() => [0, 0, 0], []);
  const tmpLook = useMemo(() => [0, 0, 0], []);

  // When demo toggles, sync OrbitControls target to current lookAt so the
  // user's next drag/zoom doesn't snap to a stale target.
  useEffect(() => {
    if (orbitRef?.current) {
      orbitRef.current.target.copy(lookTarget.current);
      orbitRef.current.update();
    }
  }, [mode, orbitRef]);

  useFrame((_, dt) => {
    const useDemo = mode === 'demo' || mode === 'resetting';

    if (!useDemo) {
      // OrbitControls is in charge — don't touch the camera.
      if (orbitRef?.current && !orbitRef.current.enabled) {
        orbitRef.current.enabled = true;
        orbitRef.current.target.copy(lookTarget.current);
        orbitRef.current.update();
      }
      return;
    }

    // Demo override.
    const c = DEMO_CAMERA[coilMood] || DEMO_CAMERA.idle;
    tmpPos[0] = c.pos[0]; tmpPos[1] = c.pos[1]; tmpPos[2] = c.pos[2];
    tmpLook[0] = c.look[0]; tmpLook[1] = c.look[1]; tmpLook[2] = c.look[2];

    if (orbitRef?.current) orbitRef.current.enabled = false;

    const lerpK = Math.min(1, dt * 3.5);
    camera.position.x += (tmpPos[0] - camera.position.x) * lerpK;
    camera.position.y += (tmpPos[1] - camera.position.y) * lerpK;
    camera.position.z += (tmpPos[2] - camera.position.z) * lerpK;

    lookTarget.current.x += (tmpLook[0] - lookTarget.current.x) * lerpK;
    lookTarget.current.y += (tmpLook[1] - lookTarget.current.y) * lerpK;
    lookTarget.current.z += (tmpLook[2] - lookTarget.current.z) * lerpK;

    camera.lookAt(lookTarget.current);

    if (orbitRef?.current) {
      orbitRef.current.target.lerp(lookTarget.current, lerpK);
    }
  });

  return null;
}
