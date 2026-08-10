/**
 * DEVICE CAPABILITY DETECTION AND THE PERFORMANCE GOVERNOR
 * =======================================================
 *
 * The simulation cost is set by the node budget and the number of CFL
 * sub-steps evaluated per frame. Neither may be lowered on capable hardware
 * just because the hardware is a phone — an iPhone 17 Pro runs this comfortably
 * at the same discretisation a laptop does.
 *
 * WHY A BENCHMARK RATHER THAN USER-AGENT SNIFFING
 * ----------------------------------------------
 * Safari does not expose `navigator.deviceMemory`, reports the same
 * `hardwareConcurrency` on a five-year-old iPhone as on a current one, and
 * freezes its user-agent string. Every static signal available is either
 * absent or useless for ranking Apple silicon. So the tier is *measured*: a
 * short, representative floating-point loop over a typed array — the same
 * shape of work the solver's bond loop does — is timed at start-up and the
 * throughput decides the tier. That ranks any device correctly, including
 * hardware that did not exist when this was written.
 *
 * The measurement is then continuously corrected by the governor, which
 * watches real frame times and moves the pixel ratio and sub-step count within
 * the tier. The *physics* is never altered by either: the node budget and
 * discretisation come from the tier, and the tier only ever drops if the
 * device genuinely cannot sustain the frame.
 */

export const TIERS = {
  high: {
    key: 'high',
    label: 'High — modern flagship',
    quality: 'high',
    dprCap: 2.75,
    minFrameMs: 9,
    maxFrameMs: 19,
    note: 'Full discretisation, GPU node field, device pixel ratio up to 2.75.',
  },
  balanced: {
    key: 'balanced',
    label: 'Balanced',
    quality: 'normal',
    dprCap: 2.0,
    minFrameMs: 10,
    maxFrameMs: 22,
    note: 'Default discretisation, GPU node field, pixel ratio capped at 2.',
  },
  fallback: {
    key: 'fallback',
    label: 'Fallback — older or throttled device',
    quality: 'low',
    dprCap: 1.5,
    minFrameMs: 12,
    maxFrameMs: 30,
    note: 'Coarser lattice and fewer sub-steps. Same solver and same model — '
      + 'the event simply plays out over more frames.',
  },
};

export const TIER_ORDER = ['high', 'balanced', 'fallback'];

/**
 * Timed micro-benchmark shaped like the solver's inner loop: strided reads
 * from typed arrays, a square root, a few multiply-adds, a scattered write.
 * Returns millions of iterations per second.
 */
export function benchmark(budgetMs = 12) {
  const N = 1 << 14;
  const ax = new Float32Array(N), ay = new Float32Array(N);
  const bx = new Float32Array(N), out = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    ax[i] = Math.sin(i) * 0.01; ay[i] = Math.cos(i) * 0.01; bx[i] = 1 + (i % 7) * 0.1;
  }
  let iters = 0;
  const t0 = performance.now();
  let elapsed = 0;
  do {
    for (let pass = 0; pass < 8; pass++) {
      for (let i = 0; i < N; i++) {
        const dx = ax[i] - ay[i], dy = ay[i] + bx[i];
        const r = Math.sqrt(dx * dx + dy * dy) || 1e-9;
        const s = (r - bx[i]) / bx[i];
        out[i] = out[i] * 0.5 + s * bx[i] * (dx / r) + dy / r;
      }
      iters += N;
    }
    elapsed = performance.now() - t0;
  } while (elapsed < budgetMs);
  return iters / elapsed / 1000;    // M iterations per second
}

/** Feature probe — what the platform can actually do. */
export function probe() {
  const ua = navigator.userAgent || '';
  const touch = (navigator.maxTouchPoints || 0) > 0;
  const iOS = /iPad|iPhone|iPod/.test(ua)
    || (navigator.platform === 'MacIntel' && (navigator.maxTouchPoints || 0) > 1);

  let webgl = null, webgl2 = false, renderer = 'unknown';
  try {
    const c = document.createElement('canvas');
    let gl = c.getContext('webgl2', { antialias: false });
    if (gl) { webgl2 = true; } else { gl = c.getContext('webgl', { antialias: false }); }
    if (gl) {
      webgl = true;
      const dbg = gl.getExtension('WEBGL_debug_renderer_info');
      if (dbg) renderer = gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) || 'unknown';
      const lose = gl.getExtension('WEBGL_lose_context');
      if (lose) lose.loseContext();
    } else webgl = false;
  } catch (e) { webgl = false; }

  return {
    ua, iOS, touch, webgl, webgl2, glRenderer: renderer,
    dpr: window.devicePixelRatio || 1,
    cores: navigator.hardwareConcurrency || 0,
    webgpu: typeof navigator !== 'undefined' && 'gpu' in navigator,
    reducedMotion: window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  };
}

