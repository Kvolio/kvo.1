/**
 * WORLD — SIMULATION ORCHESTRATION
 * ================================
 *
 * Owns the regimes and the handovers between them. There is exactly one
 * source of truth for the state of the shot at any moment, and the renderer
 * only ever reads it.
 *
 *   idle    nothing loaded / not fired
 *   flight  rigid-body ballistic flight (large time step)
 *   impact  peridynamic continuum (time step ~1e-7 s, CFL limited)
 *   coast   inside the impact regime: nothing is in contact and the armour is
 *           quiet, so the remaining bodies are advanced ballistically in big
 *           steps until something is about to touch again
 *   settle  the event is over; residual elastic energy is bled off so the
 *           permanent deformed shape is what remains
 *   done    final state, fully inspectable
 *
 * Per frame:
 *   1. read the requested amount of simulated time (real dt x time scale)
 *   2. advance the active regime in stable sub-steps
 *   3. run fuzes / detonations / sabot discard as they fall due
 *   4. promote peridynamic material that has left the meshed corridor into
 *      the ballistic fragment system
 *   5. resolve fragments and the residual penetrator against components
 *   6. record the frame
 *
 * The renderer is called afterwards by the app loop and never writes state.
 */

import { PDDomain, ROLE } from './pd/domain.js';
import { PDSolver } from './pd/solver.js';
import { Scene, modulePoly } from './scene.js';
import { Projectile } from './projectile.js';
import { makeProjectileConfig, PROJECTILE_TYPES } from './projectileTypes.js';
import { FragmentSystem } from './fragments.js';
import { InternalDamage } from './internals.js';
import { detonate, logDetonation } from './explosive.js';
import { buildCassettes, stepCassettes, logCassetteEvents } from './era.js';
import { Bus, EventLog, SEV } from '../core/events.js';
import { Recorder } from '../core/recorder.js';
import { getMaterial } from '../materials/database.js';
import { clamp, pointInPoly, distToPolyEdge, normalize } from '../core/math.js';
import { analyticPanel } from './analytics.js';

/**
 * Discretisation presets. `budget` is the node count the mesher aims for,
 * `across` the target number of nodes across the penetrator, `mRatio` the
 * horizon/spacing ratio (a larger horizon is more accurate peridynamics but
 * costs O(m^2) bonds), `substeps` the CFL steps evaluated per rendered frame.
 */
/**
 * Fraction of the original penetrator mass that has to reach a plane before
 * that plane counts as "reached". Used identically by the depth measure and
 * the perforation test so the two cannot contradict each other.
 */
const PEN_FRACTION = 0.01;
// Nodes a layer needs through its thickness before it behaves as a layer rather
// than as a line of loosely connected points. Three is the minimum at which a
// plate has an inside.
const MIN_NODES_THROUGH_LAYER = 3;

export const QUALITY = {
  low: { budget: 3200, across: 8, mRatio: 2.415, substeps: 3, label: 'Low — fastest' },
  normal: { budget: 6000, across: 11, mRatio: 2.715, substeps: 4, label: 'Normal' },
  high: { budget: 11000, across: 15, mRatio: 3.015, substeps: 5, label: 'High' },
  ultra: { budget: 18000, across: 19, mRatio: 3.015, substeps: 6, label: 'Ultra — slowest' },
};

export class World {
  constructor() {
    this.bus = new Bus();
    this.log = new EventLog();
    this.scene = new Scene();
    this.scene.casingMat = getMaterial('boxsteel');
    this.fragments = new FragmentSystem(this.bus, this.log);
    this.internals = new InternalDamage(this.scene, this.log, this.bus);
    this.recorder = new Recorder();
    this.projectile = null;
    this.domain = null;
    this.solver = null;

    this.settings = {
      quality: 'normal',
      timeScale: 1 / 4000,
      impactTimeScale: 1 / 60000,
      autoSlow: true,
      recordFrames: true,
      seed: 20260810,
      maxEventTime: 6e-4,       // hard bound on the resolved continuum window
      corridorScale: 1.0,       // width multiplier for the deformable corridor
      deterministic: false,     // fixed sub-steps: reproducible, not adaptive
      eraEfficiency: 0.45,      // Gurney sandwich efficiency for ERA (see sim/era.js)
      recordedFrames: 600,      // frames kept for scrubbing; see fire()
    };

    this.state = 'idle';
    this.simTime = 0;
    this.paused = false;
    this.pendingSteps = 0;
    this.stats = this.blankStats();
    this.perf = {
      stepsLastFrame: 0, msLastFrame: 0, coast: false, substeps: 4, avgMs: 0,
      impactMs: 0, impactFrames: 0, impactSubsteps: 0,
    };
    this.impactStartTime = 0;
    this.setProjectile(makeProjectileConfig('apcbc'));
  }

  blankStats() {
    return {
      penetration: 0, maxDepth: 0, maxDepthLOS: 0, armourDefeated: 0, channelLength: 0,
      residualMass: 0, residualVelocity: 0, residualLength: 0,
      erodedMass: 0, spallMass: 0, fragmentCount: 0,
      perforated: false, ricochet: false, embedded: false,
      backfaceBulge: 0, craterDiameter: 0, craterDepth: 0,
      brokenBonds: 0, contactTime: 0, truncated: false,
    };
  }

  // ---------------------------------------------------------------- config

  setProjectile(cfg) {
    this.projectileCfg = cfg;
    this.projectile = new Projectile(cfg);
    this.reset();
    return this;
  }

  setScene(scene) {
    this.scene = scene;
    this.scene.casingMat = getMaterial('boxsteel');
    this.internals = new InternalDamage(this.scene, this.log, this.bus);
    this.fragments = new FragmentSystem(this.bus, this.log);
    this.reset();
    return this;
  }

  reset() {
    this.state = 'idle';
    this.simTime = 0;
    this.domain = null;
    this.solver = null;
    this.log.clear();
    this.fragments.clear();
    this.internals.reset();
    this.recorder.clear();
    this.stats = this.blankStats();
    this.residual = null;
    this.impactStartTime = 0;
    this.settleTime = 0;
    this.cassettes = [];
    this.eraLastT = 0;
    this.retiredProjM = 0; this.retiredProjPX = 0; this.retiredProjPY = 0;
    if (this.projectile) this.projectile.reset();
    for (const L of this.scene.layers) { L.fragHits = 0; }
    this.bus.emit('reset');
    return this;
  }

  /** Bytes of frame buffer per recorded frame at the current discretisation. */
  bytesPerFrame() { return QUALITY[this.settings.quality].budget * 14; }

  /**
   * Frames the recorder will actually keep: what was asked for, clipped to a
   * memory ceiling that follows the device tier. The UI reads this so the
   * number on screen is the number in use.
   */
  frameCapacity() {
    const cap = { high: 340e6, balanced: 220e6, fallback: 110e6 }[
      this.governor ? this.governor.spec.key : 'balanced'] || 220e6;
    const want = this.settings.recordedFrames ?? 600;
    return clamp(Math.round(want), 60, Math.max(60, Math.floor(cap / this.bytesPerFrame())));
  }

