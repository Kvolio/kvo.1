// Step-level probe: watches the solver internals through first contact.
import { World } from '../src/sim/world.js';
import { Scene, makeLayer } from '../src/sim/scene.js';
import { makeProjectileConfig } from '../src/sim/projectileTypes.js';
import { ROLE } from '../src/sim/pd/domain.js';

const w = new World();
w.settings.recordFrames = false;
w.settings.quality = process.argv[3] || 'normal';
const sc = new Scene();
sc.setLayers([makeLayer({ material: 'rha', thickness: 0.08 })]);
w.setScene(sc);
w.setProjectile(makeProjectileConfig(process.argv[2] || 'apcbc', { standoff: 0.25 }));
w.fire();
while (w.state === 'flight') w.update(1 / 60);
const d = w.domain, s = w.solver;
console.log(`mesh n=${d.n} nb=${d.nb} dx=${(d.dx*1e3).toFixed(2)}mm dt=${(s.dt*1e9).toFixed(0)}ns kC=${s.kContact.toExponential(2)}`);
let step = 0;
while (step < 4000 && w.state !== 'done') {
  const dtc = w.maybeCoast();
  if (dtc > 0) { w.simTime += dtc; }
  else {
    if (w.coastDirty) { s.refreshContactSet(); s.computeForces(); w.coastDirty = false; }
    s.step(); w.simTime += s.dt;
  }
  step++;
  if (step % 40 === 0 || (w.contactSeen && step % 10 === 0)) {
    let vmax = 0, tmax = 0, smax = 0, pen = 0, penKE = 0, armKE = 0;
    for (let i = 0; i < d.n; i++) {
      if (!d.alive[i]) continue;
      const v = Math.hypot(d.vx[i], d.vy[i]);
      if (v > vmax) vmax = v;
      if (d.temp[i] > tmax) tmax = d.temp[i];
      if (d.role[i] === ROLE.PENETRATOR) { pen += d.mass[i]; penKE += 0.5*d.mass[i]*v*v; }
      if (d.role[i] === ROLE.ARMOUR) armKE += 0.5*d.mass[i]*v*v;
    }
    for (let b = 0; b < d.nb; b++) if (d.bcrit[b] > smax) smax = d.bcrit[b];
    console.log(`step ${String(step).padStart(4)} t=${(s.time*1e6).toFixed(1)}us vmax=${vmax.toFixed(0)} Tmax=${(tmax-273).toFixed(0)}C smax=${smax.toFixed(3)} broken=${s.totalBroken} penKE=${(penKE/1e3).toFixed(0)}kJ armKE=${(armKE/1e3).toFixed(0)}kJ Fc=${s.maxContactForce.toExponential(2)}`);
  }
  if (s.maxContactForce > 0) w.contactSeen = true;
}
