import {
  BufferGeometry,
  CircleGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  ExtrudeGeometry,
  Float32BufferAttribute,
  Group,
  IcosahedronGeometry,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  PlaneGeometry,
  Shape,
  SphereGeometry,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { mulberry32 } from './random';
import {
  TAU,
  WORLD,
  angleToPoint,
  seasonSample,
  seasonWeight,
} from './season';
import { bindGrass } from './shaders';

export type FoliageQuality = {
  grass: number;
  flowers: number;
  leaves: number;
  petals: number;
};

type TreeSlot = {
  group: Group;
  meshes: Mesh[];
  x: number;
  z: number;
  phase: number;
  base: number;
};

const TRUNK = new Color('#5c3b28');
const TRUNK_DARK = new Color('#3e2c22');

function paint(geo: BufferGeometry, color: Color, jitter = 0): BufferGeometry {
  const count = geo.getAttribute('position').count;
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i += 1) {
    const n = 1 + ((Math.abs(Math.sin(i * 12.9898) * 43758.5453) % 1) - 0.5) * jitter;
    colors[i * 3] = color.r * n;
    colors[i * 3 + 1] = color.g * n;
    colors[i * 3 + 2] = color.b * n;
  }
  geo.setAttribute('color', new Float32BufferAttribute(colors, 3));
  return geo;
}

function part(src: BufferGeometry, matrix: Matrix4, color: Color, jitter = 0.08): BufferGeometry {
  const geo = src.index ? src.toNonIndexed() : src.clone();
  geo.applyMatrix4(matrix);
  return paint(geo, color, jitter);
}

function merged(parts: BufferGeometry[]): BufferGeometry {
  const geo = mergeGeometries(parts, false);
  if (!geo) throw new Error('无法合并树的几何体');
  parts.forEach((item) => item.dispose());
  return geo;
}

const trunkGeo = new CylinderGeometry(0.055, 0.085, 0.62, 6);
const puffGeo = new IcosahedronGeometry(0.34, 1);
const coneGeo = new ConeGeometry(0.42, 0.72, 7);
const capGeo = new SphereGeometry(0.2, 8, 6);
const leafGeo = new CircleGeometry(0.16, 5);

function buildTree(kind: number, seed: number): BufferGeometry {
  const rng = mulberry32(seed + kind * 17);
  const parts: BufferGeometry[] = [];
  const trunkColor = kind === 3 ? TRUNK_DARK : TRUNK;
  parts.push(
    part(trunkGeo, new Matrix4().makeTranslation(0, 0.31, 0), trunkColor, 0.04),
  );

  if (kind === 3) {
    const greens = [new Color('#1c463c'), new Color('#24584a'), new Color('#16382f')];
    const snow = new Color('#f4f8fc');
    for (let i = 0; i < 3; i += 1) {
      const y = 0.62 + i * 0.38;
      const s = 1 - i * 0.24;
      parts.push(
        part(
          coneGeo,
          new Matrix4().makeScale(s, 0.86, s).setPosition(0, y, 0),
          greens[i]!,
          0.05,
        ),
      );
      parts.push(
        part(
          capGeo,
          new Matrix4().makeScale(0.85 * s, 0.28, 0.85 * s).setPosition(0, y + 0.28, 0),
          snow,
          0.02,
        ),
      );
    }
    return merged(parts);
  }

  const palettes = [
    [new Color('#f6b9d4'), new Color('#e992b6'), new Color('#ffe4f0'), new Color('#f3a8c8')],
    [new Color('#699544'), new Color('#4f7a32'), new Color('#87ab55'), new Color('#3f6b2a')],
    [new Color('#bd742f'), new Color('#d4924a'), new Color('#8d4e1e'), new Color('#e0a15a')],
  ];
  const colors = palettes[kind] ?? palettes[0]!;
  const count = kind === 1 ? 3 : 4;
  for (let i = 0; i < count; i += 1) {
    const ang = rng() * TAU;
    const rad = 0.08 + rng() * 0.16;
    const y = 0.72 + rng() * 0.38;
    const s = 0.75 + rng() * 0.55;
    parts.push(
      part(
        puffGeo,
        new Matrix4().makeScale(s, s * 0.86, s).setPosition(Math.cos(ang) * rad, y, Math.sin(ang) * rad),
        colors[i % colors.length]!,
        0.12,
      ),
    );
  }
  if (kind === 2) {
    for (let i = 0; i < 3; i += 1) {
      const m = new Matrix4()
        .makeRotationX(-1.1)
        .multiply(new Matrix4().makeRotationY(i))
        .setPosition((rng() - 0.5) * 0.3, 0.55 + rng() * 0.4, (rng() - 0.5) * 0.3);
      parts.push(part(leafGeo, m, colors[i % colors.length]!, 0.05));
    }
  }
  return merged(parts);
}

