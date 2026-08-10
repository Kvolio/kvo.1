// Energy audit: is the explicit scheme conservative?
import { World } from '../src/sim/world.js';
import { Scene, makeLayer } from '../src/sim/scene.js';
import { makeProjectileConfig } from '../src/sim/projectileTypes.js';
import { BOND } from '../src/sim/pd/domain.js';

const w = new World();
w.settings.recordFrames = false;
const sc = new Scene(); sc.setLayers([makeLayer({ material: 'rha', thickness: 0.08 })]);
w.setScene(sc);
w.setProjectile(makeProjectileConfig('apcbc', { standoff: 0.25 }));
w.fire();
while (w.state === 'flight') w.update(1 / 60);
const d = w.domain, s = w.solver;
const mode = process.argv[2] || 'all';
if (mode === 'nodamp') { d.bdamp.fill(0); d.bdampQ.fill(0); }
if (mode === 'nolin') { d.bdamp.fill(0); }
if (mode === 'noquad') { d.bdampQ.fill(0); }
if (mode === 'noctdamp') { s.contactZeta = 0; }
const sf = parseFloat(process.argv[3] || '0');
if (sf > 0) { s.dt *= sf; }
console.log('mode:', mode, 'dt scale', sf || 1, 'dt=', (s.dt*1e9).toFixed(0), 'ns');

function elastic() {
  let U = 0;
  for (let b = 0; b < d.nb; b++) {
    if (d.bstate[b] !== BOND.INTACT) continue;
    const i = d.bi[b], j = d.bj[b];
    if (!d.alive[i] || !d.alive[j]) continue;
    const r = Math.hypot(d.px[j] - d.px[i], d.py[j] - d.py[i]);
    const st = (r - d.bref[b]) / d.bref[b];
    const se = st - d.bsp[b];
    U += 0.5 * d.bk[b] * se * se * d.bref[b];
  }
  return U;
}
function ke() { let e = 0; for (let i = 0; i < d.n; i++) if (d.alive[i]) e += 0.5*d.mass[i]*(d.vx[i]**2 + d.vy[i]**2); return e; }
function bcLoss() { return s.bcAbsorbed || 0; }

const E0 = ke() + elastic();
console.log(`E0 = ${(E0/1e3).toFixed(1)} kJ`);
for (let n = 0; n < 900; n++) {
  const dtc = w.maybeCoast();
  if (dtc > 0) continue;
  if (w.coastDirty) { s.refreshContactSet(); s.computeForces(); w.coastDirty = false; }
  s.step();
  if (s.maxContactForce > 0) w.contactSeen = true;
  if (n % 60 === 0) {
    const K = ke(), U = elastic();
    const diss = s.energy.plastic + s.energy.fracture + s.energy.damping + s.energy.contact;
    console.log(`n=${String(n).padStart(4)} KE=${(K/1e3).toFixed(0)} U=${(U/1e3).toFixed(0)} `
      + `pl=${(s.energy.plastic/1e3).toFixed(0)} fr=${(s.energy.fracture/1e3).toFixed(0)} `
      + `dmp=${(s.energy.damping/1e3).toFixed(0)} ct=${(s.energy.contact/1e3).toFixed(0)} bc=${(bcLoss()/1e3).toFixed(0)} `
      + `| total=${((K+U+diss+bcLoss())/1e3).toFixed(0)} kJ  (E0=${(E0/1e3).toFixed(0)})`);
  }
}
