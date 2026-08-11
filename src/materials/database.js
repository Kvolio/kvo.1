/**
 * MATERIAL DATABASE
 * =================
 *
 * Every entry is a *macroscopic continuum* description. The peridynamic
 * solver derives its bond-level constants from these numbers at mesh time
 * (see materials/derive.js), so editing a property here — or in the UI —
 * changes the simulated response, not a label.
 *
 * Property meanings (SI):
 *   rho     density                              kg/m^3
 *   E       Young's modulus                      Pa
 *   nu      Poisson's ratio (reference value)    -    (see NOTE below)
 *   Y       quasi-static yield strength          Pa
 *   UTS     ultimate tensile strength            Pa
 *   epsF    true failure strain (tensile)        -
 *   G0      mode-I fracture energy  = K_IC^2/E   J/m^2
 *   BHN     Brinell hardness                     -    (reported, drives the
 *                                                      empirical cross-checks)
 *   jcC     Johnson-Cook strain-rate coefficient -    sigma_y *= 1 + C ln(edot/edot0)
 *   Tm      melting temperature                  K
 *   cp      specific heat                        J/(kg K)
 *   jcM     Johnson-Cook thermal softening exp   -
 *   brittle 0 = fully ductile, 1 = fully brittle -    (blends the two failure
 *                                                      criteria, see MODEL.md)
 *   weibull Weibull modulus of local strength    -    (flaw-density scatter;
 *                                                      low = ceramics)
 *   compFail true if bonds may also fail in compression/shear
 *
 * NOTE ON POISSON'S RATIO
 * -----------------------
 * Bond-based peridynamics is restricted to nu = 1/3 in 2-D (nu = 1/4 in 3-D).
 * The `nu` stored here is the real material value: it is used by the
 * *analytic* cross-check models (Tate, cavity expansion) and reported in the
 * UI, but the PD bond constants are calibrated at the bond-based value. This
 * is the single largest documented approximation in the deformation model.
 * See docs/MODEL.md §3.2.
 *
 * SOURCES
 * -------
 * Values are representative handbook / open-literature figures for the class
 * of material named, not certified lot data. They are traceable to the
 * references listed per entry and in docs/MODEL.md §8. Nothing here has been
 * validated against a specific firing trial.
 */

/** @typedef {ReturnType<typeof mat>} Material */

function mat(o) {
  return Object.assign({
    key: '', name: '', class: 'metal',
    rho: 7850, E: 210e9, nu: 0.29,
    Y: 1.0e9, UTS: 1.15e9, epsF: 0.18, G0: 48e3,
    BHN: 300, jcC: 0.014, Tm: 1800, cp: 477, jcM: 1.03,
    brittle: 0.0, weibull: 22, compFail: false,
    erosionResist: 1.0,
    color: '#8a94a6', color2: '#5a6272',
    source: '', notes: '',
  }, o);
}

