/**
 * HISTORIC AMMUNITION
 * ===================
 *
 * A catalogue of real tank rounds, WW2 to modern, as projectile configurations.
 * Selecting one replaces the projectile and leaves the armour array alone, so
 * the same target can be shot with a 1942 capped shot and a modern long rod
 * back to back. This is deliberately separate from the scenario presets, which
 * replace the whole scene.
 *
 * WHAT THE NUMBERS ARE
 * --------------------
 * Older entries carry reconstructed configurations. New entries marked
 * `approximate` supply sourced historical names with GENERIC TYPE DEFAULTS,
 * including generic calibre, mass and velocity. Their source metadata does
 * not validate the simulation settings. No classified characteristics are
 * inferred.
 *
 *   - Muzzle velocity is used as the STRIKING velocity. There is no exterior
 *     ballistics here, so every round is being fired at point blank. A round
 *     quoted at 1700 m/s does not arrive at 1700 m/s at 2000 m.
 *   - Sub-calibre rod dimensions (`rodD`, `rodLd`) are rarely published for
 *     anything modern. Where they are not, they are inferred from the quoted
 *     projectile mass and the core material's density at a plausible L/D. They
 *     are consistent with the mass, which is what the simulation actually
 *     integrates, but they are not the real rod.
 *   - Core materials are the usual class for the round's generation - steel,
 *     tungsten carbide, tungsten heavy alloy, depleted uranium - not a
 *     specific alloy specification.
 *
 * So this is a catalogue of plausible reconstructions with correct mass and
 * velocity, not a data table. Penetration figures the simulation produces from
 * them should be read the same way.
 */

/**
 * @typedef {object} AmmoEntry
 * @property {string} name    what to show in the list
 * @property {string} [vehicle] verified vehicle association, when available
 * @property {number} [year] verified year, when available
 * @property {string} type    projectile type key
 * @property {object} cfg     overrides passed to makeProjectileConfig
 * @property {string} [note]  what is interesting about it
 * @property {boolean} [approximate] historical name with generic game settings
 * @property {{title:string,url:string,locator?:string}[]} [sources] identity references, not performance validation
 */

import { PROJECTILE_TYPES } from '../sim/projectileTypes.js';

const SOURCES = {
  armyProduction: {title:'US Army Center of Military History — The Army and Economic Mobilization', url:'https://www.govinfo.gov/content/pkg/GOVPUB-D114-PURL-gpo122003/pdf/GOVPUB-D114-PURL-gpo122003.pdf', locator:'Table PR-8, light field, tank and antitank ammunition'},
  armyDevelopment: {title:'US Army Center of Military History — The Ordnance Department: Planning Munitions for War', url:'https://history.army.mil/portals/143/Images/Publications/catalog/10-9.pdf', locator:'90-mm HVAP M304 standardization'},
  fstc: {title:'US Army Foreign Science and Technology Center — FSTC-CW-07-100-73 (archival scan)', url:'https://www.bulletpicker.com/pdf/FSTC-CW-07-100-73.pdf', locator:'MD-10 entry, p. 2-51: BR-350B, BR-365K and BR-471B'},
  armyArmor: {title:'US Army — ARMOR, March–April 1977', url:'https://mcoecbamcoepwprd01.blob.core.usgovcloudapi.net/library/CavalryArmorJournal/1970s/1977Jan-Dec.pdf', locator:'p. 20: HESH L35 series designation'},
  ukStrategy: {title:'UK Ministry of Defence — Defence Industrial Strategy, Cm 6697 (2005)', url:'https://www.gov.uk/government/uploads/system/uploads/attachment_data/file/272203/6697.pdf', locator:'B6.10: L31A7 HESH designation'},
  italyCatalog: {title:'Italian Ministry of Defence — TER.I-92-00-MATERIALI-001-R002 (2024)', url:'https://www.difesa.it/assets/allegati/57026/ter_i_92_00_materiali_001_r002.pdf', locator:'Annex A, p. 5: 105MM L52 APDST'},
};

function historicalGameEntry(name, type, source, note) {
  return {name,type,approximate:true,cfg:structuredClone(PROJECTILE_TYPES[type].defaults),
    sources:[{...SOURCES[source]}],note};
}

/** Stand-off is a simulation staging distance, not a range. */
const KE = 1.4;      // full-calibre shot: mesh a little before contact
const SAB = 2.4;     // sabot rounds need room to discard first

