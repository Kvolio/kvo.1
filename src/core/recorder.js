/**
 * FRAME RECORDER
 * ==============
 *
 * Every rendered frame of an event is captured so the run can be scrubbed,
 * stepped forward and stepped backward after the fact. Two tiers:
 *
 *   display frames  - positions and every visualised field, quantised.
 *                     Enough to redraw and inspect any frame exactly.
 *   key frames      - full solver state (velocities, bond plastic stretch,
 *                     bond status, counters, energies). Because the solver is
 *                     deterministic, restoring a key frame and re-running
 *                     reproduces the original trajectory bit for bit, so
 *                     "rewind and continue" is exact rather than approximate.
 *
 * STORAGE
 * -------
 * Both tiers are **ring buffers of preallocated typed arrays**. The earlier
 * implementation allocated five typed arrays per captured frame and, once
 * full, shifted the whole list — around 5 MB/s of garbage at 60 fps with a
 * 6000-node mesh, which on a phone shows up directly as dropped frames during
 * collection. Now the arrays are allocated once when the mesh appears and
 * overwritten in place; a full recording allocates nothing at all.
 *
 * Scalar fields are stored as bytes against fixed normalisation constants
 * (see FIELD_SCALES) so that a scrubbed frame shows the field as it was at
 * that instant rather than as it is now.
 */

import { FIELD_SCALES } from '../render/palette.js';

// A checkpoint must preserve the force left for Verlet's next half kick and
// every accumulator that affects later steps. Recomputing forces on restore
// advances constitutive history and charges dissipation a second time.
const DOMAIN_STATE = ['px','py','vx','vy','fx','fy','temp','wPlast','damage',
  'plStrain','nBroken','flags','alive','role','bsp','bstate','bcrit',
  'flowMul','srate','theta','thetaAcc','virial'];
const SOLVER_ARRAYS = ['bdc','bstretch','bse','isoAcc'];
const SOLVER_STATE = ['time','steps','dt','dtBase','totalBroken','E0','brokenThisStep','maxContactForce'];
const WORLD_STATE = ['simTime','state','contactSeen','trueContactTime',
  'impactStartTime','impactKE0','settleTime','debrisStart','finishReason',
  'lastActivity','progressMark','lastProgressTime','truncationLogged',
  'coastMode','coastDirty','eraLastT','retiredProjM','retiredProjPX','retiredProjPY'];
const PROJECTILE_STATE = ['x','y','ang','omega','vx','vy','mass','inertia','distance',
  'state','sabotAttached','fuzeState','fuzeTimer','detonated','activeParts','residual'];
const FRAGMENT_STATE = ['list','nextId','impacts','stoppedInPlate','stoppedByCasing',
  'perforations','dropped','droppedMass','_loggedLayers'];
const pick = (source, names) => Object.fromEntries(names.map(name => [name, source[name]]));
function copyArrays(source, names, target = {}) {
  for (const name of names) {
    const a = source[name];
    if (!a) continue;
    if (!target[name] || target[name].constructor !== a.constructor || target[name].length !== a.length) target[name] = new a.constructor(a.length);
    target[name].set(a);
  }
  return target;
}
function restoreArrays(target, snapshot) {
  for (const [name, array] of Object.entries(snapshot)) target[name].set(array);
}
function arrayBytes(snapshot) {
  return Object.values(snapshot || {}).reduce((n, a) => n + a.byteLength, 0);
}

function snapshotFragment(f) {
  return [f.x, f.y, f.vx, f.vy, f.mass, f.size, f.kind, f.motionDistance || 0,
    f.appearance ? (Object.isFrozen(f.appearance) ? f.appearance : Object.freeze({ ...f.appearance })) : null];
}

export class Recorder {
  constructor(opts = {}) {
    this.maxFrames = opts.maxFrames ?? 420;
    this.keyEvery = opts.keyEvery ?? 20;
    this.slots = [];
    this.keys = new Map();       // absolute frame id -> key slot
    this.keyPool = [];
    this.baseId = 0;             // absolute id of logical frame 0
    this.count = 0;
    this.head = 0;               // ring index of logical frame 0
    this.nodeCount = -1;
    this.cursor = -1;
  }

  /** Discard everything and release the pools (mesh geometry has changed). */
  clear() {
    this.slots.length = 0;
    this.keys.clear();
    this.keyPool.length = 0;
    this.baseId = 0; this.count = 0; this.head = 0;
    this.nodeCount = -1;
    this.cursor = -1;
  }

