/**
 * Adapted from threejs-effects-demos/effects/terrain-grass-tiles.js
 * (module id `terrain-grass-tiles`, “瓦片草地 Grass Tiles”).
 *
 * Kept from that module: instanced tapered blades, vertex wind, heightmap
 * sampling, camera-tiled four-level LOD, guiSchema keys, live parameter
 * rebuilds, and dispose through removeAndDispose.
 *
 * Fitted to this seasonal disk:
 * - No infinite ground, fog, sky, extra sun, OrbitControls, or influence ball.
 * - Tiles stay on the circular island; blades outside the rim are discarded.
 * - Roots sit on the island surface, plus a small heightmap.
 * - The season sweep recolors blades and shortens them under winter snow.
 * - A fixed influence radius clears the companions' feet. The demo sphere is not created.
 * - Density and tile size are scaled for this miniature disk and for phones.
 */
import {
  BufferGeometry,
  Color,
  DataTexture,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  InstancedMesh,
  MathUtils,
  Object3D,
  RGBAFormat,
  ShaderMaterial,
  Sphere,
  UniformsUtils,
  Vector2,
  Vector3,
  type Camera,
  NoColorSpace,
  ClampToEdgeWrapping,
  LinearFilter,
} from 'three';
import { removeAndDispose } from './dispose';
import { WORLD } from './season';

export const id = 'terrain-grass-tiles';
export const title = '瓦片草地 Grass Tiles';
export const category = 'terrain';

export type GrassQualityName = 'low' | 'mid' | 'high';

export type GrassParams = {
  tileSize: number;
  maxDistance: number;
  densityScale: number;
  bladeHeight: number;
  bladeWidth: number;
  windIntensity: number;
  windDirection: number;
  windNoiseScale: number;
  windSpeed: number;
  bladeStiffness: number;
  tipColor: string;
  baseColor: string;
  terrainAmp: number;
  showInfluence: boolean;
  quality: GrassQualityName;
};

type GuiField = {
  key: keyof GrassParams;
  label: string;
  min?: number;
  max?: number;
  step?: number;
  default: number | string | boolean;
  options?: Record<string, string>;
};

/** Same keys as the demo. Ranges are rescaled from the infinite field to this disk. */
export const guiSchema: GuiField[] = [
  { key: 'tileSize', label: '瓦片尺寸 Tile', min: 1.4, max: 3.4, step: 0.1, default: 2.2 },
  { key: 'maxDistance', label: '最大距离 Dist', min: 12, max: 48, step: 1, default: 36 },
  { key: 'densityScale', label: '密度倍率 Density', min: 0.25, max: 1.4, step: 0.05, default: 0.7 },
  { key: 'bladeHeight', label: '草高 Height', min: 0.18, max: 0.85, step: 0.02, default: 0.42 },
  { key: 'bladeWidth', label: '草宽 Width', min: 0.015, max: 0.08, step: 0.002, default: 0.034 },
  { key: 'windIntensity', label: '风力 Intensity', min: 0, max: 1.4, step: 0.05, default: 0.42 },
  { key: 'windDirection', label: '风向 Dir (rad)', min: 0, max: 6.28, step: 0.05, default: 0.8 },
  { key: 'windNoiseScale', label: '风噪 Scale', min: 0.08, max: 1.4, step: 0.02, default: 0.55 },
  { key: 'windSpeed', label: '风速 Speed', min: 0, max: 2.4, step: 0.05, default: 0.85 },
  { key: 'bladeStiffness', label: '硬度 Stiffness', min: 0.2, max: 1.5, step: 0.05, default: 0.75 },
  { key: 'tipColor', label: '尖端色 Tip', default: '#b7de78' },
  { key: 'baseColor', label: '根部色 Base', default: '#1d3a16' },
  { key: 'terrainAmp', label: '地形起伏 Amp', min: 0, max: 0.2, step: 0.005, default: 0.035 },
  { key: 'showInfluence', label: '影响球 Influence', default: false },
  { key: 'quality', label: '质量 Quality', options: { Low: 'low', Mid: 'mid', High: 'high' }, default: 'mid' },
];