export const MATERIALS = {

  // ---------------------------------------------------------------- armour
  rha: mat({
    key: 'rha', name: 'RHA (rolled homogeneous armour)', class: 'metal',
    rho: 7850, E: 210e9, nu: 0.29, Y: 1.05e9, UTS: 1.20e9, epsF: 0.17,
    G0: 48e3, BHN: 300, jcC: 0.014, Tm: 1793, cp: 477, jcM: 1.03,
    brittle: 0.05, weibull: 28, erosionResist: 1.0,
    color: '#7d8798', color2: '#4b525f',
    source: 'MIL-DTL-12560K class 1; K_IC ~100 MPa*m^0.5',
    notes: 'The reference armour. All "RHAe" figures in the report are relative to this entry.',
  }),
  hha: mat({
    key: 'hha', name: 'High-hardness steel (HHA, 500 BHN)', class: 'metal',
    rho: 7850, E: 210e9, nu: 0.29, Y: 1.55e9, UTS: 1.85e9, epsF: 0.09,
    G0: 19e3, BHN: 500, jcC: 0.012, Tm: 1793, cp: 477, jcM: 1.0,
    brittle: 0.30, weibull: 20, erosionResist: 1.15,
    color: '#98a0ad', color2: '#5b6270',
    source: 'MIL-DTL-46100E; K_IC ~63 MPa*m^0.5',
    notes: 'Higher resistance to plastic flow, markedly lower ductility: prone to plugging and rear-face cracking.',
  }),
  fha: mat({
    key: 'fha', name: 'Face-hardened armour (graded)', class: 'metal',
    rho: 7850, E: 210e9, nu: 0.29, Y: 1.35e9, UTS: 1.6e9, epsF: 0.11,
    G0: 26e3, BHN: 430, jcC: 0.013, Tm: 1793, cp: 477, jcM: 1.0,
    brittle: 0.35, weibull: 18, erosionResist: 1.1,
    color: '#a6adba', color2: '#5f6673',
    // gradient: fraction-of-thickness -> property multipliers (front face = 0)
    gradient: { Y: [[0, 1.55], [0.35, 1.25], [1, 0.72]], epsF: [[0, 0.45], [0.35, 0.8], [1, 1.6]], brittle: [[0, 2.2], [0.35, 1.2], [1, 0.25]] },
    source: 'Krupp-type cemented plate, carburised case ~30-40 % of thickness',
    notes: 'Hard brittle case over a tough back. Shatters uncapped projectiles; the soft back resists the resulting plug.',
  }),
  cast: mat({
    key: 'cast', name: 'Cast homogeneous armour', class: 'metal',
    rho: 7800, E: 200e9, nu: 0.29, Y: 0.88e9, UTS: 1.0e9, epsF: 0.13,
    G0: 33e3, BHN: 260, jcC: 0.014, Tm: 1780, cp: 477, jcM: 1.03,
    brittle: 0.15, weibull: 14, erosionResist: 0.9,
    color: '#77808e', color2: '#464c58',
    source: 'Typical cast turret steel; ~0.85-0.95 x RHA mass efficiency',
    notes: 'Porosity and coarse grain modelled as a low Weibull modulus: more scatter in local strength.',
  }),
  mild: mat({
    key: 'mild', name: 'Mild / structural steel', class: 'metal',
    rho: 7850, E: 200e9, nu: 0.30, Y: 0.26e9, UTS: 0.42e9, epsF: 0.35,
    G0: 98e3, BHN: 120, jcC: 0.022, Tm: 1793, cp: 477, jcM: 1.03,
    brittle: 0.0, weibull: 30, erosionResist: 0.55,
    color: '#6c757f', color2: '#3f454d',
    source: 'AISI 1020 normalised',
    notes: 'Structural, not armour. Deforms and petals rather than plugs.',
  }),
  al5083: mat({
    key: 'al5083', name: 'Aluminium 5083-H131', class: 'metal',
    rho: 2660, E: 70e9, nu: 0.33, Y: 0.24e9, UTS: 0.35e9, epsF: 0.24,
    G0: 11.2e3, BHN: 85, jcC: 0.015, Tm: 863, cp: 900, jcM: 1.0,
    brittle: 0.05, weibull: 26, erosionResist: 0.45,
    color: '#9aa4ad', color2: '#5c646b',
    source: 'MIL-DTL-46027; K_IC ~28 MPa*m^0.5',
    notes: 'Weight-efficient against fragments, poor against long rods.',
  }),
  al7039: mat({
    key: 'al7039', name: 'Aluminium 7039-T64', class: 'metal',
    rho: 2740, E: 70e9, nu: 0.33, Y: 0.38e9, UTS: 0.45e9, epsF: 0.12,
    G0: 7.6e3, BHN: 130, jcC: 0.013, Tm: 903, cp: 900, jcM: 1.0,
    brittle: 0.25, weibull: 20, erosionResist: 0.5,
    color: '#a8b1b8', color2: '#646c73',
    source: 'MIL-DTL-46063; stress-corrosion sensitive alloy',
    notes: 'The classic weldable armour aluminium. Stronger than 5083 and more prone to stress-corrosion cracking, which is why later hulls went back to 5083.',
  }),
  ti64: mat({
    key: 'ti64', name: 'Titanium Ti-6Al-4V', class: 'metal',
    rho: 4430, E: 114e9, nu: 0.34, Y: 0.95e9, UTS: 1.05e9, epsF: 0.14,
    G0: 49e3, BHN: 334, jcC: 0.034, Tm: 1933, cp: 526, jcM: 0.8,
    brittle: 0.10, weibull: 24, erosionResist: 1.0,
    color: '#8e8a86', color2: '#565351',
    source: 'MIL-DTL-46077; K_IC ~75 MPa*m^0.5',
    notes: 'Strongly adiabatic-shear prone (low jcM): forms shear bands and plugs at high rate.',
  }),
  alumina: mat({
    key: 'alumina', name: 'Alumina AD-995 ceramic', class: 'ceramic',
    rho: 3890, E: 370e9, nu: 0.22, Y: 3.0e9, UTS: 0.26e9, epsF: 0.001,
    G0: 43, BHN: 1400, jcC: 0.0, Tm: 2323, cp: 880, jcM: 1.0,
    brittle: 1.0, weibull: 9, erosionResist: 2.4, compFail: false,
    color: '#d9d3c4', color2: '#8e897c',
    source: 'CoorsTek AD-995; K_IC ~4.0 MPa*m^0.5',
    notes: 'Very strong in compression, very weak in tension. Comminutes ahead of the penetrator and blunts/erodes it. Needs a backing plate to be useful.',
  }),
  sic: mat({
    key: 'sic', name: 'Silicon carbide ceramic', class: 'ceramic',
    rho: 3150, E: 410e9, nu: 0.16, Y: 4.4e9, UTS: 0.35e9, epsF: 0.001,
    G0: 52, BHN: 2800, jcC: 0.0, Tm: 3003, cp: 750, jcM: 1.0,
    brittle: 1.0, weibull: 10, erosionResist: 2.9,
    color: '#4a5057', color2: '#292d31',
    source: 'Hexoloy SA; K_IC ~4.6 MPa*m^0.5',
    notes: 'Harder than alumina and lighter, with much better shock impedance matching to a steel backing. The usual mid-price armour ceramic.',
  }),
  b4c: mat({
    key: 'b4c', name: 'Boron carbide ceramic', class: 'ceramic',
    rho: 2510, E: 460e9, nu: 0.17, Y: 5.2e9, UTS: 0.30e9, epsF: 0.001,
    G0: 26, BHN: 3200, jcC: 0.0, Tm: 2723, cp: 950, jcM: 1.0,
    brittle: 1.0, weibull: 8, erosionResist: 3.0,
    color: '#3b3f45', color2: '#22252a',
    source: 'K_IC ~3.5 MPa*m^0.5; known to lose strength above ~20 GPa impact stress',
    notes: 'Lightest common armour ceramic; the model does not include its amorphisation/strength collapse at very high pressure.',
  }),
  uhmwpe: mat({
    key: 'uhmwpe', name: 'UHMWPE laminate (HB-class)', class: 'composite',
    rho: 980, E: 32e9, nu: 0.35, Y: 1.4e9, UTS: 2.8e9, epsF: 0.035,
    G0: 8e3, BHN: 25, jcC: 0.03, Tm: 420, cp: 1900, jcM: 1.4,
    brittle: 0.0, weibull: 18, erosionResist: 0.25,
    color: '#c9c6ac', color2: '#7c7a68',
    source: 'DSM Dyneema HB26 class laminate',
    notes: 'Very high specific tensile strength, very low through-thickness strength: delaminates and bulges rather than plugging.',
  }),
  grp: mat({
    key: 'grp', name: 'S-2 glass / epoxy laminate', class: 'composite',
    rho: 1900, E: 27e9, nu: 0.28, Y: 0.5e9, UTS: 1.6e9, epsF: 0.03,
    G0: 3.5e3, BHN: 40, jcC: 0.02, Tm: 700, cp: 1000, jcM: 1.2,
    brittle: 0.4, weibull: 14, erosionResist: 0.3,
    color: '#b9b06f', color2: '#6e6842',
    source: 'MIL-DTL-64154 GRP structural armour',
    notes: 'The standard structural armour laminate. Cheap, stiff and effective per kilogramme against fragments; poor against a focused kinetic penetrator.',
  }),
  aramid: mat({
    key: 'aramid', name: 'Aramid spall liner', class: 'composite',
    rho: 1400, E: 20e9, nu: 0.35, Y: 0.6e9, UTS: 2.0e9, epsF: 0.04,
    G0: 6e3, BHN: 25, jcC: 0.03, Tm: 700, cp: 1400, jcM: 1.3,
    brittle: 0.0, weibull: 20, erosionResist: 0.2,
    color: '#8f7f52', color2: '#554b31',
    notes: 'Catches spall; contributes little to resisting the main penetrator.',
    source: 'Para-aramid fabric (Kevlar 29 class), resin-light lay-up',
  }),
  rubber: mat({
    key: 'rubber', name: 'Elastomer interlayer (NERA)', class: 'polymer',
    rho: 1150, E: 0.05e9, nu: 0.49, Y: 0.02e9, UTS: 0.025e9, epsF: 2.0,
    G0: 3e3, BHN: 5, jcC: 0.05, Tm: 500, cp: 1800, jcM: 1.5,
    brittle: 0.0, weibull: 30, erosionResist: 0.05,
    color: '#2f3136', color2: '#1a1c1f',
    notes: 'Bulk-modulus mismatch drives the plate-flyer motion that makes NERA sandwiches work.',
    source: 'Filled elastomer interlayer as used in NERA / bulging-plate sandwiches',
  }),

  // ------------------------------------------------------------ penetrators
  wha: mat({
    key: 'wha', name: 'Tungsten heavy alloy (91W-Ni-Fe)', class: 'metal',
    rho: 17600, E: 350e9, nu: 0.28, Y: 1.35e9, UTS: 1.55e9, epsF: 0.10,
    G0: 30e3, BHN: 420, jcC: 0.016, Tm: 1723, cp: 134, jcM: 1.0,
    brittle: 0.15, weibull: 24, erosionResist: 1.9,
    color: '#5b5f66', color2: '#33363b',
    source: 'Typical 91 % W sintered heavy alloy long-rod stock',
    notes: 'Standard modern long-rod material: mushrooms at the nose during erosion.',
  }),
  du: mat({
    key: 'du', name: 'Depleted uranium (U-0.75Ti)', class: 'metal',
    rho: 18600, E: 172e9, nu: 0.23, Y: 1.05e9, UTS: 1.4e9, epsF: 0.16,
    G0: 22e3, BHN: 350, jcC: 0.007, Tm: 1408, cp: 116, jcM: 0.55,
    brittle: 0.1, weibull: 22, erosionResist: 2.0, selfSharpening: true,
    color: '#4d4a42', color2: '#2c2a25',
    source: 'U-0.75wt%Ti alloy',
    notes: 'Very low thermal-softening exponent: localises into adiabatic shear bands, shedding material from the nose flanks instead of mushrooming (self-sharpening).',
  }),
  apsteel: mat({
    key: 'apsteel', name: 'Hardened AP core steel', class: 'metal',
    rho: 7850, E: 210e9, nu: 0.29, Y: 1.95e9, UTS: 2.15e9, epsF: 0.045,
    G0: 12e3, BHN: 620, jcC: 0.010, Tm: 1793, cp: 477, jcM: 1.0,
    brittle: 0.55, weibull: 16, erosionResist: 1.25,
    color: '#9ea3a8', color2: '#5c6064',
    notes: 'Hard enough to defeat plate, brittle enough to shatter on face-hardened armour above the shatter-gap velocity. That behaviour is emergent here, not scripted.',
  }),
  wc: mat({
    key: 'wc', name: 'Tungsten carbide (APCR core)', class: 'ceramic',
    rho: 14900, E: 600e9, nu: 0.22, Y: 5.0e9, UTS: 0.6e9, epsF: 0.004,
    G0: 170, BHN: 1600, jcC: 0.0, Tm: 3140, cp: 200, jcM: 1.0,
    brittle: 0.95, weibull: 12, erosionResist: 2.6,
    color: '#3f434a', color2: '#232629',
    source: 'WC-Co cemented carbide; K_IC ~10 MPa*m^0.5',
    notes: 'Extremely hard, low toughness, high density: excellent at short range, poor sectional density and shatters against sloped plate.',
  }),
  copper: mat({
    key: 'copper', name: 'OFHC copper (shaped-charge liner)', class: 'metal',
    rho: 8960, E: 117e9, nu: 0.34, Y: 0.09e9, UTS: 0.22e9, epsF: 0.9,
    G0: 60e3, BHN: 45, jcC: 0.025, Tm: 1356, cp: 385, jcM: 1.09,
    brittle: 0.0, weibull: 30, erosionResist: 0.5,
    color: '#b06a3a', color2: '#6a3f22',
    source: 'Johnson-Cook OFHC copper parameters (Johnson & Cook 1983)',
    notes: 'Jet material. Behaves near-hydrodynamically at jet velocities; strength barely matters.',
  }),
  al7075: mat({
    key: 'al7075', name: 'Aluminium 7075-T6 (sabot)', class: 'metal',
    rho: 2810, E: 71.7e9, nu: 0.33, Y: 0.50e9, UTS: 0.57e9, epsF: 0.11,
    G0: 9e3, BHN: 150, jcC: 0.013, Tm: 893, cp: 960, jcM: 1.0,
    brittle: 0.2, weibull: 22, erosionResist: 0.4,
    color: '#b6bcc2', color2: '#6d7176',
  }),
  softcap: mat({
    key: 'softcap', name: 'Penetrating cap steel (soft)', class: 'metal',
    rho: 7850, E: 205e9, nu: 0.29, Y: 0.55e9, UTS: 0.75e9, epsF: 0.30,
    G0: 90e3, BHN: 200, jcC: 0.018, Tm: 1793, cp: 477, jcM: 1.03,
    brittle: 0.0, weibull: 28, erosionResist: 0.7,
    color: '#8b8577', color2: '#524e46',
    notes: 'Spreads and delays the shock reaching the hard core, which is why an APC round survives a face-hardened plate that shatters an uncapped AP round.',
  }),
  windscreen: mat({
    key: 'windscreen', name: 'Ballistic cap (thin alloy shell)', class: 'metal',
    rho: 2700, E: 68e9, nu: 0.33, Y: 0.12e9, UTS: 0.2e9, epsF: 0.2,
    G0: 8e3, BHN: 45, jcC: 0.02, Tm: 900, cp: 900, jcM: 1.0,
    brittle: 0.1, weibull: 20, erosionResist: 0.08,
    color: '#7a7f86', color2: '#474a4f',
    notes: 'Purely aerodynamic. Crushes away in the first microseconds and contributes essentially nothing to penetration.',
  }),


  textolite: mat({
    key: 'textolite', name: 'Textolite (phenolic-cotton laminate)', class: 'composite',
    rho: 1380, E: 8.0e9, nu: 0.35, Y: 0.13e9, UTS: 0.10e9, epsF: 0.022,
    G0: 3.0e3, BHN: 30, jcC: 0.0, Tm: 500, cp: 1500, jcM: 1.0,
    brittle: 0.55, weibull: 12, erosionResist: 0.15,
    color: '#8a6a3f', color2: '#4f3c22',
    source: 'PTK-grade cotton-fabric phenolic laminate (GOST 5-78 class): rho 1.3-1.4 g/cm3, tensile ~100 MPa, compressive ~150-200 MPa, E ~ 6-10 GPa in plane.',
    notes: 'The filler of Soviet combination glacis armour, sandwiched between steel plates. It is not a "hard" armour material at all - a fifth the density of steel and a tenth its strength. Its value is as a low-impedance spacer: it costs the penetrator length and time, disrupts a shaped-charge jet across the impedance mismatch at each interface, and adds line-of-sight thickness for very little mass. Judge it by the areal-mass column, not by how much it stops on its own.',
  }),

  // ------------------------------------------------ heavy and exotic armour
  // Dense metals are poor armour per unit MASS - their merit is per unit
  // THICKNESS. Where volume is the binding constraint rather than weight
  // (turret fronts, test targets, backing behind a ceramic) they buy far more
  // resistance in the same space than steel does, at three to five times the
  // areal density. The simulation reports areal mass alongside thickness for
  // exactly this reason: it is the number that makes them look bad.
  maraging: mat({
    key: 'maraging', name: 'Maraging steel (18Ni-350)', class: 'metal',
    rho: 8080, E: 190e9, nu: 0.30, Y: 2.35e9, UTS: 2.45e9, epsF: 0.06,
    G0: 22e3, BHN: 600, jcC: 0.010, Tm: 1685, cp: 420, jcM: 0.9,
    brittle: 0.35, weibull: 22, erosionResist: 1.30,
    color: '#a6a2ad', color2: '#5f5c66',
    source: '18Ni(350) maraging grade, aged: 2.4 GPa UTS at ~6 % elongation',
    notes: 'Roughly twice the yield of RHA at a similar density, bought with ductility. Resists penetration well and cracks readily; a poor choice where spall behind the plate matters.',
  }),
  tantalum: mat({
    key: 'tantalum', name: 'Tantalum', class: 'metal',
    rho: 16650, E: 186e9, nu: 0.34, Y: 0.45e9, UTS: 0.62e9, epsF: 0.40,
    G0: 60e3, BHN: 200, jcC: 0.030, Tm: 3290, cp: 140, jcM: 0.44,
    brittle: 0.0, weibull: 26, erosionResist: 1.5,
    color: '#6e7480', color2: '#3e424a',
    source: 'Unalloyed Ta; Johnson-Cook constants from Chen & Gray (1996)',
    notes: 'Dense and extraordinarily ductile - it deforms rather than fractures, which is why it is used for EFP liners. As armour it soaks up energy in plastic work and barely spalls, but its low yield means it is defeated by thickness rather than by strength.',
  }),
  tib2: mat({
    key: 'tib2', name: 'Titanium diboride (TiB2)', class: 'ceramic',
    rho: 4520, E: 565e9, nu: 0.11, Y: 5.5e9, UTS: 0.40e9, epsF: 0.0012,
    G0: 60, BHN: 3400, jcC: 0.0, Tm: 3500, cp: 640, jcM: 1.0,
    brittle: 0.97, weibull: 9, compFail: true, erosionResist: 0.85,
    color: '#7c8ba0', color2: '#41495a',
    source: 'Hot-pressed TiB2; E = 565 GPa, HV ~ 33 GPa',
    notes: 'Harder and stiffer than silicon carbide and denser than boron carbide. Like every ceramic here it works in compression and is worthless in tension: it must be confined and backed, and it comminutes once through.',
  }),

  // --------------------------------------------------------------- fillers
  compb: mat({
    key: 'compb', name: 'Composition B (HE filler)', class: 'explosive',
    rho: 1717, E: 5e9, nu: 0.4, Y: 0.02e9, UTS: 0.02e9, epsF: 0.05,
    G0: 100, BHN: 5, jcC: 0.0, Tm: 500, cp: 1200, jcM: 1.0,
    brittle: 0.6, weibull: 15, erosionResist: 0.02,
    color: '#c2a33c', color2: '#7a672a',
    detVel: 7980, gurney: 2700, heatOfDet: 5.19e6,
    source: 'Gurney velocity sqrt(2E)=2.70 km/s; D=7.98 km/s (Dobratz & Crawford, LLNL Explosives Handbook)',
  }),
  // Reactive-armour explosive. 4S20 and its Western equivalents are
  // plastic-bonded, deliberately INSENSITIVE compositions: an ERA cassette has
  // to survive small-arms fire, shell splinters and its own vehicle's blast,
  // and only function when a jet or a rod shocks it. That insensitivity is the
  // whole design constraint, and it is expressed here by a critical shock
  // pressure of 7 GPa - roughly where insensitive plastic-bonded compositions
  // sit, and several times the threshold of a sensitive booster explosive.
  //
  // Published data on 4S20 itself is thin. These are representative
  // plastic-bonded-explosive values, not measurements of the Soviet
  // composition, and the initiation constants in particular should be read as
  // "insensitive PBX" rather than as a specific material.
  era4s20: mat({
    key: 'era4s20', name: '4S20-type ERA explosive (insensitive PBX)', class: 'explosive',
    rho: 1500, E: 4.5e9, nu: 0.4, Y: 0.03e9, UTS: 0.03e9, epsF: 0.06,
    G0: 120, BHN: 6, jcC: 0.0, Tm: 500, cp: 1200, jcM: 1.0,
    brittle: 0.5, weibull: 15, erosionResist: 0.02,
    color: '#b0674a', color2: '#6b3c28',
    detVel: 7000, gurney: 2400, heatOfDet: 4.6e6,
    // Initiation threshold, Held-style: the charge functions when v^2 * d
    // exceeds this, with v the speed the insult drives into the filler and d
    // the width of filler it drives. Units are (km/s)^2 * mm. Held's published
    // constants for covered charges are 16-25 for sensitive compositions; this
    // is larger both because the composition is insensitive and because d here
    // is the width of disturbed filler the solver resolves rather than a jet
    // diameter, so the constant is calibrated to this model and is not
    // interchangeable with a published one. See sim/era.js for the measured
    // separation it sits in.
    heldV2d: 200,
    source: 'Representative insensitive PBX; Gurney and detonation velocity of the RDX/binder class (Dobratz & Crawford). Walker-Wasley initiation constant is an order-of-magnitude figure for an insensitive composition, not a measurement of 4S20.',
    notes: 'Used as the interlayer of an ERA cassette. Insensitive by design: small-arms and splinter strikes must not initiate it.',
  }),
  tnt: mat({
    key: 'tnt', name: 'TNT (HE filler)', class: 'explosive',
    rho: 1630, E: 4e9, nu: 0.4, Y: 0.015e9, UTS: 0.015e9, epsF: 0.05,
    G0: 80, BHN: 4, jcC: 0.0, Tm: 480, cp: 1200, jcM: 1.0,
    brittle: 0.6, weibull: 15, erosionResist: 0.02,
    color: '#b8912f', color2: '#6e5720',
    detVel: 6930, gurney: 2440, heatOfDet: 4.52e6,
    source: 'Gurney velocity sqrt(2E)=2.44 km/s (Dobratz & Crawford)',
  }),
  octol: mat({
    key: 'octol', name: 'Octol 75/25 (shaped-charge fill)', class: 'explosive',
    rho: 1821, E: 6e9, nu: 0.4, Y: 0.02e9, UTS: 0.02e9, epsF: 0.05,
    G0: 100, BHN: 5, jcC: 0.0, Tm: 520, cp: 1200, jcM: 1.0,
    brittle: 0.6, weibull: 15, erosionResist: 0.02,
    color: '#d0b04a', color2: '#857036',
    detVel: 8480, gurney: 2800, heatOfDet: 5.5e6,
  }),
  hesh: mat({
    key: 'hesh', name: 'Plastic explosive (HESH filler)', class: 'explosive',
    rho: 1600, E: 0.5e9, nu: 0.48, Y: 0.002e9, UTS: 0.002e9, epsF: 3.0,
    G0: 300, BHN: 2, jcC: 0.0, Tm: 450, cp: 1300, jcM: 1.0,
    brittle: 0.0, weibull: 25, erosionResist: 0.01,
    color: '#cfc0a0', color2: '#7d7460',
    detVel: 8040, gurney: 2680, heatOfDet: 5.6e6,
    source: 'Composition C-4 class; squashes before the base fuze functions',
  }),

  // --------------------------------------------------------------- internals
  boxsteel: mat({
    key: 'boxsteel', name: 'Component casing steel', class: 'metal',
    rho: 7850, E: 200e9, nu: 0.3, Y: 0.35e9, UTS: 0.5e9, epsF: 0.3,
    G0: 90e3, BHN: 150, brittle: 0.0, weibull: 28, erosionResist: 0.6,
    color: '#606771', color2: '#383d44',
    source: 'Generic mild-steel component casing / housing stock',
    notes: 'Not armour. It is what a gearbox, an ammunition box or a fuel cell wall is made of, so a fragment reaching the inside of the vehicle still has something to get through.',
  }),

  // ==========================================================================
  // BASIC TIER — additions
  // Ordinary armour and structural materials: the steels, the wrought light
  // alloys, the commodity laminates and the soft interlayers. Nothing here
  // needs a specialised process to make.
  // ==========================================================================

  // ---- armour steels by hardness ----
  hha430: mat({
    key: 'hha430', name: 'High-hardness steel (HHA, 430 BHN)', class: 'metal',
    rho: 7850, E: 210e9, nu: 0.29, Y: 1.32e9, UTS: 1.58e9, epsF: 0.115,
    G0: 27e3, BHN: 430, jcC: 0.013, Tm: 1793, cp: 477, jcM: 1.0,
    brittle: 0.22, weibull: 20, erosionResist: 1.09,
    color: '#9aa2af', color2: '#5d6472',
    source: 'MIL-DTL-46100 class 1 lower band; K_IC ~75 MPa*m^0.5',
    notes: 'The soft end of the high-hardness range. Still noticeably tougher than 500 BHN plate and much less prone to plugging.',
  }),
  hha550: mat({
    key: 'hha550', name: 'High-hardness steel (HHA, 550 BHN)', class: 'metal',
    rho: 7850, E: 210e9, nu: 0.29, Y: 1.72e9, UTS: 2.02e9, epsF: 0.072,
    G0: 15e3, BHN: 550, jcC: 0.011, Tm: 1793, cp: 477, jcM: 1.0,
    brittle: 0.38, weibull: 18, erosionResist: 1.20,
    color: '#9199a6', color2: '#565d6a',
    source: 'MIL-DTL-46100 class 2; K_IC ~56 MPa*m^0.5',
    notes: 'Harder again, and the ductility is going. Good against small and medium calibre, increasingly liable to crack and plug under a full-calibre shot.',
  }),
  uhh600: mat({
    key: 'uhh600', name: 'Ultra-high-hardness steel (600 BHN)', class: 'metal',
    rho: 7850, E: 210e9, nu: 0.29, Y: 1.92e9, UTS: 2.25e9, epsF: 0.055,
    G0: 11e3, BHN: 600, jcC: 0.010, Tm: 1793, cp: 477, jcM: 1.0,
    brittle: 0.48, weibull: 16, erosionResist: 1.26,
    color: '#8c94a1', color2: '#515865',
    source: 'MIL-DTL-32332 (UHH) class; K_IC ~48 MPa*m^0.5',
    notes: 'About as hard as a steel plate usefully gets. Excellent at shattering small-calibre AP, brittle enough that a heavy hit can crack it through.',
  }),
  mil12560: mat({
    key: 'mil12560', name: 'MIL-A-12560 armour steel (RHA spec)', class: 'metal',
    rho: 7850, E: 210e9, nu: 0.29, Y: 1.05e9, UTS: 1.24e9, epsF: 0.16,
    G0: 44e3, BHN: 300, jcC: 0.014, Tm: 1793, cp: 477, jcM: 1.03,
    brittle: 0.10, weibull: 22, erosionResist: 1.0,
    color: '#8f97a4', color2: '#565d69',
    source: 'MIL-A-12560H, the wrought homogeneous armour specification',
    notes: 'The specification behind ordinary RHA. Near-identical to the generic RHA entry; kept separate so a scenario can name the spec it means.',
  }),
  mil46100: mat({
    key: 'mil46100', name: 'MIL-A-46100 armour steel (high hardness)', class: 'metal',
    rho: 7850, E: 210e9, nu: 0.29, Y: 1.56e9, UTS: 1.86e9, epsF: 0.088,
    G0: 18e3, BHN: 500, jcC: 0.012, Tm: 1793, cp: 477, jcM: 1.0,
    brittle: 0.31, weibull: 20, erosionResist: 1.15,
    color: '#98a0ad', color2: '#5b6270',
    source: 'MIL-DTL-46100E, 477-534 BHN band',
    notes: 'The high-hardness appliqué specification. Used as add-on plate rather than as primary structure because it is hard to weld and to form.',
  }),
  mil46177: mat({
    key: 'mil46177', name: 'MIL-A-46177 armour steel (thin structural)', class: 'metal',
    rho: 7850, E: 205e9, nu: 0.29, Y: 0.90e9, UTS: 1.06e9, epsF: 0.19,
    G0: 55e3, BHN: 260, jcC: 0.014, Tm: 1793, cp: 477, jcM: 1.03,
    brittle: 0.06, weibull: 23, erosionResist: 0.96,
    color: '#8a92a0', color2: '#525966',
    source: 'MIL-A-46177C, thin homogeneous armour sheet',
    notes: 'Thin-section structural armour. Softer and much more formable than RHA; used where the plate also has to be a hull.',
  }),

  // ---- wrought aluminium ----
  al6061: mat({
    key: 'al6061', name: 'Aluminium 6061-T6', class: 'metal',
    rho: 2700, E: 68.9e9, nu: 0.33, Y: 0.276e9, UTS: 0.31e9, epsF: 0.17,
    G0: 20e3, BHN: 95, jcC: 0.002, Tm: 855, cp: 896, jcM: 1.34,
    brittle: 0.05, weibull: 22, erosionResist: 0.42,
    color: '#b9c0c7', color2: '#767d85',
    source: 'ASM Handbook vol. 2, 6061-T6',
    notes: 'A general structural alloy rather than an armour alloy. Weldable and cheap; as armour it is there for the mass, not the strength.',
  }),
  al2024: mat({
    key: 'al2024', name: 'Aluminium 2024-T351', class: 'metal',
    rho: 2780, E: 73e9, nu: 0.33, Y: 0.324e9, UTS: 0.47e9, epsF: 0.18,
    G0: 24e3, BHN: 120, jcC: 0.002, Tm: 850, cp: 875, jcM: 1.34,
    brittle: 0.06, weibull: 22, erosionResist: 0.46,
    color: '#b5bcc4', color2: '#727981',
    source: 'ASM Handbook vol. 2, 2024-T351; the Johnson-Cook reference alloy',
    notes: 'The alloy most Johnson-Cook constants were originally fitted to. Aircraft structure more than armour.',
  }),
  al7050: mat({
    key: 'al7050', name: 'Aluminium 7050-T7451', class: 'metal',
    rho: 2830, E: 71.7e9, nu: 0.33, Y: 0.45e9, UTS: 0.51e9, epsF: 0.11,
    G0: 17e3, BHN: 140, jcC: 0.002, Tm: 840, cp: 860, jcM: 1.34,
    brittle: 0.10, weibull: 21, erosionResist: 0.50,
    color: '#b2b9c1', color2: '#6f767e',
    source: 'ASM Handbook vol. 2, 7050-T7451',
    notes: 'A thick-section 7xxx plate alloy with better stress-corrosion behaviour than 7075. Stronger than 5083 and far less tolerant of damage.',
  }),
  al7075: mat({
    key: 'al7075', name: 'Aluminium 7075-T6', class: 'metal',
    rho: 2810, E: 71.7e9, nu: 0.33, Y: 0.503e9, UTS: 0.572e9, epsF: 0.11,
    G0: 14e3, BHN: 150, jcC: 0.002, Tm: 840, cp: 860, jcM: 1.34,
    brittle: 0.12, weibull: 21, erosionResist: 0.52,
    color: '#b0b7bf', color2: '#6d747c',
    source: 'ASM Handbook vol. 2, 7075-T6',
    notes: 'The strongest common aluminium and the usual sabot material. As armour it is strong per kilogramme and notch-sensitive.',
  }),

  // ---- titanium ----
  ti64eli: mat({
    key: 'ti64eli', name: 'Titanium Ti-6Al-4V ELI', class: 'metal',
    rho: 4430, E: 113e9, nu: 0.34, Y: 0.86e9, UTS: 0.93e9, epsF: 0.20,
    G0: 68e3, BHN: 320, jcC: 0.019, Tm: 1933, cp: 560, jcM: 0.80,
    brittle: 0.05, weibull: 22, erosionResist: 0.80,
    color: '#a7a29c', color2: '#67635e',
    source: 'ASTM F136 extra-low-interstitial grade',
    notes: 'The low-oxygen grade: gives up yield strength for a large gain in fracture toughness. Better against a heavy hit than standard Ti-6Al-4V, worse against a light one.',
  }),

  // ---- refractory metals ----
  molybdenum: mat({
    key: 'molybdenum', name: 'Molybdenum', class: 'metal',
    rho: 10220, E: 329e9, nu: 0.31, Y: 0.55e9, UTS: 0.70e9, epsF: 0.25,
    G0: 40e3, BHN: 250, jcC: 0.020, Tm: 2896, cp: 251, jcM: 1.0,
    brittle: 0.18, weibull: 20, erosionResist: 1.35,
    color: '#9ea3a8', color2: '#616569',
    source: 'ASM Handbook vol. 2, unalloyed Mo',
    notes: 'Dense and very refractory: it keeps its strength where steel has gone soft. Ductile-to-brittle transition is near room temperature, so it can behave brittle when cold.',
  }),
  tungsten: mat({
    key: 'tungsten', name: 'Tungsten (pure)', class: 'metal',
    rho: 19250, E: 411e9, nu: 0.28, Y: 0.75e9, UTS: 0.98e9, epsF: 0.02,
    G0: 8e3, BHN: 350, jcC: 0.016, Tm: 3695, cp: 134, jcM: 1.0,
    brittle: 0.55, weibull: 15, erosionResist: 1.75,
    color: '#8e9296', color2: '#54585c',
    source: 'ASM Handbook vol. 2, unalloyed sintered W',
    notes: 'The densest practical element here and brittle at room temperature, which is exactly why penetrators use the nickel-iron bonded heavy alloys instead of pure tungsten.',
  }),

  // ---- commodity laminates ----
  eglass: mat({
    key: 'eglass', name: 'E-glass / epoxy laminate', class: 'composite',
    rho: 1850, E: 22e9, nu: 0.28, Y: 0.32e9, UTS: 0.90e9, epsF: 0.025,
    G0: 2.2e3, BHN: 32, jcC: 0.0, Tm: 700, cp: 1000, jcM: 1.0,
    brittle: 0.55, weibull: 13, erosionResist: 0.19,
    color: '#c8c0a6', color2: '#7d7767',
    source: 'E-glass roving in epoxy, ~55 % fibre volume',
    notes: 'The cheap structural glass laminate. Weaker than S-2 glass at the same weight; used as a bulk filler and a backing rather than as a strike face.',
  }),
  aramidepoxy: mat({
    key: 'aramidepoxy', name: 'Aramid / epoxy laminate', class: 'composite',
    rho: 1380, E: 30e9, nu: 0.35, Y: 0.75e9, UTS: 2.4e9, epsF: 0.035,
    G0: 6.5e3, BHN: 28, jcC: 0.0, Tm: 700, cp: 1400, jcM: 1.0,
    brittle: 0.35, weibull: 15, erosionResist: 0.22,
    color: '#c9b477', color2: '#7d6f49',
    source: 'Para-aramid fabric in epoxy, structural laminate lay-up',
    notes: 'The rigid structural version of the spall liner: resin-rich, so it carries load, at the cost of some of the fabric\'s energy absorption.',
  }),

  // ---- soft interlayers ----
  natrubber: mat({
    key: 'natrubber', name: 'Natural rubber', class: 'polymer',
    rho: 950, E: 0.0025e9, nu: 0.499, Y: 0.006e9, UTS: 0.025e9, epsF: 3.5,
    G0: 12e3, BHN: 3, jcC: 0.0, Tm: 500, cp: 1900, jcM: 1.0,
    brittle: 0.0, weibull: 20, erosionResist: 0.05,
    color: '#4a4642', color2: '#2a2825',
    source: 'Unfilled vulcanised natural rubber',
    notes: 'Very soft and very extensible. In an array it is a decoupling layer, not armour: its job is to let two plates move independently.',
  }),
  butyl: mat({
    key: 'butyl', name: 'Butyl rubber', class: 'polymer',
    rho: 920, E: 0.0035e9, nu: 0.499, Y: 0.008e9, UTS: 0.018e9, epsF: 3.0,
    G0: 8e3, BHN: 3, jcC: 0.0, Tm: 480, cp: 1850, jcM: 1.0,
    brittle: 0.0, weibull: 20, erosionResist: 0.05,
    color: '#443f3a', color2: '#26231f',
    source: 'Isobutylene-isoprene rubber, unfilled',
    notes: 'Much more internally damping than natural rubber, so it converts more of what passes through it into heat rather than returning it.',
  }),
  neoprene: mat({
    key: 'neoprene', name: 'Neoprene', class: 'polymer',
    rho: 1230, E: 0.005e9, nu: 0.499, Y: 0.010e9, UTS: 0.025e9, epsF: 2.5,
    G0: 9e3, BHN: 4, jcC: 0.0, Tm: 500, cp: 1700, jcM: 1.0,
    brittle: 0.0, weibull: 20, erosionResist: 0.06,
    color: '#3e3c3a', color2: '#232120',
    source: 'Polychloroprene, medium hardness',
    notes: 'A tougher, denser elastomer than natural rubber. Common as a skirt and mounting material.',
  }),
  polyurethane: mat({
    key: 'polyurethane', name: 'Polyurethane elastomer', class: 'polymer',
    rho: 1200, E: 0.05e9, nu: 0.48, Y: 0.030e9, UTS: 0.050e9, epsF: 2.0,
    G0: 14e3, BHN: 12, jcC: 0.0, Tm: 520, cp: 1600, jcM: 1.0,
    brittle: 0.0, weibull: 20, erosionResist: 0.09,
    color: '#5a5148', color2: '#332e29',
    source: 'Cast polyester-polyurethane, ~90 Shore A',
    notes: 'Stiffer and far more abrasion-resistant than the rubbers. Used where the interlayer also has to survive handling.',
  }),
  silicone: mat({
    key: 'silicone', name: 'Silicone elastomer', class: 'polymer',
    rho: 1100, E: 0.002e9, nu: 0.499, Y: 0.004e9, UTS: 0.009e9, epsF: 3.0,
    G0: 4e3, BHN: 2, jcC: 0.0, Tm: 600, cp: 1300, jcM: 1.0,
    brittle: 0.0, weibull: 20, erosionResist: 0.04,
    color: '#585552', color2: '#323030',
    source: 'Unfilled polydimethylsiloxane elastomer',
    notes: 'The weakest entry in the list. It is here as a bonding and potting layer, and it will behave like one.',
  }),

  // ---- rigid transparent polymers ----
  polycarbonate: mat({
    key: 'polycarbonate', name: 'Polycarbonate', class: 'polymer',
    rho: 1200, E: 2.3e9, nu: 0.37, Y: 0.065e9, UTS: 0.070e9, epsF: 0.90,
    G0: 5.0e3, BHN: 20, jcC: 0.0, Tm: 560, cp: 1200, jcM: 1.0,
    brittle: 0.05, weibull: 20, erosionResist: 0.10,
    color: '#9aa6ac', color2: '#5d666b',
    source: 'Bisphenol-A polycarbonate, extruded sheet',
    notes: 'The backing layer of transparent armour. Very tough for a polymer: it stretches enormously before it tears, which is what catches the fragments the glass has already stopped.',
  }),
  pmma: mat({
    key: 'pmma', name: 'PMMA / acrylic', class: 'polymer',
    rho: 1180, E: 3.0e9, nu: 0.37, Y: 0.070e9, UTS: 0.072e9, epsF: 0.05,
    G0: 0.9e3, BHN: 22, jcC: 0.0, Tm: 550, cp: 1450, jcM: 1.0,
    brittle: 0.65, weibull: 12, erosionResist: 0.11,
    color: '#a8b2b6', color2: '#666e72',
    source: 'Cast poly(methyl methacrylate) sheet',
    notes: 'Stiffer and much more brittle than polycarbonate: it crazes and cracks rather than stretching. The interlayer in older transparent armour stacks.',
  }),

  // ---- honeycomb cores ----
  alhoneycomb: mat({
    key: 'alhoneycomb', name: 'Aluminium honeycomb core', class: 'composite',
    rho: 70, E: 0.60e9, nu: 0.30, Y: 0.0040e9, UTS: 0.0045e9, epsF: 0.60,
    G0: 0.8e3, BHN: 5, jcC: 0.002, Tm: 850, cp: 896, jcM: 1.34,
    brittle: 0.10, weibull: 14, erosionResist: 0.03,
    color: '#b6bcc0', color2: '#6e7377',
    source: '5052 alloy hexagonal core, ~70 kg/m3 nominal',
    notes: 'A crushable spacer, not armour. Modelled with its bulk (smeared) properties, so the cell walls are not resolved and its real anisotropy is absent - see MODEL.md 7.',
  }),
  nomexhoneycomb: mat({
    key: 'nomexhoneycomb', name: 'Nomex honeycomb core', class: 'composite',
    rho: 48, E: 0.14e9, nu: 0.30, Y: 0.0020e9, UTS: 0.0024e9, epsF: 0.40,
    G0: 0.5e3, BHN: 3, jcC: 0.0, Tm: 650, cp: 1300, jcM: 1.0,
    brittle: 0.25, weibull: 12, erosionResist: 0.02,
    color: '#c2b183', color2: '#756a4f',
    source: 'Aramid-paper phenolic-dipped core, ~48 kg/m3',
    notes: 'Lighter and weaker than the aluminium core, and it does not take a permanent set the same way. Same smeared-property caveat.',
  }),

  // ==========================================================================
  // ADVANCED TIER — additions
  // Engineered ceramics, high-performance fibre laminates, specified armour
  // steel grades, superalloys and the heavy alloys. These need a controlled
  // process, and several of them are only worth the money in a specific role.
  // ==========================================================================

  // ---- oxide and non-oxide ceramics ----
  alumina85: mat({
    key: 'alumina85', name: 'Alumina AD-85 / AD-96 ceramic', class: 'ceramic',
    rho: 3420, E: 221e9, nu: 0.22, Y: 2.0e9, UTS: 0.20e9, epsF: 0.001,
    G0: 30, BHN: 1000, jcC: 0.0, Tm: 2323, cp: 880, jcM: 1.0,
    brittle: 1.0, weibull: 8, erosionResist: 1.9, compFail: false,
    color: '#cdc7ba', color2: '#837e74',
    source: 'CoorsTek AD-85 / AD-96; K_IC ~2.6 MPa*m^0.5',
    notes: 'The cheap alumina grades. Noticeably softer and weaker than AD-995 because of the glassy grain-boundary phase, and priced accordingly.',
  }),
  b4chp: mat({
    key: 'b4chp', name: 'Hot-pressed boron carbide', class: 'ceramic',
    rho: 2520, E: 462e9, nu: 0.17, Y: 5.9e9, UTS: 0.35e9, epsF: 0.001,
    G0: 40, BHN: 3100, jcC: 0.0, Tm: 2743, cp: 950, jcM: 1.0,
    brittle: 1.0, weibull: 11, erosionResist: 3.2,
    color: '#33363a', color2: '#1c1e20',
    source: 'Hot-pressed B4C, >99 % theoretical density; K_IC ~4.3 MPa*m^0.5',
    notes: 'Fully dense boron carbide: the hardest and lightest of the common armour ceramics. Known to lose strength abruptly above a threshold impact stress, which is NOT modelled here.',
  }),
  si3n4: mat({
    key: 'si3n4', name: 'Silicon nitride (Si3N4)', class: 'ceramic',
    rho: 3200, E: 310e9, nu: 0.27, Y: 3.4e9, UTS: 0.60e9, epsF: 0.0015,
    G0: 116, BHN: 1600, jcC: 0.0, Tm: 2173, cp: 700, jcM: 1.0,
    brittle: 0.92, weibull: 15, erosionResist: 2.2,
    color: '#6b6f66', color2: '#3f423c',
    source: 'Gas-pressure-sintered Si3N4; K_IC ~6.0 MPa*m^0.5',
    notes: 'The tough one. Much less hard than boron carbide but several times its fracture toughness, so it survives multiple hits far better.',
  }),
  zro2: mat({
    key: 'zro2', name: 'Zirconium oxide (ZrO2)', class: 'ceramic',
    rho: 6050, E: 210e9, nu: 0.30, Y: 2.1e9, UTS: 0.50e9, epsF: 0.002,
    G0: 381, BHN: 1250, jcC: 0.0, Tm: 2988, cp: 460, jcM: 1.0,
    brittle: 0.80, weibull: 18, erosionResist: 1.5,
    color: '#ddd8d0', color2: '#87837c',
    source: 'Yttria-stabilised tetragonal zirconia; K_IC ~9 MPa*m^0.5',
    notes: 'Transformation toughening makes this by far the toughest ceramic here, but it is also the heaviest and not especially hard. Rarely a strike face; useful as a tough backing tile.',
  }),
  zta: mat({
    key: 'zta', name: 'Zirconia-toughened alumina (ZTA)', class: 'ceramic',
    rho: 4100, E: 340e9, nu: 0.23, Y: 3.2e9, UTS: 0.42e9, epsF: 0.0012,
    G0: 124, BHN: 1500, jcC: 0.0, Tm: 2200, cp: 800, jcM: 1.0,
    brittle: 0.94, weibull: 13, erosionResist: 2.2,
    color: '#d2cdc0', color2: '#847f75',
    source: 'Alumina with ~15 % tetragonal zirconia; K_IC ~6.5 MPa*m^0.5',
    notes: 'Alumina with the zirconia toughening mechanism added: harder than plain zirconia, far tougher than plain alumina. A good compromise tile.',
  }),
  aln: mat({
    key: 'aln', name: 'Aluminium nitride (AlN)', class: 'ceramic',
    rho: 3260, E: 330e9, nu: 0.24, Y: 2.5e9, UTS: 0.32e9, epsF: 0.001,
    G0: 33, BHN: 1150, jcC: 0.0, Tm: 2500, cp: 740, jcM: 1.0,
    brittle: 1.0, weibull: 10, erosionResist: 1.9,
    color: '#b9bcb4', color2: '#6f716b',
    source: 'Sintered AlN; K_IC ~3.3 MPa*m^0.5',
    notes: 'Studied for armour mainly because its shock response is well characterised. Middling hardness; its real commercial value is thermal, not ballistic.',
  }),
  tib2al2o3: mat({
    key: 'tib2al2o3', name: 'TiB2-Al2O3 ceramic composite', class: 'ceramic',
    rho: 4050, E: 400e9, nu: 0.20, Y: 4.0e9, UTS: 0.40e9, epsF: 0.0012,
    G0: 90, BHN: 2000, jcC: 0.0, Tm: 2400, cp: 700, jcM: 1.0,
    brittle: 0.96, weibull: 12, erosionResist: 2.7,
    color: '#7a7266', color2: '#4a453d',
    source: 'Reaction-sintered TiB2 dispersed in alumina; K_IC ~6 MPa*m^0.5',
    notes: 'A particulate composite: the diboride supplies hardness, the alumina matrix arrests cracks. Tougher than either titanium diboride or alumina alone.',
  }),
  cmc: mat({
    key: 'cmc', name: 'Ceramic matrix composite (CMC)', class: 'ceramic',
    rho: 2700, E: 100e9, nu: 0.20, Y: 0.35e9, UTS: 0.30e9, epsF: 0.008,
    G0: 3.0e3, BHN: 700, jcC: 0.0, Tm: 2100, cp: 800, jcM: 1.0,
    brittle: 0.55, weibull: 18, erosionResist: 0.9,
    color: '#6e6a60', color2: '#403d38',
    source: 'SiC fibre in SiC matrix, woven; K_IC ~17 MPa*m^0.5 equivalent',
    notes: 'Fibre reinforcement buys a ceramic something like graceful failure: it pulls fibres out instead of shattering. Much weaker than a monolithic tile and far more damage-tolerant.',
  }),
  diamond: mat({
    key: 'diamond', name: 'Diamond (polycrystalline)', class: 'ceramic',
    rho: 3515, E: 1050e9, nu: 0.07, Y: 15.0e9, UTS: 1.30e9, epsF: 0.0008,
    G0: 11, BHN: 8000, jcC: 0.0, Tm: 4000, cp: 510, jcM: 1.0,
    brittle: 1.0, weibull: 6, erosionResist: 4.5,
    color: '#dfe8ee', color2: '#8b939a',
    source: 'Polycrystalline diamond compact; K_IC ~3.4 MPa*m^0.5, E from single-crystal average',
    notes: 'The hardest and stiffest material in the database by a wide margin, and one of the most brittle - a Weibull modulus of 6 means its strength scatters enormously. It resists indentation superbly and cracks through with very little warning. Not a practical armour: it is here because it bounds what hardness alone can do.',
  }),
  fusedsilica: mat({
    key: 'fusedsilica', name: 'Fused silica (SiO2)', class: 'ceramic',
    rho: 2200, E: 73e9, nu: 0.17, Y: 1.10e9, UTS: 0.050e9, epsF: 0.0007,
    G0: 7.7, BHN: 600, jcC: 0.0, Tm: 1983, cp: 740, jcM: 1.0,
    brittle: 1.0, weibull: 5, erosionResist: 0.55,
    color: '#cfdadf', color2: '#7d868b',
    source: 'High-purity fused quartz; K_IC ~0.75 MPa*m^0.5',
    notes: 'A glass: hard, extremely weak in tension, and with the lowest Weibull modulus here. It anomalously densifies under shock instead of simply shattering, which is not modelled. The strike face of transparent armour.',
  }),

  // ---- high-performance fibre laminates ----
  carbonepoxy: mat({
    key: 'carbonepoxy', name: 'Carbon fibre / epoxy composite', class: 'composite',
    rho: 1600, E: 70e9, nu: 0.30, Y: 0.60e9, UTS: 1.20e9, epsF: 0.012,
    G0: 1.6e3, BHN: 40, jcC: 0.0, Tm: 700, cp: 1000, jcM: 1.0,
    brittle: 0.62, weibull: 14, erosionResist: 0.26,
    color: '#3c3f44', color2: '#232528',
    source: 'IM7/8552 quasi-isotropic lay-up, ~60 % fibre volume',
    notes: 'Stiff and strong per kilogramme and a poor ballistic material: the fibres fail at ~1.5 % strain, so it splinters rather than stretching. It is structure that happens to be in the way.',
  }),
  uhmwpeepoxy: mat({
    key: 'uhmwpeepoxy', name: 'UHMWPE / epoxy composite', class: 'composite',
    rho: 1020, E: 26e9, nu: 0.35, Y: 1.10e9, UTS: 2.3e9, epsF: 0.030,
    G0: 9e3, BHN: 22, jcC: 0.0, Tm: 420, cp: 1850, jcM: 1.0,
    brittle: 0.28, weibull: 16, erosionResist: 0.20,
    color: '#d5d8d2', color2: '#80837e',
    source: 'UHMWPE fibre in a thermoset matrix, cross-plied',
    notes: 'The resin-bonded version of the HB-class laminate. The matrix makes it stiffer and easier to bond, and takes away some of the delamination that does the energy absorbing.',
  }),
  pbo: mat({
    key: 'pbo', name: 'PBO fibre composite', class: 'composite',
    rho: 1560, E: 55e9, nu: 0.35, Y: 1.30e9, UTS: 3.4e9, epsF: 0.030,
    G0: 8e3, BHN: 30, jcC: 0.0, Tm: 920, cp: 1200, jcM: 1.0,
    brittle: 0.30, weibull: 15, erosionResist: 0.25,
    color: '#c8a63f', color2: '#7b6628',
    source: 'Poly(p-phenylene-2,6-benzobisoxazole) fibre, Zylon class',
    notes: 'The strongest organic fibre in service. It also degrades badly with humidity and ultraviolet, which is why it stopped being used in body armour; nothing about that ageing is modelled here.',
  }),
  pboepoxy: mat({
    key: 'pboepoxy', name: 'PBO / epoxy laminate', class: 'composite',
    rho: 1600, E: 62e9, nu: 0.34, Y: 1.15e9, UTS: 2.9e9, epsF: 0.026,
    G0: 6e3, BHN: 32, jcC: 0.0, Tm: 900, cp: 1150, jcM: 1.0,
    brittle: 0.36, weibull: 15, erosionResist: 0.26,
    color: '#bb9c3d', color2: '#736126',
    source: 'PBO fabric in epoxy, structural lay-up',
    notes: 'The rigid laminate form. Same trade as every fibre system here: resin buys stiffness and costs energy absorption.',
  }),
  vectran: mat({
    key: 'vectran', name: 'Vectran laminate', class: 'composite',
    rho: 1400, E: 38e9, nu: 0.35, Y: 0.85e9, UTS: 2.2e9, epsF: 0.033,
    G0: 6.5e3, BHN: 26, jcC: 0.0, Tm: 600, cp: 1300, jcM: 1.0,
    brittle: 0.30, weibull: 16, erosionResist: 0.21,
    color: '#c4b89c', color2: '#787060',
    source: 'Thermotropic liquid-crystal polyester fibre laminate',
    notes: 'A liquid-crystal polymer fibre. Between aramid and PBO in strength, and far better behaved than PBO in damp and sunlight.',
  }),
  basaltepoxy: mat({
    key: 'basaltepoxy', name: 'Basalt fibre / epoxy composite', class: 'composite',
    rho: 2000, E: 26e9, nu: 0.28, Y: 0.36e9, UTS: 1.0e9, epsF: 0.026,
    G0: 2.6e3, BHN: 34, jcC: 0.0, Tm: 1450, cp: 900, jcM: 1.0,
    brittle: 0.52, weibull: 13, erosionResist: 0.20,
    color: '#7a7168', color2: '#48433d',
    source: 'Continuous basalt filament in epoxy, ~55 % fibre volume',
    notes: 'Drawn from melted volcanic rock. Slightly stiffer and much more heat-tolerant than E-glass at a similar price; ballistically it is a glass laminate.',
  }),
  s2advanced: mat({
    key: 's2advanced', name: 'Advanced S-glass / epoxy laminate', class: 'composite',
    rho: 1950, E: 30e9, nu: 0.28, Y: 0.62e9, UTS: 1.9e9, epsF: 0.034,
    G0: 4.6e3, BHN: 36, jcC: 0.0, Tm: 1100, cp: 1000, jcM: 1.0,
    brittle: 0.38, weibull: 16, erosionResist: 0.23,
    color: '#d3c69f', color2: '#807760',
    source: 'S-2 glass in a toughened phenolic/epoxy, high fibre volume',
    notes: 'The optimised structural-armour glass laminate: higher fibre fraction and a toughened matrix. This is the material vehicle hull composites are usually made of.',
  }),

  // ---- specified armour steels ----
  armox440: mat({
    key: 'armox440', name: 'Armox 440T', class: 'metal',
    rho: 7850, E: 205e9, nu: 0.29, Y: 1.25e9, UTS: 1.45e9, epsF: 0.14,
    G0: 34e3, BHN: 440, jcC: 0.013, Tm: 1793, cp: 477, jcM: 1.0,
    brittle: 0.18, weibull: 21, erosionResist: 1.09,
    color: '#96a0ac', color2: '#5a616e',
    source: 'SSAB Armox 440T datasheet, 370-430 HBW',
    notes: 'The formable, weldable grade: bendable enough to make structure from. Lowest protection of the Armox family and the easiest to build with.',
  }),
  armox500: mat({
    key: 'armox500', name: 'Armox 500T', class: 'metal',
    rho: 7850, E: 205e9, nu: 0.29, Y: 1.40e9, UTS: 1.65e9, epsF: 0.105,
    G0: 22e3, BHN: 500, jcC: 0.012, Tm: 1793, cp: 477, jcM: 1.0,
    brittle: 0.28, weibull: 20, erosionResist: 1.15,
    color: '#99a3b0', color2: '#5c6371',
    source: 'SSAB Armox 500T datasheet, 480-540 HBW',
    notes: 'The workhorse commercial armour plate, and probably the most-tested armour steel in the open literature.',
  }),
  armox600: mat({
    key: 'armox600', name: 'Armox 600T', class: 'metal',
    rho: 7850, E: 205e9, nu: 0.29, Y: 1.70e9, UTS: 2.00e9, epsF: 0.072,
    G0: 12e3, BHN: 600, jcC: 0.010, Tm: 1793, cp: 477, jcM: 1.0,
    brittle: 0.45, weibull: 17, erosionResist: 1.26,
    color: '#8d97a4', color2: '#545b68',
    source: 'SSAB Armox 600T datasheet, 570-640 HBW',
    notes: 'The hardest plate SSAB sells. Excellent stopping power per millimetre; it cannot be bent to any useful radius and it cracks if you weld it carelessly.',
  }),
  mars240: mat({
    key: 'mars240', name: 'MARS 240 armour steel', class: 'metal',
    rho: 7850, E: 205e9, nu: 0.29, Y: 0.70e9, UTS: 0.86e9, epsF: 0.20,
    G0: 60e3, BHN: 240, jcC: 0.014, Tm: 1793, cp: 477, jcM: 1.03,
    brittle: 0.05, weibull: 23, erosionResist: 0.92,
    color: '#87909d', color2: '#4f5663',
    source: 'Industeel MARS 240 datasheet',
    notes: 'A soft, very tough structural armour grade. Chosen for mine-blast floors and anywhere the plate has to deform a long way without tearing.',
  }),
  ph174: mat({
    key: 'ph174', name: '17-4 PH stainless steel', class: 'metal',
    rho: 7800, E: 197e9, nu: 0.27, Y: 1.10e9, UTS: 1.31e9, epsF: 0.12,
    G0: 30e3, BHN: 400, jcC: 0.013, Tm: 1713, cp: 460, jcM: 1.0,
    brittle: 0.20, weibull: 21, erosionResist: 1.05,
    color: '#a5adb6', color2: '#646b73',
    source: 'AMS 5643, H900 condition',
    notes: 'Precipitation-hardening stainless. Strong and corrosion-resistant rather than optimised for armour; usual role is fittings and mounts inside an array.',
  }),
  steel4330v: mat({
    key: 'steel4330v', name: '4330V alloy steel', class: 'metal',
    rho: 7850, E: 205e9, nu: 0.29, Y: 1.20e9, UTS: 1.40e9, epsF: 0.15,
    G0: 52e3, BHN: 420, jcC: 0.013, Tm: 1793, cp: 477, jcM: 1.0,
    brittle: 0.12, weibull: 22, erosionResist: 1.08,
    color: '#909aa6', color2: '#575e6a',
    source: 'AMS 6411, vacuum-melted 4330 modified',
    notes: 'A vacuum-melted gun and ordnance steel: unusually high toughness for its strength, which is why it is used for pressure-bearing parts rather than plate.',
  }),
  dhs: mat({
    key: 'dhs', name: 'Dual-hardness steel (DHS)', class: 'metal',
    rho: 7850, E: 208e9, nu: 0.29, Y: 1.70e9, UTS: 2.00e9, epsF: 0.075,
    G0: 14e3, BHN: 600, jcC: 0.011, Tm: 1793, cp: 477, jcM: 1.0,
    brittle: 0.40, weibull: 18, erosionResist: 1.24,
    gradient: { Y: [[0, 1.0], [0.45, 1.0], [0.55, 0.72], [1, 0.70]],
      UTS: [[0, 1.0], [0.45, 1.0], [0.55, 0.76], [1, 0.74]],
      epsF: [[0, 1.0], [0.45, 1.0], [0.55, 1.9], [1, 2.0]],
      G0: [[0, 1.0], [0.45, 1.0], [0.55, 2.6], [1, 2.8]],
      brittle: [[0, 1.0], [0.45, 1.0], [0.55, 0.4], [1, 0.35]] },
    color: '#9ba3b0', color2: '#565d6a',
    source: 'MIL-A-46099, roll-bonded hard-face / tough-back laminate',
    notes: 'Two steels roll-bonded into one plate: a ~600 BHN face to break the projectile and a ~450 BHN back to catch what is left without cracking. The gradient is applied through the thickness, so the struck face and the rear face genuinely respond differently.',
  }),
  ths: mat({
    key: 'ths', name: 'Triple-hardness steel (THS)', class: 'metal',
    rho: 7850, E: 208e9, nu: 0.29, Y: 1.78e9, UTS: 2.08e9, epsF: 0.070,
    G0: 13e3, BHN: 620, jcC: 0.011, Tm: 1793, cp: 477, jcM: 1.0,
    brittle: 0.42, weibull: 18, erosionResist: 1.25,
    gradient: { Y: [[0, 1.0], [0.30, 1.0], [0.40, 0.85], [0.65, 0.85], [0.75, 0.66], [1, 0.64]],
      UTS: [[0, 1.0], [0.30, 1.0], [0.40, 0.87], [0.65, 0.87], [0.75, 0.71], [1, 0.70]],
      epsF: [[0, 1.0], [0.30, 1.0], [0.40, 1.5], [0.65, 1.5], [0.75, 2.4], [1, 2.5]],
      G0: [[0, 1.0], [0.30, 1.0], [0.40, 1.9], [0.65, 1.9], [0.75, 3.2], [1, 3.4]],
      brittle: [[0, 1.0], [0.30, 1.0], [0.40, 0.62], [0.65, 0.62], [0.75, 0.30], [1, 0.28]] },
    color: '#a0a8b4', color2: '#5a616e',
    source: 'Three-layer roll-bonded armour laminate, hard face / medium core / tough back',
    notes: 'The same idea as dual-hardness with a graded middle layer, so the hardness falls in two steps rather than one. Intended to keep the face hard while moving the tough-brittle interface away from the back surface.',
  }),

  // ---- superalloys ----
  inconel718: mat({
    key: 'inconel718', name: 'Inconel 718', class: 'metal',
    rho: 8190, E: 200e9, nu: 0.29, Y: 1.10e9, UTS: 1.35e9, epsF: 0.20,
    G0: 90e3, BHN: 380, jcC: 0.017, Tm: 1609, cp: 435, jcM: 1.10,
    brittle: 0.05, weibull: 23, erosionResist: 1.10,
    color: '#a3a49a', color2: '#63645d',
    source: 'AMS 5663, aged condition',
    notes: 'A nickel superalloy: strong, extremely tough, and it keeps both to temperatures where steel is useless. Heavy for its strength as armour; it is here as an engine and structure material that a fragment may have to get through.',
  }),
  inconel625: mat({
    key: 'inconel625', name: 'Inconel 625', class: 'metal',
    rho: 8440, E: 208e9, nu: 0.31, Y: 0.49e9, UTS: 0.93e9, epsF: 0.42,
    G0: 130e3, BHN: 220, jcC: 0.020, Tm: 1623, cp: 410, jcM: 1.10,
    brittle: 0.0, weibull: 24, erosionResist: 0.98,
    color: '#9fa198', color2: '#60625b',
    source: 'AMS 5666, annealed',
    notes: 'The solid-solution grade: much softer than 718 and enormously ductile. It will stretch a very long way before it tears.',
  }),
  hastelloyx: mat({
    key: 'hastelloyx', name: 'Hastelloy X', class: 'metal',
    rho: 8220, E: 197e9, nu: 0.32, Y: 0.36e9, UTS: 0.77e9, epsF: 0.43,
    G0: 120e3, BHN: 200, jcC: 0.020, Tm: 1628, cp: 486, jcM: 1.10,
    brittle: 0.0, weibull: 24, erosionResist: 0.94,
    color: '#9b9d95', color2: '#5d5f59',
    source: 'AMS 5754, solution annealed',
    notes: 'A sheet superalloy for combustor and exhaust structure. Soft, tough, and here for completeness rather than protection.',
  }),
  marm247: mat({
    key: 'marm247', name: 'Mar-M 247', class: 'metal',
    rho: 8540, E: 210e9, nu: 0.29, Y: 0.85e9, UTS: 1.00e9, epsF: 0.05,
    G0: 30e3, BHN: 380, jcC: 0.015, Tm: 1600, cp: 420, jcM: 1.10,
    brittle: 0.25, weibull: 18, erosionResist: 1.05,
    color: '#a6a79c', color2: '#65665e',
    source: 'Cast nickel superalloy, conventionally cast condition',
    notes: 'A cast turbine-blade alloy. Strong hot and notably brittle cold - a cast structure with large grains, so it cracks where a wrought alloy would stretch.',
  }),

  // ---- heavy and refractory alloys ----
  wha93: mat({
    key: 'wha93', name: 'Tungsten heavy alloy (93W-Ni-Fe)', class: 'metal',
    rho: 17800, E: 360e9, nu: 0.28, Y: 1.05e9, UTS: 1.25e9, epsF: 0.13,
    G0: 26e3, BHN: 320, jcC: 0.030, Tm: 1723, cp: 145, jcM: 1.0,
    brittle: 0.10, weibull: 21, erosionResist: 1.62,
    color: '#8f959c', color2: '#565b61',
    source: 'ASTM B777 class 3',
    notes: 'More tungsten and less binder than the 91 % alloy: denser and harder, with a little less ductility. The usual long-rod penetrator composition.',
  }),
  whanicu: mat({
    key: 'whanicu', name: 'Tungsten heavy alloy (W-Ni-Cu)', class: 'metal',
    rho: 17000, E: 330e9, nu: 0.28, Y: 0.80e9, UTS: 1.00e9, epsF: 0.18,
    G0: 34e3, BHN: 260, jcC: 0.030, Tm: 1673, cp: 150, jcM: 1.0,
    brittle: 0.05, weibull: 22, erosionResist: 1.48,
    color: '#9a9790', color2: '#5c5a55',
    source: 'ASTM B777 with copper-bearing matrix',
    notes: 'The copper-matrix variant: softer and more ductile than nickel-iron, and non-magnetic. Preferred for counterweights and radiation shielding rather than penetrators.',
  }),
  tatungsten: mat({
    key: 'tatungsten', name: 'Tantalum-tungsten alloy (Ta-10W)', class: 'metal',
    rho: 16900, E: 200e9, nu: 0.33, Y: 0.75e9, UTS: 0.92e9, epsF: 0.28,
    G0: 95e3, BHN: 240, jcC: 0.035, Tm: 3100, cp: 145, jcM: 1.0,
    brittle: 0.0, weibull: 23, erosionResist: 1.45,
    color: '#9497a0', color2: '#595c63',
    source: 'ASTM B708 Ta-10W',
    notes: 'Tantalum stiffened with tungsten while keeping most of its extraordinary ductility. The shaped-charge liner material where copper is not good enough.',
  }),
  tzm: mat({
    key: 'tzm', name: 'TZM molybdenum alloy', class: 'metal',
    rho: 10220, E: 320e9, nu: 0.31, Y: 0.80e9, UTS: 0.95e9, epsF: 0.15,
    G0: 30e3, BHN: 290, jcC: 0.020, Tm: 2896, cp: 251, jcM: 1.0,
    brittle: 0.22, weibull: 20, erosionResist: 1.42,
    color: '#a1a5aa', color2: '#62666a',
    source: 'ASTM B387 TZM (Mo-0.5Ti-0.1Zr-C)',
    notes: 'Carbide-strengthened molybdenum: stronger and more recrystallisation-resistant than pure Mo, with the same cold-brittleness caveat.',
  }),

  // ---- engineered damping layers ----
  viscoelastic: mat({
    key: 'viscoelastic', name: 'Viscoelastic damping polymer', class: 'polymer',
    rho: 1150, E: 0.020e9, nu: 0.49, Y: 0.012e9, UTS: 0.020e9, epsF: 2.5,
    G0: 18e3, BHN: 6, jcC: 0.0, Tm: 480, cp: 1700, jcM: 1.0,
    brittle: 0.0, weibull: 20, erosionResist: 0.07,
    color: '#4f4a55', color2: '#2d2a31',
    source: 'Constrained-layer damping compound, acrylic class',
    notes: 'Formulated to turn strain into heat across a wide frequency band. The model has no frequency-dependent loss modulus, so it is simulated as a soft rate-hardening solid and its actual selling point is NOT represented - see MODEL.md 7.',
  }),
  pushock: mat({
    key: 'pushock', name: 'Shock-absorbing polyurethane layer', class: 'polymer',
    rho: 1250, E: 0.080e9, nu: 0.48, Y: 0.045e9, UTS: 0.075e9, epsF: 1.8,
    G0: 22e3, BHN: 16, jcC: 0.0, Tm: 520, cp: 1600, jcM: 1.0,
    brittle: 0.0, weibull: 20, erosionResist: 0.11,
    color: '#5c5347', color2: '#352f28',
    source: 'Filled polyurethane blast-mitigation coating',
    notes: 'The sprayed anti-spall and blast-mitigation liner. Stiffer than a plain elastomer and specifically tough in tension, which is what holds a cracked plate together.',
  }),
};