  setCapacity(n) {
    if (n === this.maxFrames) return;
    this.maxFrames = Math.max(30, n | 0);
    this.clear();
  }

  get length() { return this.count; }

  ensurePool(n) {
    if (this.nodeCount === n) return;
    // node count changed: the pooled arrays are the wrong size
    this.slots.length = 0; this.keys.clear(); this.keyPool.length = 0;
    this.baseId = 0; this.count = 0; this.head = 0;
    this.nodeCount = n;
  }

  allocSlot(n) {
    return {
      id: -1, t: 0, state: '', n,
      px: new Float32Array(n), py: new Float32Array(n),
      dmg: new Uint8Array(n), tmp: new Uint8Array(n), alv: new Uint8Array(n),
      pls: new Uint8Array(n), vel: new Uint8Array(n), str: new Uint8Array(n),
      frags: [], proj: null, diag: null, logLen: 0,
    };
  }

  capture(world) {
    const d = world.domain;
    if (!d) {
      // pre-impact frames carry only the rigid-body state
      const f = {
        id: this.baseId + this.count, t: world.simTime, state: world.state, n: 0,
        px: null, py: null, dmg: null, tmp: null, alv: null, pls: null, vel: null, str: null,
        frags: world.fragments.list.filter((x) => x.alive)
          .map(snapshotFragment),
        proj: world.projectile
          ? { x: world.projectile.x, y: world.projectile.y, ang: world.projectile.ang, sabot: world.projectile.sabotAttached }
          : null,
        diag: world.snapshotDiagnostics(),
        logLen: world.log.entries.length,
      };
      this.push(f);
      return f;
    }

    const n = d.n;
    this.ensurePool(n);
    const ring = this.count < this.maxFrames
      ? (this.head + this.count) % this.maxFrames
      : this.head;
    while (this.slots.length <= ring) this.slots.push(null);
    if (!this.slots[ring]) this.slots[ring] = this.allocSlot(n);
    const f = this.slots[ring];

    f.id = this.baseId + this.count;
    f.t = world.simTime;
    f.state = world.state;
    f.n = n;
    f.logLen = world.log.entries.length;
    f.diag = world.snapshotDiagnostics();
    f.proj = null;

    const px = f.px, py = f.py, dmg = f.dmg, tmp = f.tmp, alv = f.alv;
    const pls = f.pls, vel = f.vel, str = f.str;
    const S = FIELD_SCALES;
    for (let i = 0; i < n; i++) {
      px[i] = d.px[i]; py[i] = d.py[i];
      const dv = d.damage[i] * 255;
      dmg[i] = dv > 255 ? 255 : dv;
      const tv = (d.temp[i] - 293) / S.tempSpan * 255;
      tmp[i] = tv > 255 ? 255 : tv < 0 ? 0 : tv;
      // bit 2 = free material, bit 4 = ERA detonation products, so a scrubbed
      // frame draws the gas the same way the live view does
      alv[i] = d.alive[i] | (d.flags[i] & 8 ? 2 : 0) | (d.flags[i] & 16 ? 4 : 0);
      const pd = d.matTable[d.matIndex[i]].pd;
      const pv = d.plStrain[i] / Math.max(pd.epsF * 3, 1e-4) * 255;
      pls[i] = pv > 255 ? 255 : pv;
      const sp = Math.sqrt(d.vx[i] * d.vx[i] + d.vy[i] * d.vy[i]) / S.velocity * 255;
      vel[i] = sp > 255 ? 255 : sp;
      const sv = (0.5 + d.virial[i] / (2 * S.stress)) * 255;
      str[i] = sv > 255 ? 255 : sv < 0 ? 0 : sv;
    }

    // fragments are few; a small array per frame is not worth pooling
    const list = world.fragments.list;
    f.frags.length = 0;
    for (let i = 0; i < list.length; i++) {
      const x = list[i];
      if (x.alive) f.frags.push(snapshotFragment(x));
    }

    if (f.id % this.keyEvery === 0) this.captureKey(world, f.id);
    this.push(f, true);
    return f;
  }

  push(f, pooled = false) {
    if (this.count < this.maxFrames) {
      if (!pooled) {
        const ring = (this.head + this.count) % this.maxFrames;
        while (this.slots.length <= ring) this.slots.push(null);
        this.slots[ring] = f;
      }
      this.count++;
    } else {
      // overwrite the oldest slot
      if (!pooled) this.slots[this.head] = f;
      const droppedId = this.baseId;
      this.head = (this.head + 1) % this.maxFrames;
      this.baseId++;
      const k = this.keys.get(droppedId);
      if (k) { this.keys.delete(droppedId); this.keyPool.push(k); }
    }
    this.cursor = this.count - 1;
  }

