import { PDDomain } from '../../src/sim/pd/domain.js';
import { PDSolver } from '../../src/sim/pd/solver.js';

// Identical particles in arbitrary game units, with no material database.
export function contactFixture(flags, positions = flags.map((_, i) => [i * 0.5, 0])) {
  const d = new PDDomain({dx:1, slab:1, origin:[0,0], dir:[1,0], length:10, width:10});
  d.alloc(flags.length); d.n = flags.length; d.nb = 0; d.dtStable = 0.01;
  d.nBond0 = new Uint16Array(d.n);
  d.matTable = [{mat:{}, pd:{E:1000, jcC:0, jcM:1, Tm:1000}}];
  d.mass.fill(1); d.invM.fill(1); d.temp.fill(293);
  for (let i = 0; i < d.n; i++) {
    d.flags[i] = flags[i]; d.group[i] = i + 1;
    d.px[i] = positions[i][0]; d.py[i] = positions[i][1];
    d.rx[i] = d.px[i]; d.ry[i] = d.py[i];
  }
  const s = new PDSolver(d, {gravity:0, contactZeta:0, friction:0});
  return {d,s};
}
