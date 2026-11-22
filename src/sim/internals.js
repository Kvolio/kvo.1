/**
 * INTERNAL DAMAGE MODEL
 * =====================
 *
 * Components are not meshed. Once something has got through the armour, the
 * question is no longer a continuum-mechanics question — it is an energy and
 * vulnerability question — so components are resolved analytically:
 *
 *   1. the striker must defeat the component casing (plugging-work model,
 *      shared with the fragment transport in fragments.js);
 *   2. the energy that survives is compared with the component's vulnerability
 *      data below;
 *   3. each component's consequence is applied ONCE, the first time its
 *      condition is met, and rolled up into the standard kill categories.
 *
 * TWO KINDS OF THRESHOLD
 * ----------------------
 * A component can be put out of action in two ways, and the old model only
 * had one of them:
 *
 *   - by a single strike above a per-hit threshold (`perHit`). This is how
 *     people and propellant actually fail: one 100 J fragment incapacitates a
 *     crewman, a thousand 1 J fragments do not. The crew threshold is the
 *     classical ~79 J (58 ft-lbf) fragment incapacitation criterion; it is
 *     crude, and it is used here only as a threshold, not as a probability.
 *   - by accumulated damage. Machinery degrades with every strike and stops
 *     when enough of it is wrecked. `tough` is the energy scale for that,
 *     integrity = product over hits of exp(-E/tough).
 *
 * The old model gave crew ONLY the second kind, with a scale of 250 J. A crew
 * position therefore needed roughly a kilojoule in total before it was
 * counted as lost, while the log simultaneously reported "crew casualty" for
 * every 120 J strike - the run said a man was hit thirty times and the verdict
 * said he was fine.
 *
 * KILL CATEGORIES
 * ---------------
 * The usual vulnerability vocabulary:
 *   K  catastrophic   ammunition reaction; the vehicle is lost
 *   F  firepower      gun, sight or fire control out of action
 *   M  mobility       powerpack or transmission out of action
 *   crew casualties   counted per crew position (one crew component = one man)
 *
 * All the numbers are ENGINEERING PLACEHOLDERS, not validated vulnerability
 * data. They are exposed in the UI so the user can see and edit exactly what
 * is driving each verdict. Nothing here is calibrated against live-fire
 * results and it should not be read as if it were.
 */

import { MODULE_TYPES } from './scene.js';
import { SEV } from '../core/events.js';

/**
 * What losing each component means. `at` is the integrity below which the
 * consequence applies; `perHit` (J) applies it outright from a single strike.
 */
export const CONSEQUENCE = {
  crew: { perHit: 80, at: 0.02, kind: 'crew', event: 'crew-casualty', sev: SEV.MAJOR,
    text: (m, h) => `Crew casualty${m.label ? ` (${m.label})` : ''} — ${h.energy.toFixed(0)} J strike from ${h.source}`
      + ` (incapacitation criterion ~80 J per fragment)` },
  ammo: { perHit: 1400, at: 0.3, kind: 'K', event: 'ammo-reaction', sev: SEV.CRITICAL,
    text: () => 'AMMUNITION REACTION — stowed charges initiated by the strike' },
  fuel: { perHit: 2500, at: 0.3, kind: 'fire', event: 'fuel-fire', sev: SEV.MAJOR,
    text: () => 'Fuel cell ruptured — fire likely (diesel is far harder to ignite than petrol)' },
  engine: { at: 0.4, kind: 'M', event: 'mobility-kill', sev: SEV.MAJOR, text: () => 'Powerpack disabled — mobility kill' },
  transmission: { at: 0.4, kind: 'M', event: 'mobility-kill', sev: SEV.MAJOR, text: () => 'Transmission disabled — mobility kill' },
  breech: { at: 0.4, kind: 'F', event: 'firepower-kill', sev: SEV.MAJOR, text: () => 'Gun breech wrecked — firepower kill' },
  optics: { at: 0.3, kind: 'F', event: 'firepower-kill', sev: SEV.MAJOR, text: () => 'Main sight destroyed — firepower kill' },
  electronics: { at: 0.3, kind: 'F', event: 'firepower-kill', sev: SEV.MAJOR, text: () => 'Fire-control electronics destroyed — firepower kill' },
  hydraulics: { at: 0.6, kind: 'F-', event: 'hydraulic-loss', sev: SEV.NOTE,
    text: () => 'Hydraulic line severed — powered turret drive lost, leaking fluid is a fire risk' },
  battery: { at: 0.4, kind: 'power', event: 'power-loss', sev: SEV.NOTE, text: () => 'Batteries wrecked — electrical power degraded' },
};

