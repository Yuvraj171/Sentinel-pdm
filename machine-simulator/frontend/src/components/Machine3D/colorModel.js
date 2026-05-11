import * as THREE from 'three';

/**
 * Deep-clone a GLTF scene and replace every mesh's material with a new
 * MeshStandardMaterial so Kenney's built-in white/gray colors don't
 * override the industrial dark palette.
 *
 * Pass keepOrange=true to leave any mesh whose current material color has
 * high R and low B (i.e. Kenney's safety-orange pieces) as-is.
 */
export function colorModel(scene, color, metalness = 0.72, roughness = 0.44, keepOrange = false) {
  const clone = scene.clone(true);
  clone.traverse((child) => {
    if (!child.isMesh) return;
    child.castShadow    = true;
    child.receiveShadow = true;

    if (keepOrange) {
      const c = child.material?.color;
      if (c && c.r > 0.5 && c.b < 0.3) return; // keep Kenney orange/yellow
    }

    child.material = new THREE.MeshStandardMaterial({
      color: new THREE.Color(color),
      metalness,
      roughness,
    });
  });
  return clone;
}
