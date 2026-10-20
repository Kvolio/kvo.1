/**
 * FILLERS — the explosive compositions used by shells and reactive armour
 *
 * Property meanings and units are documented in ../database.js; the grading
 * of the data (A / B / C) and the group taxonomy are in ../schema.js.
 * Each entry's `refs` lists what its numbers rest on.
 */
import { mat } from '../schema.js';

export const EXPLOSIVES = [
  // ---------------------------------------------------------------- filler
  mat({
    key: 'compb',
    name: 'Composition B (HE filler)',
    class: 'explosive', group: 'filler', uses: ['filler'], grade: 'B',
    refs: [
      'Gurney velocity sqrt(2E)=2.70 km/s; D=7.98 km/s (Dobratz & Crawford, LLNL Explosives Handbook)',
    ],
    rho: 1717, E: 5e9, nu: 0.4, Y: 2e7, UTS: 2e7, epsF: 0.05, G0: 100, BHN: 5, jcC: 0, Tm: 500,
    cp: 1200, jcM: 1, brittle: 0.6, weibull: 15, compFail: false, erosionResist: 0.02, detVel: 7980,
    gurney: 2700, heatOfDet: 5.19e6, color: '#c2a33c', color2: '#7a672a',
    notes: '',
  }),
  mat({
    key: 'era4s20',
    name: '4S20-type ERA explosive (insensitive PBX)',
    class: 'explosive', group: 'filler', uses: ['filler', 'eracharge'], grade: 'C',
    refs: [
      'Representative insensitive PBX; Gurney and detonation velocity of the RDX/binder class (Dobratz & Crawford). The Held v^2*d initiation constant is calibrated to this model, not a measurement of 4S20.',
    ],
    rho: 1500, E: 4.5e9, nu: 0.4, Y: 3e7, UTS: 3e7, epsF: 0.06, G0: 120, BHN: 6, jcC: 0, Tm: 500,
    cp: 1200, jcM: 1, brittle: 0.5, weibull: 15, compFail: false, erosionResist: 0.02, detVel: 7000,
    gurney: 2400, heatOfDet: 4.6e6, heldV2d: 200, color: '#b0674a', color2: '#6b3c28',
    notes: 'Used as the interlayer of an ERA cassette. Insensitive by design: small-arms and splinter strikes must not initiate it.',
  }),
  mat({
    key: 'tnt',
    name: 'TNT (HE filler)',
    class: 'explosive', group: 'filler', uses: ['filler'], grade: 'B',
    refs: ['Gurney velocity sqrt(2E)=2.44 km/s (Dobratz & Crawford)'],
    rho: 1630, E: 4e9, nu: 0.4, Y: 1.5e7, UTS: 1.5e7, epsF: 0.05, G0: 80, BHN: 4, jcC: 0, Tm: 480,
    cp: 1200, jcM: 1, brittle: 0.6, weibull: 15, compFail: false, erosionResist: 0.02, detVel: 6930,
    gurney: 2440, heatOfDet: 4.52e6, color: '#b8912f', color2: '#6e5720',
    notes: '',
  }),
  mat({
    key: 'octol',
    name: 'Octol 75/25 (shaped-charge fill)',
    class: 'explosive', group: 'filler', uses: ['filler'], grade: 'B',
    refs: ['Octol 75/25 HMX/TNT: rho 1.82 g/cm3, D ~8.48 km/s (Dobratz & Crawford, LLNL Explosives Handbook)'],
    rho: 1821, E: 6e9, nu: 0.4, Y: 2e7, UTS: 2e7, epsF: 0.05, G0: 100, BHN: 5, jcC: 0, Tm: 520,
    cp: 1200, jcM: 1, brittle: 0.6, weibull: 15, compFail: false, erosionResist: 0.02, detVel: 8480,
    gurney: 2800, heatOfDet: 5.5e6, color: '#d0b04a', color2: '#857036',
    notes: '',
  }),
  mat({
    key: 'hesh',
    name: 'Plastic explosive (HESH filler)',
    class: 'explosive', group: 'filler', uses: ['filler'], grade: 'B',
    refs: ['Composition C-4 class; squashes before the base fuze functions'],
    rho: 1600, E: 5e8, nu: 0.48, Y: 2e6, UTS: 2e6, epsF: 3, G0: 300, BHN: 2, jcC: 0, Tm: 450, cp: 1300,
    jcM: 1, brittle: 0, weibull: 25, compFail: false, erosionResist: 0.01, detVel: 8040, gurney: 2680,
    heatOfDet: 5.6e6, color: '#cfc0a0', color2: '#7d7460',
    notes: '',
  }),
];