/** Materials that make sense as an armour layer choice in the UI. */
/**
 * ARMOUR MATERIALS, SPLIT BY TIER
 *
 * The split is about what a material IS, not about how well it performs.
 * `basic` is ordinary armour and structural stock - the steels, the wrought
 * light alloys, commodity laminates, soft interlayers. `advanced` is anything
 * needing a controlled process or an engineered microstructure: sintered
 * ceramics, high-performance fibres, specified armour grades, superalloys,
 * heavy and refractory alloys.
 *
 * A basic material is not necessarily worse. Rolled homogeneous armour beats
 * most of the advanced list per millimetre, and several advanced entries
 * (Inconel, Hastelloy, the honeycombs' advanced counterparts) are in the
 * database because a fragment may have to pass through them, not because
 * anyone would armour a vehicle with them.
 */
export const BASIC_ARMOUR_KEYS = [
  // homogeneous and hardened steels
  'cast', 'rha', 'mil12560', 'mild', 'mil46177',
  'hha430', 'hha', 'mil46100', 'hha550', 'uhh600', 'fha', 'boxsteel', 'maraging',
  // wrought aluminium
  'al5083', 'al6061', 'al2024', 'al7039', 'al7050', 'al7075',
  // titanium and refractory metals
  'ti64', 'ti64eli', 'tantalum', 'molybdenum', 'tungsten',
  // commodity laminates
  'uhmwpe', 'grp', 'eglass', 'aramid', 'aramidepoxy', 'textolite',
  // soft interlayers and rigid polymers
  'rubber', 'natrubber', 'butyl', 'neoprene', 'polyurethane', 'silicone',
  'polycarbonate', 'pmma',
  // crushable cores
  'alhoneycomb', 'nomexhoneycomb',
];

