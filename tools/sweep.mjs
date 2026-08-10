import { World } from '../src/sim/world.js';
import { Scene, makeLayer } from '../src/sim/scene.js';
import { makeProjectileConfig } from '../src/sim/projectileTypes.js';
const [lin, quad, ct] = [+(process.argv[2]||1), +(process.argv[3]||1), +(process.argv[4]||0.25)];
for (const [t, v, mm] of [['apcbc',800,0.08],['apcbc',800,0.16],['apfsds',1650,0.20]]) {
  const w = new World(); w.settings.recordFrames = false;
  const sc = new Scene(); sc.setLayers([makeLayer({ material: 'rha', thickness: mm })]);
  w.setScene(sc); w.setProjectile(makeProjectileConfig(t, { velocity: v, standoff: t==='apfsds'?2.2:0.6 }));
  w.fire();
  let f = 0; let patched = false;
  while (w.state !== 'done' && f < 2600) {
    w.update(1/60);
    if (w.solver && !patched) { w.solver.dampLin = lin; w.solver.dampQuad = quad; w.solver.contactZeta = ct; patched = true; }
    f++;
  }
  const a = w.solver ? w.solver.energyAudit() : null;
  const s = w.stats;
  console.log(`lin=${lin} quad=${quad} ct=${ct} | ${t} ${v}m/s vs ${(mm*1000)}mm -> ${w.verdict().headline.padEnd(38)} `
    + `depth=${(s.maxDepth*1000).toFixed(0)}mm erod=${(s.erodedMass*1000).toFixed(0)}g `
    + `drift=${a?(a.drift*100).toFixed(0):'-'}% dmp=${a?(a.damping/1e3).toFixed(0):'-'}kJ pl=${a?(a.plastic/1e3).toFixed(0):'-'}kJ`);
}