  fire() {
    // Re-tier from what the previous run actually cost. The node budget cannot
    // change mid-impact, so this is the one safe moment to revise it.
    if (this.governor && !this.settings.deterministic && this.perf.impactFrames > 40) {
      const mean = this.perf.impactMs / this.perf.impactFrames;
      const meanSteps = this.perf.impactSubsteps / this.perf.impactFrames;
      const moved = this.governor.reviewAfterRun(mean, meanSteps, QUALITY[this.settings.quality].substeps);
      if (moved) {
        this.settings.quality = this.governor.spec.quality;
        this.settings.deviceTier = moved;
        this.bus.emit('tier-changed', { tier: moved, meanSolverMs: mean });
      }
    }
    this.perf.impactMs = 0; this.perf.impactFrames = 0; this.perf.impactSubsteps = 0;
    // FRAME RECORDER CAPACITY
    // The user asks for a frame count; memory sets the ceiling. Each frame
    // costs 14 bytes per node (two float32 positions plus six byte fields), so
    // the affordable count falls as the discretisation rises. Rather than
    // silently pick a number, the requested count is honoured up to a hard
    // memory ceiling and the resulting figure is reported in the Simulation
    // panel next to the estimate, so a phone that cannot hold 2000 frames of
    // an ultra mesh says so instead of quietly recording 600.
    this.recorder.setCapacity(this.frameCapacity());
    this.reset();
    this.state = 'flight';
    this.paused = false;
    this.log.add(0, 'fire',
      `FIRE — ${this.projectile.type.name} at ${this.projectile.speed.toFixed(0)} m/s, ` +
      `${(this.projectile.mass * 1000).toFixed(0)} g, ${(this.projectile.ke / 1e6).toFixed(2)} MJ`,
      SEV.MAJOR, this.projectile.describe());
    this.analytics = analyticPanel({ projectile: this.projectile, scene: this.scene, rha: getMaterial('rha') });
    this.bus.emit('fired');
    return this;
  }

  // ---------------------------------------------------------------- update

  /** @param {number} realDt seconds of wall-clock time since the last frame */
  update(realDt) {
    const t0 = performance.now();
    this.perf.stepsLastFrame = 0;
    if (this.state === 'idle' || this.state === 'done') { this.perf.msLastFrame = 0; return; }

    let budgetSteps = 0;
    if (this.paused) {
      if (this.pendingSteps <= 0) { this.perf.msLastFrame = 0; return; }
      budgetSteps = this.pendingSteps;
      this.pendingSteps = 0;
    }

    const q = QUALITY[this.settings.quality];
    const scale = (this.settings.autoSlow && (this.state === 'impact' || this.state === 'settle'))
      ? this.settings.impactTimeScale : this.settings.timeScale;
    let want = clamp(realDt, 0, 0.05) * scale;

    if (this.state === 'flight') {
      // THE APPROACH IS NOT WHERE THE INFORMATION IS.
      //
      // Free flight is a rigid body on a straight line - exactly integrable,
      // and nothing about the outcome depends on how finely it is resolved.
      // Resolving it at the ordinary time scale means a HEAT round, whose
      // defaults are a 1.8 m standoff at 300 m/s, spends 6 ms of SIMULATED
      // time getting to the plate. At 1/4000 that is roughly 1400 frames, or
      // about 24 SECONDS of real time watching a stationary picture before
      // anything happens at all. Fire a cassette scenario and it is
      // indistinguishable from "the ERA does nothing".
      //
      // So the step is scaled to the distance left to run: the approach takes
      // about the same short wall-clock time whatever the standoff and muzzle
      // velocity. `flightPhase` still sub-steps at a fixed 1.5 mm of travel,
      // so the trajectory, the sabot discard point and the moment of contact
      // are bit-for-bit what they were - only the number of frames spent
      // getting there changes.
      const pf = this.projectile;
      const [ux, uy] = normalize(pf.vx, pf.vy);
      const hit = this.scene.raycast(pf.x, pf.y, ux, uy, 60)[0];
      if (hit) {
        const frames = Math.max(1, this.settings.approachFrames ?? 40);
        want = Math.max(want, (hit.t / Math.max(pf.speed, 1)) / frames);
      }
      this.flightPhase(want);
    } else if (this.state === 'impact' || this.state === 'settle') {
      const maxSteps = this.paused ? budgetSteps : this.adaptiveSubsteps(q);
      this.impactPhase(want, maxSteps);
    }

    this.perf.msLastFrame = performance.now() - t0;
    this.perf.avgMs = this.perf.avgMs * 0.85 + this.perf.msLastFrame * 0.15;
    if (this.state === 'impact') {
      this.perf.impactMs += this.perf.msLastFrame;
      this.perf.impactSubsteps += this.perf.stepsLastFrame;
      this.perf.impactFrames++;
    }
    if (this.settings.recordFrames && this.domain) this.recorder.capture(this);
    else if (this.settings.recordFrames) this.recorder.capture(this);
  }

  /**
   * Keep the frame inside its budget. The number of CFL sub-steps per rendered
   * frame is the only free variable that trades wall-clock smoothness against
   * how fast the event plays out; the physics per step is unchanged either way.
   */
  adaptiveSubsteps(q) {
    // DETERMINISM. The sub-step count below is chosen from measured wall-clock
    // time, which means the same scenario advances a different amount of
    // simulated time on a fast machine than on a slow one - identical runs were
    // measured ending at 2501, 2505 and 2504 us and giving different surviving
    // masses. That is fine for an interactive frame budget and fatal for
    // anything that has to reproduce: a regression check, a replay, a
    // comparison between two configurations. Setting `deterministic` fixes the
    // count so a run depends only on its inputs.
    if (this.settings.deterministic) return q.substeps;
    const ms = this.perf.avgMs;
    let n = this.perf.substeps || q.substeps;
    // The thresholds are deliberately loose. Trimming sub-steps aggressively
    // keeps the frame rate high but stretches a 350 us event over a minute of
    // wall time, which is worse than running at 40 fps. Prefer a slightly
    // lower frame rate over a crawling event.
    if (ms > 22 && n > 1) n -= 1;
    else if (ms < 12 && n < q.substeps) n += 1;
    this.perf.substeps = clamp(n, 1, q.substeps);
    return this.perf.substeps;
  }

  /** Ask for N solver sub-steps on the next update while paused. */
  requestSteps(n) { this.pendingSteps = n; }

  // ---------------------------------------------------------------- flight

  flightPhase(wantDt) {
    const p = this.projectile;
    let remaining = wantDt;
    let guard = 0;
    while (remaining > 1e-12 && guard++ < 400) {
      const v = Math.max(p.speed, 1);
      const dt = Math.min(remaining, 0.0015 / v);
      p.step(dt);
      this.simTime += dt;
      remaining -= dt;

      const petals = p.tryDiscardSabot();
      if (petals) {
        for (const q of petals) this.fragments.add({ ...q, bornAt: this.simTime, source: 'sabot' });
        this.log.add(this.simTime, 'sabot-discard',
          `Sabot discarded at ${p.distance.toFixed(2)} m — ${(p.mass * 1000).toFixed(0)} g penetrator continues`,
          SEV.NOTE);
      }

      // approach test against the meshable target
      const [dx, dy] = normalize(p.vx, p.vy);
      const hits = this.scene.raycast(p.x, p.y, dx, dy, 60);
      if (hits.length === 0) {
        if (p.x > this.scene.depth + 1.0 || Math.abs(p.y) > 6) {
          this.log.add(this.simTime, 'miss', 'Projectile passed the target array without contact', SEV.NOTE);
          this.finish('miss');
          return;
        }
      } else if (hits[0].t < Math.max(0.02, this.projectile.geom.penDiameter * 1.2)) {
        this.beginImpact(hits);
        return;
      }
      this.fragments.step(dt, this.scene, this.simTime, this.internals);
    }
  }

  // ---------------------------------------------------------------- meshing

  meshPlan() {
    const p = this.projectile;
    const q = QUALITY[this.settings.quality];
    const chemical = p.type.family === 'chemical';
    const cal = p.cfg.caliber ?? p.geom.refDiameter;
    let refD, corridorCal;
    if (chemical) {
      refD = cal / (p.cfg.type === 'heat' ? 6 : 5.5);
      corridorCal = p.cfg.type === 'heat' ? 1.35 : 1.7;
    } else {
      refD = p.geom.penDiameter;
      corridorCal = 5.5;
    }
    const dx0 = refD / q.across;
    // The corridor is the deformable region. Everything outside it is drawn as
    // static geometry and enters only through the boundary treatment, so
    // widening it enlarges the part of the plate that can actually crater,
    // crack and spall. At a fixed node budget a wider corridor means a coarser
    // lattice, which is the trade the user is making with this control.
    const width = Math.max(corridorCal * (chemical ? cal : refD), 0.95 * this.scene.losTotal, 0.05)
      * (this.settings.corridorScale ?? 1);
    return { dx0, refD, width, chemical, budget: q.budget, mRatio: q.mRatio };
  }

