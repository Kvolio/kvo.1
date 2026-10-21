import assert from 'node:assert/strict';
import { contactFixture as fixture } from './fixtures/contact-scene.js';

// Arbitrary game units and identical elastic particles: no projectile or
// material database is involved in these collision-search regressions.
for (const flags of [[8,0], [0,8], [1,0], [0,1]]) {
  const {d} = fixture(flags);
  assert(d.fx[0] < 0 && d.fx[1] > 0,
    `loose/surface particle ignored an intact interior target: flags ${flags}`);
  assert(Math.abs(d.fx[0] + d.fx[1]) < 1e-6, 'pair reaction is not balanced');
}

{
  const one = fixture([8,0]), both = fixture([8,8]);
  assert.equal(one.d.fx[0], both.d.fx[0], 'an active pair was processed twice');
  const {d} = fixture([0,0]);
  assert.equal(d.fx[0], 0, 'two inactive interior nodes entered the contact pass');
}

{
  const {d,s} = fixture([8,0]);
  d.alive[1] = 0; s.computeForces();
  assert.equal(d.fx[0], 0, 'retired geometry still collides');
}

{
  const {d,s} = fixture([0,0]);
  d.damage[0] = 0.5; s.computeForces();
  assert(d.fx[0] < 0, 'a newly exposed node was delayed until another step');
  d.damage[0] = 0; s.computeForces();
  assert.equal(d.fx[0], 0, 'stale query membership remained active');
}

{
  const {d,s} = fixture([8,8]);
  d.group.fill(1); s.computeForces();
  assert.equal(d.fx[0], 0, 'reference neighbors were counted in both force passes');
  d.rx[1] = 10; s.computeForces();
  assert(d.fx[0] < 0, 'same-group nodes from distant reference sites did not collide');
}

{
  const flags = [8, ...Array(80).fill(0)];
  const positions = [[0,0], ...Array.from({length:80}, (_,i) => [0.5, i * 0.0001])];
  const {d} = fixture(flags, positions);
  for (let i = 1; i < d.n; i++) assert(d.fx[i] > 0, `dense query silently dropped target ${i}`);
}

// A moving free particle must bounce from an unflagged, fixed block node.
{
  const {d,s} = fixture([8,4], [[-1.2,0], [0,0]]);
  d.vx[0] = 1;
  let deepest = -Infinity;
  for (let i = 0; i < 400; i++) { s.step(0.001); deepest = Math.max(deepest, d.px[0]); }
  assert(deepest < -0.9, `loose particle crossed the solid center: ${deepest}`);
  assert(d.vx[0] < 0, 'the particle did not reverse away from the fixed block');
}

console.log('contact-search and particle/block checks passed');
