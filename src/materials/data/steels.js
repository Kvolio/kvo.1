/**
 * STEELS — armour plate, naval and structural steels, penetrator steels
 *
 * Property meanings and units are documented in ../database.js; the grading
 * of the data (A / B / C) and the group taxonomy are in ../schema.js.
 * Each entry's `refs` lists what its numbers rest on.
 */
import { mat } from '../schema.js';

export const STEELS = [
  // ---------------------------------------------------------------- steel-rha
  mat({
    key: 'rha',
    name: 'RHA (rolled homogeneous armour)',
    class: 'metal', group: 'steel-rha', uses: ['armour', 'penetrator', 'cap', 'shell'], grade: 'B',
    refs: [
      'MIL-DTL-12560K class 1 (wrought RHA)',
      'Johnson & Cook (1983): 4340-type constants for rate and thermal terms',
    ],
    rho: 7850, E: 2.1e11, nu: 0.29, Y: 9.5e8, UTS: 1.2e9, epsF: 0.17, G0: 48000, BHN: 340, jcC: 0.014,
    Tm: 1793, cp: 477, jcM: 1.03, brittle: 0.05, weibull: 28, compFail: false, erosionResist: 1,
    color: '#7d8798', color2: '#4b525f',
    notes: 'The reference armour. All "RHAe" figures in the report are relative to this entry. Y and UTS are class-1 plate values; thin plate is harder than this, thick plate softer. The solver works at the strain-hardened flow stress between them (see materials/derive.js).',
  }),
  mat({
    key: 'cast',
    name: 'Cast homogeneous armour',
    class: 'metal', group: 'steel-rha', uses: ['armour', 'shell'], grade: 'C',
    refs: ['Typical cast armour steel; ~0.85-0.95 x RHA mass efficiency (open literature)'],
    rho: 7800, E: 2e11, nu: 0.29, Y: 8.8e8, UTS: 1e9, epsF: 0.13, G0: 33000, BHN: 260, jcC: 0.014,
    Tm: 1780, cp: 477, jcM: 1.03, brittle: 0.15, weibull: 14, compFail: false, erosionResist: 0.9,
    color: '#77808e', color2: '#464c58',
    notes: 'Porosity and coarse grain modelled as a low Weibull modulus: more scatter in local strength.',
  }),

  // ---------------------------------------------------------------- steel-hard
  mat({
    key: 'armox440',
    name: 'Armox 440T',
    class: 'metal', group: 'steel-hard', uses: ['armour'], grade: 'A',
    refs: [
      'SSAB Armox 440T datasheet: 420-480 HBW, Rp0.2 >= 1100 MPa, Rm 1250-1550 MPa, A5 >= 10 %',
    ],
    rho: 7850, E: 2.05e11, nu: 0.29, Y: 1.2e9, UTS: 1.4e9, epsF: 0.12, G0: 34000, BHN: 450, jcC: 0.013,
    Tm: 1793, cp: 477, jcM: 1, brittle: 0.18, weibull: 21, compFail: false, erosionResist: 1.09,
    color: '#96a0ac', color2: '#5a616e',
    notes: 'The formable, weldable grade: bendable enough to make structure from. Lowest protection of the Armox family and the easiest to build with.',
  }),
  mat({
    key: 'hha',
    name: 'High-hardness armour steel (MIL-DTL-46100, ~500 HB)',
    class: 'metal', group: 'steel-hard', uses: ['armour', 'penetrator'], grade: 'A',
    refs: [
      'Industeel MARS 500 datasheet: 477-534 HBW (typ. 500), Rp0.2 >= 1150 (typ. 1250) MPa, Rm >= 1500 (typ. 1700) MPa, A5 typ. 12 %',
      'MIL-DTL-46100 hardness band',
    ],
    rho: 7850, E: 2.1e11, nu: 0.29, Y: 1.25e9, UTS: 1.7e9, epsF: 0.12, G0: 19000, BHN: 500, jcC: 0.012,
    Tm: 1793, cp: 477, jcM: 1, brittle: 0.3, weibull: 20, compFail: false, erosionResist: 1.15,
    color: '#98a0ad', color2: '#5b6270',
    notes: 'Higher resistance to plastic flow, markedly lower ductility than RHA: prone to plugging and rear-face cracking. Industeel MARS 240 and Ramor 500 are products in the same 500 HB class and load as this entry.',
  }),
  mat({
    key: 'armox500',
    name: 'Armox 500T',
    class: 'metal', group: 'steel-hard', uses: ['armour'], grade: 'A',
    refs: [
      'SSAB Armox 500T datasheet: 480-540 HBW, Rp0.2 >= 1250 MPa, Rm 1450-1800 MPa, A5 >= 8 %',
    ],
    rho: 7850, E: 2.05e11, nu: 0.29, Y: 1.3e9, UTS: 1.62e9, epsF: 0.1, G0: 22000, BHN: 510, jcC: 0.012,
    Tm: 1793, cp: 477, jcM: 1, brittle: 0.28, weibull: 20, compFail: false, erosionResist: 1.15,
    color: '#99a3b0', color2: '#5c6371',
    notes: 'The workhorse commercial armour plate, and probably the most-tested armour steel in the open literature.',
  }),
  mat({
    key: 'armox600',
    name: 'Armox 600T',
    class: 'metal', group: 'steel-hard', uses: ['armour'], grade: 'B',
    refs: [
      'SSAB Armox 600T datasheet: 570-640 HBW (hardness verified)',
      'strengths are typical values for the 600 HB class',
    ],
    rho: 7850, E: 2.05e11, nu: 0.29, Y: 1.55e9, UTS: 2e9, epsF: 0.07, G0: 12000, BHN: 605, jcC: 0.01,
    Tm: 1793, cp: 477, jcM: 1, brittle: 0.45, weibull: 17, compFail: false, erosionResist: 1.26,
    color: '#8d97a4', color2: '#545b68',
    notes: 'The hardest plate SSAB sells. Excellent stopping power per millimetre; it cannot be bent to any useful radius and it cracks if you weld it carelessly.',
  }),
  mat({
    key: 'uhh600',
    name: 'Ultra-high-hardness armour steel (~600 HB)',
    class: 'metal', group: 'steel-hard', uses: ['armour'], grade: 'C',
    refs: [
      'Ultra-high-hardness class, cf. Armox 600T (570-640 HBW) and Industeel MARS 300 (620 HB)',
    ],
    rho: 7850, E: 2.1e11, nu: 0.29, Y: 1.92e9, UTS: 2.25e9, epsF: 0.055, G0: 11000, BHN: 600,
    jcC: 0.01, Tm: 1793, cp: 477, jcM: 1, brittle: 0.48, weibull: 16, compFail: false,
    erosionResist: 1.26, color: '#8c94a1', color2: '#515865',
    notes: 'About as hard as a steel plate usefully gets. Excellent at shattering small-calibre AP, brittle enough that a heavy hit can crack it through.',
  }),

  // ---------------------------------------------------------------- steel-graded
  mat({
    key: 'fha',
    name: 'Face-hardened armour (graded)',
    class: 'metal', group: 'steel-graded', uses: ['armour'], grade: 'C',
    refs: [
      'Krupp-type cemented plate, carburised case ~30-40 % of thickness (historical literature)',
    ],
    rho: 7850, E: 2.1e11, nu: 0.29, Y: 1.35e9, UTS: 1.6e9, epsF: 0.11, G0: 26000, BHN: 430, jcC: 0.013,
    Tm: 1793, cp: 477, jcM: 1, brittle: 0.35, weibull: 18, compFail: false, erosionResist: 1.1,
    gradient: {
      Y: [[0,1.55],[0.35,1.25],[1,0.72]],
      epsF: [[0,0.45],[0.35,0.8],[1,1.6]],
      brittle: [[0,2.2],[0.35,1.2],[1,0.25]],
    },
    color: '#a6adba', color2: '#5f6673',
    notes: 'Hard brittle case over a tough back. Shatters uncapped projectiles; the soft back resists the resulting plug.',
  }),
  mat({
    key: 'dhs',
    name: 'Dual-hardness steel (DHS)',
    class: 'metal', group: 'steel-graded', uses: ['armour'], grade: 'C',
    refs: ['Roll-bonded hard-face / tough-back laminate, cf. MIL-DTL-46099'],
    rho: 7850, E: 2.08e11, nu: 0.29, Y: 1.7e9, UTS: 2e9, epsF: 0.075, G0: 14000, BHN: 600, jcC: 0.011,
    Tm: 1793, cp: 477, jcM: 1, brittle: 0.4, weibull: 18, compFail: false, erosionResist: 1.24,
    gradient: {
      Y: [[0,1],[0.45,1],[0.55,0.72],[1,0.7]],
      UTS: [[0,1],[0.45,1],[0.55,0.76],[1,0.74]],
      epsF: [[0,1],[0.45,1],[0.55,1.9],[1,2]],
      G0: [[0,1],[0.45,1],[0.55,2.6],[1,2.8]],
      brittle: [[0,1],[0.45,1],[0.55,0.4],[1,0.35]],
    },
    color: '#9ba3b0', color2: '#565d6a',
    notes: 'Two steels roll-bonded into one plate: a ~600 BHN face to break the projectile and a tougher, softer back to catch what is left without cracking. The gradient is applied through the thickness, so the struck face and the rear face genuinely respond differently.',
  }),

  // ---------------------------------------------------------------- steel-naval
  mat({
    key: 'mild',
    name: 'Mild steel (AISI 1020, normalised)',
    class: 'metal', group: 'steel-naval',
    uses: ['armour', 'penetrator', 'cap', 'body', 'shell', 'sabot', 'liner'], grade: 'B',
    refs: ['ASM Handbook vol. 1: AISI 1020 normalised, Y 345 MPa, UTS 440 MPa, A 36 %'],
    rho: 7850, E: 2e11, nu: 0.3, Y: 3.45e8, UTS: 4.4e8, epsF: 0.36, G0: 98000, BHN: 131, jcC: 0.022,
    Tm: 1793, cp: 477, jcM: 1.03, brittle: 0, weibull: 30, compFail: false, erosionResist: 0.55,
    color: '#6c757f', color2: '#3f454d',
    notes: 'Structural, not armour. Deforms and petals rather than plugs.',
  }),
  mat({
    key: 'hy80',
    name: 'HY-80 naval steel',
    class: 'metal', group: 'steel-naval', uses: ['armour'], grade: 'B',
    refs: [
      'MIL-S-16216 HY-80: Y >= 80 ksi (552 MPa)',
      'density 7.75 g/cm3, E 207 GPa, nu 0.30 (open literature)',
    ],
    rho: 7750, E: 2.07e11, nu: 0.3, Y: 6e8, UTS: 7.2e8, epsF: 0.2, G0: 109000, BHN: 235, jcC: 0.014,
    Tm: 1793, cp: 477, jcM: 1.03, brittle: 0, weibull: 26, erosionResist: 0.8, color: '#7c8592',
    color2: '#4a515c',
    notes: 'The US Navy hull and submarine steel. Soft and extremely tough: it stretches and tears rather than plugging, which is why it is used where a plate has to survive a hit and stay watertight rather than stop it outright.',
  }),
  mat({
    key: 'hy100',
    name: 'HY-100 naval steel',
    class: 'metal', group: 'steel-naval', uses: ['armour'], grade: 'B',
    refs: ['MIL-S-16216 HY-100: Y >= 100 ksi (690 MPa)'],
    rho: 7750, E: 2.07e11, nu: 0.3, Y: 7.2e8, UTS: 8e8, epsF: 0.18, G0: 95000, BHN: 265, jcC: 0.014,
    Tm: 1793, cp: 477, jcM: 1.03, brittle: 0.02, weibull: 26, erosionResist: 0.85, color: '#7e8794',
    color2: '#4c535e',
    notes: 'The higher-strength cousin of HY-80, used for surface-ship and submarine structure where weight matters.',
  }),
  mat({
    key: 'hy130',
    name: 'HY-130 naval steel',
    class: 'metal', group: 'steel-naval', uses: ['armour'], grade: 'B',
    refs: ['HY-130: Y >= 130 ksi (900 MPa)'],
    rho: 7850, E: 2.07e11, nu: 0.3, Y: 9.2e8, UTS: 1.03e9, epsF: 0.15, G0: 70000, BHN: 320, jcC: 0.013,
    Tm: 1793, cp: 477, jcM: 1, brittle: 0.08, weibull: 24, erosionResist: 0.95, color: '#808996',
    color2: '#4e5560',
    notes: 'The strongest of the HY family that is still weldable in thick section. Tougher than any armour steel of the same yield, softer than any of them in hardness.',
  }),
  mat({
    key: 'steel4340',
    name: 'AISI 4340 steel (tempered, ~30 HRC)',
    class: 'metal', group: 'steel-naval', uses: ['armour', 'penetrator'], grade: 'B',
    refs: [
      'Johnson & Cook (1983): 4340 steel at 30 HRC, A = 792 MPa, C = 0.014, m = 1.03, rho 7830, cp 477, Tm 1793 K',
    ],
    rho: 7830, E: 2.05e11, nu: 0.29, Y: 7.9e8, UTS: 9.5e8, epsF: 0.2, G0: 49000, BHN: 285, jcC: 0.014,
    Tm: 1793, cp: 477, jcM: 1.03, brittle: 0.05, weibull: 24, erosionResist: 0.95, color: '#7f8895',
    color2: '#4d545f',
    notes: 'The steel most Johnson-Cook constants were fitted to, and a common test-plate and penetrator-body steel. Close to RHA in hardness and a little weaker.',
  }),
  mat({
    key: 'hadfield',
    name: 'Hadfield manganese steel (austenitic, 12-13 % Mn)',
    class: 'metal', group: 'steel-naval', uses: ['armour'], grade: 'C',
    refs: [
      'Water-toughened Hadfield steel: ~200-220 HB, UTS 0.35-0.9 GPa, A 18-65 % (rises with work hardening)',
    ],
    rho: 7800, E: 2e11, nu: 0.3, Y: 3.8e8, UTS: 8.5e8, epsF: 0.4, G0: 72000, BHN: 210, jcC: 0.02,
    Tm: 1700, cp: 500, jcM: 1, brittle: 0, weibull: 18, erosionResist: 0.8, color: '#757c86',
    color2: '#464b53',
    notes: 'Soft when struck gently and work-hardening to over 500 HB under impact, so it is used for track links and crusher jaws. The work hardening is NOT modelled: the entry behaves as the soft starting state.',
  }),
  mat({
    key: 'ss304',
    name: 'Austenitic stainless steel (304)',
    class: 'metal', group: 'steel-naval', uses: ['armour'], grade: 'B',
    refs: ['ASM Handbook vol. 1: 304 annealed, Y 215, UTS 505 MPa, A 70 %'],
    rho: 8000, E: 1.93e11, nu: 0.29, Y: 2.15e8, UTS: 5.05e8, epsF: 0.5, G0: 207000, BHN: 123,
    jcC: 0.02, Tm: 1673, cp: 500, jcM: 1, brittle: 0, weibull: 30, erosionResist: 0.6,
    color: '#a9afb6', color2: '#686e75',
    notes: 'Soft, very ductile and tough. Not an armour material; it is here as the stuff exhaust shrouds, tanks and fittings are made of.',
  }),
  mat({
    key: 'ph174',
    name: '17-4 PH stainless steel',
    class: 'metal', group: 'steel-naval', uses: ['armour'], grade: 'B',
    refs: ['AMS 5643, H900 condition: Rp0.2 >= 1170 MPa, Rm >= 1310 MPa'],
    rho: 7800, E: 1.97e11, nu: 0.27, Y: 1.17e9, UTS: 1.31e9, epsF: 0.12, G0: 30000, BHN: 400,
    jcC: 0.013, Tm: 1713, cp: 460, jcM: 1, brittle: 0.2, weibull: 21, compFail: false,
    erosionResist: 1.05, color: '#a5adb6', color2: '#646b73',
    notes: 'Precipitation-hardening stainless. Strong and corrosion-resistant rather than optimised for armour; usual role is fittings and mounts inside an array.',
  }),

  // ---------------------------------------------------------------- steel-special
  mat({
    key: 'maraging',
    name: 'Maraging steel (18Ni-350)',
    class: 'metal', group: 'steel-special', uses: ['armour'], grade: 'B',
    refs: [
      '18Ni(350) maraging grade, aged: UTS ~2.4 GPa at ~6-7 % elongation (ASM Handbook vol. 1)',
    ],
    rho: 8080, E: 1.9e11, nu: 0.3, Y: 2.35e9, UTS: 2.45e9, epsF: 0.06, G0: 22000, BHN: 600, jcC: 0.01,
    Tm: 1685, cp: 420, jcM: 0.9, brittle: 0.35, weibull: 22, compFail: false, erosionResist: 1.3,
    color: '#a6a2ad', color2: '#5f5c66',
    notes: 'Roughly twice the yield of RHA at a similar density, bought with ductility. Resists penetration well and cracks readily; a poor choice where spall behind the plate matters.',
  }),
  mat({
    key: 'steel300m',
    name: '300M ultra-high-strength steel',
    class: 'metal', group: 'steel-special', uses: ['armour', 'penetrator'], grade: 'B',
    refs: ['AMS 6417, tempered at ~300 C: Y ~1.6, UTS ~1.97 GPa, A ~10 %, ~53 HRC'],
    rho: 7830, E: 2e11, nu: 0.29, Y: 1.6e9, UTS: 1.97e9, epsF: 0.1, G0: 21000, BHN: 520, jcC: 0.011,
    Tm: 1793, cp: 477, jcM: 1, brittle: 0.3, weibull: 20, erosionResist: 1.2, color: '#939ba7',
    color2: '#555c68',
    notes: 'Landing-gear and penetrator-body steel: about as strong as steel gets while keeping some toughness. Harder than most armour plate.',
  }),
  mat({
    key: 'apsteel',
    name: 'Hardened AP core steel',
    class: 'metal', group: 'steel-special', uses: ['penetrator'], grade: 'C',
    refs: ['Through-hardened AP shot steel, ~60 HRC class'],
    rho: 7850, E: 2.1e11, nu: 0.29, Y: 1.95e9, UTS: 2.15e9, epsF: 0.045, G0: 12000, BHN: 620,
    jcC: 0.01, Tm: 1793, cp: 477, jcM: 1, brittle: 0.55, weibull: 16, compFail: false,
    erosionResist: 1.25, color: '#9ea3a8', color2: '#5c6064',
    notes: 'Hard enough to defeat plate, brittle enough to shatter on face-hardened armour above the shatter-gap velocity. That behaviour is emergent here, not scripted.',
  }),
  mat({
    key: 'softcap',
    name: 'Penetrating cap steel (soft)',
    class: 'metal', group: 'steel-special', uses: ['cap'], grade: 'C',
    refs: ['Soft penetrating-cap steel (APC rounds)'],
    rho: 7850, E: 2.05e11, nu: 0.29, Y: 5.5e8, UTS: 7.5e8, epsF: 0.3, G0: 90000, BHN: 200, jcC: 0.018,
    Tm: 1793, cp: 477, jcM: 1.03, brittle: 0, weibull: 28, compFail: false, erosionResist: 0.7,
    color: '#8b8577', color2: '#524e46',
    notes: 'Spreads and delays the shock reaching the hard core, which is why an APC round survives a face-hardened plate that shatters an uncapped AP round.',
  }),
  mat({
    key: 'boxsteel',
    name: 'Component casing steel',
    class: 'metal', group: 'steel-special', uses: ['casing'], grade: 'C',
    refs: ['Generic mild-steel housing stock'],
    rho: 7850, E: 2e11, nu: 0.3, Y: 3.5e8, UTS: 5e8, epsF: 0.3, G0: 90000, BHN: 150, jcC: 0.014,
    Tm: 1800, cp: 477, jcM: 1.03, brittle: 0, weibull: 28, compFail: false, erosionResist: 0.6,
    color: '#606771', color2: '#383d44',
    notes: 'Not armour. It is what a gearbox, an ammunition box or a fuel cell wall is made of, so a fragment reaching the inside of the vehicle still has something to get through.',
  }),
];
