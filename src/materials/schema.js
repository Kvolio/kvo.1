/**
 * MATERIAL SCHEMA AND TAXONOMY
 * ============================
 *
 * Every material in the library is a record built by `mat()`. The property
 * names and units are documented in database.js; this file owns the things
 * that are about ORGANISING the library:
 *
 *   group   which family the material belongs to (one of GROUPS below). The
 *           UI headings, the ordering of the pick-list and the family tables
 *           in the docs all come from this one field.
 *   uses    what the material is for in the simulator: 'armour' (can be a plate
 *           layer), 'penetrator' (can be a projectile core), 'cap', 'body',
 *           'shell', 'sabot', 'liner', 'casing', 'filler'.
 *   grade   how well the numbers are pinned down:
 *             A  taken from a manufacturer datasheet or a published standard
 *             B  handbook / open-literature typical value for the named alloy
 *                or ceramic (these agree to ~10-15 % between sources)
 *             C  class-representative figure: the material is a family with a
 *                wide spread (laminates, elastomers, cores, cast products), so
 *                the numbers sit inside the range rather than on a datum
 *   refs    the sources behind the numbers, plain strings
 *
 * `grade` is shown next to the material in the UI. It is not a quality mark
 * for the material, it is a statement about the data.
 */

export const GROUPS = [
  { id: 'steel-rha',      label: 'Steel — rolled and cast armour' },
  { id: 'steel-hard',     label: 'Steel — high- and ultra-hard armour plate' },
  { id: 'steel-graded',   label: 'Steel — face-hardened and dual-hardness plate' },
  { id: 'steel-naval',    label: 'Steel — naval, structural and stainless' },
  { id: 'steel-special',  label: 'Steel — ordnance, maraging and penetrator steels' },
  { id: 'aluminium',      label: 'Aluminium alloys' },
  { id: 'magnesium',      label: 'Magnesium alloys' },
  { id: 'titanium',       label: 'Titanium alloys' },
  { id: 'dense',          label: 'Dense and refractory metals' },
  { id: 'copper-nickel',  label: 'Copper, lead and nickel superalloys' },
  { id: 'ceramic-oxide',  label: 'Ceramics — oxides' },
  { id: 'ceramic-nonox',  label: 'Ceramics — carbides, borides, nitrides' },
  { id: 'glass',          label: 'Glass and transparent ceramics' },
  { id: 'fibre',          label: 'Fibre composites' },
  { id: 'laminate',       label: 'Laminates and spall liners' },
  { id: 'core',           label: 'Cores and honeycombs' },
  { id: 'elastomer',      label: 'Elastomers and damping layers' },
  { id: 'plastic',        label: 'Rigid plastics' },
  { id: 'civil',          label: 'Concrete' },
  { id: 'filler',         label: 'Fillers (explosive)' },
];

export const GROUP_ORDER = Object.fromEntries(GROUPS.map((g, i) => [g.id, i]));
export const GROUP_LABEL = Object.fromEntries(GROUPS.map((g) => [g.id, g.label]));

export const GRADE_TEXT = {
  A: 'datasheet / standard',
  B: 'handbook typical',
  C: 'class-representative',
};

/** Build a material record with defaults for everything a source may omit. */
export function mat(o) {
  const m = Object.assign({
    key: '', name: '', class: 'metal', group: 'steel-naval',
    uses: ['armour'], grade: 'B', refs: [],
    rho: 7850, E: 210e9, nu: 0.29,
    Y: 1.0e9, UTS: 1.15e9, epsF: 0.18, G0: 48e3,
    BHN: 300, jcC: 0.014, Tm: 1800, cp: 477, jcM: 1.03,
    brittle: 0.0, weibull: 22, compFail: false,
    erosionResist: 1.0,
    color: '#8a94a6', color2: '#5a6272',
    source: '', notes: '',
  }, o);
  // `source` is the single string older code and the docs read
  if (!m.source && m.refs.length) m.source = m.refs.join('; ');
  return m;
}
