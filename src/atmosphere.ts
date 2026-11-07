import {
  AdditiveBlending,
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  Group,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  Mesh,
  NormalBlending,
  Object3D,
  PlaneGeometry,
  Points,
  ShaderMaterial,
  SphereGeometry,
  BackSide,
  DoubleSide,
  Vector3,
} from 'three';
import { mulberry32 } from './random';
import { TAU, seasonSample, seasonWeight } from './season';
import { METEOR_COUNT, meteorShot, showerActive } from './showers';
import {
  PARTICLE_FRAG,
  PARTICLE_VERT,
  SKY_FRAG,
  SKY_VERT,
  STAR_FRAG,
  STAR_VERT,
  timeUniform,
} from './shaders';

const NAVY = new Color('#070d20');
const BAND = new Color('#6678b0');
const DUST = new Color('#c9a4b4');

type Particle = {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  spin: number;
  spinVel: number;
  life: number;
  kind: number;
  scale: number;
  phase: number;
};

export type Atmosphere = {
  sky: Mesh;
  stars: Points;
  particles: Group;
  meteors: Group;
  update: (dt: number, sweep: number, motion: boolean, time?: number, reduced?: boolean) => void;
  setPixelRatio: (value: number) => void;
  skyState: () => { shower: boolean; active: number };
};

export function createAtmosphere(counts: { stars: number; debris: number; fireflies: number }): Atmosphere {
  const skyMat = new ShaderMaterial({
    uniforms: {
      uNavy: { value: NAVY },
      uBand: { value: BAND },
      uDust: { value: DUST },
      uTime: timeUniform,
    },
    vertexShader: SKY_VERT,
    fragmentShader: SKY_FRAG,
    side: BackSide,
    depthWrite: false,
  });
  const sky = new Mesh(new SphereGeometry(90, 48, 32), skyMat);
  sky.frustumCulled = false;
  sky.renderOrder = -2;

  const starGeo = new BufferGeometry();
  const rng = mulberry32(7);
  const positions = new Float32Array(counts.stars * 3);
  const colors = new Float32Array(counts.stars * 3);
  const sizes = new Float32Array(counts.stars);
  const phases = new Float32Array(counts.stars);
  const flares = new Float32Array(counts.stars);
  const palette = [new Color('#d7e4ff'), new Color('#fff4e0'), new Color('#f6b9d4'), new Color('#ffffff')];
  for (let i = 0; i < counts.stars; i += 1) {
    const dir = new Vector3(rng() * 2 - 1, rng() * 2 - 1, rng() * 2 - 1).normalize();
    if (dir.y < -0.2) dir.y = Math.abs(dir.y);
    const radius = 55 + rng() * 28;
    dir.multiplyScalar(radius);
    positions[i * 3] = dir.x;
    positions[i * 3 + 1] = dir.y;
    positions[i * 3 + 2] = dir.z;
    const tint = palette[i % 11 === 0 ? 2 : i % 7 === 0 ? 1 : i % 5 === 0 ? 3 : 0] ?? palette[0]!;
    const bright = rng() > 0.9;
    const boost = bright ? 1.65 : 1.2;
    colors[i * 3] = Math.min(1.8, tint.r * boost);
    colors[i * 3 + 1] = Math.min(1.8, tint.g * boost);
    colors[i * 3 + 2] = Math.min(1.8, tint.b * boost);
    sizes[i] = bright ? 3.1 + rng() * 1.8 : 1.15 + rng() * 1.45;
    phases[i] = rng() * TAU;
    flares[i] = bright ? 0.35 : 0;
  }
  starGeo.setAttribute('position', new Float32BufferAttribute(positions, 3));
  starGeo.setAttribute('aColor', new Float32BufferAttribute(colors, 3));
  starGeo.setAttribute('aSize', new Float32BufferAttribute(sizes, 1));
  starGeo.setAttribute('aPhase', new Float32BufferAttribute(phases, 1));
  starGeo.setAttribute('aFlare', new Float32BufferAttribute(flares, 1));
  const pixelRatio = { value: 1 };
  const stars = new Points(
    starGeo,
    new ShaderMaterial({
      uniforms: { uTime: timeUniform, uPixelRatio: pixelRatio },
      vertexShader: STAR_VERT,
      fragmentShader: STAR_FRAG,
      transparent: true,
      depthWrite: false,
    }),
  );
  stars.frustumCulled = false;
  stars.renderOrder = -1;

  const debris = createPool(counts.debris, false, 3);
  const fireflies = createPool(counts.fireflies, true, 91);
  const particles = new Group();
  particles.add(debris.mesh, fireflies.mesh);
  const meteors = createMeteors();

  return {
    sky,
    stars,
    particles,
    meteors: meteors.group,
    setPixelRatio(value: number) {
      pixelRatio.value = value;
    },
    skyState() {
      return meteors.state;
    },
    update(dt, sweep, motion, time = 0, reduced = false) {
      stepPool(debris, dt, sweep, motion, false);
      stepPool(fireflies, dt, sweep, motion, true);
      meteors.update(time, reduced);
    },
  };
}

