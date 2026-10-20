/**
 * LIGHT METALS — aluminium, magnesium and titanium alloys
 *
 * Property meanings and units are documented in ../database.js; the grading
 * of the data (A / B / C) and the group taxonomy are in ../schema.js.
 * Each entry's `refs` lists what its numbers rest on.
 */
import { mat } from '../schema.js';

export const LIGHTMETALS = [
  // ---------------------------------------------------------------- aluminium
  mat({
    key: 'al5083',
    name: 'Aluminium 5083-H131',
    class: 'metal', group: 'aluminium', uses: ['armour', 'body'], grade: 'B',
    refs: ['MIL-DTL-46027, 5083-H131: UTS ~317 MPa min, Y ~228 MPa min; typical 350 / 240'],
    rho: 2660, E: 7e10, nu: 0.33, Y: 2.4e8, UTS: 3.5e8, epsF: 0.13, G0: 11200, BHN: 85, jcC: 0.015,
    Tm: 863, cp: 900, jcM: 1, brittle: 0.05, weibull: 26, compFail: false, erosionResist: 0.45,
    color: '#9aa4ad', color2: '#5c646b',
    notes: 'Weight-efficient against fragments, poor against long rods.',
  }),
  mat({
    key: 'al7039',
    name: 'Aluminium 7039-T64',
    class: 'metal', group: 'aluminium', uses: ['armour'], grade: 'B',
    refs: ['MIL-DTL-46063, 7039-T64'],
    rho: 2740, E: 7e10, nu: 0.33, Y: 3.8e8, UTS: 4.5e8, epsF: 0.12, G0: 7600, BHN: 130, jcC: 0.013,
    Tm: 903, cp: 900, jcM: 1, brittle: 0.25, weibull: 20, compFail: false, erosionResist: 0.5,
    color: '#a8b1b8', color2: '#646c73',
    notes: 'The classic weldable armour aluminium. Stronger than 5083 and more prone to stress-corrosion cracking, which is why later hulls went back to 5083.',
  }),
  mat({
    key: 'al2519',
    name: 'Aluminium 2519-T87',
    class: 'metal', group: 'aluminium', uses: ['armour'], grade: 'B',
    refs: ['2519-T87 plate (hull alloy of the US AAV7/EFV class): Y ~393, UTS ~455 MPa, A ~10 %'],
    rho: 2820, E: 7.24e10, nu: 0.33, Y: 3.93e8, UTS: 4.55e8, epsF: 0.1, G0: 12400, BHN: 130,
    jcC: 0.002, Tm: 830, cp: 860, jcM: 1.34, brittle: 0.08, weibull: 22, erosionResist: 0.48,
    color: '#b4bbc2', color2: '#6f767e',
    notes: 'The weldable armour aluminium chosen for the AAV7 and Bradley-generation hulls: stronger than 5083 and much more resistant to stress-corrosion cracking than 7039.',
  }),
  mat({
    key: 'al6061',
    name: 'Aluminium 6061-T6',
    class: 'metal', group: 'aluminium', uses: ['armour'], grade: 'B',
    refs: ['ASM Handbook vol. 2, 6061-T6: Y 276, UTS 310 MPa, A 12 %'],
    rho: 2700, E: 6.89e10, nu: 0.33, Y: 2.76e8, UTS: 3.1e8, epsF: 0.12, G0: 20000, BHN: 95, jcC: 0.002,
    Tm: 855, cp: 896, jcM: 1.34, brittle: 0.05, weibull: 22, compFail: false, erosionResist: 0.42,
    color: '#b9c0c7', color2: '#767d85',
    notes: 'A general structural alloy rather than an armour alloy. Weldable and cheap; as armour it is there for the mass, not the strength.',
  }),
  mat({
    key: 'al2024',
    name: 'Aluminium 2024-T351',
    class: 'metal', group: 'aluminium', uses: ['armour'], grade: 'B',
    refs: ['ASM Handbook vol. 2, 2024-T351: Y 325, UTS 470 MPa, A 20 %'],
    rho: 2780, E: 7.3e10, nu: 0.33, Y: 3.24e8, UTS: 4.7e8, epsF: 0.18, G0: 24000, BHN: 120, jcC: 0.002,
    Tm: 850, cp: 875, jcM: 1.34, brittle: 0.06, weibull: 22, compFail: false, erosionResist: 0.46,
    color: '#b5bcc4', color2: '#727981',
    notes: 'The alloy most Johnson-Cook constants were originally fitted to. Aircraft structure more than armour.',
  }),
  mat({
    key: 'al7050',
    name: 'Aluminium 7050-T7451',
    class: 'metal', group: 'aluminium', uses: ['armour'], grade: 'B',
    refs: ['ASM Handbook vol. 2, 7050-T7451 plate: Y 469, UTS 524 MPa'],
    rho: 2830, E: 7.17e10, nu: 0.33, Y: 4.69e8, UTS: 5.24e8, epsF: 0.11, G0: 17000, BHN: 140,
    jcC: 0.002, Tm: 840, cp: 860, jcM: 1.34, brittle: 0.1, weibull: 21, compFail: false,
    erosionResist: 0.5, color: '#b2b9c1', color2: '#6f767e',
    notes: 'A thick-section 7xxx plate alloy with better stress-corrosion behaviour than 7075. Stronger than 5083 and far less tolerant of damage.',
  }),
  mat({
    key: 'al7075',
    name: 'Aluminium 7075-T6',
    class: 'metal', group: 'aluminium', uses: ['armour', 'cap', 'body', 'sabot'], grade: 'B',
    refs: ['ASM Handbook vol. 2, 7075-T6: Y 503, UTS 572 MPa, A 11 %'],
    rho: 2810, E: 7.17e10, nu: 0.33, Y: 5.03e8, UTS: 5.72e8, epsF: 0.11, G0: 14000, BHN: 150,
    jcC: 0.002, Tm: 840, cp: 860, jcM: 1.34, brittle: 0.12, weibull: 21, compFail: false,
    erosionResist: 0.52, color: '#b0b7bf', color2: '#6d747c',
    notes: 'The strongest common aluminium and the usual sabot and body material. As armour it is strong per kilogramme and notch-sensitive.',
  }),
  mat({
    key: 'windscreen',
    name: 'Ballistic cap (thin alloy shell)',
    class: 'metal', group: 'aluminium', uses: ['windscreen'], grade: 'C',
    refs: ['Thin aluminium-class ballistic cap shell'],
    rho: 2700, E: 6.8e10, nu: 0.33, Y: 1.2e8, UTS: 2e8, epsF: 0.2, G0: 8000, BHN: 45, jcC: 0.02,
    Tm: 900, cp: 900, jcM: 1, brittle: 0.1, weibull: 20, compFail: false, erosionResist: 0.08,
    color: '#7a7f86', color2: '#474a4f',
    notes: 'Purely aerodynamic. Crushes away in the first microseconds and contributes essentially nothing to penetration.',
  }),

  // ---------------------------------------------------------------- magnesium
  mat({
    key: 'mgaz31b',
    name: 'Magnesium AZ31B-H24',
    class: 'metal', group: 'magnesium', uses: ['armour'], grade: 'B',
    refs: [
      'ASM Handbook vol. 2: AZ31B-H24 sheet/plate, rho 1.77 g/cm3, E 45 GPa, Y ~200-220, UTS ~270-290 MPa',
      'ARL / Magnesium Elektron AZ31B-H24 ballistic evaluation (DTIC ADA494926): yield strength is the dominant ballistic property',
    ],
    rho: 1770, E: 4.5e10, nu: 0.35, Y: 2e8, UTS: 2.7e8, epsF: 0.12, G0: 14000, BHN: 73, jcC: 0.01,
    Tm: 903, cp: 1000, jcM: 1, brittle: 0.1, weibull: 22, erosionResist: 0.25, color: '#b3b8bd',
    color2: '#6f7479',
    notes: 'The lightest structural metal. Weaker per millimetre than aluminium but a third lighter, so it earns its place only where mass is the constraint; it can burn when struck by an incendiary round, which is not modelled.',
  }),

  // ---------------------------------------------------------------- titanium
  mat({
    key: 'ti64',
    name: 'Titanium Ti-6Al-4V',
    class: 'metal', group: 'titanium', uses: ['armour', 'liner'], grade: 'B',
    refs: [
      'ASTM B265 grade 5 / MIL-T-9046, mill-annealed: Y >= 828, UTS >= 895 MPa (typical +10 %)',
    ],
    rho: 4430, E: 1.14e11, nu: 0.34, Y: 9.1e8, UTS: 9.9e8, epsF: 0.14, G0: 49000, BHN: 334, jcC: 0.034,
    Tm: 1933, cp: 526, jcM: 0.8, brittle: 0.1, weibull: 24, compFail: false, erosionResist: 1,
    plateScale: 0.75, color: '#8e8a86', color2: '#565351',
    notes: 'Strongly adiabatic-shear prone (low jcM): forms shear bands and plugs at high rate.',
  }),
  mat({
    key: 'ti64eli',
    name: 'Titanium Ti-6Al-4V ELI',
    class: 'metal', group: 'titanium', uses: ['armour'], grade: 'B',
    refs: ['ASTM F136 ELI grade: Y >= 795, UTS >= 860 MPa (typical +5 %)'],
    rho: 4430, E: 1.13e11, nu: 0.34, Y: 8.3e8, UTS: 9e8, epsF: 0.15, G0: 68000, BHN: 320, jcC: 0.019,
    Tm: 1933, cp: 560, jcM: 0.8, brittle: 0.05, weibull: 22, compFail: false, erosionResist: 0.8,
    color: '#a7a29c', color2: '#67635e',
    notes: 'The low-oxygen grade: gives up yield strength for a large gain in fracture toughness. Better against a heavy hit than standard Ti-6Al-4V, worse against a light one.',
  }),
];
