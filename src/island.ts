import {
  AdditiveBlending,
  BoxGeometry,
  BufferGeometry,
  CircleGeometry,
  Color,
  CylinderGeometry,
  DoubleSide,
  ExtrudeGeometry,
  Float32BufferAttribute,
  Group,
  InstancedMesh,
  LatheGeometry,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  PlaneGeometry,
  PointLight,
  ShaderMaterial,
  Shape,
  SphereGeometry,
  TorusGeometry,
  Vector2,
} from 'three';
import { WORLD } from './season';
import { bindTerrain, GLOW_FRAG, GLOW_VERT } from './shaders';

const BRASS = new Color('#d8b66d');
const METAL = new Color('#2a3140');
const METAL_DARK = new Color('#141820');

function discGeometry(radius: number, rings: number, segments: number): BufferGeometry {
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  positions.push(0, 0, 0);
  uvs.push(0.5, 0.5);
  for (let r = 1; r <= rings; r += 1) {
    const rad = (r / rings) * radius;
    for (let s = 0; s < segments; s += 1) {
      const a = (s / segments) * Math.PI * 2;
      positions.push(Math.cos(a) * rad, 0, Math.sin(a) * rad);
      uvs.push(0.5 + (Math.cos(a) * r) / rings / 2, 0.5 + (Math.sin(a) * r) / rings / 2);
    }
  }
  for (let s = 0; s < segments; s += 1) {
    const a = 1 + s;
    const b = 1 + ((s + 1) % segments);
    indices.push(0, b, a);
  }
  for (let r = 0; r < rings - 1; r += 1) {
    for (let s = 0; s < segments; s += 1) {
      const i0 = 1 + r * segments + s;
      const i1 = 1 + r * segments + ((s + 1) % segments);
      const i2 = 1 + (r + 1) * segments + s;
      const i3 = 1 + (r + 1) * segments + ((s + 1) % segments);
      indices.push(i0, i1, i3, i0, i3, i2);
    }
  }
  const geo = new BufferGeometry();
  geo.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

function heartGeometry(scale: number): BufferGeometry {
  const s = scale;
  const shape = new Shape();
  shape.moveTo(0, 0.22 * s);
  shape.bezierCurveTo(0, 0.22 * s, -0.04 * s, 0.42 * s, -0.22 * s, 0.42 * s);
  shape.bezierCurveTo(-0.5 * s, 0.42 * s, -0.52 * s, 0.12 * s, -0.52 * s, 0.02 * s);
  shape.bezierCurveTo(-0.52 * s, -0.18 * s, -0.28 * s, -0.36 * s, 0, -0.62 * s);
  shape.bezierCurveTo(0.28 * s, -0.36 * s, 0.52 * s, -0.18 * s, 0.52 * s, 0.02 * s);
  shape.bezierCurveTo(0.52 * s, 0.12 * s, 0.5 * s, 0.42 * s, 0.22 * s, 0.42 * s);
  shape.bezierCurveTo(0.04 * s, 0.42 * s, 0, 0.22 * s, 0, 0.22 * s);
  const geo = new ExtrudeGeometry(shape, {
    depth: 0.07 * s,
    bevelEnabled: true,
    bevelSegments: 2,
    steps: 1,
    bevelSize: 0.018 * s,
    bevelThickness: 0.02 * s,
  });
  geo.center();
  return geo;
}

export type Island = {
  group: Group;
  update: (sweep: number, time: number, motion: boolean) => void;
};

export function createIsland(detail: { rings: number; segments: number }): Island {
  const group = new Group();

  const metal = new MeshStandardMaterial({
    color: METAL,
    metalness: 0.88,
    roughness: 0.34,
    envMapIntensity: 1.15,
  });
  const metalDark = new MeshStandardMaterial({
    color: METAL_DARK,
    metalness: 0.8,
    roughness: 0.46,
  });
  const brass = new MeshStandardMaterial({
    color: BRASS,
    metalness: 0.72,
    roughness: 0.28,
    emissive: new Color('#a8843e'),
    emissiveIntensity: 0.18,
    envMapIntensity: 1.2,
  });

  const profile = [
    new Vector2(4.48, 0.145),
    new Vector2(4.62, 0.178),
    new Vector2(4.8, 0.162),
    new Vector2(4.94, 0.06),
    new Vector2(5.04, -0.04),
    new Vector2(5.0, -0.16),
    new Vector2(4.86, -0.24),
    new Vector2(4.58, -0.27),
    new Vector2(4.42, -0.18),
  ];
  const rim = new Mesh(new LatheGeometry(profile, detail.segments < 80 ? 72 : 96), metal);
  rim.castShadow = true;
  rim.receiveShadow = true;
  group.add(rim);

  const cap = new Mesh(new CircleGeometry(4.55, 48), metalDark);
  cap.rotation.x = Math.PI / 2;
  cap.position.y = -0.26;
  group.add(cap);

  const inlay = new Mesh(new TorusGeometry(4.78, 0.012, 8, 96), brass);
  inlay.rotation.x = Math.PI / 2;
  inlay.position.y = 0.188;
  group.add(inlay);

  const terrainMat = new MeshStandardMaterial({
    color: new Color('#ffffff'),
    roughness: 0.94,
    metalness: 0.02,
    envMapIntensity: 0.35,
  });
  bindTerrain(terrainMat);
  const terrain = new Mesh(discGeometry(WORLD.diskRadius, detail.rings, detail.segments), terrainMat);
  terrain.position.y = WORLD.surfaceY;
  terrain.receiveShadow = true;
  terrain.castShadow = false;
  group.add(terrain);

  const tickMat = new MeshStandardMaterial({
    color: new Color('#ffffff'),
    metalness: 0.6,
    roughness: 0.35,
  });
  const tickCount = 72;
  const ticks = new InstancedMesh(new BoxGeometry(0.014, 0.07, 0.028), tickMat, tickCount);
  const dummy = new Object3D();
  const brassTick = new Color('#d8b66d');
  const silverTick = new Color('#b7c2d2');
  for (let i = 0; i < tickCount; i += 1) {
    const major = i % 3 === 0;
    const a = (i / tickCount) * Math.PI * 2;
    dummy.position.set(Math.sin(a) * 5.0, -0.02, -Math.cos(a) * 5.0);
    dummy.scale.set(1, major ? 1.65 : 1, 1);
    dummy.lookAt(0, -0.02, 0);
    dummy.updateMatrix();
    ticks.setMatrixAt(i, dummy.matrix);
    ticks.setColorAt(i, major ? brassTick : silverTick);
  }
  ticks.instanceMatrix.needsUpdate = true;
  if (ticks.instanceColor) ticks.instanceColor.needsUpdate = true;
  ticks.frustumCulled = false;
  group.add(ticks);

  const topTickGeo = new BoxGeometry(0.018, 0.012, 0.11);
  const topTicks = new InstancedMesh(topTickGeo, tickMat, tickCount);
  for (let i = 0; i < tickCount; i += 1) {
    const major = i % 3 === 0;
    const a = (i / tickCount) * Math.PI * 2;
    dummy.position.set(Math.sin(a) * 4.86, 0.2, -Math.cos(a) * 4.86);
    dummy.rotation.set(0, a, 0);
    dummy.scale.set(1, 1, major ? 1.55 : 0.85);
    dummy.updateMatrix();
    topTicks.setMatrixAt(i, dummy.matrix);
    topTicks.setColorAt(i, major ? brassTick : silverTick);
  }
  topTicks.instanceMatrix.needsUpdate = true;
  if (topTicks.instanceColor) topTicks.instanceColor.needsUpdate = true;
  topTicks.frustumCulled = false;
  group.add(topTicks);

  const hub = new Group();
  const hubBase = new Mesh(new CylinderGeometry(0.36, 0.4, 0.1, 28), metal);
  hubBase.castShadow = true;
  hub.add(hubBase);
  const hubTop = new Mesh(new CylinderGeometry(0.24, 0.24, 0.045, 24), metalDark);
  hubTop.position.y = 0.06;
  hub.add(hubTop);
  const hubRing = new Mesh(new TorusGeometry(0.36, 0.018, 8, 32), brass);
  hubRing.rotation.x = Math.PI / 2;
  hubRing.position.y = 0.05;
  hub.add(hubRing);
  const pin = new Mesh(new SphereGeometry(0.055, 16, 12), brass);
  pin.position.y = 0.1;
  hub.add(pin);
  hub.position.y = WORLD.surfaceY + 0.08;
  group.add(hub);

  const pivot = new Group();
  pivot.position.y = WORLD.surfaceY + 0.2;

  const len = 4.82;
  const needleGeo = new CylinderGeometry(0.009, 0.02, len, 8, 1);
  needleGeo.translate(0, len / 2 + 0.4, 0);
  needleGeo.rotateX(-Math.PI / 2);
  const needle = new Mesh(
    needleGeo,
    new MeshStandardMaterial({
      color: BRASS,
      metalness: 0.64,
      roughness: 0.22,
      emissive: new Color('#ffd78a'),
      emissiveIntensity: 1.55,
    }),
  );
  needle.castShadow = false;
  pivot.add(needle);

  const glow = new Mesh(
    new PlaneGeometry(0.36, 5.15),
    new ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      side: DoubleSide,
      toneMapped: true,
      vertexShader: GLOW_VERT,
      fragmentShader: GLOW_FRAG,
    }),
  );
  glow.rotation.x = -Math.PI / 2;
  glow.position.set(0, -0.08, -2.95);
  glow.renderOrder = 3;
  pivot.add(glow);

  const shade = new Mesh(
    new PlaneGeometry(0.42, 3.6),
    new MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0.1,
      depthWrite: false,
      side: DoubleSide,
    }),
  );
  shade.rotation.x = -Math.PI / 2;
  shade.position.set(0.28, -0.09, -2.5);
  shade.renderOrder = 2;
  pivot.add(shade);

  const heart = new Mesh(
    heartGeometry(0.36),
    new MeshStandardMaterial({
      color: BRASS,
      metalness: 0.55,
      roughness: 0.24,
      emissive: new Color('#ffe1a4'),
      emissiveIntensity: 1.8,
    }),
  );
  heart.position.set(0, -0.02, -(0.4 + len + 0.02));
  heart.rotation.x = -1.15;
  pivot.add(heart);

  const heartLight = new PointLight('#ffd59a', 1.35, 2.4, 2);
  heartLight.position.copy(heart.position);
  pivot.add(heartLight);

  group.add(pivot);

  return {
    group,
    update(sweep, time, motion) {
      const rev = Math.floor(sweep / (Math.PI * 2) + 1e-4);
      const sw = sweep - rev * Math.PI * 2;
      pivot.rotation.y = -sw;
      const pulse = motion ? 1 + Math.sin(time * 2.3) * 0.045 : 1;
      heart.scale.setScalar(pulse);
      heartLight.intensity = 1.2 + (pulse - 1) * 4;
    },
  };
}
