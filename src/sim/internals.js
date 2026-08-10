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
 *   2. the energy that survives is compared with a component toughness scale;
 *   3. component-specific consequences are applied.
 *
 * The toughness scales are *engineering placeholders*, not validated
 * vulnerability data. They are exposed in the UI so the user can see and edit
 * exactly what is driving each verdict. Nothing here is calibrated against
 * live-fire results and it should not be read as if it were.
 */

import { MODULE_TYPES } from './scene.js';
import { SEV } from '../core/events.js';

export class InternalDamage {
  constructor(scene, log, bus) {
    this.scene = scene; this.log = log; this.bus = bus;
    this.events = [];
    this.catastrophic = false;
  }

  reset() { this.events.length = 0; this.catastrophic = false; this.scene.resetDamage(); }

  /**
   * Apply a strike to a component.
   * @param {object} m   module
   * @param {object} hit {energy, mass, velocity, source, t, x, y}
   */
  applyHit(m, hit) {
    const spec = MODULE_TYPES[m.type] || MODULE_TYPES.void;
    if (m.type === 'void') return;
    const tough = (m.tough ?? spec.tough) * 1;
    // fractional damage saturates: repeated small hits accumulate, a single
    // large hit can destroy outright
    const frac = 1 - Math.exp(-hit.energy / Math.max(tough, 1));
    m.integrity = Math.max(0, m.integrity - frac);
    m.hits.push(hit);

    const prev = m.state;
    if (m.integrity <= 0.02) m.state = 'destroyed';
    else if (m.integrity < 0.55) m.state = 'damaged';
    else m.state = 'degraded';

    if (m.state !== prev) {
      const sev = m.state === 'destroyed' ? SEV.MAJOR : SEV.NOTE;
      this.log.add(hit.t, `module-${m.state}`,
        `${spec.label}${m.label ? ` (${m.label})` : ''} ${m.state} — ${(hit.energy / 1000).toFixed(1)} kJ from ${hit.source}`,
        sev, { module: m.id });
    }

    this.consequence(m, hit, spec);
  }

  consequence(m, hit, spec) {
    switch (m.type) {
      case 'ammo': {
        // Propellant/charge reaction threshold. Bulk energy density delivered
        // to the stowage is the driver; a hot fragment is worse than a cold one.
        const thresh = 1400;
        if (hit.energy > thresh && m.integrity < 0.6 && !this.catastrophic) {
          this.catastrophic = true;
          this.log.add(hit.t, 'ammo-reaction',
            'AMMUNITION REACTION — stowed charges initiated by the strike', SEV.CRITICAL, { module: m.id });
          this.bus.emit('catastrophic', { module: m, hit });
        }
        break;
      }
      case 'fuel':
        if (hit.energy > 2500 && m.integrity < 0.7) {
          this.log.add(hit.t, 'fuel-fire', 'Fuel cell ruptured — ignition likely', SEV.MAJOR, { module: m.id });
        }
        break;
      case 'crew':
        if (hit.energy > 120) {
          this.log.add(hit.t, 'crew-casualty',
            `Crew position struck — ${(hit.energy).toFixed(0)} J delivered (incapacitation threshold ~80-150 J)`,
            SEV.MAJOR, { module: m.id });
        }
        break;
      case 'engine':
      case 'transmission':
        if (m.integrity < 0.4) this.log.add(hit.t, 'mobility-kill', `${spec.label} disabled — mobility kill`, SEV.MAJOR, { module: m.id });
        break;
      case 'hydraulics':
        if (m.integrity < 0.6) this.log.add(hit.t, 'hydraulic-loss', 'Hydraulic line severed — turret drive lost', SEV.NOTE, { module: m.id });
        break;
      default: break;
    }
  }

  summary() {
    const out = { destroyed: [], damaged: [], catastrophic: this.catastrophic, kill: 'none' };
    for (const m of this.scene.modules) {
      if (m.state === 'destroyed') out.destroyed.push(m);
      else if (m.state === 'damaged') out.damaged.push(m);
    }
    const has = (t, states) => this.scene.modules.some((m) => m.type === t && states.includes(m.state));
    if (this.catastrophic) out.kill = 'catastrophic';
    else if (has('crew', ['destroyed'])) out.kill = 'firepower / crew';
    else if (has('engine', ['destroyed']) || has('transmission', ['destroyed'])) out.kill = 'mobility';
    else if (out.destroyed.length || out.damaged.length) out.kill = 'partial';
    return out;
  }
}
