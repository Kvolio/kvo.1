/** Reproduce a reported case: node tools/repro.mjs [thicknessMM] [slopeDeg] */
import { World } from '../src/sim/world.js';
import { Scene, makeLayer } from '../src/sim/scene.js';
import { makeProjectileConfig } from '../src/sim/projectileTypes.js';
import { ROLE } from '../src/sim/pd/domain.js';

const th = (+(process.argv[2] || 120)) / 1000;
const slope = +(process.argv[3] || 60);
const type = process.argv[5] || 'apcbc';
const vel = +(process.argv[6] || 0);

const w = new World();
w.settings.quality = process.argv[4] || 'high';
w.settings.recordFrames = false;
const sc = new Scene();
sc.setLayers([makeLayer({ material: 'rha', thickness: th, slope, height: 1.4 })]);
w.setScene(sc);
const over = { standoff: type === 'apds' || type === 'apfsds' ? 1.6 : 0.6 };
if (vel) over.velocity = vel;
w.setProjectile(makeProjectileConfig(type, over));
console.log(`projectile: ${type} ${JSON.stringify(w.projectile.describe(), (k,v)=>typeof v==='number'?+v.toPrecision(4):v)}`);
w.fire();
let f = 0;
while (w.state !== 'done' && f < 4000) { w.update(1 / 60); f++; }

const L = sc.activeLayers()[0];
const s = w.stats;
console.log(`\nplate: ${(th * 1000).toFixed(0)} mm normal, ${slope}deg  ->  LOS ${(sc.losTotal * 1000).toFixed(0)} mm`);
console.log(`layer.frontX=${(L.frontX * 1000).toFixed(1)} mm  normal=[${L.normal.map((x) => x.toFixed(3))}]  losThickness=${(L.losThickness * 1000).toFixed(1)} mm`);

// what the code compares
const backPlane = L.frontX + L.thickness / Math.max(0.15, Math.cos(slope * Math.PI / 180));
console.log(`\ncode's throughDepth (backPlane - frontX) = ${((backPlane - L.frontX) * 1000).toFixed(1)} mm`);
console.log(`plate's true normal thickness            = ${(L.thickness * 1000).toFixed(1)} mm`);

// measure the deepest penetrator node both ways
const d = w.domain;
let dNorm = -Infinity, dLos = -Infinity;
const dir = [Math.cos(0), Math.sin(0)];
for (let i = 0; i < d.n; i++) {
  if (!d.alive[i] || d.role[i] !== ROLE.PENETRATOR || (d.flags[i] & 8)) continue;
  const dn = (d.px[i] - L.frontX) * L.normal[0] + d.py[i] * L.normal[1];
  if (dn > dNorm) dNorm = dn;
  const dl = (d.px[i] - L.frontX) * dir[0] + d.py[i] * dir[1];
  if (dl > dLos) dLos = dl;
}
console.log(`\ndeepest penetrator node, along plate normal = ${(dNorm * 1000).toFixed(1)} mm`);
console.log(`deepest penetrator node, along shot line     = ${(dLos * 1000).toFixed(1)} mm`);
console.log(`=> physically through the plate?              ${dNorm > L.thickness ? 'YES' : 'no'}`);
console.log(`\nreported: depth=${(s.maxDepth * 1000).toFixed(1)} mm  perforated=${s.perforated}  bulge=${(s.backfaceBulge * 1e6).toFixed(0)} um`);
console.log(`verdict: ${w.verdict().headline}`);
console.log(`spall=${(s.spallMass * 1000).toFixed(0)} g  frags=${s.fragmentCount}  broken=${s.brokenBonds}/${d.nb}  eroded=${(s.erodedMass * 1000).toFixed(0)} g`);
const a = w.solver.energyAudit();
console.log(`energy: E0=${(a.E0/1e3).toFixed(0)} kJ  drift=${(a.drift*100).toFixed(0)} %  plastic=${(a.plastic/1e3).toFixed(0)}  damping=${(a.damping/1e3).toFixed(0)}`);
// damage histogram of the penetrator
const bins = new Array(5).fill(0); let pm = 0;
for (let i = 0; i < d.n; i++) {
  if (d.role[i] !== ROLE.PENETRATOR) continue;
  pm += d.mass[i];
  bins[Math.min(4, Math.floor(d.damage[i] * 5))]++;
}
console.log(`penetrator nodes by damage [0-.2,.2-.4,.4-.6,.6-.8,.8-1] = ${bins.join(' ')}  (total mass ${(pm*1000).toFixed(0)} g)`);
console.log(`mesh: ${d.n} nodes, dx=${(d.dx*1000).toFixed(2)}mm, corridor ${(d.width*1000).toFixed(0)}mm wide`);
