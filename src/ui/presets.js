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
};

export const PRESET_ORDER = [
  'single-plate', 'sloped-glacis', 'spaced-array', 'shatter-gap',
  'ceramic-composite', 'mbt-frontal', 'nera-sandwich', 'hesh-scab', 'aphe-interior',
];
