/**
 * POLYMERS — elastomers, damping layers and rigid plastics
 *
 * Property meanings and units are documented in ../database.js; the grading
 * of the data (A / B / C) and the group taxonomy are in ../schema.js.
 * Each entry's `refs` lists what its numbers rest on.
 */
import { mat } from '../schema.js';

export const POLYMERS = [
  // ---------------------------------------------------------------- elastomer
  mat({
    key: 'rubber',
    name: 'Elastomer interlayer (NERA)',
    class: 'polymer', group: 'elastomer', uses: ['armour', 'eracharge'], grade: 'C',
    refs: ['Filled elastomer interlayer as used in NERA / bulging-plate sandwiches'],
    rho: 1150, E: 5e7, nu: 0.49, Y: 2e7, UTS: 2.5e7, epsF: 2, G0: 3000, BHN: 5, jcC: 0.05, Tm: 500,
    cp: 1800, jcM: 1.5, brittle: 0, weibull: 30, compFail: false, erosionResist: 0.05,
    color: '#2f3136', color2: '#1a1c1f',
    notes: 'Bulk-modulus mismatch drives the plate-flyer motion that makes NERA sandwiches work.',
  }),
  mat({
    key: 'natrubber',
    name: 'Natural rubber',
    class: 'polymer', group: 'elastomer', uses: ['armour'], grade: 'B',
    refs: ['Unfilled vulcanised natural rubber'],
    rho: 950, E: 2.5e6, nu: 0.499, Y: 6e6, UTS: 2.5e7, epsF: 3.5, G0: 12000, BHN: 3, jcC: 0, Tm: 500,
    cp: 1900, jcM: 1, brittle: 0, weibull: 20, compFail: false, erosionResist: 0.05, color: '#4a4642',
    color2: '#2a2825',
    notes: 'Very soft and very extensible. In an array it is a decoupling layer, not armour: its job is to let two plates move independently.',
  }),
  mat({
    key: 'butyl',
    name: 'Butyl rubber',
    class: 'polymer', group: 'elastomer', uses: ['armour'], grade: 'B',
    refs: ['Isobutylene-isoprene rubber, unfilled'],
    rho: 920, E: 3.5e6, nu: 0.499, Y: 8e6, UTS: 1.8e7, epsF: 3, G0: 8000, BHN: 3, jcC: 0, Tm: 480,
    cp: 1850, jcM: 1, brittle: 0, weibull: 20, compFail: false, erosionResist: 0.05, color: '#443f3a',
    color2: '#26231f',
    notes: 'Much more internally damping than natural rubber, so it converts more of what passes through it into heat rather than returning it.',
  }),
  mat({
    key: 'neoprene',
    name: 'Neoprene',
    class: 'polymer', group: 'elastomer', uses: ['armour'], grade: 'B',
    refs: ['Polychloroprene, medium hardness'],
    rho: 1230, E: 5e6, nu: 0.499, Y: 1e7, UTS: 2.5e7, epsF: 2.5, G0: 9000, BHN: 4, jcC: 0, Tm: 500,
    cp: 1700, jcM: 1, brittle: 0, weibull: 20, compFail: false, erosionResist: 0.06, color: '#3e3c3a',
    color2: '#232120',
    notes: 'A tougher, denser elastomer than natural rubber. Common as a skirt and mounting material.',
  }),
  mat({
    key: 'polyurethane',
    name: 'Polyurethane elastomer',
    class: 'polymer', group: 'elastomer', uses: ['armour', 'eracharge'], grade: 'C',
    refs: ['Cast polyester-polyurethane, ~90 Shore A'],
    rho: 1200, E: 5e7, nu: 0.48, Y: 3e7, UTS: 5e7, epsF: 2, G0: 14000, BHN: 12, jcC: 0, Tm: 520,
    cp: 1600, jcM: 1, brittle: 0, weibull: 20, compFail: false, erosionResist: 0.09, color: '#5a5148',
    color2: '#332e29',
    notes: 'Stiffer and far more abrasion-resistant than the rubbers. Used where the interlayer also has to survive handling.',
  }),
  mat({
    key: 'silicone',
    name: 'Silicone elastomer',
    class: 'polymer', group: 'elastomer', uses: ['armour'], grade: 'B',
    refs: ['Unfilled polydimethylsiloxane elastomer'],
    rho: 1100, E: 2e6, nu: 0.499, Y: 4e6, UTS: 9e6, epsF: 3, G0: 4000, BHN: 2, jcC: 0, Tm: 600,
    cp: 1300, jcM: 1, brittle: 0, weibull: 20, compFail: false, erosionResist: 0.04, color: '#585552',
    color2: '#323030',
    notes: 'The weakest entry in the list. It is here as a bonding and potting layer, and it will behave like one.',
  }),
  mat({
    key: 'viscoelastic',
    name: 'Viscoelastic damping polymer',
    class: 'polymer', group: 'elastomer', uses: ['armour'], grade: 'C',
    refs: ['Constrained-layer damping compound, acrylic class'],
    rho: 1150, E: 2e7, nu: 0.49, Y: 1.2e7, UTS: 2e7, epsF: 2.5, G0: 18000, BHN: 6, jcC: 0, Tm: 480,
    cp: 1700, jcM: 1, brittle: 0, weibull: 20, compFail: false, erosionResist: 0.07, color: '#4f4a55',
    color2: '#2d2a31',
    notes: 'Formulated to turn strain into heat across a wide frequency band. The model has no frequency-dependent loss modulus, so it is simulated as a soft rate-hardening solid and its actual selling point is NOT represented - see MODEL.md 7.',
  }),
  mat({
    key: 'pushock',
    name: 'Shock-absorbing polyurethane layer',
    class: 'polymer', group: 'elastomer', uses: ['armour'], grade: 'C',
    refs: ['Filled polyurethane blast-mitigation coating'],
    rho: 1250, E: 8e7, nu: 0.48, Y: 4.5e7, UTS: 7.5e7, epsF: 1.8, G0: 22000, BHN: 16, jcC: 0, Tm: 520,
    cp: 1600, jcM: 1, brittle: 0, weibull: 20, compFail: false, erosionResist: 0.11, color: '#5c5347',
    color2: '#352f28',
    notes: 'The sprayed anti-spall and blast-mitigation liner. Stiffer than a plain elastomer and specifically tough in tension, which is what holds a cracked plate together.',
  }),

  // ---------------------------------------------------------------- plastic
  mat({
    key: 'polycarbonate',
    name: 'Polycarbonate',
    class: 'polymer', group: 'plastic', uses: ['armour'], grade: 'B',
    refs: ['Bisphenol-A polycarbonate, extruded sheet'],
    rho: 1200, E: 2.3e9, nu: 0.37, Y: 6.5e7, UTS: 7e7, epsF: 0.9, G0: 5000, BHN: 20, jcC: 0, Tm: 560,
    cp: 1200, jcM: 1, brittle: 0.05, weibull: 20, compFail: false, erosionResist: 0.1,
    color: '#9aa6ac', color2: '#5d666b',
    notes: 'The backing layer of transparent armour. Very tough for a polymer: it stretches enormously before it tears, which is what catches the fragments the glass has already stopped.',
  }),
  mat({
    key: 'pmma',
    name: 'PMMA / acrylic',
    class: 'polymer', group: 'plastic', uses: ['armour'], grade: 'B',
    refs: ['Cast PMMA: rho 1.18, E 3.0-3.3 GPa, UTS ~70 MPa, K_IC ~1.0-1.5 MPa*m^0.5'],
    rho: 1180, E: 3e9, nu: 0.37, Y: 7e7, UTS: 7.2e7, epsF: 0.05, G0: 500, BHN: 22, jcC: 0, Tm: 550,
    cp: 1450, jcM: 1, brittle: 0.65, weibull: 12, compFail: false, erosionResist: 0.11,
    color: '#a8b2b6', color2: '#666e72',
    notes: 'Stiffer and much more brittle than polycarbonate: it crazes and cracks rather than stretching. The interlayer in older transparent armour stacks.',
  }),
  mat({
    key: 'hdpe',
    name: 'High-density polyethylene (HDPE)',
    class: 'polymer', group: 'plastic', uses: ['armour', 'eracharge'], grade: 'B',
    refs: [
      'Typical HDPE sheet: rho 0.95-0.96 g/cm3, E 0.8-1.2 GPa, yield 22-30 MPa, elongation > 500 %',
    ],
    rho: 950, E: 1e9, nu: 0.42, Y: 2.6e7, UTS: 3e7, epsF: 3, G0: 20000, BHN: 6, jcC: 0.05, Tm: 405,
    cp: 2250, jcM: 1, brittle: 0, weibull: 30, erosionResist: 0.1, color: '#d9dcdc', color2: '#8d9090',
    notes: 'A tough thermoplastic that draws out rather than cracking. Used as spall liner and as a low-cost bulk filler; far weaker than the fibre grade of the same polymer.',
  }),
  mat({
    key: 'nylon66',
    name: 'Nylon 6/6 (PA66)',
    class: 'polymer', group: 'plastic', uses: ['armour'], grade: 'B',
    refs: [
      'Typical dry-as-moulded PA66: rho 1.14 g/cm3, E 2.8-3.0 GPa, yield ~80 MPa; absorbs water, which softens it and raises elongation',
    ],
    rho: 1140, E: 2.8e9, nu: 0.39, Y: 8e7, UTS: 8.3e7, epsF: 0.6, G0: 6000, BHN: 12, jcC: 0.03,
    Tm: 535, cp: 1670, jcM: 1, brittle: 0, weibull: 28, erosionResist: 0.12, color: '#d7d2c4',
    color2: '#8c8878',
    notes: 'A stiff, tough engineering plastic. Properties shown are for dry material; in service it absorbs a few percent of water and becomes noticeably softer.',
  }),
];
