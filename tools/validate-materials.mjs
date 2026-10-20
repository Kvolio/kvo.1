/**
 * Relative efficiency of homogeneous armour materials against RHA.
 *
 *   node tools/validate-materials.mjs [--round key] [--quality low] [mat ...]
 *
 * Finds, by bisection, the thickest plate of each material the chosen round
 * perforates at its striking velocity, and reports
 *
 *   thickness efficiency  TE = T_RHA / T_mat
 *   mass efficiency       ME = (rho_RHA T_RHA) / (rho_mat T_mat)
 *
 * against engineering bands from the open armour literature. The BANDS ARE
 * RANGES, not point values: published efficiencies depend on the threat,
 * obliquity and plate thickness, and the sources do not agree to better than
 * about +/-20 %. Because both numbers come from the same simulated round, the
 * round's own bias against de Marre cancels.
 */
import { World } from '../src/sim/world.js';
import { Scene, makeLayer } from '../src/sim/scene.js';
import { makeProjectileConfig } from '../src/sim/projectileTypes.js';
import { AMMO } from '../src/ui/ammo.js';
import { getMaterial } from '../src/materials/database.js';

const argv = process.argv.slice(2);
const opt = { round: 'kwk40-pzgr39', quality: 'low' };
const keys = [];
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--round') opt.round = argv[++i];
  else if (argv[i] === '--quality') opt.quality = argv[++i];
  else keys.push(argv[i]);
}

// Mass-efficiency bands vs medium-calibre AP shot, normal incidence, RHA = 1.
const BANDS = {
  mild: { me: [0.65, 0.95], note: 'soft steel: thickness efficiency ~0.65-0.9' },
  cast: { me: [0.85, 1.05], note: 'cast armour ~0.9-1.0 of RHA' },
  hha: { me: [1.05, 1.5], note: 'high-hardness steel beats RHA against AP by 10-40 %' },
  armox440: { me: [0.95, 1.35], note: '420-480 HB' },
  armox500: { me: [1.0, 1.45], note: '480-540 HB' },
  armox600: { me: [1.0, 1.5], note: '570-640 HB' },
  hy80: { me: [0.6, 0.95], note: 'naval steel: soft and tough, below RHA against AP' },
  hy100: { me: [0.7, 1.0], note: '' },
  hy130: { me: [0.8, 1.1], note: '' },
  steel4340: { me: [0.8, 1.1], note: 'tempered to ~30 HRC: RHA-like' },
  steel300m: { me: [1.0, 1.5], note: '~53 HRC' },
  hadfield: { me: [0.55, 1.0], note: 'soft as struck; work hardening not modelled' },
  ss304: { me: [0.5, 0.95], note: 'austenitic stainless: poor against AP' },
  al2519: { me: [1.0, 1.6], note: '' },
  al6061: { me: [0.85, 1.45], note: '' },
  al7050: { me: [1.0, 1.6], note: '' },
  mgaz31b: { me: [0.9, 1.8], note: 'magnesium: mass-efficient, thick' },
  ti64eli: { me: [0.9, 1.5], note: '' },
  wha90: { me: [0.6, 1.2], note: 'sintered tungsten alloy: dense, only moderate strength' },
  wha93: { me: [0.6, 1.2], note: '' },
  wha95: { me: [0.6, 1.2], note: '' },
  uhh600: { me: [1.0, 1.5], note: 'very hard steel: gains fall off as it becomes brittle' },
  fha: { me: [1.0, 1.4], note: '' },
  al5083: { me: [0.9, 1.5], note: 'aluminium: mass efficiency ~1.0-1.5 vs AP, thickness efficiency ~0.35-0.5' },
  al7039: { me: [1.0, 1.6], note: '' },
  al7075: { me: [1.0, 1.6], note: '' },
  al2024: { me: [0.9, 1.6], note: '' },
  ti64: { me: [0.95, 1.5], note: 'Ti-6Al-4V: ME ~1.1-1.4 vs AP' },
  uhmwpe: { me: [0.8, 3.0], note: 'UHMWPE vs medium-calibre AP: wide spread; unidirectional laminates run 2-4 at equal areal density' },
  grp: { me: [0.5, 1.3], note: 'glass-reinforced plastic: ME below 1 to ~1.2 vs AP' },
  aramid: { me: [0.6, 1.6], note: '' },
};
const todo = keys.length ? keys : Object.keys(BANDS);
const a = AMMO[opt.round];

function shoot(mat, T) {
  const w = new World();
  w.settings.deterministic = true; w.settings.quality = opt.quality; w.settings.recordFrames = false;
  const sc = new Scene();
  sc.setLayers([makeLayer({ material: mat, thickness: T, slope: 0 })]);
  w.setScene(sc);
  w.setProjectile(makeProjectileConfig(a.type, a.cfg));
  w.fire();
  let f = 0;
  while (w.state !== 'done' && f < 60000) { w.update(1 / 60); f++; }
  return !!w.verdict().perforated;
}

function limit(mat, guess) {
  let lo = 0.008, hi = Math.max(0.03, guess * 1.8);
  if (!shoot(mat, lo)) return 0;
  let runs = 1;
  while (shoot(mat, hi) && hi < 1.2) { lo = hi; hi *= 1.5; runs++; }
  while ((hi - lo) / hi > 0.06 && runs < 14) {
    const mid = 0.5 * (lo + hi);
    if (shoot(mat, mid)) lo = mid; else hi = mid;
    runs++;
  }
  return 0.5 * (lo + hi);
}

const rho0 = getMaterial('rha').rho;
const TR = limit('rha', 0.07);
console.log(`round ${opt.round} (${a.cfg.velocity} m/s), quality ${opt.quality}: RHA limit ${(TR * 1000).toFixed(0)} mm\n`);
console.log('material'.padEnd(10), 'rho'.padStart(5), 'T mm'.padStart(6), 'TE'.padStart(6), 'ME'.padStart(6), '  band');
for (const k of todo) {
  const m = getMaterial(k);
  const T = limit(k, TR * rho0 / m.rho * 0.8);
  const te = TR / T, me = (rho0 * TR) / (m.rho * T);
  const b = BANDS[k];
  const flag = !b ? '' : me < b.me[0] ? '  << too weak' : me > b.me[1] ? '  >> too strong' : '  ok';
  console.log(k.padEnd(10), String(m.rho).padStart(5), (T * 1000).toFixed(0).padStart(6), te.toFixed(2).padStart(6),
    me.toFixed(2).padStart(6), b ? `  ME ${b.me[0]}-${b.me[1]}${flag}` : '');
}
