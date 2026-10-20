/**
 * COMPOSITES — fibre laminates, spall liners, honeycomb cores
 *
 * Property meanings and units are documented in ../database.js; the grading
 * of the data (A / B / C) and the group taxonomy are in ../schema.js.
 * Each entry's `refs` lists what its numbers rest on.
 */
import { mat } from '../schema.js';

export const COMPOSITES = [
  // ---------------------------------------------------------------- fibre
  mat({
    key: 'uhmwpe',
    name: 'UHMWPE laminate, cross-ply (HB-class)',
    class: 'composite', group: 'fibre', uses: ['armour'], grade: 'C',
    refs: [
      'Dyneema HB26-class cross-ply laminate, rho ~0.97 g/cm3',
      'in-plane strength is that of a 0/90 fibre lay-up (about half the fibre strength), not of a unidirectional tape',
    ],
    rho: 980, E: 3.2e10, nu: 0.35, Y: 1e9, UTS: 1.4e9, epsF: 0.04, G0: 8000, BHN: 25, jcC: 0.03,
    Tm: 420, cp: 1900, jcM: 1.4, brittle: 0, weibull: 18, compFail: false, erosionResist: 0.25,
    color: '#c9c6ac', color2: '#7c7a68',
    notes: 'Very high specific tensile strength, very low through-thickness strength: delaminates and bulges rather than plugging.',
  }),
  mat({
    key: 'uhmwpeepoxy',
    name: 'UHMWPE / epoxy composite',
    class: 'composite', group: 'fibre', uses: ['armour'], grade: 'C',
    refs: ['UHMWPE fibre in a thermoset matrix, cross-plied'],
    rho: 1020, E: 2.6e10, nu: 0.35, Y: 1.1e9, UTS: 2.3e9, epsF: 0.03, G0: 9000, BHN: 22, jcC: 0,
    Tm: 420, cp: 1850, jcM: 1, brittle: 0.28, weibull: 16, compFail: false, erosionResist: 0.2,
    color: '#d5d8d2', color2: '#80837e',
    notes: 'The resin-bonded version of the HB-class laminate. The matrix makes it stiffer and easier to bond, and takes away some of the delamination that does the energy absorbing.',
  }),
  mat({
    key: 'aramidepoxy',
    name: 'Aramid / epoxy laminate',
    class: 'composite', group: 'fibre', uses: ['armour'], grade: 'C',
    refs: ['Para-aramid fabric in epoxy, structural laminate lay-up'],
    rho: 1380, E: 3e10, nu: 0.35, Y: 7.5e8, UTS: 2.4e9, epsF: 0.035, G0: 6500, BHN: 28, jcC: 0,
    Tm: 700, cp: 1400, jcM: 1, brittle: 0.35, weibull: 15, compFail: false, erosionResist: 0.22,
    color: '#c9b477', color2: '#7d6f49',
    notes: 'The rigid structural version of the spall liner: resin-rich, so it carries load, at the cost of some of the fabric\'s energy absorption.',
  }),
  mat({
    key: 'pbo',
    name: 'PBO fibre composite / laminate',
    class: 'composite', group: 'fibre', uses: ['armour'], grade: 'C',
    refs: ['Poly(p-phenylene-2,6-benzobisoxazole) fibre, Zylon class'],
    rho: 1560, E: 5.5e10, nu: 0.35, Y: 1.3e9, UTS: 3.4e9, epsF: 0.03, G0: 8000, BHN: 30, jcC: 0,
    Tm: 920, cp: 1200, jcM: 1, brittle: 0.3, weibull: 15, compFail: false, erosionResist: 0.25,
    color: '#c8a63f', color2: '#7b6628',
    notes: 'The strongest organic fibre in service. It also degrades badly with humidity and ultraviolet, which is why it stopped being used in body armour; nothing about that ageing is modelled here.',
  }),
  mat({
    key: 'vectran',
    name: 'Vectran laminate',
    class: 'composite', group: 'fibre', uses: ['armour'], grade: 'C',
    refs: ['Thermotropic liquid-crystal polyester fibre laminate'],
    rho: 1400, E: 3.8e10, nu: 0.35, Y: 8.5e8, UTS: 2.2e9, epsF: 0.033, G0: 6500, BHN: 26, jcC: 0,
    Tm: 600, cp: 1300, jcM: 1, brittle: 0.3, weibull: 16, compFail: false, erosionResist: 0.21,
    color: '#c4b89c', color2: '#787060',
    notes: 'A liquid-crystal polymer fibre. Between aramid and PBO in strength, and far better behaved than PBO in damp and sunlight.',
  }),
  mat({
    key: 'carbonepoxy',
    name: 'Carbon fibre / epoxy composite',
    class: 'composite', group: 'fibre', uses: ['armour'], grade: 'C',
    refs: ['IM7/8552 quasi-isotropic lay-up: E ~50-55 GPa, UTS ~0.7-0.8 GPa, rho ~1.57 g/cm3'],
    rho: 1570, E: 5.2e10, nu: 0.3, Y: 6e8, UTS: 7.5e8, epsF: 0.015, G0: 1600, BHN: 40, jcC: 0, Tm: 700,
    cp: 1000, jcM: 1, brittle: 0.62, weibull: 14, compFail: false, erosionResist: 0.26,
    color: '#3c3f44', color2: '#232528',
    notes: 'Stiff and strong per kilogramme and a poor ballistic material: the fibres fail at ~1.5 % strain, so it splinters rather than stretching. It is structure that happens to be in the way.',
  }),
  mat({
    key: 'grp',
    name: 'S-2 glass / epoxy laminate (woven)',
    class: 'composite', group: 'fibre', uses: ['armour', 'sabot'], grade: 'C',
    refs: [
      'MIL-DTL-64154 class woven S-2 glass / epoxy: in-plane E ~25-30 GPa, UTS ~0.5-0.65 GPa, failure strain ~2-3 %',
    ],
    rho: 1900, E: 2.7e10, nu: 0.28, Y: 4.5e8, UTS: 6e8, epsF: 0.025, G0: 3500, BHN: 40, jcC: 0.02,
    Tm: 700, cp: 1000, jcM: 1.2, brittle: 0.4, weibull: 14, compFail: false, erosionResist: 0.3,
    color: '#b9b06f', color2: '#6e6842',
    notes: 'The standard structural armour laminate. Cheap, stiff and effective per kilogramme against fragments; poor against a focused kinetic penetrator.',
  }),
  mat({
    key: 'eglass',
    name: 'E-glass / epoxy laminate',
    class: 'composite', group: 'fibre', uses: ['armour'], grade: 'C',
    refs: ['E-glass roving in epoxy, ~55 % fibre volume'],
    rho: 1850, E: 2.2e10, nu: 0.28, Y: 3.2e8, UTS: 9e8, epsF: 0.025, G0: 2200, BHN: 32, jcC: 0,
    Tm: 700, cp: 1000, jcM: 1, brittle: 0.55, weibull: 13, compFail: false, erosionResist: 0.19,
    color: '#c8c0a6', color2: '#7d7767',
    notes: 'The cheap structural glass laminate. Weaker than S-2 glass at the same weight; used as a bulk filler and a backing rather than as a strike face.',
  }),
  mat({
    key: 'basaltepoxy',
    name: 'Basalt fibre / epoxy composite',
    class: 'composite', group: 'fibre', uses: ['armour'], grade: 'C',
    refs: ['Continuous basalt filament in epoxy, ~55 % fibre volume'],
    rho: 2000, E: 2.6e10, nu: 0.28, Y: 3.6e8, UTS: 1e9, epsF: 0.026, G0: 2600, BHN: 34, jcC: 0,
    Tm: 1450, cp: 900, jcM: 1, brittle: 0.52, weibull: 13, compFail: false, erosionResist: 0.2,
    color: '#7a7168', color2: '#48433d',
    notes: 'Drawn from melted volcanic rock. Slightly stiffer and much more heat-tolerant than E-glass at a similar price; ballistically it is a glass laminate.',
  }),

  // ---------------------------------------------------------------- laminate
  mat({
    key: 'aramid',
    name: 'Aramid spall liner',
    class: 'composite', group: 'laminate', uses: ['armour'], grade: 'C',
    refs: ['Para-aramid fabric (Kevlar 29 class), resin-light lay-up'],
    rho: 1400, E: 2e10, nu: 0.35, Y: 6e8, UTS: 2e9, epsF: 0.04, G0: 6000, BHN: 25, jcC: 0.03, Tm: 700,
    cp: 1400, jcM: 1.3, brittle: 0, weibull: 20, compFail: false, erosionResist: 0.2, color: '#8f7f52',
    color2: '#554b31',
    notes: 'Catches spall; contributes little to resisting the main penetrator.',
  }),
  mat({
    key: 'textolite',
    name: 'Textolite (phenolic-cotton laminate)',
    class: 'composite', group: 'laminate', uses: ['armour'], grade: 'C',
    refs: [
      'PTK-grade cotton-fabric phenolic laminate (GOST 5-78 class): rho 1.3-1.4 g/cm3, tensile ~100 MPa, in-plane E 6-10 GPa',
    ],
    rho: 1380, E: 8e9, nu: 0.35, Y: 1.3e8, UTS: 1e8, epsF: 0.022, G0: 3000, BHN: 30, jcC: 0, Tm: 500,
    cp: 1500, jcM: 1, brittle: 0.55, weibull: 12, compFail: false, erosionResist: 0.15,
    color: '#8a6a3f', color2: '#4f3c22',
    notes: 'The filler of Soviet combination glacis armour, sandwiched between steel plates. It is not a "hard" armour material at all - a fifth the density of steel and a tenth its strength. Its value is as a low-impedance spacer: it costs the penetrator length and time, disrupts a shaped-charge jet across the impedance mismatch at each interface, and adds line-of-sight thickness for very little mass. Judge it by the areal-mass column, not by how much it stops on its own.',
  }),

  // ---------------------------------------------------------------- core
  mat({
    key: 'alhoneycomb',
    name: 'Aluminium honeycomb core',
    class: 'composite', group: 'core', uses: ['armour'], grade: 'C',
    refs: ['5052 alloy hexagonal core, ~70 kg/m3 nominal'],
    rho: 70, E: 6e8, nu: 0.3, Y: 4e6, UTS: 4.5e6, epsF: 0.6, G0: 800, BHN: 5, jcC: 0.002, Tm: 850,
    cp: 896, jcM: 1.34, brittle: 0.1, weibull: 14, compFail: false, erosionResist: 0.03,
    color: '#b6bcc0', color2: '#6e7377',
    notes: 'A crushable spacer, not armour. Modelled with its bulk (smeared) properties, so the cell walls are not resolved and its real anisotropy is absent - see MODEL.md 7.',
  }),
  mat({
    key: 'nomexhoneycomb',
    name: 'Nomex honeycomb core',
    class: 'composite', group: 'core', uses: ['armour'], grade: 'C',
    refs: ['Aramid-paper phenolic-dipped core, ~48 kg/m3'],
    rho: 48, E: 1.4e8, nu: 0.3, Y: 2e6, UTS: 2.4e6, epsF: 0.4, G0: 500, BHN: 3, jcC: 0, Tm: 650,
    cp: 1300, jcM: 1, brittle: 0.25, weibull: 12, compFail: false, erosionResist: 0.02,
    color: '#c2b183', color2: '#756a4f',
    notes: 'Lighter and weaker than the aluminium core, and it does not take a permanent set the same way. Same smeared-property caveat.',
  }),
];