  beginImpact(hits) {
    const p = this.projectile;
    const plan = this.meshPlan();
    const [dirx, diry] = normalize(p.vx, p.vy);

    // corridor extent: from behind the tail to past the last thing it can reach
    const back = p.geom.length + 6 * plan.dx0;
    const deepest = Math.max(
      hits[hits.length - 1].tExit,
      ...this.scene.modules.map((m) => Math.hypot(m.x - p.x, m.y - p.y) + Math.max(m.w, m.h)),
      0.05,
    );
    const originX = p.x - dirx * back;
    const originY = p.y - diry * back;
    const length = back + deepest + 0.10;

    // Tune the lattice spacing to *use* the particle budget: the finer the
    // lattice the more of the crater, channel and spall structure is resolved,
    // so we refine until we are just inside the budget rather than settling
    // for whatever the nominal spacing gives.
    const target = plan.budget * 0.82;
    const dxMin = Math.max(0.0004, plan.dx0 * 0.28);
    // THIN LAYERS SET THE COARSE BOUND TOO
    // The lattice used to be sized from the penetrator and the node budget
    // alone. An array containing a thin layer - an ERA cassette's 3 mm plates,
    // a stand-off screen - was then meshed at a spacing coarser than the layer
    // itself: measured at 0.7 nodes through an ERA plate, which is not a plate
    // at all. It cannot erode a jet, it can only be pushed aside, and a live
    // cassette came out WORSE than an inert one because detonation cleared the
    // charge from the jet's path without the plates ever doing any work.
    // A layer needs a few nodes through it before it behaves like one.
    let thinnest = Infinity;
    for (const L of this.scene.activeLayers()) if (L.thickness < thinnest) thinnest = L.thickness;
    const dxThin = isFinite(thinnest) ? thinnest / MIN_NODES_THROUGH_LAYER : Infinity;
    // the coarse bound follows the mesh reference diameter, not the nominal
    // penetrator: for a shaped charge the "penetrator" is the jet, which is far
    // too fine to be the thing that limits how coarse the lattice may go
    const dxMax = Math.min(0.030, dxThin, Math.max(plan.refD / 3, plan.dx0 * 2.5));
    let dx = clamp(plan.dx0, dxMin, dxMax);
    let width = plan.width;
    // Below this the corridor stops being a corridor: it has to hold the
    // channel, the crater lip and enough plate either side of them to react.
    // Trading width for resolution is bounded - narrowing without limit would
    // clip the array rather than resolve it.
    const widthFloor = Math.max(0.55 * plan.width, 4 * plan.refD, 0.05);
    let dom = null, count = 0;
    for (let attempt = 0; attempt < 7; attempt++) {
      dom = this.assembleDomain({ dx, width, length, originX, originY, dirx, diry, mRatio: plan.mRatio });
      count = dom.countSites();
      const ratio = count / target;
      if (ratio > 1.0) {
        dx = clamp(dx * Math.sqrt(ratio) * 1.02, dxMin, dxMax);
      } else if (ratio < 0.62 && dx > dxMin * 1.02) {
        dx = clamp(dx * Math.sqrt(Math.max(ratio, 0.2)), dxMin, dxMax);
      } else break;
    }
    // Hard enforcement: the budget is what keeps the frame inside its time box.
    // Narrow the corridor before coarsening the lattice. Meshing 300 mm of
    // plate that mostly sits still is worth less than resolving the few
    // millimetres that are actually doing the work, and coarsening first is
    // what produced the sub-lattice ERA plates described above.
    let guard = 0;
    while (count > plan.budget && guard++ < 16) {
      if (width > widthFloor * 1.02) width = Math.max(widthFloor, width * 0.88);
      else dx = Math.min(0.030, dx * 1.14);
      dom = this.assembleDomain({ dx, width, length, originX, originY, dirx, diry, mRatio: plan.mRatio });
      count = dom.countSites();
    }
    plan.width = width;
    dom.build();
    dom.applyLateralBC((x, y) => !!this.scene.isSolid(x, y));

    this.domain = dom;
    this.solver = new PDSolver(dom);
    this.cassettes = buildCassettes(this.scene, dom);
    this.eraLastT = this.simTime;
    this.state = 'impact';
    this.impactStartTime = this.simTime;
    this.impactKE0 = this.solver.kinetic();
    this.projectile.state = 'meshed';
    this.coastMode = false;
    this.contactSeen = false;
    this.progressMark = 0;
    this.lastProgressTime = null;
    this.truncationLogged = false;

    // record what was actually meshed so the user can audit the discretisation
    this.meshInfo = {
      particles: dom.n, bonds: dom.nb, dx, delta: dom.delta, slab: dom.slab,
      width: plan.width, length, dt: this.solver.dt,
      acrossPenetrator: p.geom.penDiameter / dx,
      throughThickness: this.scene.activeLayers().map((L) => L.thickness / dx),
    };
    this.log.add(this.simTime, 'mesh',
      `Continuum domain built — ${dom.n} nodes, ${dom.nb} bonds, dx = ${(dx * 1000).toFixed(2)} mm, ` +
      `dt = ${(this.solver.dt * 1e9).toFixed(0)} ns`, SEV.INFO, this.meshInfo);
    // A layer thinner than a couple of lattice spacings is not being simulated
    // as a layer, and anything that depends on it behaving like one - an ERA
    // cassette's plates above all - will be wrong. Say so rather than quietly
    // producing a number.
    const through = this.meshInfo.throughThickness;
    let worst = Infinity, worstIdx = -1;
    through.forEach((t, i) => { if (t < worst) { worst = t; worstIdx = i; } });
    this.meshInfo.minNodesThroughLayer = worst;
    if (worstIdx >= 0 && worst < 2) {
      const L = this.scene.activeLayers()[worstIdx];
      this.log.add(this.simTime, 'under-resolved',
        `${L.label || L.mat.name} is ${(L.thickness * 1000).toFixed(1)} mm against a `
        + `${(dx * 1000).toFixed(2)} mm lattice — ${worst.toFixed(1)} nodes through it. `
        + `A layer this thin cannot behave as a plate: raise Discretisation or narrow the `
        + `deformable zone before trusting anything that depends on it.`, SEV.WARN);
    }
    this.log.add(this.simTime, 'contact', 'Continuum phase armed — projectile within a few lattice spacings', SEV.NOTE);
    this.bus.emit('impact-begin', {
      // a sensible viewing scale: about a dozen calibres across the frame
      span: Math.max(this.projectile.geom.penDiameter * 14, this.scene.losTotal * 3.2, plan.width * 0.55),
      x: p.x, y: p.y,
    });
  }

  assembleDomain({ dx, width, length, originX, originY, dirx, diry, mRatio }) {
    const p = this.projectile;
    const dom = new PDDomain({
      dx, mRatio, slab: p.slab, origin: [originX, originY], dir: [dirx, diry],
      length, width, seed: this.settings.seed,
    });

    // --- projectile parts (filler/cavity first so it wins the point test) --
    let bodyId = 1;
    const parts = p.meshParts();
    const heatLinerOnly = p.cfg.type === 'heat';
    for (const part of parts) {
      if (heatLinerOnly && part.role !== 2) continue;
      if (heatLinerOnly && !/liner/.test(part.label)) continue;
      dom.addSolid({
        poly: p.worldPoly(part.poly),
        material: part.mat,
        bodyId: bodyId++,
        bondGroup: 1000,
        role: part.role === 1 ? ROLE.PENETRATOR : part.role === 3 ? ROLE.FILLER : ROLE.PROJ_AUX,
        vel: [p.vx, p.vy],
        scale: part.scale,
        label: part.label,
        partRef: part,
      });
    }

    // --- armour layers ----------------------------------------------------
    let group = 1;
    this.scene.activeLayers().forEach((L, idx) => {
      const prevBonded = L.bonded && idx > 0;
      const g = prevBonded ? group : ++group;
      const n = L.normal, front = L.frontX;
      dom.addSolid({
        poly: L.poly, material: L.mat, bodyId: 100 + idx, bondGroup: g,
        role: ROLE.ARMOUR, layerIdx: idx, label: L.label || L.mat.name,
        gradientAxis: (x, y) => ((x - front) * n[0] + y * n[1]) / L.thickness,
      });
    });
    return dom;
  }