export class InternalDamage {
  constructor(scene, log, bus) {
    this.scene = scene; this.log = log; this.bus = bus;
    this.events = [];
    this.catastrophic = false;
  }

  reset() {
    this.events.length = 0; this.catastrophic = false;
    this.scene.resetDamage();
  }

  /**
   * Apply a strike to a component.
   * @param {object} m   module
   * @param {object} hit {energy, mass, velocity, source, t, x, y}
   */
  applyHit(m, hit) {
    const spec = MODULE_TYPES[m.type] || MODULE_TYPES.void;
    if (m.type === 'void') return;
    const tough = Math.max(m.tough ?? spec.tough, 1);
    // accumulated damage: repeated small hits add up, a single large hit can
    // destroy outright
    m.integrity = Math.max(0, m.integrity * Math.exp(-hit.energy / tough));
    m.hits.push(hit);
    m.peakHit = Math.max(m.peakHit || 0, hit.energy);

    const c = CONSEQUENCE[m.type];
    const perHit = m.perHit ?? c?.perHit;
    // a single strike over the per-hit threshold takes the component out
    if (perHit && hit.energy >= perHit) m.integrity = Math.min(m.integrity, 0.02);

    const prev = m.state;
    if (m.integrity <= 0.02) m.state = 'destroyed';
    else if (m.integrity < 0.55) m.state = 'damaged';
    else m.state = 'degraded';

    if (m.state !== prev) {
      const sev = m.state === 'destroyed' ? SEV.MAJOR : SEV.NOTE;
      this.log.add(hit.t, `module-${m.state}`,
        `${spec.label}${m.label ? ` (${m.label})` : ''} ${m.state} — ${hit.energy >= 1000 ? `${(hit.energy / 1000).toFixed(1)} kJ` : `${hit.energy.toFixed(0)} J`} from ${hit.source}`,
        sev, { module: m.id });
    }
    this.consequence(m, hit, c);
  }

  /** Apply a component's consequence the first time its condition is met. */
  consequence(m, hit, c) {
    if (!c || m.effect) return;
    if (m.integrity > c.at) return;
    m.effect = c.kind;
    this.events.push({ t: hit.t, module: m.id, kind: c.kind });
    this.log.add(hit.t, c.event, c.text(m, hit), c.sev, { module: m.id });
    if (c.kind === 'K' && !this.catastrophic) {
      this.catastrophic = true;
      this.bus.emit('catastrophic', { module: m, hit });
    }
  }

  summary() {
    const mods = this.scene.modules;
    const out = {
      destroyed: [], damaged: [], catastrophic: this.catastrophic, kill: 'none',
      categories: [], crewHit: 0, crewTotal: 0, fire: false, notes: [],
    };
    for (const m of mods) {
      if (m.state === 'destroyed') out.destroyed.push(m);
      else if (m.state === 'damaged') out.damaged.push(m);
      if (m.type === 'crew') { out.crewTotal++; if (m.effect === 'crew') out.crewHit++; }
      if (m.effect === 'fire') out.fire = true;
    }
    const any = (k) => mods.some((m) => m.effect === k);
    if (this.catastrophic) out.categories.push('K');
    if (any('F')) out.categories.push('F');
    if (any('M')) out.categories.push('M');

    if (this.catastrophic) out.kill = 'catastrophic';
    else if (out.categories.length) {
      out.kill = out.categories.map((k) => ({ F: 'firepower', M: 'mobility' })[k]).join(' + ');
    } else if (out.crewHit) out.kill = out.crewHit === out.crewTotal ? 'crew' : 'partial (crew)';
    else if (out.destroyed.length || out.damaged.length) out.kill = 'partial';

    if (out.crewTotal) out.notes.push(`${out.crewHit} of ${out.crewTotal} crew positions hit`);
    if (out.fire) out.notes.push('fuel fire likely');
    if (any('F-')) out.notes.push('turret drive lost');
    if (any('power')) out.notes.push('electrical power degraded');
    return out;
  }
}
