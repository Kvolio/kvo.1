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
          .map((x) => [x.x, x.y, x.vx, x.vy, x.mass, x.size, x.kind]),
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
      alv[i] = d.alive[i] | (d.flags[i] & 8 ? 2 : 0);
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
      if (x.alive) f.frags.push([x.x, x.y, x.vx, x.vy, x.mass, x.size, x.kind]);
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
    if (!k || k.px.length !== d.n || k.bsp.length !== d.nb) {
      k = {
        px: new Float64Array(d.n), py: new Float64Array(d.n),
        vx: new Float32Array(d.n), vy: new Float32Array(d.n),
        temp: new Float32Array(d.n), damage: new Float32Array(d.n),
        plStrain: new Float32Array(d.n),
        nBroken: new Uint16Array(d.n), flags: new Uint8Array(d.n), alive: new Uint8Array(d.n),
        bsp: new Float32Array(d.nb), bstate: new Uint8Array(d.nb), bcrit: new Float32Array(d.nb),
        solver: {}, modules: [],
      };
    }
    k.px.set(d.px); k.py.set(d.py); k.vx.set(d.vx); k.vy.set(d.vy);
    k.temp.set(d.temp); k.damage.set(d.damage); k.plStrain.set(d.plStrain);
    k.nBroken.set(d.nBroken); k.flags.set(d.flags); k.alive.set(d.alive);
    k.bsp.set(d.bsp); k.bstate.set(d.bstate); k.bcrit.set(d.bcrit);
    k.solver = { time: s.time, steps: s.steps, energy: { ...s.energy }, totalBroken: s.totalBroken, E0: s.E0 };
    k.simTime = world.simTime;
    k.state = world.state;
    k.contactSeen = world.contactSeen;
    k.trueContactTime = world.trueContactTime;
    k.stats = JSON.parse(JSON.stringify(world.stats));
    k.fragments = structuredClone(world.fragments.list);
    k.modules = world.scene.modules.map((m) => ({ id: m.id, integrity: m.integrity, state: m.state, hits: m.hits.length }));
    k.logLen = world.log.entries.length;
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
    d.px.set(k.px); d.py.set(k.py); d.vx.set(k.vx); d.vy.set(k.vy);
    d.temp.set(k.temp); d.damage.set(k.damage); d.plStrain.set(k.plStrain);
    d.nBroken.set(k.nBroken); d.flags.set(k.flags); d.alive.set(k.alive);
    d.bsp.set(k.bsp); d.bstate.set(k.bstate); d.bcrit.set(k.bcrit);
    s.time = k.solver.time; s.steps = k.solver.steps;
    s.energy = { ...k.solver.energy }; s.totalBroken = k.solver.totalBroken; s.E0 = k.solver.E0;
    world.simTime = k.simTime;
    world.state = k.state;
    world.contactSeen = k.contactSeen;
    world.trueContactTime = k.trueContactTime;
    Object.assign(world.stats, k.stats);
    world.fragments.list = structuredClone(k.fragments);
    for (const rec of k.modules) {
      const m = world.scene.modules.find((x) => x.id === rec.id);
      if (m) { m.integrity = rec.integrity; m.state = rec.state; m.hits.length = Math.min(m.hits.length, rec.hits); }
    }
    world.log.entries.length = k.logLen;
    s.refreshContactSet();
    s.computeForces();
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
    for (const k of this.keys.values()) {
      b += k.px.byteLength * 2 + k.vx.byteLength * 4 + k.bsp.byteLength * 2 + k.bstate.byteLength;
    }
    for (const k of this.keyPool) b += k.px.byteLength * 2 + k.bsp.byteLength * 2;
    return b;
  }
}