const LOD_BANDS = [
  { name: 'high', min: 0, max: 0.35, density: 1.0, segments: 4 },
  { name: 'medium', min: 0.35, max: 0.55, density: 0.55, segments: 3 },
  { name: 'low', min: 0.55, max: 0.75, density: 0.3, segments: 2 },
  { name: 'veryLow', min: 0.75, max: 1.01, density: 0.15, segments: 1 },
];

const QUALITY = {
  low: { baseBlades: 220, tileBudget: 24 },
  mid: { baseBlades: 520, tileBudget: 36 },
  high: { baseBlades: 700, tileBudget: 48 },
};

const HEIGHT_RES = 128;
const TERRAIN_EXTENT = 6;
const DISK_RADIUS = 4.55;
const FEET = { x: 0, z: 3.12, radius: 0.9 };
const HUB = { x: 0, z: 0, radius: 0.55 };

function hash2(x: number, z: number): number {
  const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return s - Math.floor(s);
}
function noise2(x: number, z: number): number {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fz = z - iz;
  const u = fx * fx * (3 - 2 * fx);
  const v = fz * fz * (3 - 2 * fz);
  const a = hash2(ix, iz);
  const b = hash2(ix + 1, iz);
  const c = hash2(ix, iz + 1);
  const d = hash2(ix + 1, iz + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm2(x: number, z: number): number {
  let v = 0;
  let a = 0.5;
  let px = x;
  let pz = z;
  for (let i = 0; i < 5; i += 1) {
    v += a * noise2(px, pz);
    px *= 2.03;
    pz *= 2.03;
    a *= 0.5;
  }
  return v;
}
function terrainHeight(x: number, z: number, amp: number): number {
  return (fbm2(x * 0.42, z * 0.42) * 2 - 0.9) * amp;
}

function buildHeightTexture(amp: number): DataTexture {
  const data = new Uint8Array(HEIGHT_RES * HEIGHT_RES * 4);
  for (let j = 0; j < HEIGHT_RES; j += 1) {
    for (let i = 0; i < HEIGHT_RES; i += 1) {
      const u = i / (HEIGHT_RES - 1);
      const v = j / (HEIGHT_RES - 1);
      const x = (u - 0.5) * 2 * TERRAIN_EXTENT;
      const z = (v - 0.5) * 2 * TERRAIN_EXTENT;
      const h = terrainHeight(x, z, amp);
      const n = MathUtils.clamp((h / (amp * 1.2 + 1e-4)) * 0.5 + 0.5, 0, 1);
      const byte = (n * 255) | 0;
      const idx = (j * HEIGHT_RES + i) * 4;
      data[idx] = byte;
      data[idx + 1] = byte;
      data[idx + 2] = byte;
      data[idx + 3] = 255;
    }
  }
  const tex = new DataTexture(data, HEIGHT_RES, HEIGHT_RES, RGBAFormat);
  tex.wrapS = ClampToEdgeWrapping;
  tex.wrapT = ClampToEdgeWrapping;
  tex.minFilter = LinearFilter;
  tex.magFilter = LinearFilter;
  tex.colorSpace = NoColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function createBladeGeometry(segments: number, width: number, height: number): BufferGeometry {
  const seg = Math.max(1, segments | 0);
  const verts: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  for (let i = 0; i <= seg; i += 1) {
    const t = i / seg;
    const y = t * height;
    const w = width * (1 - t * 0.92);
    verts.push(-w * 0.5, y, 0, w * 0.5, y, 0);
    uvs.push(0, t, 1, t);
  }
  for (let i = 0; i < seg; i += 1) {
    const a = i * 2;
    indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  const geo = new BufferGeometry();
  geo.setAttribute('position', new Float32BufferAttribute(verts, 3));
  geo.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

const BladeShader = {
  uniforms: {
    uTime: { value: 0 },
    uSweep: { value: 0 },
    uSurfaceY: { value: WORLD.surfaceY },
    uDiskRadius: { value: DISK_RADIUS },
    uTipColor: { value: new Color('#b7de78') },
    uBaseColor: { value: new Color('#1d3a16') },
    uWindIntensity: { value: 0.42 },
    uWindDir: { value: new Vector2(1, 0) },
    uWindNoiseScale: { value: 0.55 },
    uWindSpeed: { value: 0.85 },
    uBladeStiffness: { value: 0.75 },
    uBladeHeight: { value: 0.42 },
    uHeightMap: { value: null as DataTexture | null },
    uTerrainExtent: { value: TERRAIN_EXTENT },
    uTerrainAmp: { value: 0.035 },
    uCamXZ: { value: new Vector2(0, 0) },
    uMaxDistance: { value: 36 },
    uInfluenceCenter: { value: new Vector3(FEET.x, WORLD.surfaceY, FEET.z) },
    uInfluenceRadius: { value: FEET.radius },
    uInfluenceEnabled: { value: 1 },
  },
  vertexShader: /* glsl */ `
    attribute vec2 aOffset;
    attribute float aYaw;
    attribute float aHeightScale;
    attribute float aColorVary;

    uniform float uTime;
    uniform float uSweep;
    uniform float uSurfaceY;
    uniform float uDiskRadius;
    uniform float uWindIntensity;
    uniform vec2 uWindDir;
    uniform float uWindNoiseScale;
    uniform float uWindSpeed;
    uniform float uBladeStiffness;
    uniform float uBladeHeight;
    uniform sampler2D uHeightMap;
    uniform float uTerrainExtent;
    uniform float uTerrainAmp;
    uniform vec2 uCamXZ;
    uniform float uMaxDistance;
    uniform vec3 uInfluenceCenter;
    uniform float uInfluenceRadius;
    uniform float uInfluenceEnabled;

    varying float vH;
    varying float vColorVary;
    varying float vFade;
    varying vec3 vWorldNormal;
    varying vec2 vUv;
    varying vec2 vWorldXZ;

    float hash(vec2 p) {
      return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
    }
    float noise(vec2 p) {
      vec2 i = floor(p);
      vec2 f = fract(p);
      f = f * f * (3.0 - 2.0 * f);
      float a = hash(i);
      float b = hash(i + vec2(1.0, 0.0));
      float c = hash(i + vec2(0.0, 1.0));
      float d = hash(i + vec2(1.0, 1.0));
      return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
    }
    float sampleHeight(vec2 xz) {
      vec2 uv = xz / (uTerrainExtent * 2.0) + 0.5;
      float n = texture2D(uHeightMap, clamp(uv, 0.0, 1.0)).r;
      return (n * 2.0 - 1.0) * uTerrainAmp * 1.2;
    }
    float seasonWinter(vec2 xz) {
      const float TAU = 6.28318530718;
      float point = mod(atan(xz.x, -xz.y) + TAU, TAU);
      float sw = mod(uSweep, TAU);
      float wNew = smoothstep(-0.18, 0.18, sw - point);
      float rev = floor(uSweep / TAU + 0.0001);
      float iNew = mod(rev, 4.0);
      float iOld = mod(rev + 3.0, 4.0);
      float w = 0.0;
      if (abs(iNew - 3.0) < 0.5) w += wNew;
      if (abs(iOld - 3.0) < 0.5) w += 1.0 - wNew;
      return clamp(w, 0.0, 1.0);
    }

    void main() {
      vUv = uv;
      vH = uv.y;
      vColorVary = aColorVary;
      float cy = cos(aYaw);
      float sy = sin(aYaw);
      vec3 tileOrigin = vec3(modelMatrix[3][0], modelMatrix[3][1], modelMatrix[3][2]);
      vec2 baseXZ = tileOrigin.xz + aOffset;
      vWorldXZ = baseXZ;
      float winter = seasonWinter(baseXZ);
      vec3 local = position;
      local.y *= aHeightScale * mix(1.0, 0.07, winter);
      vec3 rotated = vec3(local.x * cy - local.z * sy, local.y, local.x * sy + local.z * cy);
      float groundY = tileOrigin.y + uSurfaceY + sampleHeight(baseXZ);
      float tipFactor = uv.y * uv.y;
      float stiff = max(uBladeStiffness, 0.05);
      vec2 windDir = normalize(uWindDir + vec2(1e-5));
      float n = noise(baseXZ * uWindNoiseScale + vec2(uTime * uWindSpeed * 0.35));
      float gust = noise(baseXZ * uWindNoiseScale * 0.45 - vec2(uTime * uWindSpeed * 0.2));
      float bend = uWindIntensity * tipFactor * (0.55 + n * 0.9 + gust * 0.35) / stiff;
      rotated.x += windDir.x * bend * uBladeHeight;
      rotated.z += windDir.y * bend * uBladeHeight;
      rotated.y -= bend * 0.15 * uBladeHeight * tipFactor;
      if (uInfluenceEnabled > 0.5) {
        vec2 dInf = baseXZ - uInfluenceCenter.xz;
        float dist = length(dInf);
        float flattenAmt = 1.0 - smoothstep(uInfluenceRadius * 0.2, uInfluenceRadius, dist);
        rotated.y *= mix(1.0, 0.05, flattenAmt * (0.45 + tipFactor * 0.55));
      }
      vec3 worldPos = vec3(baseXZ.x, groundY, baseXZ.y) + rotated;
      float camDist = length(baseXZ - uCamXZ);
      vFade = 1.0 - smoothstep(uMaxDistance * 0.72, uMaxDistance, camDist);
      float disk = smoothstep(uDiskRadius, uDiskRadius - 0.28, length(baseXZ));
      vFade *= disk;
      vWorldNormal = normalize(vec3(-sy * 0.15, 1.0, -cy * 0.15));
      gl_Position = projectionMatrix * viewMatrix * vec4(worldPos, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform float uSweep;
    uniform vec3 uTipColor;
    uniform vec3 uBaseColor;
    varying float vH;
    varying float vColorVary;
    varying float vFade;
    varying vec3 vWorldNormal;
    varying vec2 vWorldXZ;

    vec3 seasonTint(vec2 xz, float h) {
      const float TAU = 6.28318530718;
      float point = mod(atan(xz.x, -xz.y) + TAU, TAU);
      float sw = mod(uSweep, TAU);
      float wNew = smoothstep(-0.18, 0.18, sw - point);
      float rev = floor(uSweep / TAU + 0.0001);
      float iNew = mod(rev, 4.0);
      float iOld = mod(rev + 3.0, 4.0);
      vec3 tips[4];
      vec3 bases[4];
      tips[0] = vec3(0.78, 0.86, 0.42); bases[0] = vec3(0.22, 0.38, 0.12);
      tips[1] = vec3(0.55, 0.78, 0.28); bases[1] = vec3(0.12, 0.28, 0.08);
      tips[2] = vec3(0.86, 0.58, 0.24); bases[2] = vec3(0.38, 0.24, 0.08);
      tips[3] = vec3(0.90, 0.94, 0.96); bases[3] = vec3(0.62, 0.70, 0.74);
      int a = int(iOld + 0.5);
      int b = int(iNew + 0.5);
      vec3 tip = mix(tips[a], tips[b], wNew);
      vec3 base = mix(bases[a], bases[b], wNew);
      return mix(base, tip, pow(h, 0.72));
    }

    void main() {
      if (vFade < 0.02) discard;
      vec3 graded = mix(uBaseColor, uTipColor, pow(vH, 0.75));
      graded *= 0.82 + vColorVary * 0.36;
      vec3 col = mix(graded, seasonTint(vWorldXZ, vH), 0.84);
      float ndl = clamp(dot(normalize(vWorldNormal), normalize(vec3(0.35, 1.0, 0.25))), 0.0, 1.0);
      col *= 0.55 + ndl * 0.55;
      gl_FragColor = vec4(col, 1.0);
    }
  `,
};

type Tile = { mesh: InstancedMesh; lod: number; ix: number; iz: number; count: number };

let root: Group | null = null;
let heightTex: DataTexture | null = null;
let sharedMat: ShaderMaterial | null = null;
const bladeGeos = new Map<string, BufferGeometry>();
const tiles = new Map<string, Tile>();
let lastQuality = '';
let lastTileSize = -1;
let lastMaxDist = -1;
let lastDensity = -1;
let lastTerrainAmp = -1;
let windHeld = 0.42;

function defaultsFromSchema(): GrassParams {
  const params = {} as GrassParams;
  for (const field of guiSchema) params[field.key] = field.default as never;
  return params;
}

function lodIndexForNorm(d: number): number {
  for (let i = 0; i < LOD_BANDS.length; i += 1) {
    const band = LOD_BANDS[i]!;
    if (d >= band.min && d < band.max) return i;
  }
  return LOD_BANDS.length - 1;
}

function bladeCountFor(lodIdx: number, params: GrassParams): number {
  const q = QUALITY[params.quality] ?? QUALITY.mid;
  const band = LOD_BANDS[lodIdx] ?? LOD_BANDS[3]!;
  return Math.max(8, Math.floor(q.baseBlades * band.density * params.densityScale));
}

function ensureBladeGeo(segments: number, params: GrassParams): BufferGeometry {
  const key = `${segments}_${params.bladeWidth.toFixed(3)}_${params.bladeHeight.toFixed(3)}`;
  let geo = bladeGeos.get(key);
  if (!geo) {
    geo = createBladeGeometry(segments, params.bladeWidth, params.bladeHeight);
    bladeGeos.set(key, geo);
  }
  return geo;
}

function disposeAllGeos(): void {
  for (const geo of bladeGeos.values()) geo.dispose();
  bladeGeos.clear();
}

function seededRand(ix: number, iz: number, i: number, salt: number): number {
  return hash2(ix * 19.1 + i * 0.17 + salt, iz * 23.7 + i * 0.31 + salt * 1.3);
}

function fillInstances(mesh: InstancedMesh, ix: number, iz: number, count: number, tileSize: number): void {
  const half = tileSize * 0.5;
  const offset = new Float32Array(count * 2);
  const yaw = new Float32Array(count);
  const hScale = new Float32Array(count);
  const colorVary = new Float32Array(count);
  const dummy = new Object3D();
  for (let i = 0; i < count; i += 1) {
    const rx = (seededRand(ix, iz, i, 1) - 0.5) * tileSize;
    const rz = (seededRand(ix, iz, i, 2) - 0.5) * tileSize;
    const ox = MathUtils.clamp(rx, -half + 0.05, half - 0.05);
    const oz = MathUtils.clamp(rz, -half + 0.05, half - 0.05);
    offset[i * 2] = ox;
    offset[i * 2 + 1] = oz;
    const x = ix * tileSize + ox;
    const z = iz * tileSize + oz;
    const clump = fbm2(x * 1.35, z * 1.35);
    const outside = Math.hypot(x, z) > DISK_RADIUS || Math.hypot(x, z) < HUB.radius;
    const feet = Math.hypot(x - FEET.x, z - FEET.z) < FEET.radius;
    yaw[i] = seededRand(ix, iz, i, 3) * Math.PI * 2;
    let height = 0.62 + seededRand(ix, iz, i, 4) * 0.58;
    if (outside || feet) height = 0;
    else if (clump < 0.36) height *= 0.1;
    hScale[i] = height;
    colorVary[i] = seededRand(ix, iz, i, 5);
    dummy.position.set(0, 0, 0);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  }
  mesh.instanceMatrix.needsUpdate = true;
  const geo = mesh.geometry;
  geo.setAttribute('aOffset', new InstancedBufferAttribute(offset, 2));
  geo.setAttribute('aYaw', new InstancedBufferAttribute(yaw, 1));
  geo.setAttribute('aHeightScale', new InstancedBufferAttribute(hScale, 1));
  geo.setAttribute('aColorVary', new InstancedBufferAttribute(colorVary, 1));
  geo.boundingSphere = new Sphere(new Vector3(0, 0.4, 0), tileSize * 0.8);
  mesh.frustumCulled = false;
}

function createTileMesh(ix: number, iz: number, lodIdx: number, params: GrassParams): Tile {
  const band = LOD_BANDS[lodIdx] ?? LOD_BANDS[3]!;
  const count = bladeCountFor(lodIdx, params);
  const geo = new InstancedBufferGeometry();
  geo.copy(ensureBladeGeo(band.segments, params) as unknown as InstancedBufferGeometry);
  geo.instanceCount = count;
  const mesh = new InstancedMesh(geo, sharedMat!, count);
  mesh.frustumCulled = false;
  mesh.position.set(ix * params.tileSize, 0, iz * params.tileSize);
  mesh.count = count;
  fillInstances(mesh, ix, iz, count, params.tileSize);
  mesh.userData.lod = lodIdx;
  root?.add(mesh);
  return { mesh, lod: lodIdx, ix, iz, count };
}

function destroyTile(tile: Tile): void {
  root?.remove(tile.mesh);
  tile.mesh.geometry.dispose();
}

function rebuildHeight(): void {
  heightTex?.dispose();
  heightTex = buildHeightTexture(params.terrainAmp);
  if (sharedMat) sharedMat.uniforms.uHeightMap!.value = heightTex;
}

function clearTiles(): void {
  for (const tile of tiles.values()) destroyTile(tile);
  tiles.clear();
}

function syncTiles(cam: Camera): void {
  if (!root) return;
  const q = QUALITY[params.quality] ?? QUALITY.mid;
  const tileSize = params.tileSize;
  const maxDist = params.maxDistance;
  const cx = cam.position.x;
  const cz = cam.position.z;
  const cix = Math.floor(cx / tileSize + 1e-6);
  const ciz = Math.floor(cz / tileSize + 1e-6);
  const range = Math.ceil(maxDist / tileSize) + 1;
  const candidates: { ix: number; iz: number; dist: number; lod: number; key: string }[] = [];
  for (let dz = -range; dz <= range; dz += 1) {
    for (let dx = -range; dx <= range; dx += 1) {
      const ix = cix + dx;
      const iz = ciz + dz;
      const ox = (ix + 0.5) * tileSize;
      const oz = (iz + 0.5) * tileSize;
      if (Math.hypot(ox, oz) > DISK_RADIUS + tileSize * 0.65) continue;
      const dist = Math.hypot(ox - cx, oz - cz);
      if (dist > maxDist + tileSize * 0.75) continue;
      candidates.push({ ix, iz, dist, lod: lodIndexForNorm(dist / maxDist), key: `${ix},${iz}` });
    }
  }
  candidates.sort((a, b) => a.dist - b.dist);
  const keep = candidates.slice(0, q.tileBudget);
  const needed = new Set(keep.map((item) => item.key));
  for (const [key, tile] of tiles) {
    if (!needed.has(key)) {
      destroyTile(tile);
      tiles.delete(key);
    }
  }
  for (const item of keep) {
    const existing = tiles.get(item.key);
    if (!existing) tiles.set(item.key, createTileMesh(item.ix, item.iz, item.lod, params));
    else if (existing.lod !== item.lod) {
      destroyTile(existing);
      tiles.set(item.key, createTileMesh(item.ix, item.iz, item.lod, params));
    } else existing.mesh.position.set(item.ix * tileSize, 0, item.iz * tileSize);
  }
}

function updateUniforms(cam: Camera, elapsed: number, sweep: number, motion: boolean): void {
  if (!sharedMat) return;
  const u = sharedMat.uniforms;
  u.uTime!.value = elapsed;
  u.uSweep!.value = sweep;
  u.uTipColor!.value.set(params.tipColor);
  u.uBaseColor!.value.set(params.baseColor);
  u.uWindIntensity!.value = motion ? params.windIntensity : 0;
  (u.uWindDir!.value as Vector2).set(Math.cos(params.windDirection), Math.sin(params.windDirection));
  u.uWindNoiseScale!.value = params.windNoiseScale;
  u.uWindSpeed!.value = params.windSpeed;
  u.uBladeStiffness!.value = params.bladeStiffness;
  u.uBladeHeight!.value = params.bladeHeight;
  u.uTerrainAmp!.value = params.terrainAmp;
  (u.uCamXZ!.value as Vector2).set(cam.position.x, cam.position.z);
  u.uMaxDistance!.value = params.maxDistance;
  u.uInfluenceEnabled!.value = 1;
  (u.uInfluenceCenter!.value as Vector3).set(FEET.x, WORLD.surfaceY, FEET.z);
  u.uInfluenceRadius!.value = FEET.radius;
}

const params = defaultsFromSchema();

export type IslandGrass = {
  group: Group;
  params: GrassParams;
  guiSchema: GuiField[];
  update: (dt: number, time: number, sweep: number, camera: Camera, motion: boolean) => void;
  dispose: () => void;
};

export function createIslandGrass(options: { quality?: GrassQualityName; narrow?: boolean } = {}): IslandGrass {
  disposeIslandGrass();
  params.quality = options.quality ?? (options.narrow ? 'low' : 'mid');
  params.densityScale = options.narrow ? 0.48 : 0.72;
  params.tileSize = options.narrow ? 2.6 : 2.15;
  windHeld = params.windIntensity;
  root = new Group();
  root.name = 'terrain-grass-tiles';
  sharedMat = new ShaderMaterial({
    uniforms: UniformsUtils.clone(BladeShader.uniforms),
    vertexShader: BladeShader.vertexShader,
    fragmentShader: BladeShader.fragmentShader,
    depthWrite: true,
    side: DoubleSide,
  });
  sharedMat.uniforms.uTipColor!.value = new Color(params.tipColor);
  sharedMat.uniforms.uBaseColor!.value = new Color(params.baseColor);
  sharedMat.uniforms.uWindDir!.value = new Vector2(1, 0);
  sharedMat.uniforms.uCamXZ!.value = new Vector2();
  sharedMat.uniforms.uInfluenceCenter!.value = new Vector3(FEET.x, WORLD.surfaceY, FEET.z);
  rebuildHeight();
  lastQuality = params.quality;
  lastTileSize = params.tileSize;
  lastMaxDist = params.maxDistance;
  lastDensity = params.densityScale;
  lastTerrainAmp = params.terrainAmp;
  return {
    group: root,
    params,
    guiSchema,
    update(dt, time, sweep, camera, motion) {
      if (!root || !sharedMat) return;
      const topo = params.quality !== lastQuality
        || params.tileSize !== lastTileSize
        || params.maxDistance !== lastMaxDist
        || Math.abs(params.densityScale - lastDensity) > 0.001;
      if (Math.abs(params.terrainAmp - lastTerrainAmp) > 0.004) {
        rebuildHeight();
        lastTerrainAmp = params.terrainAmp;
      }
      if (topo) {
        clearTiles();
        disposeAllGeos();
        lastQuality = params.quality;
        lastTileSize = params.tileSize;
        lastMaxDist = params.maxDistance;
        lastDensity = params.densityScale;
      }
      const baked = sharedMat.userData as { bh?: number; bw?: number };
      if (baked.bh === undefined) baked.bh = params.bladeHeight;
      if (baked.bw === undefined) baked.bw = params.bladeWidth;
      if (Math.abs(baked.bh - params.bladeHeight) > 0.001 || Math.abs(baked.bw - params.bladeWidth) > 0.0001) {
        baked.bh = params.bladeHeight;
        baked.bw = params.bladeWidth;
        clearTiles();
        disposeAllGeos();
      }
      syncTiles(camera);
      updateUniforms(camera, time, sweep, motion);
      void dt;
    },
    dispose: disposeIslandGrass,
  };
}

export function disposeIslandGrass(): void {
  clearTiles();
  disposeAllGeos();
  heightTex?.dispose();
  heightTex = null;
  sharedMat?.dispose();
  sharedMat = null;
  if (root) removeAndDispose(null, root);
  root = null;
  lastQuality = '';
  lastTileSize = lastMaxDist = lastDensity = lastTerrainAmp = -1;
  params.windIntensity = windHeld;
}