const TREE_SPOTS = [
  { a: 0.38, r: 3.82, s: 1.05 },
  { a: 0.95, r: 4.18, s: 0.9 },
  { a: 1.5, r: 3.68, s: 1.12 },
  { a: 2.08, r: 4.22, s: 0.86 },
  { a: 2.58, r: 3.72, s: 1.0 },
  { a: 3.78, r: 3.78, s: 1.08 },
  { a: 4.32, r: 4.2, s: 0.88 },
  { a: 4.92, r: 3.62, s: 1.16 },
  { a: 5.52, r: 4.12, s: 0.94 },
];

const FLOWER_SPOTS_BASE = [
  { a: 0.55, r: 2.65 },
  { a: 1.2, r: 3.05 },
  { a: 1.9, r: 2.5 },
  { a: 4.4, r: 2.85 },
  { a: 5.0, r: 2.45 },
  { a: 5.6, r: 3.0 },
];

function smoothstep(t: number): number {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
}

export type Foliage = {
  group: Group;
  update: (sweep: number, time: number, motion: boolean) => void;
};

export function createFoliage(quality: FoliageQuality): Foliage {
  const group = new Group();
  const treeMat = new MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.78,
    metalness: 0,
  });

  const slots: TreeSlot[] = TREE_SPOTS.map((spot, index) => {
    const point = angleToPoint(spot.a, spot.r);
    const slot = new Group();
    slot.position.set(point.x, WORLD.surfaceY, point.z);
    slot.rotation.y = spot.a;
    const meshes: Mesh[] = [];
    for (let kind = 0; kind < 4; kind += 1) {
      const mesh = new Mesh(buildTree(kind, index * 13 + 3), treeMat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.visible = false;
      slot.add(mesh);
      meshes.push(mesh);
    }
    group.add(slot);
    return {
      group: slot,
      meshes,
      x: point.x,
      z: point.z,
      phase: index * 1.7,
      base: spot.s,
    };
  });

  const grassGeo = new PlaneGeometry(0.11, 0.5, 1, 3);
  grassGeo.translate(0, 0.24, 0);
  const rng = mulberry32(2026);
  const phases = new Float32Array(quality.grass);
  const grass = new InstancedMesh(
    grassGeo,
    (() => {
      const mat = new MeshStandardMaterial({
        color: new Color('#ffffff'),
        roughness: 0.92,
        metalness: 0,
        side: DoubleSide,
      });
      bindGrass(mat);
      return mat;
    })(),
    quality.grass,
  );
  const dummy = new Object3D();
  const exclusions = [
    { x: 0, z: 1.28, r: 1.05 },
    { x: 0, z: 0, r: 0.48 },
    { x: 0.82, z: 1.78, r: 0.38 },
  ];
  let placed = 0;
  let guard = 0;
  while (placed < quality.grass && guard < quality.grass * 12) {
    guard += 1;
    const rad = Math.sqrt(rng()) * 4.5;
    const ang = rng() * TAU;
    const x = Math.sin(ang) * rad;
    const z = -Math.cos(ang) * rad;
    if (rad < 0.55) continue;
    if (exclusions.some((item) => Math.hypot(x - item.x, z - item.z) < item.r)) continue;
    phases[placed] = rng() * TAU;
    dummy.position.set(x, WORLD.surfaceY - 0.01, z);
    dummy.rotation.set((rng() - 0.5) * 0.25, rng() * TAU, (rng() - 0.5) * 0.25);
    const height = 0.55 + rng() * 0.9;
    dummy.scale.set(0.65 + rng() * 0.7, height, 1);
    dummy.updateMatrix();
    grass.setMatrixAt(placed, dummy.matrix);
    placed += 1;
  }
  grass.count = placed;
  grassGeo.setAttribute('aPhase', new InstancedBufferAttribute(phases, 1));
  grass.instanceMatrix.needsUpdate = true;
  grass.frustumCulled = false;
  grass.castShadow = false;
  grass.receiveShadow = false;
  group.add(grass);

  const flowers = makeDecals(
    buildFlower(),
    quality.flowers,
    11,
    (i) => 0.85 + (i % 5) * 0.08,
    new Color('#ffffff'),
    0,
    true,
  );
  group.add(flowers.mesh);

  const leaves = makeDecals(
    new CircleGeometry(0.13, 5),
    quality.leaves,
    29,
    (i) => 0.85 + (i % 4) * 0.18,
    new Color('#bd742f'),
    2,
  );
  group.add(leaves.mesh);

  const petals = makeDecals(
    new CircleGeometry(0.055, 6),
    quality.petals,
    41,
    (i) => 0.7 + (i % 3) * 0.2,
    new Color('#f6b9d4'),
    0,
  );
  group.add(petals.mesh);

  const sunflowers = FLOWER_SPOTS_BASE.map((spot, index) => {
    const point = angleToPoint(spot.a, spot.r);
    const flower = new Group();
    const stem = new Mesh(
      new CylinderGeometry(0.018, 0.024, 0.62, 5),
      new MeshStandardMaterial({ color: new Color('#3f6b2c'), roughness: 0.8 }),
    );
    stem.position.y = 0.31;
    stem.castShadow = true;
    flower.add(stem);
    const head = new Group();
    head.position.y = 0.7;
    const center = new Mesh(
      new SphereGeometry(0.07, 10, 8),
      new MeshStandardMaterial({ color: new Color('#6a3d22'), roughness: 0.7 }),
    );
    center.scale.y = 0.62;
    head.add(center);
    const petalMat = new MeshStandardMaterial({ color: new Color('#f0c84a'), roughness: 0.58 });
    for (let p = 0; p < 8; p += 1) {
      const petal = new Mesh(new SphereGeometry(0.055, 6, 5), petalMat);
      const ang = (p / 8) * TAU;
      petal.position.set(Math.cos(ang) * 0.11, 0.01, Math.sin(ang) * 0.11);
      petal.scale.set(1.15, 0.45, 0.7);
      head.add(petal);
    }
    flower.add(head);
    flower.position.set(point.x, WORLD.surfaceY, point.z);
    group.add(flower);
    return { flower, head, x: point.x, z: point.z, phase: index };
  });

  const melon = buildWatermelon();
  melon.position.set(0.78, WORLD.surfaceY + 0.06, 1.92);
  group.add(melon);

  const decals = [flowers, leaves, petals];

  return {
    group,
    update(sweep, time, motion) {
      for (const slot of slots) {
        const sample = seasonSample(slot.x, slot.z, sweep);
        for (let kind = 0; kind < 4; kind += 1) {
          const w = seasonWeight(sample, kind);
          const mesh = slot.meshes[kind];
          if (!mesh) continue;
          const show = w > 0.045;
          mesh.visible = show;
          if (!show) continue;
          const s = slot.base * (0.22 + 0.78 * smoothstep(w));
          mesh.scale.setScalar(s);
        }
        if (motion) {
          slot.group.rotation.z = Math.sin(time * 1.15 + slot.phase) * 0.02;
          slot.group.rotation.x = Math.cos(time * 0.85 + slot.phase) * 0.012;
        } else {
          slot.group.rotation.z = 0;
          slot.group.rotation.x = 0;
        }
      }

      for (const decal of decals) {
        for (let i = 0; i < decal.points.length; i += 1) {
          const p = decal.points[i];
          if (!p) continue;
          const w = seasonWeight(seasonSample(p.x, p.z, sweep), decal.season);
          const show = w > 0.08;
          const s = show ? p.scale * (0.25 + 0.75 * w) : 0.0001;
          dummy.position.set(p.x, WORLD.surfaceY + 0.025, p.z);
          dummy.rotation.set(-Math.PI / 2, p.spin, 0);
          dummy.scale.setScalar(s);
          dummy.updateMatrix();
          decal.mesh.setMatrixAt(i, dummy.matrix);
        }
        decal.mesh.instanceMatrix.needsUpdate = true;
      }

      for (const sun of sunflowers) {
        const w = seasonWeight(seasonSample(sun.x, sun.z, sweep), 1);
        sun.flower.visible = w > 0.06;
        const s = 0.2 + 0.8 * w;
        sun.flower.scale.setScalar(s);
        if (motion) sun.head.rotation.z = Math.sin(time * 1.3 + sun.phase) * 0.12;
      }

      const melonW = seasonWeight(seasonSample(0.82, 1.78, sweep), 1);
      melon.visible = melonW > 0.08;
      melon.scale.setScalar((0.25 + 0.75 * melonW) * 1.15);
      if (motion) melon.rotation.y = Math.sin(time * 0.4) * 0.08 + 0.4;
    },
  };
}

