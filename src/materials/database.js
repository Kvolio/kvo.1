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
  }),
  aramid: mat({
    key: 'aramid', name: 'Aramid spall liner', class: 'composite',
    rho: 1400, E: 20e9, nu: 0.35, Y: 0.6e9, UTS: 2.0e9, epsF: 0.04,
    G0: 6e3, BHN: 25, jcC: 0.03, Tm: 700, cp: 1400, jcM: 1.3,
    brittle: 0.0, weibull: 20, erosionResist: 0.2,
    color: '#8f7f52', color2: '#554b31',
    notes: 'Catches spall; contributes little to resisting the main penetrator.',
  }),
  rubber: mat({
    key: 'rubber', name: 'Elastomer interlayer (NERA)', class: 'polymer',
    rho: 1150, E: 0.05e9, nu: 0.49, Y: 0.02e9, UTS: 0.025e9, epsF: 2.0,
    G0: 3e3, BHN: 5, jcC: 0.05, Tm: 500, cp: 1800, jcM: 1.5,
    brittle: 0.0, weibull: 30, erosionResist: 0.05,
    color: '#2f3136', color2: '#1a1c1f',
    notes: 'Bulk-modulus mismatch drives the plate-flyer motion that makes NERA sandwiches work.',
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
  }),
};

/** Materials that make sense as an armour layer choice in the UI. */
export const ARMOUR_KEYS = [
  'rha', 'hha', 'fha', 'cast', 'mild', 'maraging', 'boxsteel',
  'al5083', 'al7039', 'ti64', 'tantalum', 'wha', 'du',
  'alumina', 'sic', 'b4c', 'tib2', 'uhmwpe', 'grp', 'aramid', 'textolite', 'rubber',
];

/** Materials that make sense as a penetrator body/core in the UI. */
export const PENETRATOR_KEYS = [
  'apsteel', 'wha', 'du', 'wc', 'hha', 'rha', 'copper', 'mild',
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
