import assert from 'node:assert/strict';
import { COMPANION_HOME, PLAY_CYCLE, PLAY_SAFE, playFrame } from '../src/companionPlay.ts';
import { createHandGate, pairWedge, stepHandHop } from '../src/companionJump.ts';
import { METEOR_COUNT, METEOR_CYCLE, METEOR_QUIET, meteorShot, showerActive } from '../src/showers.ts';
import { TAU } from '../src/season.ts';

for (let step = 0; step <= 280; step += 1) {
  const time = (step / 280) * PLAY_CYCLE;
  const frame = playFrame(time, false);
  for (const figure of [frame.left, frame.right]) {
    assert.ok(figure.x >= PLAY_SAFE.minX - 1e-4 && figure.x <= PLAY_SAFE.maxX + 1e-4, `x ${figure.x} at ${time}`);
    assert.ok(figure.z >= PLAY_SAFE.minZ - 1e-4 && figure.z <= PLAY_SAFE.maxZ + 1e-4, `z ${figure.z} at ${time}`);
    assert.ok(Math.hypot(figure.x, figure.z) <= PLAY_SAFE.maxRadius + 1e-3, `radius at ${time}`);
    assert.ok(figure.hop >= -0.001 && figure.hop < 0.2);
  }
  assert.ok(frame.separation >= PLAY_SAFE.minSeparation - 1e-3, `separation ${frame.separation} at ${time}`);
}

const rest = playFrame(0.4, false);
assert.equal(rest.beat, 'rest');
assert.ok(Math.abs(rest.left.x - COMPANION_HOME.left.x) < 0.08);

const chase = playFrame(3.6, false);
assert.equal(chase.beat, 'chase');
assert.ok(Math.hypot(chase.left.x - COMPANION_HOME.left.x, chase.left.z - COMPANION_HOME.left.z) > 0.08);

const kiss = playFrame(8.3, false);
assert.equal(kiss.beat, 'kiss');
assert.ok(kiss.heart > 0.4);
assert.ok(kiss.separation < rest.separation);

const hug = playFrame(10.4, false);
assert.equal(hug.beat, 'hug');
assert.ok(hug.left.armIn > 0.5 && hug.right.armIn < -0.5);
assert.ok(hug.separation < 0.7);

const still = playFrame(4, true);
assert.equal(still.beat, 'rest');
assert.equal(still.left.hop, 0);
assert.equal(still.heart, 0);
assert.equal(playFrame(99, true).left.x, still.left.x);

const homeWedge = pairWedge(COMPANION_HOME.left, COMPANION_HOME.right);
const gate = createHandGate();
stepHandHop(gate, homeWedge.start - 0.3, 0, false, homeWedge);
assert.equal(gate.jumps, 0);
stepHandHop(gate, homeWedge.start + 0.02, 1 / 60, false, homeWedge);
assert.equal(gate.jumps, 1);
const parked = gate.jumps;
stepHandHop(gate, homeWedge.start + 0.05, 1 / 60, false, homeWedge);
assert.equal(gate.jumps, parked);

const quiet = meteorShot(2, 0, false);
assert.equal(quiet.active, false);
assert.equal(showerActive(2, false), false);
const lead = meteorShot(METEOR_QUIET + 0.4, 0, false);
assert.equal(lead.active, true);
assert.ok(lead.u > 0 && lead.u < 1);
assert.equal(meteorShot(METEOR_QUIET + 0.4, 0, true).active, false);
assert.equal(showerActive(METEOR_QUIET + 1, true), false);
assert.equal(meteorShot(METEOR_CYCLE + 1.2, 0, false).active, false);
let seen = 0;
for (let i = 0; i < METEOR_COUNT; i += 1) {
  if (meteorShot(METEOR_QUIET + 2.2, i, false).active) seen += 1;
}
assert.ok(seen >= 2 && seen <= 4, `cluster size ${seen}`);

assert.ok(homeWedge.length < TAU * 0.25);
console.log('grove and sky tests passed', { homeWedge, kiss: kiss.separation, hug: hug.separation, seen });