  // ---------------------------------------------------------------- impact

  impactPhase(wantDt, maxSteps) {
    const s = this.solver, d = this.domain;
    let advanced = 0;
    let steps = 0;
    const wantSteps = this.paused ? maxSteps : clamp(Math.round(wantDt / s.dt), 0, maxSteps);

    while (steps < Math.max(1, wantSteps)) {
      const dtc = this.maybeCoast();
      if (dtc > 0) {
        advanced += dtc;
        this.simTime += dtc;
      } else {
        if (this.coastDirty) {
          // positions jumped during coasting; the stored forces are stale
          s.refreshContactSet();
          s.computeForces();
          this.coastDirty = false;
          this.coastMode = false;
        }
        s.step();
        advanced += s.dt;
        this.simTime += s.dt;
      }
      steps++;
      // ERA initiation is an integral over the shock, and a shock transit
      // through a 6 mm charge lasts under a microsecond, so it is sampled
      // twice as often as the fuze check to avoid stepping over the peak.
      if (steps % 2 === 0) this.stepEra();
      if (steps % 4 === 0) this.checkFuze();
    }
    this.perf.stepsLastFrame = steps;
    this.checkFuze();
    this.stepEra();
    this.checkModuleStrikes();
    this.promoteEscapees();
    this.fragments.step(advanced, this.scene, this.simTime, this.internals);
    this.updateStats();

    // settle / finish detection - only once the projectile has actually
    // touched something, otherwise the approach across the standoff gap would
    // read as "quiet" and end the run before the impact
    if (s.maxContactForce > 0 || s.brokenThisStep > 0) {
      if (!this.contactSeen) {
        this.contactSeen = true;
        this.trueContactTime = this.simTime;
        // record where contact actually happened, from the leading node
        let bx = 0, by = 0, bs = -Infinity;
        for (let i = 0; i < d.n; i++) {
          if (!d.alive[i] || d.role[i] === ROLE.ARMOUR) continue;
          const sPos = (d.px[i] - d.ox) * d.ax + (d.py[i] - d.oy) * d.ay;
          if (sPos > bs) { bs = sPos; bx = d.px[i]; by = d.py[i]; }
        }
        this.stats.impactX = bx; this.stats.impactY = by;
        this.log.add(this.simTime, 'first-contact',
          `Nose contact with the struck face at (${(bx * 1000).toFixed(0)}, ${(by * 1000).toFixed(0)}) mm`, SEV.MAJOR);
      }
      this.lastActivity = this.simTime;
    }
    const armourKE = s.kineticOf(ROLE.ARMOUR);
    const quiet = this.contactSeen && s.maxContactForce === 0 && s.brokenThisStep === 0
      && (this.simTime - (this.lastActivity ?? 0)) > 4e-6;
    // WHEN THE RESOLVED WINDOW CLOSES
    //
    // This used to be a fixed clock: `elapsed > maxEventTime` and the run was
    // over. Measurement showed that cap was ending essentially EVERY run - a
    // 120 mm long rod fired at 600 mm of RHA was cut off 400 mm in, still
    // travelling at about 1000 m/s, and reported as "did not perforate,
    // residual 1000 m/s". That is not a result, it is a stopwatch expiring
    // mid-event, and it reads exactly like a round that never slows down.
    //
    // Penetration time scales with depth: a rod eating through half a metre
    // of steel at a penetration velocity of order 1 km/s genuinely needs
    // milliseconds. So the window now closes when the PHYSICS is finished:
    //
    //   - the penetrator has stopped making progress into the array for a
    //     sustained period (it is stopped, deflected, or fully consumed), or
    //   - it has left the back of the array and is no longer in contact.
    //
    // `maxEventTime` is kept only as the minimum window, so short events still
    // get their full resolved period. A separate, much larger backstop bounds
    // pathological runs - and when THAT one fires the result is explicitly
    // flagged as truncated rather than reported as though the round stopped.
    const elapsed = this.simTime - (this.trueContactTime ?? this.simTime);
    const minWindow = this.settings.maxEventTime ?? 3.5e-4;

    // "Progress" is penetration into the armour, not flight: armourDefeated is
    // bounded by the plate, so it stops growing the moment the round is
    // through or stalled, whereas depth keeps counting as debris flies on.
    const prog = this.stats.armourDefeated || 0;
    if (prog > (this.progressMark ?? 0) + d.dx * 0.5) {
      this.progressMark = prog;
      this.lastProgressTime = this.simTime;
    }
    const sinceProgress = this.simTime - (this.lastProgressTime ?? this.trueContactTime ?? this.simTime);
    const stalled = this.contactSeen && sinceProgress > (this.settings.stallTime ?? 8e-5);

    const hardCap = this.settings.maxEventTimeHard ?? 6e-3;
    const truncated = this.contactSeen && elapsed > hardCap;
    if (truncated && !this.truncationLogged) {
      this.truncationLogged = true;
      this.stats.truncated = true;
      this.log.add(this.simTime, 'truncated',
        `Resolved window hit its ${(hardCap * 1e3).toFixed(1)} ms backstop with the round still `
        + `making progress — the reported depth and residual velocity are a LOWER BOUND, `
        + `not a final state`, SEV.WARN);
    }
    const overrun = this.contactSeen && ((stalled && elapsed > minWindow) || truncated);
    // A meshed shot that never touches anything - it missed inside the
    // corridor, or the remnant left without contacting a later layer - would
    // otherwise sit in the impact regime forever with nothing to resolve.
    if (!this.contactSeen && this.simTime - this.impactStartTime > 3e-3) {
      this.log.add(this.simTime, 'no-contact',
        'Projectile left the meshed corridor without contacting the array', SEV.NOTE);
      this.finish('miss');
      return;
    }
    if (this.state === 'impact' && (overrun || (quiet && armourKE < Math.max(this.impactKE0 * 0.004, 1)))) {
      this.state = 'settle';
      this.settleTime = this.simTime;
      this.log.add(this.simTime, 'settle', 'Contact phase complete — residual state settling', SEV.NOTE);
    }
    if (this.state === 'settle') {
      // bleed residual elastic ringing so the permanent set is what remains
      for (let i = 0; i < d.n; i++) {
        if (!d.alive[i]) continue;
        const sp = Math.hypot(d.vx[i], d.vy[i]);
        if (sp < 120) { d.vx[i] *= 0.90; d.vy[i] *= 0.90; }
      }
      if (this.simTime - this.settleTime > 4e-5 && this.fragments.liveCount === 0) this.finish('settled');
      else if (this.simTime - this.settleTime > 1.2e-4) this.finish('settled');
    }
  }

