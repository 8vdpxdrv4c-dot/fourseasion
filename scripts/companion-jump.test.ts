import assert from 'node:assert/strict';
import {
  COMPANION_JUMP_DURATION,
  companionJumpPose,
  companionTriggerAngle,
  createJumpState,
  handCrossings,
  stepCompanionJump,
  sweepDelta,
} from '../src/companionJump.ts';
import { TAU } from '../src/season.ts';

const trigger = companionTriggerAngle();
const right = Math.atan2(0.38, -1.16);
const left = Math.atan2(-0.4, -1.22);
const wrap = (a: number) => ((a % TAU) + TAU) % TAU;

assert.ok(trigger > 2.7 && trigger < 3.0, `trigger ${trigger} should be the leading companion`);
assert.ok(Math.abs(trigger - wrap(right)) < 1e-9, 'hand meets the right figure first');
assert.ok(wrap(left) > trigger, 'left figure is later along the sweep');

assert.equal(handCrossings(trigger - 0.2, trigger - 0.05, trigger), 0);
assert.equal(handCrossings(trigger - 0.08, trigger + 0.02, trigger), 1);
assert.equal(handCrossings(trigger + 0.02, trigger + 0.4, trigger), 0);
assert.equal(handCrossings(trigger + 0.2, trigger - 0.4, trigger), 0);
assert.equal(handCrossings(trigger, trigger + 0.05, trigger), 0);
assert.equal(handCrossings(trigger - 0.01, trigger - 0.01, trigger), 0);

const nearSeam = 0.04;
assert.equal(handCrossings(TAU - 0.05, TAU + 0.08, nearSeam), 1);
assert.equal(handCrossings(TAU - 0.02, 0.01, nearSeam), 0);
assert.equal(handCrossings(-0.03, nearSeam + 0.01, nearSeam), 1);

const unwoundPrev = TAU * 16 + (trigger - 0.04);
const unwoundNext = unwoundPrev + 0.09 - TAU * 4;
assert.ok(sweepDelta(unwoundPrev, unwoundNext) > 0.05 && sweepDelta(unwoundPrev, unwoundNext) < 0.2);
assert.equal(handCrossings(unwoundPrev, unwoundNext, trigger), 1);
assert.equal(handCrossings(5, 5 - TAU * 4 - 0.2, trigger), 0);

const stepped = createJumpState();
let sweep = trigger - 0.3;
for (let i = 0; i < 40; i += 1) {
  sweep += 0.02;
  stepCompanionJump(stepped, sweep, 1 / 60, false, trigger);
}
assert.equal(stepped.jumps, 1, 'small steps cross once');
const jumpsAfterOverlap = stepped.jumps;
for (let i = 0; i < 15; i += 1) {
  sweep += 0.02;
  stepCompanionJump(stepped, sweep, 1 / 60, false, trigger);
}
assert.equal(stepped.jumps, jumpsAfterOverlap, 'overlap does not retrigger');

const held = createJumpState();
stepCompanionJump(held, trigger + 0.01, 1 / 60, false, trigger);
for (let i = 0; i < 90; i += 1) stepCompanionJump(held, trigger + 0.01, 1 / 60, false, trigger);
assert.equal(held.jumps, 0, 'a stationary hand does not hop');

const wrapped = createJumpState();
stepCompanionJump(wrapped, trigger + 0.3, 0, false, trigger);
stepCompanionJump(wrapped, trigger + TAU + 0.05, 1 / 60, false, trigger);
assert.equal(wrapped.jumps, 1, 'the next revolution hops once');

const reduced = createJumpState();
stepCompanionJump(reduced, trigger - 0.2, 0, true, trigger);
stepCompanionJump(reduced, trigger + 0.3, 1 / 60, true, trigger);
assert.equal(reduced.jumps, 0);
assert.equal(reduced.elapsed, -1);

let peak = 0;
let minScale = 1;
let maxScale = 1;
let prevY = 0;
for (let ms = 0; ms <= COMPANION_JUMP_DURATION * 1000; ms += 8) {
  const pose = companionJumpPose(ms / 1000);
  peak = Math.max(peak, pose.y);
  minScale = Math.min(minScale, pose.scaleY);
  maxScale = Math.max(maxScale, pose.scaleY);
  assert.ok(Math.abs(pose.y - prevY) < 0.12, `pose popped at ${ms}ms`);
  prevY = pose.y;
  assert.ok(pose.scaleY > 0.8 && pose.scaleY < 1.15);
}
assert.ok(peak > 0.6, `peak ${peak} should clear the ground`);
assert.ok(minScale < 0.9, 'anticipation or landing squashes');
assert.ok(maxScale > 1.04, 'the rise stretches');
assert.deepEqual(companionJumpPose(-1), { y: 0, scaleY: 1 });
assert.deepEqual(companionJumpPose(COMPANION_JUMP_DURATION), { y: 0, scaleY: 1 });

const play = createJumpState();
stepCompanionJump(play, trigger - 0.05, 0, false, trigger);
stepCompanionJump(play, trigger + 0.02, 1 / 60, false, trigger);
assert.equal(play.jumps, 1);
let sawAir = false;
for (let i = 0; i < 80; i += 1) {
  const pose = stepCompanionJump(play, trigger + 0.02, 1 / 60, false, trigger);
  if (pose.y > 0.45) sawAir = true;
}
assert.equal(sawAir, true);
assert.equal(play.jumps, 1, 'holding the hand still finishes one hop');
assert.equal(play.elapsed, -1);

console.log('companion jump tests passed', { trigger, peak, minScale, maxScale });