const METEOR_PATHS = [
  { from: [-6.4, 3.05, -1.4], to: [6.2, 2.15, -5.6] },
  { from: [5.8, 3.55, 0.8], to: [-5.2, 2.35, -5.2] },
  { from: [-1.2, 3.9, 1.6], to: [3.8, 2.55, -5.8] },
  { from: [6.8, 2.7, -2.2], to: [-5.8, 2.05, -4.2] },
  { from: [-6.6, 3.35, 0.2], to: [2.4, 2.25, -5.4] },
];

function createMeteors(): {
  group: Group;
  update: (time: number, reduced: boolean) => void;
  state: { shower: boolean; active: number };
} {
  const group = new Group();
  group.renderOrder = -1;
  const dir = new Vector3();
  const pos = new Vector3();
  const side = new Vector3();
  const normal = new Vector3();
  const view = new Vector3(0, 0.35, 1);
  const basis = new Matrix4();
  const shots = METEOR_PATHS.slice(0, METEOR_COUNT).map((path) => {
    const material = new ShaderMaterial({
      uniforms: { uLife: { value: 0 } },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        varying vec2 vUv;
        uniform float uLife;
        void main() {
          float along = vUv.y;
          float across = pow(smoothstep(0.5, 0.04, abs(vUv.x - 0.5)), 1.7);
          float head = smoothstep(0.88, 1.0, along);
          float trail = smoothstep(0.0, 0.42, along) * (1.0 - smoothstep(0.7, 0.98, along));
          float life = sin(clamp(uLife, 0.0, 1.0) * 3.14159265);
          float alpha = across * (trail * 0.5 + head * 0.95) * life;
          if (alpha < 0.025) discard;
          vec3 col = mix(vec3(0.62, 0.76, 1.0), vec3(1.0, 0.97, 0.88), head);
          gl_FragColor = vec4(col * (0.85 + head * 0.7), alpha);
        }
      `,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: AdditiveBlending,
      toneMapped: false,
      side: DoubleSide,
    });
    const mesh = new Mesh(new PlaneGeometry(0.22, 5.6), material);
    mesh.frustumCulled = false;
    mesh.visible = false;
    mesh.renderOrder = -1;
    group.add(mesh);
    return {
      mesh,
      material,
      from: new Vector3(...path.from),
      to: new Vector3(...path.to),
    };
  });
  const state: { shower: boolean; active: number; points: number[][] } = { shower: false, active: 0, points: [] };
  return {
    group,
    state,
    update(time, reduced) {
      let active = 0;
      shots.forEach((shot, index) => {
        const fly = meteorShot(time, index, reduced);
        shot.mesh.visible = fly.active;
        shot.material.uniforms.uLife.value = fly.u;
        if (!fly.active) return;
        active += 1;
        pos.copy(shot.from).lerp(shot.to, fly.u);
        dir.copy(shot.to).sub(shot.from).normalize();
        side.crossVectors(dir, view);
        if (side.lengthSq() < 1e-6) side.set(1, 0, 0);
        side.normalize();
        normal.crossVectors(side, dir).normalize();
        basis.makeBasis(side, dir, normal);
        shot.mesh.position.copy(pos);
        shot.mesh.quaternion.setFromRotationMatrix(basis);
      });
      state.shower = showerActive(time, reduced);
      state.active = active;
      state.points = shots.filter((shot) => shot.mesh.visible).map((shot) => shot.mesh.position.toArray());
    },
  };
}

type Pool = {
  mesh: InstancedMesh;
  items: Particle[];
  alpha: Float32Array;
  spin: Float32Array;
  color: Float32Array;
  scale: Float32Array;
  kind: Float32Array;
  dummy: Object3D;
  rng: () => number;
};

function createPool(count: number, additive: boolean, seed: number): Pool {
  const geo = new PlaneGeometry(1, 1);
  const alpha = new Float32Array(count);
  const spin = new Float32Array(count);
  const color = new Float32Array(count * 3);
  const scale = new Float32Array(count);
  const kind = new Float32Array(count);
  geo.setAttribute('aAlpha', new InstancedBufferAttribute(alpha, 1));
  geo.setAttribute('aSpin', new InstancedBufferAttribute(spin, 1));
  geo.setAttribute('aColor', new InstancedBufferAttribute(color, 3));
  geo.setAttribute('aScale', new InstancedBufferAttribute(scale, 1));
  geo.setAttribute('aKind', new InstancedBufferAttribute(kind, 1));
  const mesh = new InstancedMesh(
    geo,
    new ShaderMaterial({
      uniforms: { uTime: timeUniform },
      vertexShader: PARTICLE_VERT,
      fragmentShader: PARTICLE_FRAG,
      transparent: true,
      depthWrite: false,
      blending: additive ? AdditiveBlending : NormalBlending,
      toneMapped: !additive,
    }),
    count,
  );
  mesh.frustumCulled = false;
  mesh.renderOrder = additive ? 4 : 3;
  const rng = mulberry32(seed);
  const items: Particle[] = [];
  for (let i = 0; i < count; i += 1) {
    items.push(spawn(rng, additive, 0.9 * TAU));
  }
  return { mesh, items, alpha, spin, color, scale, kind, dummy: new Object3D(), rng };
}

function spawn(rng: () => number, firefly: boolean, sweep: number): Particle {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const ang = rng() * TAU;
    const rad = Math.sqrt(rng()) * 4.35;
    const x = Math.sin(ang) * rad;
    const z = -Math.cos(ang) * rad;
    const sample = seasonSample(x, z, sweep, 0.18);
    const weights = [0, 0, 0, 0];
    weights[sample.iNew] = (weights[sample.iNew] ?? 0) + sample.wNew;
    weights[sample.iOld] = (weights[sample.iOld] ?? 0) + (1 - sample.wNew);
    let season = sample.iOld;
    let acc = 0;
    const total = weights.reduce((sum, value) => sum + value, 0) || 1;
    const roll = rng() * total;
    for (let i = 0; i < 4; i += 1) {
      acc += weights[i] ?? 0;
      if (roll <= acc) {
        season = i;
        break;
      }
    }
    const summer = season === 1;
    if (firefly !== summer && attempt < 7) continue;
    const kind = firefly ? 3 : season === 2 ? 1 : season === 3 ? 2 : 0;
    return {
      x,
      y: firefly ? 0.35 + rng() * 0.9 : 0.45 + rng() * 1.7,
      z,
      vx: (rng() - 0.4) * (kind === 1 ? 0.28 : 0.12),
      vy: firefly ? 0.05 : kind === 1 ? -0.36 : kind === 2 ? -0.22 : -0.16,
      vz: (rng() - 0.5) * 0.08,
      spin: rng() * TAU,
      spinVel: (rng() - 0.5) * (kind === 1 ? 2.4 : 1.2),
      life: 0.35 + rng() * 0.65,
      kind,
      scale: firefly ? 0.05 + rng() * 0.04 : kind === 2 ? 0.035 + rng() * 0.03 : 0.07 + rng() * 0.07,
      phase: rng() * TAU,
    };
  }
  return {
    x: 0,
    y: -1,
    z: 0,
    vx: 0,
    vy: 0,
    vz: 0,
    spin: 0,
    spinVel: 0,
    life: 0,
    kind: firefly ? 3 : 0,
    scale: 0.01,
    phase: 0,
  };
}

function stepPool(pool: Pool, dt: number, sweep: number, motion: boolean, firefly: boolean): void {
  const windX = Math.sin(timeUniform.value * 0.35) * 0.18 + 0.12;
  const windZ = Math.cos(timeUniform.value * 0.27) * 0.08;
  for (let i = 0; i < pool.items.length; i += 1) {
    let p = pool.items[i];
    if (!p) continue;
    if (motion) {
      p.life -= dt * (firefly ? 0.12 : 0.18);
      p.x += (p.vx + windX) * dt;
      p.z += (p.vz + windZ) * dt;
      p.y += p.vy * dt;
      p.spin += p.spinVel * dt;
      p.x += Math.sin(timeUniform.value * 1.4 + p.phase) * dt * 0.12;
      if (firefly) p.y += Math.sin(timeUniform.value * 2 + p.phase) * dt * 0.15;
    }
    const sample = seasonSample(p.x, p.z, sweep, 0.2);
    const season = firefly ? 1 : p.kind === 1 ? 2 : p.kind === 2 ? 3 : 0;
    const w = seasonWeight(sample, season);
    const outside = Math.hypot(p.x, p.z) > 4.65 || p.y < 0.22 || p.life <= 0 || w < 0.04;
    if (outside) {
      p = spawn(pool.rng, firefly, sweep);
      pool.items[i] = p;
    }
    const alpha = Math.min(p.life, 1) * Math.min(w, 1) * (p.y < 0.4 ? (p.y - 0.2) / 0.2 : 1);
    pool.alpha[i] = Math.max(0, alpha);
    pool.spin[i] = p.spin;
    pool.scale[i] = p.scale;
    pool.kind[i] = p.kind;
    const tint = firefly
      ? [1.7, 1.45, 0.75]
      : p.kind === 1
        ? [0.89, 0.45, 0.16]
        : p.kind === 2
          ? [0.94, 0.97, 1]
          : [0.96, 0.73, 0.83];
    pool.color[i * 3] = tint[0] ?? 1;
    pool.color[i * 3 + 1] = tint[1] ?? 1;
    pool.color[i * 3 + 2] = tint[2] ?? 1;
    pool.dummy.position.set(p.x, p.y, p.z);
    pool.dummy.rotation.set(0, 0, 0);
    pool.dummy.scale.set(1, 1, 1);
    pool.dummy.updateMatrix();
    pool.mesh.setMatrixAt(i, pool.dummy.matrix);
  }
  pool.mesh.instanceMatrix.needsUpdate = true;
  const geo = pool.mesh.geometry;
  (geo.getAttribute('aAlpha') as InstancedBufferAttribute).needsUpdate = true;
  (geo.getAttribute('aSpin') as InstancedBufferAttribute).needsUpdate = true;
  (geo.getAttribute('aColor') as InstancedBufferAttribute).needsUpdate = true;
  (geo.getAttribute('aScale') as InstancedBufferAttribute).needsUpdate = true;
  (geo.getAttribute('aKind') as InstancedBufferAttribute).needsUpdate = true;
}