  /**
   * COAST FAST-FORWARD
   * ------------------
   * Crossing a standoff gap or an air gap in a spaced array is pure free
   * flight: no contact, no bond activity, plate quiet. Resolving that at the
   * CFL step would burn thousands of steps on nothing. When the *smallest*
   * clearance between any moving node and any solid is comfortably larger
   * than the lattice spacing, the moving material is advanced ballistically
   * by a step sized so it cannot cross that clearance. As soon as the gap
   * closes to a few lattice spacings, coasting stops and every step is
   * resolved again.
   *
   * @returns {number} simulated seconds advanced, or 0 if the caller must
   *                   take a normal solver step instead.
   */
  maybeCoast() {
    const s = this.solver, d = this.domain;
    if (this.state === 'settle' || this.contactSeen) return 0;
    if (s.maxContactForce > 0 || s.brokenThisStep > 0) return 0;

    let vmax = 0, armKE = 0;
    for (let i = 0; i < d.n; i++) {
      if (!d.alive[i]) continue;
      const v2 = d.vx[i] * d.vx[i] + d.vy[i] * d.vy[i];
      if (d.role[i] === ROLE.ARMOUR) { armKE += 0.5 * d.mass[i] * v2; continue; }
      if (v2 > vmax) vmax = v2;
    }
    vmax = Math.sqrt(vmax);
    if (vmax < 50) return 0;
    if (armKE > Math.max(this.impactKE0 * 0.004, 2)) return 0;

    // smallest gap between any moving node and any solid surface
    let clearance = 0.8;
    const layers = this.scene.activeLayers();
    for (let i = 0; i < d.n && clearance > 0; i++) {
      if (!d.alive[i] || d.role[i] === ROLE.ARMOUR) continue;
      if (d.vx[i] * d.vx[i] + d.vy[i] * d.vy[i] < 2500) continue;
      for (const L of layers) {
        if (pointInPoly(L.poly, d.px[i], d.py[i])) return 0;
        const dd = distToPolyEdge(L.poly, d.px[i], d.py[i]);
        if (dd < clearance) clearance = dd;
      }
    }
    for (const m of this.scene.modules) {
      if (m.type !== 'void') clearance = Math.min(clearance, Math.max(m.w, m.h) * 0.5);
    }
    // too close to be worth it: resolve properly
    if (clearance < d.dx * 4) { this.coastMode = false; return 0; }

    const dt = clamp(0.35 * clearance / vmax, s.dt, s.dt * 500);
    for (let i = 0; i < d.n; i++) {
      if (!d.alive[i]) continue;
      if (d.vx[i] * d.vx[i] + d.vy[i] * d.vy[i] < 400) continue;
      d.px[i] += d.vx[i] * dt;
      d.py[i] += d.vy[i] * dt;
    }
    s.time += dt;
    this.coastMode = true;
    this.coastDirty = true;
    return dt;
  }

  // ------------------------------------------------------- event hooks

  checkFuze() {
    const p = this.projectile;
    const fz = p.type.fuze;
    if (!fz || p.detonated) return;
    if (p.fuzeState === 'safe') {
      p.fuzeState = 'armed';
      p.fuzeTimer = this.simTime;
      this.log.add(this.simTime, 'fuze-arm',
        `Fuze armed on impact setback (${fz.kind}, ${(this.projectile.cfg.fuzeDelay ?? fz.delay) * 1e6} µs delay)`, SEV.NOTE);
      if (p.cfg.type === 'heat') this.formJet();
      return;
    }
    if (p.fuzeState !== 'armed') return;
    const delay = this.projectile.cfg.fuzeDelay ?? fz.delay;
    if (this.simTime - p.fuzeTimer < delay) return;
    this.detonateShell();
  }

  /**
   * Advance every ERA cassette. Called on the same cadence as the fuze check:
   * initiation is a P^2*tau integral, so it only needs to see the stress state
   * a few times per shock transit, not every step.
   */
  stepEra() {
    if (!this.cassettes || !this.cassettes.length || !this.domain) return;
    const dt = this.simTime - this.eraLastT;
    if (dt <= 0) return;
    this.eraLastT = this.simTime;
    const ev = stepCassettes(this.cassettes, this.domain, this.simTime, dt,
      this.settings.eraEfficiency ?? 0.45);
    if (!ev.length) return;
    logCassetteEvents(this.log, this.simTime, ev);
    for (const e of ev) {
      if (e.kind === 'era-initiate') this.bus.emit('era-initiate', e.cassette);
    }
  }

  detonateShell() {
    const p = this.projectile, d = this.domain;
    p.detonated = true;
    p.fuzeState = 'functioned';
    // charge mass and Gurney velocity come from the filler material record
    const fillerKey = p.cfg.filler || 'compb';
    const fm = getMaterial(fillerKey);
    let cm = 0, cx = 0, cy = 0, cn = 0;
    for (let i = 0; i < d.n; i++) {
      if (!d.alive[i] || d.role[i] !== ROLE.FILLER) continue;
      cm += d.mass[i]; cx += d.px[i]; cy += d.py[i]; cn++;
    }
    if (cn === 0) {
      this.log.add(this.simTime, 'fuze-dud',
        'Fuze functioned but the filler had already been consumed or dispersed — no coherent detonation',
        SEV.NOTE);
      return;
    }
    cx /= cn; cy /= cn;
    const keBefore = this.solver.kinetic();
    const radius = Math.sqrt(cn) * d.dx * 0.6;
    const info = detonate(d, {
      cx, cy, chargeMass: cm, gurneyVel: fm.gurney || 2400, radius,
      geometry: p.cfg.type === 'hesh' ? 'sandwich' : 'cylindrical',
    });
    info.chargeMass = cm; info.x = cx; info.y = cy;
    // The burst injects chemical energy the audit baseline knows nothing about.
    // Fold the delivered kinetic energy into E0 so the closure figure keeps
    // meaning something after a detonation.
    this.solver.E0 += Math.max(0, this.solver.kinetic() - keBefore);
    info.deliveredKE = this.solver.kinetic() - keBefore;
    logDetonation(this.log, this.simTime, p.type.name, info);
    this.stats.detonation = info;
    this.bus.emit('detonation', info);
  }

  /**
   * HEAT: impose the collapse outcome on the liner. The liner particles are
   * given an inward-radial collapse component plus the axial velocity gradient
   * predicted by the PER collapse model, and the peridynamic solver takes it
   * from there — the jet forms, stretches, and (at long standoff) particulates
   * on its own. Liner collapse itself is NOT simulated; see MODEL.md §5.3.
   */
  formJet() {
    const p = this.projectile, d = this.domain;
    const j = p.type.jet;
    const tip = p.cfg.jetTip ?? j.tip, tail = p.cfg.jetTail ?? j.tail;
    const [ax, ay] = normalize(p.vx, p.vy);
    const bx = -ay, by = ax;
    // apex position along the axis
    let sMin = Infinity, sMax = -Infinity;
    const idx = [];
    for (let i = 0; i < d.n; i++) {
      if (!d.alive[i] || d.role[i] !== ROLE.PROJ_AUX) continue;
      idx.push(i);
      const s = (d.px[i] - p.x) * ax + (d.py[i] - p.y) * ay;
      if (s < sMin) sMin = s;
      if (s > sMax) sMax = s;
    }
    if (!idx.length) return;
    const keBefore = this.solver.kinetic();
    const span = Math.max(sMax - sMin, 1e-4);
    for (const i of idx) {
      const s = (d.px[i] - p.x) * ax + (d.py[i] - p.y) * ay;
      const u = (d.px[i] - p.x) * bx + (d.py[i] - p.y) * by;
      const f = clamp((s - sMin) / span, 0, 1);     // 1 = apex end (jet tip)
      const vAx = tail + (tip - tail) * f;
      const collapse = 1800;                        // radial collapse velocity
      d.vx[i] = ax * vAx - Math.sign(u) * bx * collapse * clamp(Math.abs(u) / (span * 0.5), 0, 1);
      d.vy[i] = ay * vAx - Math.sign(u) * by * collapse * clamp(Math.abs(u) / (span * 0.5), 0, 1);
      d.role[i] = ROLE.PENETRATOR;
    }
    this.solver.E0 += Math.max(0, this.solver.kinetic() - keBefore);
    // the liner has just become the penetrator; the cached initial penetrator
    // mass was measured before that and is now stale
    this._penMass0Domain = null;
    this.log.add(this.simTime, 'jet-formed',
      `Shaped-charge liner collapsed — imposed jet gradient ${tail.toFixed(0)}-${tip.toFixed(0)} m/s over ${(span * 1000).toFixed(0)} mm`,
      SEV.MAJOR);
  }

