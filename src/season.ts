export const TAU = Math.PI * 2;

export const SEASONS = [
  { id: 'spring', label: '春', line: '桃花酿暖', aria: '春季' },
  { id: 'summer', label: '夏', line: '绿意正浓', aria: '夏季' },
  { id: 'autumn', label: '秋', line: '琥珀落叶', aria: '秋季' },
  { id: 'winter', label: '冬', line: '霜色初晴', aria: '冬季' },
] as const;

export const WORLD = {
  surfaceY: 0.17,
  diskRadius: 4.72,
  rimRadius: 5.02,
};

/** Couple's side of the disk, toward the camera (+Z). */
export const FRONT = { x: 0, z: 1.32 };

export function wrapAngle(a: number): number {
  return ((a % TAU) + TAU) % TAU;
}

export function mod(n: number, m: number): number {
  return ((n % m) + m) % m;
}

/** 0 at the far rim (-Z), increasing toward +X. Matches the GLSL `atan(x, -z)`. */
export function diskAngle(x: number, z: number): number {
  return Math.atan2(x, -z);
}

export function angleToPoint(angle: number, radius: number): { x: number; z: number } {
  return { x: Math.sin(angle) * radius, z: -Math.cos(angle) * radius };
}

function smooth01(t: number): number {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
}

function smoothRange(edge0: number, edge1: number, x: number): number {
  return smooth01((x - edge0) / (edge1 - edge0));
}

export type SeasonSample = {
  wNew: number;
  iNew: number;
  iOld: number;
  sw: number;
  point: number;
  rev: number;
};

/**
 * Incoming season is a wedge from the far rim (angle 0) to the golden hand.
 * CPU feather is a little wider than the shader so trees cover the noisy edge.
 */
export function seasonSample(x: number, z: number, sweep: number, feather = 0.24): SeasonSample {
  const point = wrapAngle(diskAngle(x, z));
  const rev = Math.floor(sweep / TAU + 1e-4);
  const sw = sweep - rev * TAU;
  let wNew = smoothRange(-feather, feather, sw - point);
  const sd = point > Math.PI ? point - TAU : point;
  const seamBand = 1 - smoothRange(feather, feather * 3.5, Math.abs(sd));
  const seamW = smoothRange(-feather, feather, sd);
  const handFar = smoothRange(0.35, 0.7, Math.min(sw, TAU - sw));
  const seam = seamBand * handFar;
  wNew = wNew * (1 - seam) + seamW * seam;
  wNew = Math.min(1, Math.max(0, wNew));
  const iNew = mod(rev, 4);
  const iOld = mod(rev + 3, 4);
  return { wNew, iNew, iOld, sw, point, rev };
}

export function seasonWeight(sample: SeasonSample, index: number): number {
  let w = 0;
  if (sample.iNew === index) w += sample.wNew;
  if (sample.iOld === index) w += 1 - sample.wNew;
  return Math.min(1, Math.max(0, w));
}

export function frontSeason(sweep: number): number {
  const sample = seasonSample(FRONT.x, FRONT.z, sweep, 0.16);
  return sample.wNew >= 0.5 ? sample.iNew : sample.iOld;
}

/** Sweep forward until `seasonIndex` has just finished covering the whole disk. */
export function seekTarget(sweep: number, seasonIndex: number): number {
  for (let step = 0; step < 8; step += 1) {
    const rev = Math.floor(sweep / TAU + 1e-4) + step;
    if (mod(rev, 4) === seasonIndex) {
      const end = (rev + 1) * TAU;
      if (end > sweep + 0.12) return end;
    }
  }
  return sweep + TAU * 4;
}

export function globalLightMix(sweep: number): { iNew: number; iOld: number; t: number } {
  const rev = Math.floor(sweep / TAU + 1e-4);
  const sw = sweep - rev * TAU;
  const t = smoothRange(0.08, 0.92, sw / TAU);
  return { iNew: mod(rev, 4), iOld: mod(rev + 3, 4), t };
}