/**
 * Pick a starting tier from the measured throughput.
 *
 * The benchmark loop is deliberately latency-bound — dependent square roots
 * and divides — because that is the shape of the solver's bond update, so the
 * absolute numbers are much lower than a throughput benchmark would give.
 *
 * The thresholds lean towards *promoting*: an over-promoted device is
 * recoverable, because the governor trims pixel ratio and sub-steps within a
 * frame or two and the between-run review (see Governor.reviewAfterRun) drops
 * the tier before the next shot. An under-promoted device is not recoverable
 * by itself — a flagship would quietly run a coarse lattice forever and the
 * user would have no way of knowing. Given that asymmetry, the starting tier
 * errs high and lets measurement correct it.
 */
export function classify(score, cap) {
  if (!cap.webgl) return 'fallback';           // no GPU path: keep the node count low
  if (score >= 55) return 'high';
  if (score >= 22) return 'balanced';
  return 'fallback';
}

export function detect() {
  const cap = probe();
  let score = 0;
  try { score = benchmark(); } catch (e) { score = 0; }
  const tier = classify(score, cap);
  return { ...cap, score, tier, tierSpec: TIERS[tier] };
}

/**
 * Runtime governor.
 *
 * Watches the real frame interval and trims the two things that can be trimmed
 * without touching the model: the render pixel ratio and the number of solver
 * sub-steps per frame. It never changes the lattice, the material model or the
 * time step, so a governed run and an ungoverned one are the same simulation —
 * one simply advances less simulated time per frame.
 */
export class Governor {
  constructor(device) {
    this.device = device;
    this.spec = device.tierSpec;
    this.dprScale = 1;
    this.avg = 16.7;
    this.samples = 0;
    this.cooldown = 0;
    this.enabled = true;
    this.history = [];
  }

  setTier(key) {
    this.device.tier = key;
    this.spec = TIERS[key];
    this.device.tierSpec = this.spec;
    this.dprScale = 1;
    this.cooldown = 60;
  }

  /** Effective device pixel ratio for the canvases. */
  pixelRatio() {
    return Math.max(1, Math.min(window.devicePixelRatio || 1, this.spec.dprCap) * this.dprScale);
  }

  /**
   * @param {number} frameMs wall-clock interval of the last frame
   * @returns {boolean} true if the pixel ratio changed and canvases must resize
   */
  update(frameMs) {
    if (!this.enabled) return false;
    this.avg = this.avg * 0.9 + Math.min(frameMs, 100) * 0.1;
    this.samples++;
    if (this.cooldown > 0) { this.cooldown--; return false; }
    if (this.samples < 30) return false;

    const before = this.dprScale;
    if (this.avg > this.spec.maxFrameMs && this.dprScale > 0.6) {
      this.dprScale = Math.max(0.6, this.dprScale - 0.12);
      this.cooldown = 45;
    } else if (this.avg < this.spec.minFrameMs && this.dprScale < 1) {
      this.dprScale = Math.min(1, this.dprScale + 0.08);
      this.cooldown = 45;
    }
    return this.dprScale !== before;
  }

  /**
   * Between-shot tier review.
   *
   * The governor can only trim pixel ratio and sub-steps; the node budget is
   * fixed for the life of a mesh, so it can only be changed between runs. This
   * is where a device that turned out to be faster or slower than the start-up
   * benchmark suggested gets moved. Called on FIRE, so the tier never changes
   * part-way through an impact.
   *
   * The decisive signal is not the solver's cost per frame — once the
   * sub-step governor has clamped down, a struggling device reports a *cheap*
   * frame because it is barely advancing the solution. What matters is whether
   * the device could sustain the sub-step count the tier asks for.
   *
   * @param {number} solverMs   mean solver cost per frame during the last impact
   * @param {number} meanSteps  mean sub-steps actually achieved per frame
   * @param {number} wantSteps  sub-steps the tier asks for
   * @returns {string|null} the new tier key, or null if unchanged
   */
  reviewAfterRun(solverMs, meanSteps, wantSteps) {
    if (!this.enabled || !(solverMs > 0)) return null;
    const i = TIER_ORDER.indexOf(this.device.tier);
    const starved = meanSteps > 0 && meanSteps <= Math.max(1.35, wantSteps * 0.4);
    if (starved && i < TIER_ORDER.length - 1) {
      const next = TIER_ORDER[i + 1];
      this.setTier(next);
      return next;
    }
    const comfortable = solverMs < 5.5 && meanSteps >= wantSteps * 0.95;
    if (comfortable && i > 0) {
      const next = TIER_ORDER[i - 1];
      this.setTier(next);
      return next;
    }
    return null;
  }

  describe() {
    return {
      tier: this.spec.label,
      score: this.device.score,
      fps: this.avg > 0 ? 1000 / this.avg : 0,
      dpr: this.pixelRatio(),
      backend: this.device.webgl2 ? 'WebGL 2' : this.device.webgl ? 'WebGL 1' : 'Canvas 2D',
    };
  }
}