export const ADVANCED_ARMOUR_KEYS = [
  // ceramics
  'alumina', 'alumina85', 'sic', 'b4c', 'b4chp', 'si3n4', 'zro2', 'zta', 'aln',
  'tib2', 'tib2al2o3', 'cmc', 'diamond', 'fusedsilica',
  // high-performance fibre laminates
  'carbonepoxy', 'uhmwpeepoxy', 'pbo', 'pboepoxy', 'vectran', 'basaltepoxy', 's2advanced',
  // specified and laminated armour steels
  'armox440', 'armox500', 'armox600', 'mars240', 'ph174', 'steel4330v', 'dhs', 'ths',
  // superalloys
  'inconel718', 'inconel625', 'hastelloyx', 'marm247',
  // heavy and refractory alloys
  'wha', 'wha93', 'whanicu', 'du', 'tatungsten', 'tzm',
  // engineered damping layers
  'viscoelastic', 'pushock',
];

/** Every armour choice, both tiers. Order is basic then advanced. */
export const ARMOUR_KEYS = [...BASIC_ARMOUR_KEYS, ...ADVANCED_ARMOUR_KEYS];

/** Which tier a key belongs to, for grouping in the UI. */
export function armourTier(key) {
  if (BASIC_ARMOUR_KEYS.includes(key)) return 'basic';
  if (ADVANCED_ARMOUR_KEYS.includes(key)) return 'advanced';
  return 'custom';
}

