import { TAU, diskAngle, wrapAngle } from './season';

/** Near-front pair. The golden hand advances with disk angle and meets the right figure first. */
export const COMPANION_LEFT = { x: -0.4, z: 1.22 };
export const COMPANION_RIGHT = { x: 0.38, z: 1.16 };

/** Matches the sweep unwind in the render loop (four-season periods). */
const UNWIND = TAU * 4;

export const COMPANION_JUMP_DURATION = 0.96;

export type JumpPose = { y: number; scaleY: number };

export type JumpState = {
  previousSweep: number | null;
  elapsed: number;
  pending: boolean;
  jumps: number;
};

export function createJumpState(): JumpState {
  return { previousSweep: null, elapsed: -1, pending: false, jumps: 0 };
}

/** First angle the forward-moving hand reaches as it sweeps across the pair. */
export function companionTriggerAngle(
  left: { x: number; z: number } = COMPANION_LEFT,
  right: { x: number; z: number } = COMPANION_RIGHT,
): number {
  const a = wrapAngle(diskAngle(left.x, left.z));
  const b = wrapAngle(diskAngle(right.x, right.z));
  const forward = wrapAngle(b - a);
  return forward <= TAU / 2 ? a : b;
}

/**
 * Forward sweep change. A large drop that lands within a fraction of a radian
 * is the render loop subtracting whole 4-turn blocks, not a backward seek.
 */
export function sweepDelta(prev: number, next: number): number {
  const delta = next - prev;
  if (delta >= -1e-6) return Math.max(0, delta);
  const steps = Math.round(-delta / UNWIND);
  if (steps <= 0) return delta;
  const corrected = delta + steps * UNWIND;
  if (corrected >= -1e-4 && corrected < 0.75) return Math.max(0, corrected);
  return delta;
}

/** How many times the hand passes `trigger` while moving from prev to next. */
export function handCrossings(prevSweep: number, nextSweep: number, trigger: number): number {
  const delta = sweepDelta(prevSweep, nextSweep);
  if (delta <= 1e-5) return 0;
  const dist = wrapAngle(trigger - wrapAngle(prevSweep));
  if (dist <= 1e-6) return Math.floor((delta + 1e-6) / TAU);
  if (delta + 1e-6 < dist) return 0;
  return 1 + Math.floor((delta - dist + 1e-6) / TAU);
}

function smooth(t: number): number {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
}

/** Whole-body hop: anticipation squash, rise, fall, then a short landing spring. */
export function companionJumpPose(elapsed: number): JumpPose {
  if (!(elapsed >= 0) || elapsed >= COMPANION_JUMP_DURATION) return { y: 0, scaleY: 1 };
  const u = elapsed / COMPANION_JUMP_DURATION;
  if (u < 0.14) {
    const k = smooth(u / 0.14);
    return { y: -0.01 * k, scaleY: 1 - 0.16 * k };
  }
  if (u < 0.44) {
    const k = smooth((u - 0.14) / 0.3);
    const lift = 1 - (1 - k) * (1 - k);
    return { y: -0.01 + 0.71 * lift, scaleY: 0.84 + 0.24 * k };
  }
  if (u < 0.7) {
    const k = (u - 0.44) / 0.26;
    const fall = k * k;
    return { y: 0.7 * (1 - fall), scaleY: 1.08 - 0.08 * fall };
  }
  const k = (u - 0.7) / 0.3;
  if (k < 0.42) {
    const s = smooth(k / 0.42);
    return { y: 0, scaleY: 1 - 0.1 * s };
  }
  const s = smooth((k - 0.42) / 0.58);
  return { y: Math.sin(s * Math.PI) * 0.048, scaleY: 0.9 + 0.1 * s };
}

/** Lateral scale keeps the body from looking pinched when it squashes or stretches. */
export function companionJumpScale(scaleY: number): { x: number; y: number; z: number } {
  const lateral = 1 + (1 - scaleY) * 0.65;
  return { x: lateral, y: scaleY, z: lateral };
}

/**
 * Advance the shared hop. A crossing while a hop is playing is remembered once,
 * so a fast extra pass is not dropped and a multi-turn teleport does not queue a string of hops.
 */
export function stepCompanionJump(state: JumpState, sweep: number, dt: number, reduced: boolean, trigger: number): JumpPose {
  if (state.previousSweep !== null && !reduced) {
    const crossings = handCrossings(state.previousSweep, sweep, trigger);
    if (crossings > 0) {
      if (state.elapsed < 0) {
        state.elapsed = 0;
        state.jumps += 1;
        if (crossings > 1) state.pending = true;
      } else {
        state.pending = true;
      }
    }
  }
  state.previousSweep = sweep;

  if (reduced) {
    state.elapsed = -1;
    state.pending = false;
    return { y: 0, scaleY: 1 };
  }

  if (state.elapsed >= 0) {
    state.elapsed += Math.min(Math.max(dt, 0), 0.05);
    if (state.elapsed >= COMPANION_JUMP_DURATION) {
      if (state.pending) {
        state.pending = false;
        state.elapsed = 0;
        state.jumps += 1;
      } else {
        state.elapsed = -1;
      }
    }
  }

  if (state.elapsed < 0) return { y: 0, scaleY: 1 };
  return companionJumpPose(state.elapsed);
}