type DecalPoint = { x: number; z: number; spin: number; scale: number };
type DecalSet = { mesh: InstancedMesh; points: DecalPoint[]; season: number };

function makeDecals(
  geo: BufferGeometry,
  count: number,
  seed: number,
  scaleOf: (i: number) => number,
  color: Color,
  season: number,
  vertexColors = false,
): DecalSet {
  const mat = new MeshStandardMaterial({
    color,
    roughness: 0.82,
    metalness: 0,
    side: DoubleSide,
    vertexColors,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  const mesh = new InstancedMesh(geo, mat, count);
  mesh.frustumCulled = false;
  mesh.receiveShadow = true;
  const rng = mulberry32(seed);
  const points: DecalPoint[] = [];
  const dummy = new Object3D();
  for (let i = 0; i < count; i += 1) {
    const rad = 1.55 + rng() * 2.75;
    const ang = rng() * TAU;
    let x = Math.sin(ang) * rad;
    let z = -Math.cos(ang) * rad;
    if (Math.hypot(x, z - 1.28) < 0.85) {
      x += x > 0 ? 1.1 : -1.1;
    }
    points.push({ x, z, spin: rng() * TAU, scale: scaleOf(i) });
    dummy.position.set(x, WORLD.surfaceY + 0.03, z);
    dummy.rotation.x = -Math.PI / 2;
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  }
  mesh.instanceMatrix.needsUpdate = true;
  return { mesh, points, season };
}

function buildFlower(): BufferGeometry {
  const stem = new CylinderGeometry(0.012, 0.014, 0.14, 4);
  const bloom = new SphereGeometry(0.05, 7, 6);
  const stemPart = part(stem, new Matrix4().makeTranslation(0, 0.07, 0), new Color('#6f9a48'), 0.02);
  const bloomPart = part(bloom, new Matrix4().makeTranslation(0, 0.16, 0), new Color('#fff4f8'), 0.04);
  return merged([stemPart, bloomPart]);
}

function buildWatermelon(): Group {
  const group = new Group();
  const shape = new Shape();
  shape.moveTo(0, 0);
  shape.absarc(0, 0, 0.24, Math.PI * 1.12, Math.PI * 1.88, false);
  shape.lineTo(0, 0);
  const flesh = new Mesh(
    new ExtrudeGeometry(shape, {
      depth: 0.11,
      bevelEnabled: true,
      bevelThickness: 0.012,
      bevelSize: 0.01,
      bevelSegments: 1,
    }),
    new MeshStandardMaterial({ color: new Color('#e15b62'), roughness: 0.55 }),
  );
  const rindShape = new Shape();
  rindShape.moveTo(0, 0);
  rindShape.absarc(0, 0, 0.28, Math.PI * 1.12, Math.PI * 1.88, false);
  rindShape.lineTo(0, 0);
  const rind = new Mesh(
    new ExtrudeGeometry(rindShape, { depth: 0.11, bevelEnabled: false }),
    new MeshStandardMaterial({ color: new Color('#3f8f4a'), roughness: 0.7 }),
  );
  rind.position.z = -0.02;
  group.add(rind);
  group.add(flesh);
  const seedMat = new MeshStandardMaterial({ color: new Color('#1b1412'), roughness: 0.4 });
  for (let i = 0; i < 5; i += 1) {
    const seed = new Mesh(new SphereGeometry(0.012, 6, 4), seedMat);
    const a = Math.PI * 1.28 + i * 0.12;
    seed.position.set(Math.cos(a) * 0.12, Math.sin(a) * 0.1, 0.1);
    group.add(seed);
  }
  group.rotation.set(-0.55, -0.9, 0.15);
  group.position.y = 0.04;
  return group;
}
