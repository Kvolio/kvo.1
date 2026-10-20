/**
 * CERAMICS, GLASS AND CONCRETE
 *
 * Property meanings and units are documented in ../database.js; the grading
 * of the data (A / B / C) and the group taxonomy are in ../schema.js.
 * Each entry's `refs` lists what its numbers rest on.
 */
import { mat } from '../schema.js';

export const CERAMICS = [
  // ---------------------------------------------------------------- ceramic-oxide
  mat({
    key: 'alumina85',
    name: 'Alumina AD-85 ceramic (85 %)',
    class: 'ceramic', group: 'ceramic-oxide', uses: ['armour'], grade: 'A',
    refs: [
      'CoorsTek AD-85: rho 3.42, E 221 GPa, nu 0.22, Knoop 960, flexural 296 MPa, K_IC 3-4 MPa*m^0.5',
    ],
    rho: 3420, E: 2.21e11, nu: 0.22, Y: 2e9, UTS: 2e8, epsF: 0.001, G0: 55, BHN: 960, jcC: 0, Tm: 2323,
    cp: 880, jcM: 1, brittle: 1, weibull: 8, compFail: false, erosionResist: 1.9, color: '#cdc7ba',
    color2: '#837e74',
    notes: 'The cheap alumina grades. Noticeably softer and weaker than AD-995 because of the glassy grain-boundary phase, and priced accordingly.',
  }),
  mat({
    key: 'alumina96',
    name: 'Alumina AD-96 ceramic (96 %)',
    class: 'ceramic', group: 'ceramic-oxide', uses: ['armour'], grade: 'A',
    refs: [
      'CoorsTek AD-96: rho 3.72, E 303 GPa, nu 0.21, Knoop 1175, flexural 358 MPa, compressive 2.07 GPa, K_IC 4-5 MPa*m^0.5',
    ],
    rho: 3720, E: 3.03e11, nu: 0.21, Y: 2.5e9, UTS: 2.2e8, epsF: 0.001, G0: 67, BHN: 1175, jcC: 0,
    Tm: 2323, cp: 880, jcM: 1, brittle: 1, weibull: 9, compFail: false, erosionResist: 2.1,
    color: '#d3cdbf', color2: '#888377',
    notes: 'The common structural alumina grade: between the cheap AD-85 and the armour-grade AD-995 in everything.',
  }),
  mat({
    key: 'alumina',
    name: 'Alumina AD-995 ceramic',
    class: 'ceramic', group: 'ceramic-oxide', uses: ['armour'], grade: 'A',
    refs: [
      'CoorsTek AD-995: rho 3.90, E 370 GPa, nu 0.22, Knoop 1440, flexural 379 MPa, compressive 2.6 GPa, K_IC 4-5 MPa*m^0.5',
    ],
    rho: 3890, E: 3.7e11, nu: 0.22, Y: 3e9, UTS: 2.6e8, epsF: 0.001, G0: 55, BHN: 1440, jcC: 0,
    Tm: 2323, cp: 880, jcM: 1, brittle: 1, weibull: 9, compFail: false, erosionResist: 2.4,
    color: '#d9d3c4', color2: '#8e897c',
    notes: 'Very strong in compression, very weak in tension. Comminutes ahead of the penetrator and blunts/erodes it. Needs a backing plate to be useful.',
  }),
  mat({
    key: 'zta',
    name: 'Zirconia-toughened alumina (ZTA, 10 % ZrO2)',
    class: 'ceramic', group: 'ceramic-oxide', uses: ['armour'], grade: 'A',
    refs: [
      'CoorsTek ZTA: rho 4.01, E 360 GPa, nu 0.30, Knoop 1475, flexural 450 MPa, compressive 2.9 GPa, K_IC 5-6 MPa*m^0.5',
    ],
    rho: 4010, E: 3.6e11, nu: 0.3, Y: 3.3e9, UTS: 3.1e8, epsF: 0.0012, G0: 84, BHN: 1475, jcC: 0,
    Tm: 2200, cp: 800, jcM: 1, brittle: 0.94, weibull: 13, compFail: false, erosionResist: 2.2,
    color: '#d2cdc0', color2: '#847f75',
    notes: 'Alumina with the zirconia toughening mechanism added: harder than plain zirconia, far tougher than plain alumina. A good compromise tile.',
  }),
  mat({
    key: 'zro2',
    name: 'Zirconia (Y-PSZ)',
    class: 'ceramic', group: 'ceramic-oxide', uses: ['armour'], grade: 'A',
    refs: [
      'CoorsTek Y2O3-PSZ: rho 6.02, E 210 GPa, nu 0.30, Knoop 1300, flexural 1240 MPa, compressive 2.5 GPa; K_IC 8-13 MPa*m^0.5 depending on grade (9 used)',
    ],
    rho: 6020, E: 2.1e11, nu: 0.3, Y: 2.5e9, UTS: 5e8, epsF: 0.002, G0: 381, BHN: 1300, jcC: 0,
    Tm: 2988, cp: 460, jcM: 1, brittle: 0.8, weibull: 18, compFail: false, erosionResist: 1.5,
    color: '#ddd8d0', color2: '#87837c',
    notes: 'Transformation toughening makes this by far the toughest ceramic here, but it is also the heaviest and not especially hard. Rarely a strike face; useful as a tough backing tile.',
  }),

  // ---------------------------------------------------------------- ceramic-nonox
  mat({
    key: 'sic',
    name: 'Silicon carbide, sintered (Hexoloy SA type)',
    class: 'ceramic', group: 'ceramic-nonox', uses: ['armour'], grade: 'A',
    refs: [
      'Saint-Gobain Hexoloy SA: rho 3.15, E 410 GPa, nu 0.14, Knoop 2800, flexural 380 MPa (4-pt), K_IC 4.6 MPa*m^0.5',
    ],
    rho: 3150, E: 4.1e11, nu: 0.14, Y: 4.4e9, UTS: 3.5e8, epsF: 0.001, G0: 52, BHN: 2800, jcC: 0,
    Tm: 3003, cp: 750, jcM: 1, brittle: 1, weibull: 10, compFail: false, erosionResist: 2.9,
    plateScale: 1.35, color: '#4a5057', color2: '#292d31',
    notes: 'Harder than alumina and lighter, with much better shock impedance matching to a steel backing. The usual mid-price armour ceramic.',
  }),
  mat({
    key: 'rbsic',
    name: 'Silicon carbide, reaction-bonded (RBSiC)',
    class: 'ceramic', group: 'ceramic-nonox', uses: ['armour'], grade: 'A',
    refs: [
      'CoorsTek reaction-bonded SiC: rho 3.10, E 393 GPa, nu 0.20, Knoop 2500, flexural 462 MPa, compressive 2.7 GPa, K_IC 4 MPa*m^0.5',
    ],
    rho: 3100, E: 3.93e11, nu: 0.2, Y: 3.9e9, UTS: 3e8, epsF: 0.001, G0: 41, BHN: 2500, jcC: 0,
    Tm: 2000, cp: 700, jcM: 1, brittle: 1, weibull: 10, compFail: false, erosionResist: 2.5,
    plateScale: 1.35, color: '#4e545b', color2: '#2d3136',
    notes: 'Silicon carbide with a free-silicon phase left in the pores. A little softer and weaker than sintered SiC but far cheaper to make in large complex tiles, which is why much real SiC armour is reaction-bonded.',
  }),
  mat({
    key: 'b4c',
    name: 'Boron carbide, hot-pressed',
    class: 'ceramic', group: 'ceramic-nonox', uses: ['armour'], grade: 'B',
    refs: [
      'CoorsTek hot-pressed B4C: rho 2.5, E 460 GPa, nu 0.17, Knoop 2750, flexural 410 MPa; K_IC 2.5-3.5 MPa*m^0.5 (3.0 used)',
    ],
    rho: 2510, E: 4.6e11, nu: 0.17, Y: 5.2e9, UTS: 3e8, epsF: 0.001, G0: 20, BHN: 2750, jcC: 0,
    Tm: 2723, cp: 950, jcM: 1, brittle: 1, weibull: 8, compFail: false, erosionResist: 3,
    plateScale: 1.2, color: '#3b3f45', color2: '#22252a',
    notes: 'Lightest common armour ceramic. Known to lose strength abruptly above a threshold impact stress (amorphisation), which this model does not include - so it is optimistic against heavy long rods. Pressureless-sintered and hot-pressed grades are not distinguished.',
  }),
  mat({
    key: 'tib2',
    name: 'Titanium diboride (TiB2)',
    class: 'ceramic', group: 'ceramic-nonox', uses: ['armour'], grade: 'B',
    refs: ['Hot-pressed TiB2; E = 565 GPa, HV ~ 33 GPa'],
    rho: 4520, E: 5.65e11, nu: 0.11, Y: 5.5e9, UTS: 4e8, epsF: 0.0012, G0: 60, BHN: 3400, jcC: 0,
    Tm: 3500, cp: 640, jcM: 1, brittle: 0.97, weibull: 9, compFail: true, erosionResist: 0.85,
    color: '#7c8ba0', color2: '#41495a',
    notes: 'Harder and stiffer than silicon carbide and denser than boron carbide. Like every ceramic here it works in compression and is worthless in tension: it must be confined and backed, and it comminutes once through.',
  }),
  mat({
    key: 'tib2al2o3',
    name: 'TiB2-Al2O3 ceramic composite',
    class: 'ceramic', group: 'ceramic-nonox', uses: ['armour'], grade: 'C',
    refs: ['Reaction-sintered TiB2 dispersed in alumina; K_IC ~6 MPa*m^0.5'],
    rho: 4050, E: 4e11, nu: 0.2, Y: 4e9, UTS: 4e8, epsF: 0.0012, G0: 90, BHN: 2000, jcC: 0, Tm: 2400,
    cp: 700, jcM: 1, brittle: 0.96, weibull: 12, compFail: false, erosionResist: 2.7, color: '#7a7266',
    color2: '#4a453d',
    notes: 'A particulate composite: the diboride supplies hardness, the alumina matrix arrests cracks. Tougher than either titanium diboride or alumina alone.',
  }),
  mat({
    key: 'si3n4',
    name: 'Silicon nitride (Si3N4)',
    class: 'ceramic', group: 'ceramic-nonox', uses: ['armour'], grade: 'A',
    refs: [
      'CoorsTek Si3N4 (SN101C / NT154): rho 3.16-3.22, E 310-320 GPa, nu 0.26-0.27, Knoop 1530-1630, flexural 900-1000 MPa, K_IC 5.5-6.5 MPa*m^0.5',
    ],
    rho: 3200, E: 3.1e11, nu: 0.27, Y: 3.4e9, UTS: 6e8, epsF: 0.0015, G0: 116, BHN: 1600, jcC: 0,
    Tm: 2173, cp: 700, jcM: 1, brittle: 0.92, weibull: 15, compFail: false, erosionResist: 2.2,
    plateScale: 1.1, color: '#6b6f66', color2: '#3f423c',
    notes: 'The tough one. Much less hard than boron carbide but several times its fracture toughness, so it survives multiple hits far better.',
  }),
  mat({
    key: 'aln',
    name: 'Aluminium nitride (AlN)',
    class: 'ceramic', group: 'ceramic-nonox', uses: ['armour'], grade: 'A',
    refs: [
      'CoorsTek hot-pressed AlN: rho 3.26, E 330 GPa, nu 0.25, Knoop 1120, flexural 340 MPa, K_IC 3 MPa*m^0.5',
    ],
    rho: 3260, E: 3.3e11, nu: 0.25, Y: 2.5e9, UTS: 3.2e8, epsF: 0.001, G0: 27, BHN: 1120, jcC: 0,
    Tm: 2500, cp: 740, jcM: 1, brittle: 1, weibull: 10, compFail: false, erosionResist: 1.9,
    color: '#b9bcb4', color2: '#6f716b',
    notes: 'Studied for armour mainly because its shock response is well characterised. Middling hardness; its real commercial value is thermal, not ballistic.',
  }),
  mat({
    key: 'wc',
    name: 'Tungsten carbide (APCR core)',
    class: 'ceramic', group: 'ceramic-nonox', uses: ['armour', 'penetrator'], grade: 'B',
    refs: ['WC-6Co cemented carbide: rho ~14.9 g/cm3, E ~600 GPa, K_IC ~10 MPa*m^0.5'],
    rho: 14900, E: 6e11, nu: 0.22, Y: 5e9, UTS: 6e8, epsF: 0.004, G0: 170, BHN: 1600, jcC: 0, Tm: 3140,
    cp: 200, jcM: 1, brittle: 0.95, weibull: 12, compFail: false, erosionResist: 2.6, color: '#3f434a',
    color2: '#232629',
    notes: 'Extremely hard, low toughness, high density: excellent at short range, poor sectional density and shatters against sloped plate.',
  }),
  mat({
    key: 'cmc',
    name: 'Ceramic matrix composite (CMC)',
    class: 'ceramic', group: 'ceramic-nonox', uses: ['armour'], grade: 'C',
    refs: ['SiC fibre in SiC matrix, woven; K_IC ~17 MPa*m^0.5 equivalent'],
    rho: 2700, E: 1e11, nu: 0.2, Y: 3.5e8, UTS: 3e8, epsF: 0.008, G0: 3000, BHN: 700, jcC: 0, Tm: 2100,
    cp: 800, jcM: 1, brittle: 0.55, weibull: 18, compFail: false, erosionResist: 0.9, color: '#6e6a60',
    color2: '#403d38',
    notes: 'Fibre reinforcement buys a ceramic something like graceful failure: it pulls fibres out instead of shattering. Much weaker than a monolithic tile and far more damage-tolerant.',
  }),
  mat({
    key: 'diamond',
    name: 'Diamond (polycrystalline)',
    class: 'ceramic', group: 'ceramic-nonox', uses: ['armour', 'penetrator'], grade: 'B',
    refs: ['Polycrystalline diamond compact; K_IC ~3.4 MPa*m^0.5, E from single-crystal average'],
    rho: 3515, E: 1.05e12, nu: 0.07, Y: 1.5e10, UTS: 1.3e9, epsF: 0.0008, G0: 11, BHN: 8000, jcC: 0,
    Tm: 4000, cp: 510, jcM: 1, brittle: 1, weibull: 6, compFail: false, erosionResist: 4.5,
    color: '#dfe8ee', color2: '#8b939a',
    notes: 'The hardest and stiffest material in the database by a wide margin, and one of the most brittle - a Weibull modulus of 6 means its strength scatters enormously. It resists indentation superbly and cracks through with very little warning. Not a practical armour: it is here because it bounds what hardness alone can do.',
  }),

  // ---------------------------------------------------------------- glass
  mat({
    key: 'sapphire',
    name: 'Sapphire (single-crystal Al2O3)',
    class: 'ceramic', group: 'glass', uses: ['armour'], grade: 'B',
    refs: [
      'Manufacturer handbook values for c-plane sapphire: rho 3.98, E 345-435 GPa, Knoop ~2200, flexural 400-700 MPa, K_IC ~2 MPa*m^0.5',
    ],
    rho: 3980, E: 4e11, nu: 0.27, Y: 4.4e9, UTS: 4e8, epsF: 0.001, G0: 10, BHN: 2200, jcC: 0, Tm: 2303,
    cp: 760, jcM: 1, brittle: 1, weibull: 8, compFail: false, erosionResist: 2.6, color: '#c9d4e2',
    color2: '#7a8594',
    notes: 'The hardest oxide and the strike face of the best transparent armour. A single crystal, so its real strength depends on orientation; the entry is an isotropic average.',
  }),
  mat({
    key: 'alon',
    name: 'Aluminium oxynitride (ALON)',
    class: 'ceramic', group: 'glass', uses: ['armour'], grade: 'A',
    refs: [
      'Surmet/CIAL ALON datasheet: rho 3.69-3.70, E 46.9 Msi (323 GPa), nu 0.24, Knoop 1850, flexural 55 ksi (380 MPa), K_IC 2.0 MPa*m^0.5',
      'compressive strength 2.68 GPa (Wikipedia, Aluminium oxynitride)',
    ],
    rho: 3690, E: 3.23e11, nu: 0.24, Y: 3.6e9, UTS: 3e8, epsF: 0.001, G0: 12.4, BHN: 1850, jcC: 0,
    Tm: 2413, cp: 760, jcM: 1, brittle: 1, weibull: 10, compFail: false, erosionResist: 2,
    color: '#c0cad6', color2: '#7a828e',
    notes: 'Polycrystalline transparent ceramic, optically clear and far cheaper to make in large panes than sapphire. The usual strike layer of transparent armour in the open literature.',
  }),
  mat({
    key: 'spinel',
    name: 'Magnesium aluminate spinel (transparent)',
    class: 'ceramic', group: 'glass', uses: ['armour'], grade: 'B',
    refs: [
      'Transparent MgAl2O4 spinel, open literature: rho 3.58, E ~260-277 GPa, Knoop ~1400-1650, flexural ~150-250 MPa (fine-grain up to ~400), K_IC ~1.5-2 MPa*m^0.5',
    ],
    rho: 3580, E: 2.77e11, nu: 0.26, Y: 2.8e9, UTS: 1.5e8, epsF: 0.001, G0: 12, BHN: 1500, jcC: 0,
    Tm: 2408, cp: 790, jcM: 1, brittle: 1, weibull: 9, compFail: false, erosionResist: 1.8,
    color: '#c7d0dc', color2: '#7d8591',
    notes: 'Slightly softer and weaker than ALON and sapphire; chosen where large clear panes and broad-band transparency matter more than the last increment of hardness.',
  }),
  mat({
    key: 'fusedsilica',
    name: 'Fused silica (SiO2)',
    class: 'ceramic', group: 'glass', uses: ['armour'], grade: 'B',
    refs: ['High-purity fused quartz; K_IC ~0.75 MPa*m^0.5'],
    rho: 2200, E: 7.3e10, nu: 0.17, Y: 1.1e9, UTS: 5e7, epsF: 0.0007, G0: 7.7, BHN: 600, jcC: 0,
    Tm: 1983, cp: 740, jcM: 1, brittle: 1, weibull: 5, compFail: false, erosionResist: 0.55,
    color: '#cfdadf', color2: '#7d868b',
    notes: 'A glass: hard, extremely weak in tension, and with the lowest Weibull modulus here. It anomalously densifies under shock instead of simply shattering, which is not modelled. The strike face of transparent armour.',
  }),
  mat({
    key: 'floatglass',
    name: 'Soda-lime float glass',
    class: 'ceramic', group: 'glass', uses: ['armour'], grade: 'B',
    refs: [
      'Float glass handbook values: rho 2.50, E 70 GPa, nu 0.22, Knoop ~520-560, annealed tensile strength ~40-50 MPa, K_IC ~0.75 MPa*m^0.5',
    ],
    rho: 2500, E: 7e10, nu: 0.22, Y: 1e9, UTS: 4.5e7, epsF: 0.0007, G0: 8, BHN: 540, jcC: 0, Tm: 1400,
    cp: 840, jcM: 1, brittle: 1, weibull: 5, compFail: false, erosionResist: 0.5, color: '#b9d2cf',
    color2: '#6b807d',
    notes: 'Ordinary window glass. Weak in tension and with a very wide strength scatter (Weibull modulus ~5). The outer layers of laminated bullet-resistant glass.',
  }),
  mat({
    key: 'borosilicate',
    name: 'Borosilicate glass (Pyrex 7740 type)',
    class: 'ceramic', group: 'glass', uses: ['armour'], grade: 'B',
    refs: ['Corning 7740 / Borofloat 33 class: rho 2.23, E 63-64 GPa, nu 0.20, Knoop ~420'],
    rho: 2230, E: 6.4e10, nu: 0.2, Y: 9e8, UTS: 5e7, epsF: 0.0008, G0: 11, BHN: 420, jcC: 0, Tm: 1500,
    cp: 830, jcM: 1, brittle: 1, weibull: 5, compFail: false, erosionResist: 0.5, color: '#bcd5d6',
    color2: '#6e8587',
    notes: 'Lighter and slightly softer than soda-lime glass, with a lower thermal expansion. Used in thick transparent stacks where glass must survive heat as well as impact.',
  }),

  // ---------------------------------------------------------------- civil
  mat({
    key: 'concrete',
    name: 'Concrete (normal strength, C40/50)',
    class: 'ceramic', group: 'civil', uses: ['armour'], grade: 'B',
    refs: [
      'Eurocode 2 C40/50: Ecm 35 GPa, fck 40 MPa, fctm 3.5 MPa; mode-I fracture energy ~100 J/m2',
      'rho 2.3-2.5 g/cm3',
    ],
    rho: 2400, E: 3.5e10, nu: 0.2, Y: 4e7, UTS: 3.5e6, epsF: 0.0002, G0: 100, BHN: 30, jcC: 0,
    Tm: 1500, cp: 880, jcM: 1, brittle: 0.9, weibull: 6, compFail: true, erosionResist: 0.2,
    color: '#9a9a96', color2: '#5c5c59',
    notes: 'Crushes in compression and cracks in tension at a tenth of that stress. The aggregate and the reinforcing steel are not resolved: this is the homogenised plain-concrete value, so a real reinforced wall is stronger.',
  }),
  mat({
    key: 'uhpc',
    name: 'Ultra-high-performance fibre concrete (UHPFRC)',
    class: 'ceramic', group: 'civil', uses: ['armour'], grade: 'C',
    refs: [
      'UHPFRC open literature: fc 150-200 MPa, E 45-55 GPa, post-crack tensile strength ~8-15 MPa, fracture energy several kJ/m2',
    ],
    rho: 2500, E: 5e10, nu: 0.2, Y: 1.5e8, UTS: 1e7, epsF: 0.0006, G0: 4000, BHN: 60, jcC: 0, Tm: 1500,
    cp: 880, jcM: 1, brittle: 0.5, weibull: 12, compFail: true, erosionResist: 0.4, color: '#8e8f8b',
    color2: '#52534f',
    notes: 'Steel-fibre-reinforced concrete with a refined paste. The fibres bridge cracks, so it fails far more gracefully than plain concrete; fracture energy here is the homogenised fibre-bridged value.',
  }),
];
