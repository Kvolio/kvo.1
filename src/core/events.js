/**
 * Minimal event bus + a timestamped simulation event log.
 *
 * The log is the audit trail of the run: every physically meaningful
 * transition (first contact, bond-failure onset, back-face rupture, sabot
 * discard, fuze arming, detonation, module hit, ...) is recorded with the
 * simulation time and the state that produced it. It is the primary object
 * the post-impact report is built from.
 */

export class Bus {
  constructor() { this.map = new Map(); }
  on(type, fn) {
    if (!this.map.has(type)) this.map.set(type, new Set());
    this.map.get(type).add(fn);
    return () => this.off(type, fn);
  }
  off(type, fn) { const s = this.map.get(type); if (s) s.delete(fn); }
  emit(type, payload) {
    const s = this.map.get(type);
    if (s) for (const fn of s) fn(payload);
    const a = this.map.get('*');
    if (a) for (const fn of a) fn({ type, payload });
  }
}

export const SEV = { INFO: 0, NOTE: 1, MAJOR: 2, CRITICAL: 3 };

export class EventLog {
  constructor() { this.entries = []; this.seq = 0; }
  clear() { this.entries.length = 0; this.seq = 0; }
  add(t, type, text, severity = SEV.INFO, data = null) {
    const e = { id: this.seq++, t, type, text, severity, data };
    this.entries.push(e);
    return e;
  }
  /** Only add once per type (used for one-shot transitions). */
  addOnce(t, type, text, severity = SEV.INFO, data = null) {
    if (this.entries.some((e) => e.type === type)) return null;
    return this.add(t, type, text, severity, data);
  }
  has(type) { return this.entries.some((e) => e.type === type); }
  get(type) { return this.entries.find((e) => e.type === type) || null; }
  since(t) { return this.entries.filter((e) => e.t >= t); }
}