/** Materials that make sense as a penetrator body/core in the UI. */
export const PENETRATOR_KEYS = [
  'apsteel', 'wha', 'wha93', 'du', 'wc', 'hha', 'rha', 'copper', 'mild',
  'tantalum', 'tatungsten', 'diamond',
];

export function getMaterial(key) {
  const m = MATERIALS[key];
  if (!m) throw new Error(`unknown material '${key}'`);
  return m;
}

/** Clone a material so the user can edit it without touching the database. */
export function cloneMaterial(key, newKey, overrides = {}) {
  const base = getMaterial(key);
  const m = Object.assign({}, base, { key: newKey, name: overrides.name || `${base.name} (custom)`, custom: true }, overrides);
  MATERIALS[newKey] = m;
  return m;
}

export function registerMaterial(def) {
  const m = mat(def);
  MATERIALS[m.key] = m;
  return m;
}

/**
 * Sample a graded material at a through-thickness fraction (0 = struck face).
 * Returns a shallow-copied material with the gradient applied. Used for
 * face-hardened plate, where the response genuinely varies with depth.
 */
export function sampleGradient(m, f) {
  if (!m.gradient) return m;
  const out = Object.assign({}, m);
  for (const prop of Object.keys(m.gradient)) {
    const pts = m.gradient[prop];
    let v = pts[pts.length - 1][1];
    for (let i = 0; i < pts.length - 1; i++) {
      const [f0, v0] = pts[i], [f1, v1] = pts[i + 1];
      if (f >= f0 && f <= f1) { v = v0 + (v1 - v0) * ((f - f0) / (f1 - f0 || 1)); break; }
      if (f < f0) { v = v0; break; }
    }
    out[prop] = m[prop] * v;
  }
  return out;
}