  /** Fast peridynamic material striking an internal component. */
  checkModuleStrikes() {
    const d = this.domain;
    if (!d || !this.scene.modules.length) return;
    for (const m of this.scene.modules) {
      if (m.type === 'void') continue;
      const poly = modulePoly(m);
      for (let i = 0; i < d.n; i++) {
        if (!d.alive[i]) continue;
        const v2 = d.vx[i] * d.vx[i] + d.vy[i] * d.vy[i];
        if (v2 < 2500) continue;
        if (!pointInPoly(poly, d.px[i], d.py[i])) continue;
        const e = 0.5 * d.mass[i] * v2;
        this.internals.applyHit(m, {
          energy: e, mass: d.mass[i], velocity: Math.sqrt(v2),
          source: d.role[i] === ROLE.PENETRATOR ? 'penetrator' : 'fragment',
          t: this.simTime, x: d.px[i], y: d.py[i],
        });
        // the strike is spent on the component
        d.vx[i] *= 0.25; d.vy[i] *= 0.25;
      }
    }
  }

  /**
   * Material that has left the meshed corridor is promoted to a ballistic
   * fragment. It keeps its mass, velocity and energy; the continuum solver
   * has nothing left to say about it.
   */
  promoteEscapees() {
    const d = this.domain;
    const halfW = d.width * 0.5 - d.dx;
    for (let i = 0; i < d.n; i++) {
      if (!d.alive[i]) continue;
      const dx = d.px[i] - d.ox, dy = d.py[i] - d.oy;
      const s = dx * d.ax + dy * d.ay;
      const u = dx * d.bx + dy * d.by;
      if (s > -d.dx && s < d.length + d.dx && Math.abs(u) < halfW) continue;
      const v = Math.hypot(d.vx[i], d.vy[i]);
      // slow debris and, past a cap, the long tail of small fragments are
      // retired rather than transported: they carry negligible energy and the
      // ballistic layer stays cheap. Their mass is still accounted for.
      if (v < 12 || this.fragments.count >= 1400) {
        d.alive[i] = 0;
        this.stats.retiredMass = (this.stats.retiredMass || 0) + d.mass[i];
        this.stats.retiredCount = (this.stats.retiredCount || 0) + 1;
        // Keep its momentum on the books if it was part of the projectile.
        // Dropping a slow piece silently RAISES the reported remnant speed,
        // which is one of the ways the round appears to accelerate.
        if (d.role[i] !== ROLE.ARMOUR && d.role[i] !== ROLE.MODULE) {
          this.retiredProjM = (this.retiredProjM || 0) + d.mass[i];
          this.retiredProjPX = (this.retiredProjPX || 0) + d.vx[i] * d.mass[i];
          this.retiredProjPY = (this.retiredProjPY || 0) + d.vy[i] * d.mass[i];
        }
        continue;
      }
      this.fragments.add({
        x: d.px[i], y: d.py[i], vx: d.vx[i], vy: d.vy[i],
        mass: d.mass[i], size: d.dx * 1.1,
        kind: d.role[i] === ROLE.PENETRATOR ? 'penetrator' : d.role[i] === ROLE.ARMOUR ? 'spall' : 'casing',
        matKey: d.matTable[d.matIndex[i]].mat.key,
        bornAt: this.simTime,
        source: d.role[i] === ROLE.ARMOUR ? 'armour' : 'projectile',
      });
      d.alive[i] = 0;
    }
  }

  // ---------------------------------------------------------------- stats

