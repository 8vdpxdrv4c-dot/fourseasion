/** Quiet sky, then a short cluster, then quiet again. Not a continuous rain. */
export const METEOR_QUIET = 15.5;
export const METEOR_SHOWER = 4.1;
export const METEOR_CYCLE = METEOR_QUIET + METEOR_SHOWER;
export const METEOR_COUNT = 5;

export type MeteorShot = {
  active: boolean;
  /** 0 at the first spark, 1 when the trail has left. */
  u: number;
};

export function meteorShot(time: number, index: number, reduced: boolean): MeteorShot {
  if (reduced || !Number.isFinite(time) || index < 0 || index >= METEOR_COUNT) {
    return { active: false, u: 0 };
  }
  const local = ((time % METEOR_CYCLE) + METEOR_CYCLE) % METEOR_CYCLE;
  if (local < METEOR_QUIET) return { active: false, u: 0 };
  const showerT = local - METEOR_QUIET;
  const start = 0.08 + index * 0.52;
  const duration = 1.05 + (index % 3) * 0.16;
  if (showerT < start || showerT > start + duration) return { active: false, u: 0 };
  return { active: true, u: (showerT - start) / duration };
}

export function showerActive(time: number, reduced: boolean): boolean {
  if (reduced || !Number.isFinite(time)) return false;
  const local = ((time % METEOR_CYCLE) + METEOR_CYCLE) % METEOR_CYCLE;
  return local >= METEOR_QUIET && local < METEOR_CYCLE;
}
