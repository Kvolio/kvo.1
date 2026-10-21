import assert from 'node:assert/strict';
import { FragmentSystem } from '../src/sim/fragments.js';
import { Scene } from '../src/sim/scene.js';

const makeSystem = () => new FragmentSystem(null, { add() {} });
const scene = (thickness = 0.02) => new Scene().setLayers([{ thickness }]);
const add = (fs, props = {}) => fs.add({
  x: -0.001, y: 0, vx: 5000, vy: 0, mass: 0.004, dia: 0.006, size: 0.006, ...props,
});
const step = (fs, sc, dt) => fs.step(dt, sc, 0, { applyHit() { throw new Error('unexpected component hit'); } });

// Entry may resolve the existing impact model, but cannot skip travel time.
{
  const fs = makeSystem(), sc = scene(), f = add(fs);
  step(fs, sc, 1e-6);
  assert(f.x >= 0 && f.x < 0.0041, `entry teleported to ${f.x}`);
  assert.equal(fs.list.length, 1, 'exit debris appeared before the far face was reached');
  assert.equal(fs.perforations, 1);
  // Containment must survive a recorder keyframe clone (object identities change).
  fs.list = structuredClone(fs.list);
  const replay = fs.list[0], x = replay.x;
  step(fs, sc, 1e-6);
  assert(replay.x > x && replay.x < 0.0091);
  assert.equal(fs.perforations, 1, 'the same crossing was charged twice');
  for (let i = 0; i < 20 && fs.list.length === 1; i++) step(fs, sc, 1e-6);
  assert.equal(fs.list.length, 2, 'exit debris was not released at the far face');
  assert(fs.list[0].x >= 0.02);
}

// Being spawned inside geometry is not permission to traverse it for free.
{
  const fs = makeSystem(), sc = scene(0.2), f = add(fs, { x: 0.01, vx: 100 });
  step(fs, sc, 1e-6);
  assert(f.stopped, 'fragment spawned in a solid skipped its collision');
  assert(f.x <= 0.010101, `stopped fragment jumped to ${f.x}`);
  assert.equal(fs.stoppedInPlate, 1);
}

// An impact in an earlier layer cannot bring an unreachable later layer into range.
{
  const fs = makeSystem(), sc = scene(), f = add(fs);
  sc.setLayers([{ thickness: 0.02 }, { thickness: 0.02, gap: 0.001 }]);
  step(fs, sc, 1e-6);
  assert(f.x < 0.0041);
  assert.equal(sc.layers[1].fragHits || 0, 0);
}

// A genuinely long sweep still resolves multiple solids in path order.
{
  const fs = makeSystem(), sc = scene(), f = add(fs);
  sc.setLayers([{ thickness: 0.002 }, { thickness: 0.2, gap: 0.01 }]);
  step(fs, sc, 1e-4);
  assert(f.stopped);
  assert.equal(sc.layers[0].fragHits, 1);
  assert.equal(sc.layers[1].fragHits, 1);
  assert.equal(fs.list.filter(q => q.kind === 'plug').length, 1);
}

console.log('fragment transport checks passed');