  updateStats() {
    const d = this.domain, st = this.stats;
    if (!d) return;
    const layers = this.scene.activeLayers();
    const first = layers[0];
    if (!first) return;

    // DEPTH FRAMES
    // Two different measures get confused very easily, so they are kept
    // explicitly apart here:
    //   normal depth  - distance through the plate along its own normal. This
    //                   is "how much plate thickness has been defeated", and it
    //                   is what the perforation test must use.
    //   line of sight - distance along the shot line. On a plate sloped at
    //                   theta this is longer by 1/cos(theta): a 120 mm plate at
    //                   60 deg is 240 mm of LOS.
    // Comparing a normal depth against an LOS thickness under-reports
    // perforation by exactly that factor, and pins the back-face bulge test at
    // a threshold the plate can never reach.
    const n0 = first.normal;
    const fx = first.frontX;
    const last = layers[layers.length - 1];
    const nL = last.normal, fxL = last.frontX;
    const tL = last.thickness;              // NORMAL thickness of the last layer
    const ix = st.impactX ?? fx, iy = st.impactY ?? 0;
    const ax = d.ax, ay = d.ay;             // shot direction
    const channelHalfWidth = this.projectile.geom.penDiameter * 0.9;
    const channelRadius = this.projectile.geom.penDiameter * 2.0;

    // DEPTH AS A MASS PERCENTILE, NOT A SINGLE DEEPEST NODE
    // The tip of a comminuted penetrator is a cloud, and its foremost node is
    // noise. Depth is therefore the deepest plane that at least PEN_FRACTION of
    // the original penetrator mass has reached, accumulated from the deep end
    // of a histogram. Perforation uses the same measure in the last layer's
    // frame, so "depth exceeds the plate" and "perforated" can no longer
    // disagree - they are the same number read against the same threshold.
    const NB = 256, NL = 64;
    if (!this._histA) { this._histA = new Float32Array(NB); this._histB = new Float32Array(NB); }
    const histA = this._histA, histB = this._histB;
    histA.fill(0); histB.fill(0);

    // PER-LAYER PENETRATION
    // Depth measured from the struck face counts air gaps: a round that has
    // crossed a 300 mm stand-off in a spaced array reads as "300 mm of
    // penetration" while having defeated 10 mm of plate. What the user wants
    // is armour defeated, so each layer keeps its own histogram and the totals
    // are summed with the gaps excluded.
    if (!this._histL || this._histL.length < layers.length) {
      this._histL = layers.map(() => new Float32Array(NL));
      this._pastL = new Float32Array(layers.length);
    }
    const histL = this._histL, pastL = this._pastL;
    for (let k = 0; k < layers.length; k++) { histL[k].fill(0); pastL[k] = 0; }
    const aLo = -0.03, aHi = this.scene.normalTotal + 0.20;
    const bLo = -0.05, bHi = tL + 0.20;
    const aStep = (aHi - aLo) / NB, bStep = (bHi - bLo) / NB;

    // WHICH LAYER IS THE BULGE MEASURED ON
    // The last layer in the array is not necessarily the one being deformed.
    // A round that stops in the front plate of a two-plate array leaves that
    // plate visibly dished while the rear plate is untouched, and measuring
    // the bulge on the rear plate reported 0 um for an obvious bulge. The
    // bulge belongs to the deepest layer the penetrator has actually entered.
    let bulgeIdx = 0;
    for (let i = 0; i < d.n; i++) {
      if (!d.alive[i] || d.role[i] !== ROLE.PENETRATOR) continue;
      for (let k = layers.length - 1; k > bulgeIdx; k--) {
        const Lk = layers[k];
        if ((d.px[i] - Lk.frontX) * Lk.normal[0] + d.py[i] * Lk.normal[1] > 0) { bulgeIdx = k; break; }
      }
    }
    const Lb = layers[bulgeIdx];
    const nB = Lb.normal, fxB = Lb.frontX, tB = Lb.thickness;

    let deepest = -Infinity, deepestLast = -Infinity, deepestLos = -Infinity;
    let penMass = 0;
    let chanMass = 0, chanKE = 0, chanVX = 0, chanVY = 0, massThrough = 0;
    let sMin = Infinity, sMax = -Infinity, uMin = Infinity, uMax = -Infinity;
    let spall = 0, freeCount = 0, hot = 293, coherent = 0, attached = 0;
    // RESIDUAL VELOCITY IS THE REMNANT'S, NOT THE CORE'S
    // A capped shot is not one body: the core, the cap and the windscreen
    // exchange momentum through elastic waves for as long as they stay in
    // contact. Quoting the core's own centre-of-mass velocity therefore shows
    // it OSCILLATING - it was measured swinging 877 -> 874.4 -> 875.7 m/s
    // while the assembly as a whole decelerated smoothly from 854 to 821 -
    // and a round crossing a stand-off gap appears to speed up. Nothing is
    // gaining energy; momentum is sloshing between parts that are still
    // touching. The reported figure is the whole coherent remnant, which is
    // also what "residual velocity" means in the literature: the mass that
    // emerges, not one component of it.
    let remM = 0, remVX = 0, remVY = 0;
    let bulge = 0;

    for (let i = 0; i < d.n; i++) {
      if (!d.alive[i]) continue;
      if (d.temp[i] > hot) hot = d.temp[i];
      // PENETRATOR ACCOUNTING
      // Comminuted material has not gone anywhere: a shattered carbide core is
      // still 1.8 kg of dense debris inside the cavity, still being driven
      // forward, still doing work through contact. Counting only *attached*
      // nodes reports a fully comminuted penetrator as "0 mg at 0 m/s", which
      // is not what the solver computed. So the primary figures cover every
      // penetrator node still in the domain, and coherence is reported beside
      // them rather than instead of them.
      if (d.role[i] === ROLE.PENETRATOR) {
        const m = d.mass[i];
        penMass += m;
        if (!(d.flags[i] & 8)) attached += m;
        if (d.damage[i] < 0.5) coherent += m;

        // DEPTH IS A PROPERTY OF THE CHANNEL, NOT OF THE DEBRIS CLOUD.
        // A comminuted penetrator throws material sideways and backwards along
        // the struck face in wide fans. Taking the deepest node over all of it
        // lets one ejected fragment define the penetration depth. Only material
        // still inside the channel - within a couple of penetrator diameters of
        // the shot axis - counts towards depth, velocity and perforation.
        const lat = Math.abs((d.px[i] - d.ox) * d.bx + (d.py[i] - d.oy) * d.by);
        if (lat > channelRadius) continue;
        // material spraying back out of the crater is ejecta, not penetration
        if (d.vx[i] * ax + d.vy[i] * ay < -50) continue;

        chanMass += m;
        chanVX += d.vx[i] * m; chanVY += d.vy[i] * m;
        chanKE += 0.5 * m * (d.vx[i] * d.vx[i] + d.vy[i] * d.vy[i]);
        const depth = (d.px[i] - fx) * n0[0] + d.py[i] * n0[1];
        const ia = Math.min(NB - 1, Math.max(0, ((depth - aLo) / aStep) | 0));
        histA[ia] += m;
        const dLast = (d.px[i] - fxL) * nL[0] + d.py[i] * nL[1];
        const ib = Math.min(NB - 1, Math.max(0, ((dLast - bLo) / bStep) | 0));
        histB[ib] += m;
        if (dLast > tL) massThrough += m;
        const dLos = (d.px[i] - ix) * ax + (d.py[i] - iy) * ay;
        if (dLos > deepestLos) deepestLos = dLos;
        for (let k = 0; k < layers.length; k++) {
          const Lk = layers[k];
          const dk = (d.px[i] - Lk.frontX) * Lk.normal[0] + d.py[i] * Lk.normal[1];
          if (dk <= 0) continue;
          if (dk >= Lk.thickness) { pastL[k] += m; continue; }
          histL[k][Math.min(NL - 1, ((dk / Lk.thickness) * NL) | 0)] += m;
        }
        const s = d.px[i], u = d.py[i];
        if (s < sMin) sMin = s; if (s > sMax) sMax = s;
        if (u < uMin) uMin = u; if (u > uMax) uMax = u;
      }
      // Membership must not depend on the free flag. A node crossing the
      // damage threshold is reclassified from "attached" to "free" in one
      // step, and dropping it from the average makes the reported speed JUMP -
      // measured rising by up to 0.9 m/s in mid-gap with nothing touching the
      // round, purely because a slower-than-average node stopped counting.
      // Every rise seen during free flight was of exactly this kind. Comminuted
      // material driven forward in the channel is still part of the remnant and
      // still arrives at the next plate, so it keeps counting.
      // Every surviving piece of projectile, with NO position or velocity
      // weighting. Any weight that depends on where a node is changes as the
      // debris cloud spreads, so the reported speed drifts upward even in free
      // flight - a channel cut, a tapered channel cut and a free-flag test were
      // each measured doing it, by up to 1 m/s between plates with nothing
      // touching the round. Over a set fixed at mesh time the figure is exact:
      // internal forces cancel, so it can only change when something outside
      // the projectile pushes it. Mass times this velocity is the projectile's
      // remaining momentum, which is what the mass readout beside it means.
      if (d.role[i] !== ROLE.ARMOUR && d.role[i] !== ROLE.MODULE) {
        const mm = d.mass[i];
        remM += mm; remVX += d.vx[i] * mm; remVY += d.vy[i] * mm;
      }

      if (d.role[i] === ROLE.ARMOUR) {
        // flag 16 is ERA detonation products - free, but gas rather than
        // spalled plate, so it must not be reported as spall mass
        if ((d.flags[i] & 8) && !(d.flags[i] & 16)) { spall += d.mass[i]; freeCount++; }
        // Back-face bulge: permanent forward motion of rear-face material that
        // is still attached. Detached material is spall, not bulge, so it is
        // excluded - otherwise a scab flying off would be reported as an
        // enormous bulge.
        // Measured in that layer's own frame against its NORMAL thickness,
        // and only outside the channel: material being pushed out through the
        // hole is petalling, not bulging, and would otherwise dominate the
        // figure once the plate is perforated. A bulge is the dishing of the
        // rear face *around* the impact.
        if (d.damage[i] < 0.45 && d.layer[i] === bulgeIdx) {
          const lat = Math.abs((d.rx[i] - d.ox) * d.bx + (d.ry[i] - d.oy) * d.by);
          if (lat > channelHalfWidth) {
            const dep = (d.px[i] - fxB) * nB[0] + d.py[i] * nB[1];
            const ref = (d.rx[i] - fxB) * nB[0] + d.ry[i] * nB[1];
            if (ref > tB * 0.82) {
              const move = dep - ref;
              if (move > bulge) bulge = move;
            }
          }
        }
      }
    }

    // read both histograms from the deep end
    // A chemical round has no kinetic penetrator at all, so the threshold must
    // have a floor: with need = 0 the very first histogram bin satisfies it and
    // a HESH round would report perforating a plate it never entered.
    const need = Math.max(this.penetratorMass0() * PEN_FRACTION, 1e-9);
    let acc = 0;
    for (let k = NB - 1; k >= 0; k--) {
      acc += histA[k];
      if (acc >= need) { deepest = aLo + (k + 1) * aStep; break; }
    }
    acc = 0;
    for (let k = NB - 1; k >= 0; k--) {
      acc += histB[k];
      if (acc >= need) { deepestLast = bLo + (k + 1) * bStep; break; }
    }

    // armour actually defeated, layer by layer, gaps excluded
    let defeated = 0;
    for (let k = 0; k < layers.length; k++) {
      const Lk = layers[k];
      if (pastL[k] >= need) { defeated += Lk.thickness; continue; }
      let a2 = pastL[k];
      for (let j = NL - 1; j >= 0; j--) {
        a2 += histL[k][j];
        if (a2 >= need) { defeated += ((j + 1) / NL) * Lk.thickness; break; }
      }
    }
    st.armourDefeated = Math.max(st.armourDefeated || 0, defeated);

    // DEPTH IS BOUNDED BY THE ARMOUR
    //
    // `deepest` is measured from the struck face along the shot line, and once
    // the remnant is through the back of the array it keeps growing - the
    // number then describes how far debris has FLOWN, not how far it has
    // penetrated. Unbounded, it reports 466 mm of "depth" on a 266 mm array
    // and, worse, it converges to the same value for every variant of a
    // perforating shot, because what it is really measuring is remnant
    // velocity times whatever is left of the resolved window. Two cassettes,
    // live and inert, were measured reporting depth identical to the
    // millimetre for exactly this reason - which reads as "nothing I change
    // makes any difference".
    //
    // So the reported depth is clipped at the back of the array. Past that
    // point the round is through and the figure that still carries
    // information is the residual velocity, which is reported beside it.
    const totalNormal = layers.reduce((s2, L2) => s2 + L2.thickness, 0);
    st.arrayThickness = totalNormal;
    st.maxDepth = Math.min(totalNormal,
      Math.max(st.maxDepth, isFinite(deepest) ? deepest : 0));
    // same bound along the shot line, against the array's line-of-sight total
    const totalLos = layers.reduce(
      (s2, L2) => s2 + L2.thickness / Math.max(0.2, Math.cos((L2.slope || 0) * Math.PI / 180)), 0);
    st.arrayThicknessLOS = totalLos;
    st.maxDepthLOS = Math.min(totalLos,
      Math.max(st.maxDepthLOS || 0, isFinite(deepestLos) ? deepestLos : 0));
    st.residualMass = penMass;          // penetrator material still in the domain
    st.attachedMass = attached;         // of that, still bonded into one body
    st.coherentMass = coherent;         // of that, still largely undamaged
    st.comminutedMass = Math.max(0, penMass - attached);
    st.channelMass = chanMass;
    // Projectile material retired from the lattice is still projectile
    // material: it is flying on as a ballistic fragment. Leaving it out means
    // the figure ticks upward every time a slow piece is retired, which is the
    // last source of apparent acceleration in free flight.
    for (const fr of this.fragments.list) {
      if (!fr.alive || fr.source !== 'projectile') continue;
      remM += fr.mass; remVX += fr.vx * fr.mass; remVY += fr.vy * fr.mass;
    }
    remM += this.retiredProjM || 0;
    remVX += this.retiredProjPX || 0;
    remVY += this.retiredProjPY || 0;
    st.residualVelocity = remM > 0 ? Math.hypot(remVX / remM, remVY / remM)
      : (chanMass > 0 ? Math.hypot(chanVX / chanMass, chanVY / chanMass) : 0);
    st.remnantMass = remM;
    st.residualLength = isFinite(sMax) ? Math.hypot(sMax - sMin, uMax - uMin) : 0;
    st.residualKE = chanKE;
    // "lost" means gone from the domain - promoted to a ballistic fragment or
    // retired - not merely fragmented in place
    st.erodedMass = Math.max(0, this.penetratorMass0() - penMass);
    st.spallMass = spall;
    st.spallCount = freeCount;
    st.fragmentCount = this.fragments.count;
    st.brokenBonds = this.solver.totalBroken;
    st.backfaceBulge = bulge;
    st.peakTemp = hot;

    // through when the deepest coherent node has passed the back face of the
    // last layer, measured along that layer's own normal against its own
    // normal thickness
    // Perforation = a measurable amount of penetrator material got past the
    // back face inside the channel. Testing a single deepest node instead lets
    // one stray fragment call a perforation that did not happen.
    if (!st.perforated && isFinite(deepestLast) && deepestLast > tL) {
      st.perforated = true;
      // freeze the residual state at the moment of break-out: afterwards the
      // remnant simply leaves the meshed corridor and the live counters fall
      st.atPerforation = {
        t: this.simTime, mass: penMass, velocity: st.residualVelocity,
        ke: chanKE, length: st.residualLength, through: massThrough,
        eroded: this.penetratorMass0() - penMass,
        coherent, attached,
        depthNormal: st.maxDepth, depthLOS: st.maxDepthLOS,
      };
      this.log.add(this.simTime, 'perforation',
        `PERFORATION — ${(massThrough * 1000).toFixed(0)} g through the back face at ` +
        `${st.residualVelocity.toFixed(0)} m/s (${(chanKE / 1000).toFixed(0)} kJ in the channel)`,
        SEV.CRITICAL, { ...st.atPerforation });
    }
    // ricochet: penetrator turned away and is leaving without perforating
    if (!st.perforated && chanMass > 0 && st.residualVelocity > 80) {
      const away = (chanVX / chanMass) * n0[0] + (chanVY / chanMass) * n0[1];
      if (away < -30 && !st.ricochet) {
        st.ricochet = true;
        this.log.add(this.simTime, 'ricochet',
          `RICOCHET — remnant deflected at ${st.residualVelocity.toFixed(0)} m/s`, SEV.MAJOR);
      }
    }
    st.contactTime = this.simTime - (this.trueContactTime ?? this.impactStartTime);
  }

