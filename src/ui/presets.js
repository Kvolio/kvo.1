/**
 * Scenario presets. Each is a complete, loadable scenario file — the same
 * format the save/load system reads and writes — so a preset is nothing more
 * than a scenario that ships with the tool.
 */

export const PRESETS = {
  'single-plate': {
    name: 'Single RHA plate — 80 mm at 0°',
    note: 'The reference case. Everything else is a departure from this.',
    projectile: { type: 'apcbc', velocity: 800, standoff: 1.2 },
    scene: {
      layers: [{ material: 'rha', thickness: 0.080, slope: 0, height: 1.2, label: 'plate' }],
      modules: [],
    },
  },
  'sloped-glacis': {
    name: 'Sloped glacis — 80 mm at 55°',
    note: 'Same plate, same round. Line-of-sight thickness and the tendency to ricochet both rise with obliquity.',
    projectile: { type: 'apcbc', velocity: 800, standoff: 1.2 },
    scene: {
      layers: [{ material: 'rha', thickness: 0.080, slope: 55, height: 1.4, label: 'glacis' }],
      modules: [],
    },
  },
  'spaced-array': {
    name: 'Spaced array — thin screen + main plate',
    note: 'The screen costs little mass but starts the projectile deforming and yawing before it reaches the plate behind.',
    projectile: { type: 'apcbc', velocity: 800, standoff: 1.2 },
    scene: {
      layers: [
        { material: 'hha', thickness: 0.010, slope: 30, height: 0.9, label: 'screen' },
        { material: 'rha', thickness: 0.075, slope: 10, gap: 0.30, height: 1.2, label: 'main plate' },
      ],
      modules: [{ type: 'crew', x: 0.75, y: 0.05, w: 0.34, h: 0.62, label: 'gunner' }],
    },
  },
  'ceramic-composite': {
    name: 'Ceramic / composite array',
    note: 'Alumina strike face bonded to an aluminium backing with a UHMWPE catcher. The ceramic works in compression and shatters in tension.',
    projectile: { type: 'apfsds', velocity: 1500, standoff: 2.4, rodD: 0.018, rodLd: 20, mass: 1.9 },
    scene: {
      layers: [
        { material: 'alumina', thickness: 0.020, slope: 0, height: 0.7, label: 'strike face' },
        { material: 'al7039', thickness: 0.035, slope: 0, bonded: true, height: 0.7, label: 'backing' },
        { material: 'uhmwpe', thickness: 0.025, slope: 0, bonded: true, height: 0.7, label: 'catcher' },
      ],
      modules: [],
    },
  },
  'mbt-frontal': {
    name: 'MBT frontal array vs long rod',
    note: 'Layered steel / ceramic / steel with an air gap and a spall liner, and a crew compartment behind it.',
    projectile: { type: 'apfsds', velocity: 1650, standoff: 2.6 },
    scene: {
      layers: [
        { material: 'hha', thickness: 0.050, slope: 20, height: 1.3, label: 'outer plate' },
        { material: 'sic', thickness: 0.045, slope: 20, gap: 0.02, height: 1.2, label: 'ceramic tile' },
        { material: 'rha', thickness: 0.030, slope: 20, bonded: true, height: 1.2, label: 'tile backing' },
        { material: 'rha', thickness: 0.060, slope: 20, gap: 0.09, height: 1.2, label: 'main backing' },
        { material: 'aramid', thickness: 0.012, slope: 20, bonded: true, height: 1.2, label: 'spall liner' },
      ],
      modules: [
        { type: 'crew', x: 0.62, y: 0.10, w: 0.30, h: 0.55, label: 'driver' },
        { type: 'ammo', x: 0.72, y: -0.34, w: 0.36, h: 0.26, label: 'ready rack' },
        { type: 'hydraulics', x: 0.55, y: -0.42, w: 0.16, h: 0.14 },
      ],
    },
  },
  'nera-sandwich': {
    name: 'NERA sandwich',
    note: 'Steel/elastomer/steel. The bulk-modulus mismatch drives the plates apart during penetration, which is why the array performs better than its mass suggests.',
    projectile: { type: 'heat', velocity: 300, standoff: 1.0 },
    scene: {
      layers: [
        { material: 'hha', thickness: 0.006, slope: 0, height: 0.6, label: 'front flyer' },
        { material: 'rubber', thickness: 0.012, slope: 0, bonded: true, height: 0.6, label: 'interlayer' },
        { material: 'hha', thickness: 0.006, slope: 0, bonded: true, height: 0.6, label: 'rear flyer' },
        { material: 'rha', thickness: 0.060, slope: 0, gap: 0.12, height: 0.9, label: 'main plate' },
      ],
      modules: [],
    },
  },
  'hesh-scab': {
    name: 'HESH against thick plate',
    note: 'No penetration at all: the scab comes off the inside face because the reflected tensile wave beats the armour, not because anything went through it.',
    projectile: { type: 'hesh', velocity: 730, standoff: 1.0 },
    scene: {
      layers: [{ material: 'rha', thickness: 0.075, slope: 0, height: 1.1, label: 'plate' }],
      modules: [{ type: 'crew', x: 0.45, y: 0.0, w: 0.32, h: 0.6, label: 'crew' }],
    },
  },
  'aphe-interior': {
    name: 'APHE — penetrate then burst',
    note: 'Watch the base fuze delay: the shell must survive the plate and still be inside the target when it functions.',
    projectile: { type: 'aphe', velocity: 800, standoff: 1.2, fuzeDelay: 300e-6 },
    scene: {
      layers: [{ material: 'rha', thickness: 0.045, slope: 15, height: 1.1, label: 'side plate' }],
      modules: [
        { type: 'crew', x: 0.40, y: 0.12, w: 0.30, h: 0.50, label: 'loader' },
        { type: 'ammo', x: 0.52, y: -0.30, w: 0.34, h: 0.26, label: 'stowage' },
        { type: 'engine', x: 0.95, y: -0.05, w: 0.45, h: 0.55 },
      ],
    },
  },
  'shatter-gap': {
    name: 'Face-hardened plate vs uncapped AP',
    note: 'The hard case attacks the projectile nose. An uncapped shot can shatter on plate it would otherwise defeat — compare with APC on the same array.',
    projectile: { type: 'ap', velocity: 850, standoff: 1.2 },
    scene: {
      layers: [{ material: 'fha', thickness: 0.055, slope: 25, height: 1.0, label: 'face-hardened plate' }],
      modules: [],
    },
  },

  'era-light-heat': {
    name: 'Light ERA vs shaped charge',
    note: 'A Kontakt-1 class cassette over a main plate, struck at 60°. The charge is initiated by the jet itself, and the plates then sweep across the jet path — which is why obliquity matters so much to ERA: at 0° the plates fly along the jet axis and barely interact with it. Compare with the slope set to 0.',
    projectile: { type: 'heat', standoff: 0.6 },
    scene: {
      layers: [
        { kind: 'era', label: 'Kontakt-1 type', plate: 'hha', slope: 60, height: 0.8,
          frontThickness: 0.003, chargeThickness: 0.006, backThickness: 0.003 },
        { material: 'rha', thickness: 0.090, slope: 60, gap: 0.10, height: 1.2, label: 'main plate' },
      ],
      modules: [{ type: 'crew', x: 1.05, y: 0.05, w: 0.32, h: 0.52, label: 'driver' }],
    },
  },
  'era-heavy-ke': {
    name: 'Heavy ERA vs long rod',
    note: 'A Kontakt-5 class cassette: the front plate is thick enough to carry real momentum, so the rod is not merely disturbed but bent and yawed before it reaches the main array. The two plates leave at different speeds because they have different masses.',
    projectile: { type: 'apfsds', velocity: 1650, standoff: 2.6 },
    scene: {
      layers: [
        { kind: 'era', label: 'Kontakt-5 type', plate: 'hha', slope: 55, height: 0.9,
          frontThickness: 0.015, chargeThickness: 0.010, backThickness: 0.005 },
        { material: 'hha', thickness: 0.050, slope: 55, gap: 0.08, height: 1.3, label: 'outer plate' },
        { material: 'rha', thickness: 0.070, slope: 55, gap: 0.06, height: 1.3, label: 'main backing' },
      ],
      modules: [{ type: 'crew', x: 1.3, y: 0.05, w: 0.34, h: 0.55, label: 'crew' }],
    },
  },
  'era-insensitive': {
    name: 'ERA under fragment attack',
    note: 'The same cassette hit by something it is designed to shrug off. An ERA filler is deliberately insensitive: it has to survive splinters, small arms and its own vehicle firing. Whether it functions here is decided by the Walker-Wasley shock integral on the simulated stress, not by what is hitting it.',
    projectile: { type: 'ap', caliber: 0.0145, mass: 0.064, velocity: 1000, standoff: 0.5 },
    scene: {
      layers: [
        { kind: 'era', label: 'Cassette', plate: 'hha', slope: 0, height: 0.6,
          frontThickness: 0.003, chargeThickness: 0.006, backThickness: 0.003 },
        { material: 'rha', thickness: 0.060, slope: 0, gap: 0.10, height: 1.0, label: 'hull side' },
      ],
      modules: [],
    },
  },

  'dense-metals': {
    name: 'Dense metal backing — tungsten vs steel',
    note: 'A tungsten-alloy plate against the same thickness of RHA. Per unit THICKNESS the heavy metal wins comfortably; per unit MASS it loses badly, and the areal figures in the Setup panel are the ones that decide whether a vehicle can carry it. Swap the material and compare.',
    projectile: { type: 'apfsds', velocity: 1650, standoff: 2.4 },
    scene: {
      layers: [
        { material: 'wha', thickness: 0.040, slope: 0, height: 0.9, label: 'tungsten alloy' },
        { material: 'rha', thickness: 0.060, slope: 0, gap: 0.05, height: 1.1, label: 'RHA backing' },
      ],
      modules: [{ type: 'crew', x: 0.85, y: 0.05, w: 0.32, h: 0.52, label: 'crew' }],
    },
  },

  // ---------------------------------------------------------------------
  // POST-WAR COMBINATION GLACIS
  //
  // Soviet "combination armour" is a steel-textolite-steel laminate carried at
  // extreme obliquity. The published layer breakdowns below are the ones that
  // recur in the open literature; they are not measurements, and armour
  // layouts of vehicles still in service are not public. Treat the layer
  // thicknesses as representative of the design idea - a low-density spacer
  // between steel skins, angled hard - rather than as the armour of any
  // particular tank on any particular day.
  //
  // Slope is from the vertical, so a 68 deg glacis is the near-horizontal one.
  // ---------------------------------------------------------------------
  't72-ural-ufp': {
    name: 'T-72 Ural — glacis, 80/105/20 at 68°',
    note: 'The classic combination glacis: high-hardness steel, a thick textolite filler, a thin steel back plate, all at 68°. 205 mm of material becomes about 550 mm of line of sight, and the textolite contributes barely a tenth of the mass of the same thickness of steel. Fired on here by the 105 mm APDS it was designed against.',
    projectile: { type: 'apds', caliber: 0.105, coreD: 0.036, coreLd: 4.2, mass: 3.8, velocity: 1478, standoff: 1.8 },
    scene: {
      layers: [
        { material: 'hha', thickness: 0.080, slope: 68, height: 1.3, label: 'front plate' },
        { material: 'textolite', thickness: 0.105, slope: 68, bonded: true, height: 1.3, label: 'textolite filler' },
        { material: 'rha', thickness: 0.020, slope: 68, bonded: true, height: 1.3, label: 'back plate' },
      ],
      modules: [
        { type: 'crew', x: 1.25, y: 0.05, w: 0.34, h: 0.55, label: 'driver' },
        { type: 'ammo', x: 1.70, y: -0.28, w: 0.36, h: 0.28, label: 'carousel' },
      ],
    },
  },
  't72b-ufp': {
    name: 'T-72B — glacis with reflecting plates, at 68°',
    note: 'The later laminate trades textolite for thin steel plates separated by a compliant interlayer. Each interface reflects part of the shock and each plate has to be cut separately, which is worth more against a long rod than the same mass of textolite is.',
    projectile: { type: 'apfsds', caliber: 0.125, rodD: 0.022, rodLd: 20, mass: 3.9, velocity: 1700, standoff: 2.4 },
    scene: {
      layers: [
        { material: 'hha', thickness: 0.060, slope: 68, height: 1.3, label: 'front plate' },
        { material: 'rubber', thickness: 0.010, slope: 68, bonded: true, height: 1.3, label: 'interlayer' },
        { material: 'rha', thickness: 0.035, slope: 68, bonded: true, height: 1.3, label: 'reflecting plate' },
        { material: 'rubber', thickness: 0.010, slope: 68, bonded: true, height: 1.3, label: 'interlayer' },
        { material: 'rha', thickness: 0.050, slope: 68, bonded: true, height: 1.3, label: 'back plate' },
      ],
      modules: [
        { type: 'crew', x: 1.30, y: 0.05, w: 0.34, h: 0.55, label: 'driver' },
        { type: 'ammo', x: 1.75, y: -0.28, w: 0.36, h: 0.28, label: 'carousel' },
      ],
    },
  },
  't90a-ufp': {
    name: 'T-90A — glacis with heavy ERA, at 68°',
    note: 'The T-72B laminate with a Kontakt-5 class cassette on top. The heavy front plate is the point: it is thick enough to carry real momentum against a long rod rather than merely to confine the charge. Compare with the cassette deleted.',
    projectile: { type: 'apfsds', caliber: 0.120, rodD: 0.022, rodLd: 26, mass: 4.6, velocity: 1670, core: 'du', standoff: 2.6 },
    scene: {
      layers: [
        { kind: 'era', label: 'Kontakt-5', plate: 'hha', slope: 68, height: 1.0,
          frontThickness: 0.015, chargeThickness: 0.010, backThickness: 0.005 },
        { material: 'hha', thickness: 0.060, slope: 68, gap: 0.02, height: 1.3, label: 'front plate' },
        { material: 'rubber', thickness: 0.010, slope: 68, bonded: true, height: 1.3, label: 'interlayer' },
        { material: 'rha', thickness: 0.035, slope: 68, bonded: true, height: 1.3, label: 'reflecting plate' },
        { material: 'rha', thickness: 0.050, slope: 68, bonded: true, height: 1.3, label: 'back plate' },
      ],
      modules: [
        { type: 'crew', x: 1.40, y: 0.05, w: 0.34, h: 0.55, label: 'driver' },
        { type: 'ammo', x: 1.85, y: -0.28, w: 0.36, h: 0.28, label: 'carousel' },
      ],
    },
  },
  't55-ufp': {
    name: 'T-55 — glacis, 100 mm at 60°',
    note: 'Homogeneous steel, no laminate: 200 mm of line of sight from 100 mm of plate. The baseline every post-war combination array was trying to beat without gaining weight.',
    projectile: { type: 'apcbc', caliber: 0.090, mass: 11.0, velocity: 850, standoff: 1.5 },
    scene: {
      layers: [{ material: 'rha', thickness: 0.100, slope: 60, height: 1.3, label: 'glacis' }],
      modules: [{ type: 'crew', x: 0.75, y: 0.05, w: 0.32, h: 0.52, label: 'driver' }],
    },
  },

  // ---------------------------------------------------------------------
  // HISTORICAL PLATES
  //
  // Nominal design figures from published armour layouts, not measurements of
  // any particular vehicle. Real plate varied with manufacturer, production
  // batch and late-war material quality, and the hardness of a given plate is
  // not recorded in a thickness table - the material chosen here is the usual
  // classification for that plate, which is itself a judgement.
  //
  // ANGLE CONVENTION: slope is measured from the vertical, i.e. from the plane
  // perpendicular to the shot line. 0 deg is a flat face square to the round.
  // Sources that quote "60 degrees" for a Tiger II glacis are measuring from
  // the horizontal instead; that plate is 50 deg here. Line-of-sight thickness
  // is thickness / cos(slope) and is shown in the Setup panel.
  // ---------------------------------------------------------------------
  'tiger1-ufp': {
    name: 'Tiger I — upper front plate, 100 mm at 9°',
    note: 'The driver\u2019s plate. Thick but almost unsloped, which is the whole argument against the Tiger I\u2019s frontal layout: 100 mm of plate does 101 mm of work. Fired on here by a 17-pounder APCBC.',
    projectile: { type: 'apcbc', caliber: 0.0765, mass: 7.65, velocity: 884, standoff: 1.4 },
    scene: {
      layers: [{ material: 'rha', thickness: 0.100, slope: 9, height: 1.0, label: 'upper front plate' }],
      modules: [
        { type: 'crew', x: 0.55, y: 0.10, w: 0.32, h: 0.55, label: 'driver' },
        { type: 'ammo', x: 0.80, y: -0.28, w: 0.30, h: 0.24, label: 'hull stowage' },
      ],
    },
  },
  'tiger1-nose': {
    name: 'Tiger I — nose plate, 100 mm at 25°',
    note: 'Same thickness as the driver\u2019s plate but angled, so it is the harder of the two despite being the lower target. Worth running against the same round as the upper plate.',
    projectile: { type: 'apcbc', caliber: 0.0765, mass: 7.65, velocity: 884, standoff: 1.4 },
    scene: {
      layers: [{ material: 'rha', thickness: 0.100, slope: 25, height: 0.9, label: 'nose plate' }],
      modules: [{ type: 'crew', x: 0.60, y: 0.08, w: 0.32, h: 0.50, label: 'driver' }],
    },
  },
  'tiger2-ufp': {
    name: 'Tiger II — glacis, 150 mm at 50°',
    note: '233 mm line of sight. Effectively immune to wartime tank guns from the front; the interesting question is what happens to the round, not to the plate.',
    projectile: { type: 'apcbc', caliber: 0.122, mass: 25.0, velocity: 795, standoff: 1.8 },
    scene: {
      layers: [{ material: 'rha', thickness: 0.150, slope: 50, height: 1.5, label: 'glacis' }],
      modules: [{ type: 'crew', x: 0.85, y: 0.05, w: 0.34, h: 0.55, label: 'driver' }],
    },
  },
  'panther-glacis': {
    name: 'Panther — glacis, 80 mm at 55°',
    note: 'The counter-example to the Tiger I: less than half the plate, angled hard, and 139 mm of line of sight for it. Late-war plate quality is the usual caveat and is not modelled.',
    projectile: { type: 'apcbc', caliber: 0.076, mass: 7.0, velocity: 792, standoff: 1.4 },
    scene: {
      layers: [{ material: 'rha', thickness: 0.080, slope: 55, height: 1.4, label: 'glacis' }],
      modules: [{ type: 'crew', x: 0.70, y: 0.06, w: 0.32, h: 0.52, label: 'driver' }],
    },
  },
  't34-glacis': {
    name: 'T-34-85 — glacis, 45 mm at 60°',
    note: 'Thin plate carried at extreme obliquity: 90 mm of line of sight from 45 mm of steel, and a strong tendency to deflect. Try lowering the aim height onto the nose plate for the contrast.',
    projectile: { type: 'apcbc', caliber: 0.075, mass: 6.8, velocity: 790, standoff: 1.4 },
    scene: {
      layers: [{ material: 'rha', thickness: 0.045, slope: 60, height: 1.2, label: 'glacis' }],
      modules: [{ type: 'ammo', x: 0.62, y: -0.26, w: 0.32, h: 0.24, label: 'hull ammunition' }],
    },
  },
  'is2-ufp': {
    name: 'IS-2 (1944) — upper front plate, 120 mm at 60°',
    note: '240 mm line of sight from cast and rolled plate. The stepped nose of the earlier hull is not modelled; this is the later straight glacis.',
    projectile: { type: 'apcbc', caliber: 0.088, mass: 10.2, velocity: 1000, standoff: 1.6 },
    scene: {
      layers: [{ material: 'rha', thickness: 0.120, slope: 60, height: 1.4, label: 'upper front plate' }],
      modules: [{ type: 'crew', x: 0.80, y: 0.05, w: 0.32, h: 0.52, label: 'driver' }],
    },
  },
  'sherman-glacis': {
    name: 'M4A3 Sherman — glacis, 63.5 mm at 47°',
    note: 'The late one-piece glacis. Thin by 1944 standards and relying on angle; the modules behind it are placed for the wet-stowage hull.',
    projectile: { type: 'apcbc', caliber: 0.075, mass: 6.8, velocity: 790, standoff: 1.4 },
    scene: {
      layers: [{ material: 'rha', thickness: 0.0635, slope: 47, height: 1.3, label: 'glacis' }],
      modules: [
        { type: 'crew', x: 0.62, y: 0.10, w: 0.30, h: 0.50, label: 'driver' },
        { type: 'ammo', x: 0.88, y: -0.30, w: 0.30, h: 0.22, label: 'wet stowage' },
      ],
    },
  },
  'panzer4-front': {
    name: 'Panzer IV Ausf. H — front plate, 80 mm at 0°',
    note: 'A flat 80 mm slab, the simplest possible target and a useful control: no obliquity, no spacing, nothing to argue about except the plate itself.',
    projectile: { type: 'apcbc', caliber: 0.075, mass: 6.8, velocity: 790, standoff: 1.2 },
    scene: {
      layers: [{ material: 'rha', thickness: 0.080, slope: 0, height: 1.0, label: 'front plate' }],
      modules: [{ type: 'crew', x: 0.50, y: 0.08, w: 0.30, h: 0.50, label: 'driver' }],
    },
  },
  'tiger1-side-skirt': {
    name: 'Tiger I — hull side with schürzen',
    note: 'Thin spaced screen ahead of the 80 mm hull side. Against a full-calibre AP shot the screen does very little; the reason it was fitted was Soviet anti-tank rifles and shaped charges. Try it with HEAT.',
    projectile: { type: 'apcbc', caliber: 0.076, mass: 7.0, velocity: 792, standoff: 1.4 },
    scene: {
      layers: [
        { material: 'mild', thickness: 0.005, slope: 0, height: 0.8, label: 'sch\u00fcrzen' },
        { material: 'rha', thickness: 0.080, slope: 0, gap: 0.42, height: 1.0, label: 'hull side' },
      ],
      modules: [
        { type: 'ammo', x: 1.00, y: -0.05, w: 0.34, h: 0.40, label: 'side stowage' },
        { type: 'engine', x: 1.45, y: -0.05, w: 0.45, h: 0.55 },
      ],
    },
  },
};

export const PRESET_ORDER = [
  'single-plate', 'sloped-glacis', 'spaced-array', 'shatter-gap',
  'ceramic-composite', 'mbt-frontal', 'nera-sandwich', 'hesh-scab', 'aphe-interior',
  'era-light-heat', 'era-heavy-ke', 'era-insensitive', 'dense-metals',
  't55-ufp', 't72-ural-ufp', 't72b-ufp', 't90a-ufp',
  'tiger1-ufp', 'tiger1-nose', 'tiger1-side-skirt', 'tiger2-ufp', 'panther-glacis',
  't34-glacis', 'is2-ufp', 'sherman-glacis', 'panzer4-front',
];
