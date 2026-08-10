/**
 * FRAME RECORDER
 * ==============
 *
 * Every rendered frame of an event is captured so the run can be scrubbed,
 * stepped forward and stepped backward after the fact. Two tiers:
 *
 *   display frames  - positions, damage, temperature, liveness, fragments.
 *                     Enough to redraw and inspect any frame exactly.
 *   key frames      - full solver state (velocities, bond plastic stretch,
 *                     bond status, counters, energies). Because the solver is
 *                     deterministic, restoring a key frame and re-running
 *                     reproduces the original trajectory bit for bit, so
 *                     "rewind and continue" is exact rather than approximate.
 *
 * Display frames are stored quantised where that costs nothing visually
 * (damage and temperature as bytes) and as Float32 where it does not.
 */

export class Recorder {
  constructor(opts = {}) {
    this.maxFrames = opts.maxFrames ?? 420;
    this.keyEvery = opts.keyEvery ?? 20;
    this.frames = [];
    this.keys = new Map();
    this.cursor = -1;
  }

  clear() { this.frames.length = 0; this.keys.clear(); this.cursor = -1; }

  get length() { return this.frames.length; }

  capture(world) {
    const d = world.domain;
    const f = {
      index: this.frames.length,
      t: world.simTime,
      state: world.state,
      n: d ? d.n : 0,
      px: null, py: null, dmg: null, tmp: null, alv: null,
      frags: world.fragments.list.filter((x) => x.alive).map((x) => [x.x, x.y, x.vx, x.vy, x.mass, x.size, x.kind]),
      proj: world.projectile && world.state === 'flight'
        ? { x: world.projectile.x, y: world.projectile.y, ang: world.projectile.ang, sabot: world.projectile.sabotAttached }
        : null,
      diag: world.snapshotDiagnostics(),
      logLen: world.log.entries.length,
    };
    if (d) {
      const n = d.n;
      f.px = new Float32Array(n); f.py = new Float32Array(n);
      f.dmg = new Uint8Array(n); f.tmp = new Uint8Array(n); f.alv = new Uint8Array(n);
      for (let i = 0; i < n; i++) {
        f.px[i] = d.px[i]; f.py[i] = d.py[i];
        f.dmg[i] = Math.min(255, (d.damage[i] * 255) | 0);
        f.tmp[i] = Math.min(255, ((d.temp[i] - 293) / 8) | 0);
        f.alv[i] = d.alive[i] | (d.flags[i] & 8 ? 2 : 0);
      }
      if (this.frames.length % this.keyEvery === 0) this.captureKey(world, f.index);
    }
    this.frames.push(f);
    if (this.frames.length > this.maxFrames) {
      const drop = this.frames.shift();
      this.keys.delete(drop.index);
      for (const fr of this.frames) fr.index--;
      const remap = new Map();
      for (const [k, v] of this.keys) remap.set(k - 1, v);
      this.keys = remap;
    }
    this.cursor = this.frames.length - 1;
    return f;
  }

  captureKey(world, index) {
    const d = world.domain, s = world.solver;
    this.keys.set(index, {
      px: Float64Array.from(d.px), py: Float64Array.from(d.py),
      vx: Float32Array.from(d.vx), vy: Float32Array.from(d.vy),
      temp: Float32Array.from(d.temp), damage: Float32Array.from(d.damage),
      nBroken: Uint16Array.from(d.nBroken), flags: Uint8Array.from(d.flags),
      alive: Uint8Array.from(d.alive),
      bsp: Float32Array.from(d.bsp), bstate: Uint8Array.from(d.bstate),
      bcrit: Float32Array.from(d.bcrit),
      solver: { time: s.time, steps: s.steps, energy: { ...s.energy }, totalBroken: s.totalBroken },
      simTime: world.simTime,
      fragments: structuredClone(world.fragments.list),
      modules: world.scene.modules.map((m) => ({ id: m.id, integrity: m.integrity, state: m.state, hits: m.hits.length })),
      logLen: world.log.entries.length,
      state: world.state,
    });
  }

  frame(i) { return this.frames[Math.max(0, Math.min(this.frames.length - 1, i))]; }

  /** Nearest key frame index at or before `i`. */
  keyAtOrBefore(i) {
    let best = -1;
    for (const k of this.keys.keys()) if (k <= i && k > best) best = k;
    return best;
  }

  restoreKey(world, index) {
    const k = this.keys.get(index);
    if (!k) return false;
    const d = world.domain, s = world.solver;
    d.px.set(k.px); d.py.set(k.py); d.vx.set(k.vx); d.vy.set(k.vy);
    d.temp.set(k.temp); d.damage.set(k.damage); d.nBroken.set(k.nBroken);
    d.flags.set(k.flags); d.alive.set(k.alive);
    d.bsp.set(k.bsp); d.bstate.set(k.bstate); d.bcrit.set(k.bcrit);
    s.time = k.solver.time; s.steps = k.solver.steps;
    s.energy = { ...k.solver.energy }; s.totalBroken = k.solver.totalBroken;
    world.simTime = k.simTime;
    world.state = k.state;
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

  memoryBytes() {
    let b = 0;
    for (const f of this.frames) if (f.px) b += f.px.byteLength * 2 + f.dmg.byteLength * 3;
    for (const k of this.keys.values()) b += k.px.byteLength * 2 + k.vx.byteLength * 2 + k.bsp.byteLength * 2;
    return b;
  }
}