  penetratorMass0() {
    if (this._penMass0 !== undefined && this._penMass0Domain === this.domain) return this._penMass0;
    let m = 0;
    const d = this.domain;
    for (let i = 0; i < d.n; i++) if (d.role[i] === ROLE.PENETRATOR) m += d.mass[i];
    this._penMass0 = m; this._penMass0Domain = this.domain;
    return m;
  }

  snapshotDiagnostics() {
    const s = this.solver;
    const st = this.stats;
    return {
      t: this.simTime, state: this.state,
      residualVelocity: st.residualVelocity, residualMass: st.residualMass,
      depth: st.maxDepth, broken: st.brokenBonds,
      ke: s ? s.kinetic() : (this.projectile ? this.projectile.ke : 0),
      plastic: s ? s.energy.plastic : 0,
      fracture: s ? s.energy.fracture : 0,
      spall: st.spallMass, frags: this.fragments.count,
      bulge: st.backfaceBulge, peakTemp: st.peakTemp,
      audit: s ? s.energyAudit() : null,
    };
  }

  finish(reason) {
    if (this.state === 'done') return;
    this.state = 'done';
    this.finishReason = reason;
    if (this.domain) this.updateStats();
    const verdict = this.verdict();
    this.log.add(this.simTime, 'end', `Result: ${verdict.headline}`, SEV.MAJOR, verdict);
    this.bus.emit('finished', verdict);
  }

  verdict() {
    const st = this.stats;
    const kill = this.internals.summary();
    let headline;
    if (this.finishReason === 'miss') headline = 'No contact';
    else if (st.perforated) headline = `Perforation — ${(st.atPerforation.velocity).toFixed(0)} m/s residual`;
    else if (st.ricochet) headline = 'Ricochet — armour defeated the attack';
    else if (st.armourDefeated > 0) headline = `Partial penetration — ${(st.armourDefeated * 1000).toFixed(0)} mm of armour defeated`;
    else headline = 'No penetration';
    return {
      headline, perforated: st.perforated, ricochet: st.ricochet,
      depth: st.maxDepth, depthLOS: st.maxDepthLOS, armourDefeated: st.armourDefeated,
      residualVelocity: st.atPerforation ? st.atPerforation.velocity : st.residualVelocity,
      residualMass: st.atPerforation ? st.atPerforation.mass : st.residualMass,
      erodedMass: st.atPerforation ? st.atPerforation.eroded : st.erodedMass,
      spallMass: st.spallMass, fragments: st.fragmentCount,
      bulge: st.backfaceBulge, kill: kill.kill, modules: kill,
      energy: this.solver ? { ...this.solver.energy } : null,
      audit: this.solver ? this.solver.energyAudit() : null,
      contactTime: st.contactTime,
    };
  }

  // ---------------------------------------------------------- save / load

  toJSON() {
    return {
      version: 1,
      name: this.scene.name,
      projectile: this.projectileCfg,
      scene: this.scene.toJSON(),
      settings: { ...this.settings },
    };
  }

  loadJSON(j) {
    if (!j || !j.projectile) throw new Error('not a ballistics scenario file');
    this.setScene(Scene.fromJSON(j.scene || { layers: [] }));
    Object.assign(this.settings, j.settings || {});
    this.setProjectile(Object.assign(
      makeProjectileConfig(j.projectile.type || 'apcbc'), j.projectile,
    ));
    this.scene.name = j.name || 'Scenario';
    return this;
  }
}

export { PROJECTILE_TYPES };
