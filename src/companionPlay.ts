/** Front-edge home. The pair stays on the meadow, inside the tree ring and clear of the rim. */
export const COMPANION_HOME = {
  left: { x: -0.4, z: 3.12 },
  right: { x: 0.38, z: 3.06 },
};

export const PLAY_SAFE = {
  minX: -1.05,
  maxX: 1.05,
  minZ: 2.55,
  maxZ: 3.48,
  maxRadius: 3.85,
  minSeparation: 0.58,
};

/** Rest, chase, little hops, kiss, hug, rest. Deterministic in `time`. */
export const PLAY_CYCLE = 14;

export type PlayBeat = 'rest' | 'chase' | 'hop' | 'kiss' | 'hug';

export type FigurePose = {
  x: number;
  z: number;
  rotY: number;
  hop: number;
  headYaw: number;
  headPitch: number;
  lean: number;
  armIn: number;
  armOut: number;
};

export type PlayFrame = {
  beat: PlayBeat;
  left: FigurePose;
  right: FigurePose;
  heart: number;
  separation: number;
};

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

function smooth(t: number): number {
  const x = clamp01(t);
  return x * x * (3 - 2 * x);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function lerpPose(a: FigurePose, b: FigurePose, t: number): FigurePose {
  return {
    x: lerp(a.x, b.x, t),
    z: lerp(a.z, b.z, t),
    rotY: lerp(a.rotY, b.rotY, t),
    hop: lerp(a.hop, b.hop, t),
    headYaw: lerp(a.headYaw, b.headYaw, t),
    headPitch: lerp(a.headPitch, b.headPitch, t),
    lean: lerp(a.lean, b.lean, t),
    armIn: lerp(a.armIn, b.armIn, t),
    armOut: lerp(a.armOut, b.armOut, t),
  };
}

function enclose(pose: FigurePose): FigurePose {
  let x = Math.min(PLAY_SAFE.maxX, Math.max(PLAY_SAFE.minX, pose.x));
  let z = Math.min(PLAY_SAFE.maxZ, Math.max(PLAY_SAFE.minZ, pose.z));
  const radius = Math.hypot(x, z);
  if (radius > PLAY_SAFE.maxRadius) {
    const scale = PLAY_SAFE.maxRadius / radius;
    x *= scale;
    z *= scale;
  }
  return { ...pose, x, z };
}

export function standPose(side: -1 | 1): FigurePose {
  const home = side < 0 ? COMPANION_HOME.left : COMPANION_HOME.right;
  return {
    x: home.x,
    z: home.z,
    rotY: side < 0 ? 0.62 : -0.58,
    hop: 0,
    headYaw: side < 0 ? 0.28 : -0.26,
    headPitch: 0.02,
    lean: side < 0 ? -0.02 : 0.02,
    armIn: 0,
    armOut: 0,
  };
}

function finish(beat: PlayBeat, left: FigurePose, right: FigurePose, heart: number): PlayFrame {
  const a = enclose(left);
  const b = enclose(right);
  const separation = Math.hypot(a.x - b.x, a.z - b.z);
  if (separation < PLAY_SAFE.minSeparation && separation > 1e-4) {
    const midX = (a.x + b.x) * 0.5;
    const midZ = (a.z + b.z) * 0.5;
    const push = PLAY_SAFE.minSeparation / separation;
    a.x = midX + (a.x - midX) * push;
    a.z = midZ + (a.z - midZ) * push;
    b.x = midX + (b.x - midX) * push;
    b.z = midZ + (b.z - midZ) * push;
  }
  return {
    beat,
    left: enclose(a),
    right: enclose(b),
    heart,
    separation: Math.hypot(a.x - b.x, a.z - b.z),
  };
}

function affectionateStill(): PlayFrame {
  const left = standPose(-1);
  const right = standPose(1);
  left.x = -0.3;
  right.x = 0.28;
  left.z = 3.14;
  right.z = 3.1;
  left.headYaw = 0.48;
  right.headYaw = -0.46;
  left.headPitch = 0.08;
  right.headPitch = 0.08;
  left.lean = -0.05;
  right.lean = 0.05;
  left.armIn = -0.42;
  right.armIn = -0.42;
  return finish('rest', left, right, 0);
}

/** Clock-driven play. Reduced motion is one still, close, affectionate pose. */
export function playFrame(time: number, reduced: boolean): PlayFrame {
  if (reduced || !Number.isFinite(time)) return affectionateStill();
  const t = ((time % PLAY_CYCLE) + PLAY_CYCLE) % PLAY_CYCLE;
  const left = standPose(-1);
  const right = standPose(1);
  const homeL = COMPANION_HOME.left;
  const homeR = COMPANION_HOME.right;

  if (t < 2.1) {
    const sway = Math.sin(t * 1.5) * 0.035;
    left.rotY += sway;
    right.rotY -= sway * 0.8;
    left.headYaw += sway * 0.4;
    right.headYaw -= sway * 0.4;
    return finish('rest', left, right, 0);
  }

  if (t < 5.2) {
    const u = (t - 2.1) / 3.1;
    const env = Math.sin(u * Math.PI);
    const ang = u * Math.PI * 2;
    const radius = 0.26 * env;
    left.x = homeL.x + Math.cos(ang) * radius;
    left.z = homeL.z + Math.sin(ang) * radius * 0.55;
    right.x = homeR.x + Math.cos(ang + Math.PI) * radius * 0.92;
    right.z = homeR.z + Math.sin(ang + Math.PI) * radius * 0.5;
    const tangent = Math.atan2(Math.cos(ang), Math.sin(ang) * 0.55);
    left.rotY = lerp(0.62, tangent, env);
    right.rotY = lerp(-0.58, tangent + Math.PI, env);
    left.headYaw = 0.35 + env * 0.25;
    right.headYaw = -0.32 - env * 0.22;
    left.armOut = Math.sin(ang * 2) * 0.18 * env;
    right.armOut = Math.sin(ang * 2 + 1) * 0.18 * env;
    return finish('chase', left, right, 0);
  }

  if (t < 7.15) {
    const u = (t - 5.2) / 1.95;
    const env = Math.sin(u * Math.PI);
    const leftWave = Math.max(0, Math.sin(u * Math.PI * 4));
    const rightWave = Math.max(0, Math.sin(u * Math.PI * 4 + Math.PI));
    left.hop = env * leftWave * 0.16;
    right.hop = env * rightWave * 0.16;
    left.x = homeL.x + Math.sin(u * Math.PI * 2) * 0.06;
    right.x = homeR.x - Math.sin(u * Math.PI * 2) * 0.06;
    left.headPitch = -left.hop * 0.4;
    right.headPitch = -right.hop * 0.4;
    left.armOut = left.hop * 1.4;
    right.armOut = right.hop * 1.4;
    return finish('hop', left, right, 0);
  }

  if (t < 9.55) {
    const u = (t - 7.15) / 2.4;
    const approach = smooth(Math.min(1, u / 0.28));
    const release = u > 0.78 ? smooth((u - 0.78) / 0.22) : 0;
    const close = approach * (1 - release * 0.35);
    left.x = lerp(homeL.x, -0.34, close);
    right.x = lerp(homeR.x, 0.32, close);
    left.z = lerp(homeL.z, 3.16, close);
    right.z = lerp(homeR.z, 3.14, close);
    left.rotY = lerp(0.62, 0.95, close);
    right.rotY = lerp(-0.58, -0.92, close);
    left.headYaw = 0.55 * close;
    right.headYaw = -0.52 * close;
    left.headPitch = 0.2 * close;
    right.headPitch = 0.18 * close;
    left.lean = -0.08 * close;
    right.lean = 0.08 * close;
    return finish('kiss', left, right, close * 0.8);
  }

  if (t < 12.05) {
    const u = (t - 9.55) / 2.5;
    const embrace = smooth(Math.min(1, u / 0.22));
    const release = u > 0.72 ? smooth((u - 0.72) / 0.28) : 0;
    const hold = embrace * (1 - release);
    left.x = lerp(homeL.x, -0.32, hold);
    right.x = lerp(homeR.x, 0.3, hold);
    left.z = lerp(homeL.z, 3.14, hold);
    right.z = lerp(homeR.z, 3.12, hold);
    left.rotY = lerp(0.62, 1.05, hold);
    right.rotY = lerp(-0.58, -1.02, hold);
    left.headYaw = 0.15 * hold;
    right.headYaw = -0.12 * hold;
    left.headPitch = 0.06 * hold;
    right.headPitch = 0.06 * hold;
    left.lean = -0.04 * hold;
    right.lean = 0.04 * hold;
    left.armIn = 0.9 * hold;
    right.armIn = -0.9 * hold;
    left.armOut = -0.25 * hold;
    right.armOut = -0.25 * hold;
    return finish('hug', left, right, hold * 0.45);
  }

  const u = (t - 12.05) / (PLAY_CYCLE - 12.05);
  const settle = 1 - smooth(u);
  left.x = lerp(homeL.x, -0.32, settle * 0.2);
  right.x = lerp(homeR.x, 0.3, settle * 0.2);
  return finish('rest', left, right, 0);
}
