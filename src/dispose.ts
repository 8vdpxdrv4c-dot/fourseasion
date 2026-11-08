/**
 * Adapted from threejs-effects-demos/lib/dispose.js (attached with terrain-grass-tiles).
 * Deep-disposes geometries, materials, and uniform textures when the grass field is rebuilt.
 */
import type { Material, Object3D, Scene, Texture } from 'three';

type DisposableMaterial = Material & {
  uniforms?: Record<string, { value?: unknown }>;
} & Record<string, unknown>;

const MAPS = [
  'map', 'alphaMap', 'aoMap', 'bumpMap', 'displacementMap',
  'emissiveMap', 'envMap', 'lightMap', 'metalnessMap', 'normalMap',
  'roughnessMap', 'specularMap', 'gradientMap',
];

export function disposeMaterial(mat: Material | null | undefined): void {
  if (!mat) return;
  const material = mat as DisposableMaterial;
  for (const key of MAPS) {
    const map = material[key] as { dispose?: () => void } | undefined;
    map?.dispose?.();
  }
  if (material.uniforms) {
    for (const uniform of Object.values(material.uniforms)) {
      const value = uniform?.value as (Texture & { isTexture?: boolean }) | undefined;
      if (value && value.isTexture) value.dispose();
    }
  }
  mat.dispose();
}

export function disposeObject3D(root: Object3D | null | undefined): void {
  if (!root) return;
  root.traverse((obj) => {
    const mesh = obj as Object3D & {
      geometry?: { dispose: () => void };
      material?: Material | Material[];
    };
    mesh.geometry?.dispose();
    if (Array.isArray(mesh.material)) mesh.material.forEach((item) => disposeMaterial(item));
    else disposeMaterial(mesh.material);
  });
}

/** Remove objects from their parent (or the scene) and free their GPU resources. */
export function removeAndDispose(scene: Scene | null, objects: Object3D | Object3D[]): void {
  const list = Array.isArray(objects) ? objects : [objects];
  for (const obj of list) {
    if (!obj) continue;
    if (obj.parent) obj.parent.remove(obj);
    else scene?.remove(obj);
    disposeObject3D(obj);
  }
}