export const AMMO = {
  // Identity references only. No service dates, vehicle claims or new
  // performance parameters are inferred from a name or nominal calibre.
  'br350b-aphe-game': historicalGameEntry('76 mm BR-350B', 'aphe', 'fstc', 'Historical base-fuzed projectile represented by the generic APHE game model.'),
  'br365k-aphe-game': historicalGameEntry('85 mm BR-365K', 'aphe', 'fstc', 'Historical base-fuzed projectile represented by the generic APHE game model.'),
  'br471b-aphe-game': historicalGameEntry('122 mm BR-471B', 'aphe', 'fstc', 'Historical base-fuzed projectile represented by the generic APHE game model.'),
  'm48-he-game': historicalGameEntry('75 mm M48 HE', 'he', 'armyProduction', 'A WWII catalog name represented by the generic HE game model.'),
  'm42a1-he-game': historicalGameEntry('76 mm M42A1 HE', 'he', 'armyProduction', 'A WWII catalog name represented by the generic HE game model.'),
  'm71-he-game': historicalGameEntry('90 mm M71 HE', 'he', 'armyProduction', 'A WWII catalog name represented by the generic HE game model.'),
  'l35-hesh-game': historicalGameEntry('105 mm L35 HESH', 'hesh', 'armyArmor', 'A Cold War catalog name represented by the generic HESH game model.'),
  'l31a7-hesh-game': historicalGameEntry('120 mm L31A7 HESH', 'hesh', 'ukStrategy', 'A HESH designation documented in the 2005 UK defence strategy; uses the generic HESH game model.'),
  'm72-ap-game': historicalGameEntry('75 mm M72 AP', 'ap', 'armyProduction', 'A WWII catalog name represented by the generic AP game model.'),
  'm51-apc-game': historicalGameEntry('37 mm M51 APC', 'apc', 'armyProduction', 'A WWII catalog name represented by the generic APC game model.'),
  'm304-hvap-game': historicalGameEntry('90 mm M304 HVAP', 'apcr', 'armyDevelopment', 'A historical HVAP designation represented by the generic APCR game model.'),
  'l52-apds-game': historicalGameEntry('105 mm L52 APDS-T', 'apds', 'italyCatalog', 'An APDS catalog designation represented by the generic APDS game model.'),
  // ------------------------------------------------------------ WW2, 1939-45
  'qf2pdr-ap': {
    name: '2-pdr AP shot', vehicle: 'Matilda II / Crusader', year: 1939, type: 'ap',
    cfg: { caliber: 0.040, mass: 1.08, velocity: 792, ld: 3.2, standoff: KE },
    note: 'Uncapped solid shot. Adequate in 1940 and obsolete by 1942; try it against anything face-hardened and watch it shatter.',
  },
  'kwk40-pzgr39': {
    name: '7.5 cm PzGr. 39 (KwK 40)', vehicle: 'Panzer IV Ausf. F2-J', year: 1942, type: 'apcbc',
    cfg: { caliber: 0.075, mass: 6.8, velocity: 790, standoff: KE },
    note: 'Capped, ballistic-capped shot: the standard German medium-velocity AP round of the middle war.',
  },
  'm61-apcbc': {
    name: '75 mm M61 APCBC', vehicle: 'M4 Sherman', year: 1942, type: 'apcbc',
    cfg: { caliber: 0.075, mass: 6.79, velocity: 618, standoff: KE },
    note: 'Low velocity by 1944 standards. The cap is doing a lot of work here — compare with the uncapped 2-pdr on face-hardened plate.',
  },
  'br350a': {
    name: '76 mm BR-350A', vehicle: 'T-34 (F-34 gun)', year: 1941, type: 'apc',
    cfg: { caliber: 0.0762, mass: 6.3, velocity: 655, standoff: KE },
    note: 'Blunt-capped Soviet shot. The blunt nose is why it bites at obliquity where a pointed shot would glance.',
  },
  'kwk36-pzgr39': {
    name: '8.8 cm PzGr. 39 (KwK 36)', vehicle: 'Tiger I', year: 1942, type: 'apcbc',
    cfg: { caliber: 0.088, mass: 10.2, velocity: 773, standoff: KE },
    note: 'The Tiger I round. Heavy, well-capped, and accurate; not especially fast.',
  },
  'kwk42-pzgr39': {
    name: '7.5 cm PzGr. 39/42 (KwK 42)', vehicle: 'Panther', year: 1943, type: 'apcbc',
    cfg: { caliber: 0.075, mass: 6.8, velocity: 935, standoff: KE },
    note: 'Same shell weight as the KwK 40 round, 145 m/s faster. Velocity, not mass, is what made the Panther gun.',
  },
  'br365': {
    name: '85 mm BR-365', vehicle: 'T-34-85 / SU-85', year: 1943, type: 'apcbc',
    cfg: { caliber: 0.085, mass: 9.2, velocity: 792, standoff: KE },
    note: 'The round that let a T-34 fight a Panther frontally, if not comfortably.',
  },
  'm62-apcbc': {
    name: '76 mm M62 APCBC', vehicle: 'M4A3(76)W Sherman', year: 1944, type: 'apcbc',
    cfg: { caliber: 0.076, mass: 7.0, velocity: 792, standoff: KE },
    note: 'The up-gunned Sherman round. Still not enough against a Panther glacis; try it and see.',
  },
  'm93-hvap': {
    name: '76 mm M93 HVAP', vehicle: 'M4A3(76)W Sherman', year: 1944, type: 'apcr',
    cfg: { caliber: 0.076, mass: 4.26, velocity: 1036, standoff: KE },
    note: 'Tungsten-carbide core in a light body. Very fast, very good up close, and it sheds velocity and bites badly at obliquity.',
  },
  '17pdr-apcbc': {
    name: '17-pdr APCBC', vehicle: 'Sherman Firefly / Challenger', year: 1944, type: 'apcbc',
    cfg: { caliber: 0.0765, mass: 7.65, velocity: 884, standoff: KE },
    note: 'The best Allied full-calibre shot of the war.',
  },
  '17pdr-apds': {
    name: '17-pdr APDS', vehicle: 'Sherman Firefly / Challenger', year: 1944, type: 'apds',
    cfg: { caliber: 0.0765, coreD: 0.0305, coreLd: 4.0, mass: 1.90, velocity: 1203, standoff: SAB },
    note: 'The first service discarding-sabot round. Enormous penetration for 1944 and famously inaccurate.',
  },
  'kwk43-pzgr39': {
    name: '8.8 cm PzGr. 39/43 (KwK 43)', vehicle: 'Tiger II / Jagdpanther', year: 1944, type: 'apcbc',
    cfg: { caliber: 0.088, mass: 10.16, velocity: 1000, standoff: KE },
    note: 'The heaviest-hitting full-calibre AP round to see service in the war.',
  },
  'br471': {
    name: '122 mm BR-471', vehicle: 'IS-2', year: 1944, type: 'apcbc',
    cfg: { caliber: 0.122, mass: 25.0, velocity: 795, standoff: 1.8 },
    note: '25 kg of shot. Its virtue is momentum rather than velocity: it defeats armour by breaking it up as much as by piercing it.',
  },

  // -------------------------------------------------------- Cold War, 1950-79
  'br412d': {
    name: '100 mm BR-412D APCBC', vehicle: 'T-54 / T-55', year: 1953, type: 'apcbc',
    cfg: { caliber: 0.100, mass: 15.88, velocity: 895, standoff: 1.6 },
    note: 'The standard Soviet full-calibre AP round of the 1950s and 60s.',
  },
  'l28-apds': {
    name: '105 mm L28 APDS', vehicle: 'Centurion / M60 (L7 gun)', year: 1959, type: 'apds',
    cfg: { caliber: 0.105, coreD: 0.036, coreLd: 4.2, mass: 3.8, velocity: 1478, standoff: SAB },
    note: 'The round the L7 gun was built around, and the reason every Western tank carried that gun for twenty years.',
  },
  '3bm6': {
    name: '115 mm 3BM6 APFSDS', vehicle: 'T-62', year: 1962, type: 'apfsds',
    cfg: { caliber: 0.115, rodD: 0.030, rodLd: 12, mass: 5.5, velocity: 1615, core: 'apsteel', standoff: SAB },
    note: 'The first service fin-stabilised long rod. Steel, short and stubby by modern standards, but it started the line every rod since belongs to.',
  },
  'm456-heat': {
    name: '105 mm M456 HEAT-T', vehicle: 'M60 / Centurion', year: 1962, type: 'heat',
    cfg: { caliber: 0.105, mass: 10.5, velocity: 1173, standoff: 0.8 },
    note: 'Chemical energy, so its penetration barely depends on impact velocity. The counter is spaced or reactive armour, not thicker steel.',
  },
  '3bm15': {
    name: '125 mm 3BM15 APFSDS', vehicle: 'T-72 Ural', year: 1972, type: 'apfsds',
    cfg: { caliber: 0.125, rodD: 0.022, rodLd: 20, mass: 3.9, velocity: 1780, core: 'wha', standoff: SAB },
    note: 'Tungsten-cored rod with a steel body. The armour it was meant to beat is in the T-72 and Chieftain presets.',
  },
  'm735': {
    name: '105 mm M735 APFSDS', vehicle: 'M60A3 / M1 Abrams', year: 1978, type: 'apfsds',
    cfg: { caliber: 0.105, rodD: 0.024, rodLd: 15, mass: 3.7, velocity: 1501, core: 'wha', standoff: SAB },
    note: 'The first US long rod in service, and the round that made the 105 mm gun competitive again.',
  },

  // ----------------------------------------------------------- Modern, 1980-
  'm111-hetz': {
    name: '105 mm M111 Hetz', vehicle: 'Merkava / M60', year: 1979, type: 'apfsds',
    cfg: { caliber: 0.105, rodD: 0.026, rodLd: 13, mass: 3.7, velocity: 1455, core: 'wha', standoff: SAB },
    note: 'The Israeli round whose performance against T-72 glacis prompted the move to the 3BM22 and to reactive armour.',
  },
  'm833': {
    name: '105 mm M833 APFSDS (DU)', vehicle: 'M60A3 / M1', year: 1983, type: 'apfsds',
    cfg: { caliber: 0.105, rodD: 0.023, rodLd: 20, mass: 3.7, velocity: 1494, core: 'du', standoff: SAB },
    note: 'First US depleted-uranium rod. Watch the nose: DU sheds material in shear bands instead of mushrooming, so it stays sharp.',
  },
  '3bm42-mango': {
    name: '125 mm 3BM42 Mango', vehicle: 'T-72B / T-80U / T-90', year: 1986, type: 'apfsds',
    cfg: { caliber: 0.125, rodD: 0.021, rodLd: 22, mass: 4.85, velocity: 1700, core: 'wha', standoff: SAB },
    note: 'Two tungsten slugs in a steel body. Designed for the era when everything it faced had reactive armour on the front.',
  },
  'm829a1': {
    name: '120 mm M829A1 APFSDS (DU)', vehicle: 'M1A1 Abrams', year: 1988, type: 'apfsds',
    cfg: { caliber: 0.120, rodD: 0.027, rodLd: 24, mass: 4.6, velocity: 1575, core: 'du', standoff: SAB },
    note: 'The "silver bullet". A long DU rod at high velocity is the reference threat every modern array is designed against.',
  },
  'dm53': {
    name: '120 mm DM53 APFSDS', vehicle: 'Leopard 2A6 (L55)', year: 2000, type: 'apfsds',
    cfg: { caliber: 0.120, rodD: 0.022, rodLd: 30, mass: 5.0, velocity: 1750, core: 'wha', standoff: SAB },
    note: 'Tungsten rather than uranium, and very long: it makes up in L/D and muzzle velocity what it gives away in density.',
  },
  '3bm46-svinets': {
    name: '125 mm 3BM46 Svinets', vehicle: 'T-80U / T-90A', year: 1991, type: 'apfsds',
    cfg: { caliber: 0.125, rodD: 0.022, rodLd: 27, mass: 4.85, velocity: 1700, core: 'du', standoff: SAB },
    note: 'Longer rod than Mango, uranium core, sized to the full length of the autoloader carousel.',
  },
  'm829a3': {
    name: '120 mm M829A3 APFSDS (DU)', vehicle: 'M1A2 Abrams', year: 2003, type: 'apfsds',
    cfg: { caliber: 0.120, rodD: 0.025, rodLd: 32, mass: 10.0, velocity: 1555, core: 'du', standoff: SAB },
    note: 'Heavier and longer than the A1, and specifically shaped to get through heavy reactive armour before the main array. Try it on the T-90 preset with and without the cassette.',
  },
  'm830a1-heat': {
    name: '120 mm M830A1 HEAT-MP', vehicle: 'M1A1 / M1A2 Abrams', year: 1994, type: 'heat',
    cfg: { caliber: 0.120, mass: 11.4, velocity: 1410, standoff: 0.9 },
    note: 'Multipurpose shaped charge. Against a modern frontal array it is the wrong tool, which is the point of trying it on one.',
  },
};

/** Oldest first: the list reads as a history of the problem. */
export const AMMO_ORDER = Object.keys(AMMO).sort((a, b) =>
  (AMMO[a].year ?? Infinity) - (AMMO[b].year ?? Infinity) || AMMO[a].name.localeCompare(AMMO[b].name));

/** Label for the picker: year, vehicle, round. */
export function ammoLabel(key) {
  const a = AMMO[key];
  if (a.approximate) return `${a.name} — generic ${a.type.toUpperCase()} game approximation`;
  return `${a.year ?? 'Date unverified'}  ${a.vehicle ? `${a.vehicle} — ` : ''}${a.name}`;
}