  captureKey(world, id) {
    const d = world.domain, s = world.solver;
    let k = this.keyPool.pop();
    const maxKeys = Math.ceil(this.maxFrames / this.keyEvery) + 1;
    if (!k && this.keys.size >= maxKeys) {
      const oldest = Math.min(...this.keys.keys());
      k = this.keys.get(oldest);
      this.keys.delete(oldest);
    }
    k ||= {};
    k.domain = copyArrays(d, DOMAIN_STATE, k.domain);
    k.solverArrays = copyArrays(s, SOLVER_ARRAYS, k.solverArrays);
    k.solver = { ...pick(s, SOLVER_STATE), energy: { ...s.energy } };
    k.world = structuredClone(pick(world, WORLD_STATE));
    k.projectile = world.projectile ? structuredClone(pick(world.projectile, PROJECTILE_STATE)) : null;
    k.stats = structuredClone(world.stats);
    k.fragments = structuredClone(pick(world.fragments, FRAGMENT_STATE));
    k.cassettes = structuredClone(world.cassettes || []);
    k.modules = world.scene.modules.map(m => ({ id:m.id, integrity:m.integrity, state:m.state, hits:structuredClone(m.hits) }));
    k.layerHits = world.scene.layers.map(L => L.fragHits);
    k.internals = world.internals ? structuredClone(pick(world.internals, ['events','catastrophic'])) : null;
    k.log = structuredClone({ entries:world.log.entries, seq:world.log.seq });
    this.keys.set(id, k);
  }

  /** Logical index -> stored frame. */
  frame(i) {
    if (this.count === 0) return null;
    const idx = Math.max(0, Math.min(this.count - 1, i | 0));
    return this.slots[(this.head + idx) % this.maxFrames];
  }

  /** Nearest key frame at or before logical index `i`; -1 when none. */
  keyAtOrBefore(i) {
    const target = this.baseId + i;
    let best = -1;
    for (const id of this.keys.keys()) if (id <= target && id > best) best = id;
    return best < 0 ? -1 : best - this.baseId;
  }

  restoreKey(world, logicalIndex) {
    const k = this.keys.get(this.baseId + logicalIndex);
    if (!k) return false;
    const d = world.domain, s = world.solver;
    restoreArrays(d, k.domain);
    restoreArrays(s, k.solverArrays);
    Object.assign(s, k.solver, {energy:{...k.solver.energy}});
    Object.assign(world, structuredClone(k.world));
    if (k.projectile) Object.assign(world.projectile, structuredClone(k.projectile));
    world.stats = structuredClone(k.stats);
    Object.assign(world.fragments, structuredClone(k.fragments));
    for (const f of world.fragments.list) if (f.appearance) Object.freeze(f.appearance);
    world.cassettes = structuredClone(k.cassettes);
    world.scene.layers.forEach((L, i) => { L.fragHits=k.layerHits[i]; });
    if (k.internals) Object.assign(world.internals, structuredClone(k.internals));
    for (const rec of k.modules) {
      const m = world.scene.modules.find((x) => x.id === rec.id);
      if (m) { m.integrity = rec.integrity; m.state = rec.state; m.hits = structuredClone(rec.hits); }
    }
    Object.assign(world.log, structuredClone(k.log));
    world._penMass0Domain = null;
    world.pendingSteps = 0;
    s.refreshContactSet();
    return true;
  }

  /** Drop every frame after `logicalIndex` (used when resuming from a scrub). */
  truncate(logicalIndex) {
    if (logicalIndex < -1) return;
    this.count = Math.min(this.count, logicalIndex + 1);
    for (const id of [...this.keys.keys()]) {
      if (id > this.baseId + logicalIndex) { this.keyPool.push(this.keys.get(id)); this.keys.delete(id); }
    }
    this.cursor = this.count - 1;
  }

  memoryBytes() {
    let b = 0;
    for (const f of this.slots) {
      if (!f || !f.px) continue;
      b += f.px.byteLength * 2 + f.dmg.byteLength * 6;
    }
    for (const k of [...this.keys.values(), ...this.keyPool]) b += arrayBytes(k.domain) + arrayBytes(k.solverArrays);
    return b;
  }
}
