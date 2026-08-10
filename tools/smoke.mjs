/**
 * Headless physics harness.
 *
 *   node tools/smoke.mjs [case]
 *
 * Runs the real World loop with a synthetic clock and prints the diagnostics
 * the UI would show. This is how the solver is exercised without a browser.
 */

import { World } from '../src/sim/world.js';
import { Scene, makeLayer, makeModule } from '../src/sim/scene.js';
import { makeProjectileConfig } from '../src/sim/projectileTypes.js';

const CASES = {
  apcbc: {
    proj: ['apcbc', { velocity: 800, standoff: 0.6 }],
    layers: [{ material: 'rha', thickness: 0.08, slope: 0 }],
  },
  apcbc_thick: {
    proj: ['apcbc', { velocity: 800, standoff: 0.6 }],
    layers: [{ material: 'rha', thickness: 0.16, slope: 0 }],
  },
  apcbc_sloped: {
    proj: ['apcbc', { velocity: 800, standoff: 0.6 }],
    layers: [{ material: 'rha', thickness: 0.08, slope: 60 }],
  },
  apfsds: {
    proj: ['apfsds', { velocity: 1650, standoff: 2.2 }],
    layers: [{ material: 'rha', thickness: 0.20, slope: 0 }],
  },
  apfsds_slow: {
    proj: ['apfsds', { velocity: 900, standoff: 2.2 }],
    layers: [{ material: 'rha', thickness: 0.20, slope: 0 }],
  },
  ap_vs_ceramic: {
    proj: ['apcr', { velocity: 1036, standoff: 0.6 }],
    layers: [
      { material: 'alumina', thickness: 0.02, slope: 0 },
      { material: 'al5083', thickness: 0.04, slope: 0, bonded: true },
    ],
  },
  spaced: {
    proj: ['ap', { velocity: 792, standoff: 0.6 }],
    layers: [
      { material: 'rha', thickness: 0.02, slope: 0 },
      { material: 'rha', thickness: 0.06, slope: 0, gap: 0.15 },
    ],
  },
  hesh: {
    proj: ['hesh', { velocity: 730, standoff: 0.6 }],
    layers: [{ material: 'rha', thickness: 0.06, slope: 0 }],
  },
  heat: {
    proj: ['heat', { velocity: 300, standoff: 0.5 }],
    layers: [{ material: 'rha', thickness: 0.15, slope: 0 }],
  },
  aphe: {
    proj: ['aphe', { velocity: 800, standoff: 0.6 }],
    layers: [{ material: 'rha', thickness: 0.06, slope: 0 }],
    modules: [{ type: 'crew', x: 0.5, y: 0.05, w: 0.35, h: 0.5 }],
  },
};

const name = process.argv[2] || 'apcbc';
const quality = process.argv[3] || 'normal';
const c = CASES[name];
if (!c) { console.error('cases:', Object.keys(CASES).join(', ')); process.exit(1); }

const w = new World();
w.settings.quality = quality;
w.settings.recordFrames = false;
const scene = new Scene();
scene.setLayers(c.layers.map((l) => makeLayer(l)));
if (c.modules) scene.setModules(c.modules.map((m) => makeModule(m)));
w.setScene(scene);
w.setProjectile(makeProjectileConfig(c.proj[0], c.proj[1]));

console.log(`\n=== ${name} @ ${quality} ===`);
console.log('projectile:', JSON.stringify(w.projectile.describe(), (k, v) => (typeof v === 'number' ? +v.toPrecision(4) : v)));
console.log('array LOS:', (scene.losTotal * 1000).toFixed(1), 'mm');

const t0 = Date.now();
w.fire();
let frames = 0;
const FRAME = 1 / 60;
let lastState = '';
while (w.state !== 'done' && frames < 6000) {
  w.update(FRAME);
  if (w.state !== lastState) {
    lastState = w.state;
    console.log(`  [frame ${frames}] -> ${w.state}  t=${(w.simTime * 1e6).toFixed(1)} us`);
    if (w.meshInfo && w.state === 'impact') {
      console.log(`     mesh: ${w.meshInfo.particles} nodes / ${w.meshInfo.bonds} bonds, ` +
        `dx=${(w.meshInfo.dx * 1000).toFixed(2)}mm dt=${(w.meshInfo.dt * 1e9).toFixed(0)}ns ` +
        `across-pen=${w.meshInfo.acrossPenetrator.toFixed(1)} ` +
        `thru=${w.meshInfo.throughThickness.map((x) => x.toFixed(0)).join('/')}`);
    }
  }
  frames++;
  if (frames % 250 === 0) {
    const s = w.stats;
    console.log(`  f${frames} t=${(w.simTime * 1e6).toFixed(0)}us depth=${(s.maxDepth * 1000).toFixed(1)}mm ` +
      `vres=${s.residualVelocity.toFixed(0)} mres=${(s.residualMass * 1000).toFixed(0)}g ` +
      `broken=${s.brokenBonds} spall=${(s.spallMass * 1000).toFixed(1)}g frags=${s.fragmentCount} ` +
      `${w.perf.msLastFrame.toFixed(1)}ms`);
  }
}
const wall = Date.now() - t0;

const v = w.verdict();
console.log('\n--- verdict ---');
for (const [k, val] of Object.entries(v)) {
  if (k === 'modules' || k === 'energy') continue;
  console.log(`  ${k}: ${typeof val === 'number' ? +val.toPrecision(4) : val}`);
}
if (v.energy) {
  console.log('  energy split (J):', Object.entries(v.energy).map(([k, x]) => `${k}=${x.toFixed(0)}`).join(' '));
}
console.log('\n--- analytic cross-checks ---');
for (const m of (w.analytics?.models || [])) {
  console.log(`  ${m.name}: ${(m.value * 1000).toFixed(1)} mm   (${m.note})`);
}
console.log('\n--- event log ---');
for (const e of w.log.entries) console.log(`  ${(e.t * 1e6).toFixed(1).padStart(9)} us  ${e.text}`);
console.log(`\nframes=${frames} wall=${wall}ms  (${(wall / Math.max(frames, 1)).toFixed(2)} ms/frame)`);
if (w.solver) {
  const a = w.solver.energyAudit();
  console.log(`\n--- energy audit ---\n  E0=${(a.E0/1e3).toFixed(0)} kJ  KE=${(a.kinetic/1e3).toFixed(0)}  U=${(a.strain/1e3).toFixed(0)}  plastic=${(a.plastic/1e3).toFixed(0)}  fracture=${(a.fracture/1e3).toFixed(1)}  damping=${(a.damping/1e3).toFixed(0)}  => drift ${(a.drift*100).toFixed(1)} %`);
}
