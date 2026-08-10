/**
 * RENDERER
 * ========
 *
 * Strictly a view. It reads the simulation state (or a recorded frame of it)
 * and draws it. It never decides an outcome, never moves a node and never
 * substitutes an effect for something the solver did not compute.
 *
 * The 2.5-D presentation is an extrusion of the simulated cross-section along
 * the out-of-plane slab depth: every solid is drawn as a back face, a swept
 * side and a lit front face. The geometry of all three comes from the same
 * simulated outline, so the "3-D" look cannot drift away from the physics.
 *
 * Drawing order
 *   1  background, scale grid
 *   2  far-field armour outside the meshed corridor (static, undeformed)
 *   3  internal components
 *   4  peridynamic nodes: extruded shadow pass, then the lit field pass
 *   5  ballistic fragments and their trails
 *   6  the rigid projectile while it is still in flight
 *   7  overlays: shot line, corridor bounds, measurements, selection
 */

import { UI, RAMP_DAMAGE, RAMP_PLASTIC, RAMP_TEMP, RAMP_VELOCITY, RAMP_STRESS, FIELD_SCALES, rgb, shade, hexToRgb } from './palette.js';
import { NodeGL } from './nodegl.js';
import { clamp, DEG } from '../core/math.js';
import { modulePoly, MODULE_TYPES } from '../sim/scene.js';
import { ROLE } from '../sim/pd/domain.js';

/**
 * THREE STACKED CANVASES
 * ----------------------
 * The draw order that the scene needs is: plates, then the node field over
 * them, then fragments and overlays over that. A single GPU canvas cannot be
 * interleaved with a 2-D one, so the layers are stacked instead:
 *
 *   base (2-D, opaque)      background, grid, plates, components
 *   field (WebGL, alpha)    the peridynamic node field
 *   fx   (2-D, alpha)       fragments, trails, in-flight projectile, overlays
 *
 * All three share one camera and one pixel ratio, so they stay registered.
 * If WebGL is unavailable — or the context is lost, which iOS does on
 * backgrounding — the node field is drawn on the base canvas by the original
 * Canvas 2-D path and everything still works.
 */
export class Renderer {
  constructor(canvases, camera) {
    const c = canvases instanceof HTMLCanvasElement ? { base: canvases } : canvases;
    this.canvas = c.base;
    this.ctx = c.base.getContext('2d', { alpha: false });
    this.fxCanvas = c.fx || null;
    this.fx = this.fxCanvas ? this.fxCanvas.getContext('2d', { alpha: true }) : this.ctx;
    this.glCanvas = c.field || null;
    this.field = this.glCanvas ? NodeGL.create(this.glCanvas) : null;
    if (this.glCanvas && !this.field) this.glCanvas.style.display = 'none';
    this.pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    this.cam = camera;
    this.opts = {
      field: 'material',
      showGrid: true,
      showCorridor: false,
      showVectors: false,
      showFragments: true,
      showTrails: true,
      showFarField: true,
      extrude: true,
      nodeGain: 1.0,
      velScale: FIELD_SCALES.velocity,
      stressScale: FIELD_SCALES.stress,
    };
    this.matColorCache = new Map();
    this.selection = null;
    this.hover = null;
    this.frameOverride = null;   // a recorded frame to draw instead of live state
  }

  /** Pixel ratio comes from the performance governor, not from the device. */
  setPixelRatio(r) { this.pixelRatio = Math.max(0.5, r); }

  resize() {
    const dpr = this.pixelRatio;
    const r = this.canvas.getBoundingClientRect();
    const w = Math.max(1, Math.round(r.width * dpr));
    const h = Math.max(1, Math.round(r.height * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w; this.canvas.height = h;
    }
    if (this.fxCanvas && (this.fxCanvas.width !== w || this.fxCanvas.height !== h)) {
      this.fxCanvas.width = w; this.fxCanvas.height = h;
    }
    if (this.field) this.field.resize(w, h);
    this.cam.resize(w, h, dpr);
    this.dpr = dpr;
  }

  get backend() {
    if (!this.field || this.field.lost) return 'Canvas 2D';
    return this.field.isGL2 ? 'WebGL 2' : 'WebGL 1';
  }

  matColor(key) {
    let c = this.matColorCache.get(key);
    if (!c) { c = hexToRgb(key); this.matColorCache.set(key, c); }
    return c;
  }

  draw(world) {
    this.resize();
    const ctx = this.ctx, cam = this.cam;
    const W = cam.w, H = cam.h;

    if (!this.bgGrad || this.bgH !== H) {
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, UI.bg1); g.addColorStop(1, UI.bg0);
      this.bgGrad = g; this.bgH = H;
    }
    ctx.fillStyle = this.bgGrad; ctx.fillRect(0, 0, W, H);

    if (this.opts.showGrid) this.drawGrid();

    const frame = this.frameOverride;
    this.drawScene(world);
    this.drawModules(world);

    const useGL = this.field && !this.field.lost;
    if (useGL) this.field.clear();
    if (world.domain) {
      if (useGL) this.drawNodesGL(world, frame);
      else this.drawNodes(world, frame);
    }

    if (this.fx !== ctx) this.fx.clearRect(0, 0, W, H);
    const save = this.ctx;
    this.ctx = this.fx;                       // overlay layer
    if (this.opts.showFragments) this.drawFragments(world, frame);
    this.drawProjectile(world, frame);
    this.drawOverlays(world);
    if (world.domain && this.opts.showVectors) this.drawVectors(world, frame);
    this.ctx = save;
  }

  // ------------------------------------------------------- GPU node field

  /**
   * Normalised field value per node, for the GPU path. Reads the recorded
   * frame when one is being scrubbed so a replayed frame shows the field as it
   * was, not as it is now.
   */
  fillFieldBuffers(world, frame) {
    const d = world.domain, f = this.field;
    const n = frame && frame.px ? frame.n : d.n;
    f.ensure(n);
    if (f.colourStamp !== d) f.uploadColours(d, hexToRgb);

    const pos = f.pos, val = f.val, flag = f.flag;
    const mode = this.opts.field;
    const S = FIELD_SCALES;

    if (frame && frame.px) {
      const px = frame.px, py = frame.py, alv = frame.alv;
      const src = mode === 'material' || mode === 'damage' ? frame.dmg
        : mode === 'plastic' ? frame.pls
          : mode === 'temp' ? frame.tmp
            : mode === 'velocity' ? frame.vel : frame.str;
      for (let i = 0; i < n; i++) {
        pos[i * 2] = px[i]; pos[i * 2 + 1] = py[i];
        val[i] = src[i] * (1 / 255);
        flag[i] = alv[i] & 1 ? ((alv[i] & 2) ? 3 : 1) : 0;
      }
    } else {
      const px = d.px, py = d.py, alive = d.alive, flags = d.flags;
      for (let i = 0; i < n; i++) {
        pos[i * 2] = px[i]; pos[i * 2 + 1] = py[i];
        flag[i] = alive[i] ? ((flags[i] & 8) ? 3 : 1) : 0;
      }
      switch (mode) {
        case 'plastic':
          for (let i = 0; i < n; i++) {
            const pd = d.matTable[d.matIndex[i]].pd;
            val[i] = d.plStrain[i] / Math.max(pd.epsF * S.plasticSpan, 1e-4);
          }
          break;
        case 'temp':
          for (let i = 0; i < n; i++) val[i] = (d.temp[i] - 293) / S.tempSpan;
          break;
        case 'velocity':
          for (let i = 0; i < n; i++) {
            val[i] = Math.sqrt(d.vx[i] * d.vx[i] + d.vy[i] * d.vy[i]) / this.opts.velScale;
          }
          break;
        case 'stress':
          for (let i = 0; i < n; i++) val[i] = 0.5 + d.virial[i] / (2 * this.opts.stressScale);
          break;
        default:
          for (let i = 0; i < n; i++) val[i] = d.damage[i];
      }
    }
    return n;
  }

  drawNodesGL(world, frame) {
    const d = world.domain;
    const n = this.fillFieldBuffers(world, frame);
    const size = Math.max(1, d.dx * this.cam.scale * this.opts.nodeGain * 1.42);
    this.field.drawPoints({
      count: n,
      cam: this.cam,
      mode: this.opts.field,
      pointSize: Math.min(size, 128),
      extrude: this.nodeExtrudeVec(size),
      alpha: 1,
    });
  }

  // ------------------------------------------------------------------ grid

  drawGrid() {
    const ctx = this.ctx, cam = this.cam;
    // choose a spacing that lands between 60 and 220 px
    let step = 0.001;
    const nice = [0.001, 0.002, 0.005, 0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5];
    for (const s of nice) { step = s; if (s * cam.scale > 60) break; }
    const [wx0, wy1] = cam.toWorld(0, 0);
    const [wx1, wy0] = cam.toWorld(cam.w, cam.h);
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = Math.floor(wx0 / step) * step; x < wx1; x += step) {
      const [sx] = cam.toScreen(x, 0);
      ctx.moveTo(sx, 0); ctx.lineTo(sx, cam.h);
    }
    for (let y = Math.floor(wy0 / step) * step; y < wy1; y += step) {
      const [, sy] = cam.toScreen(0, y);
      ctx.moveTo(0, sy); ctx.lineTo(cam.w, sy);
    }
    ctx.strokeStyle = UI.grid; ctx.stroke();

    // scale bar
    const px = step * cam.scale;
    const label = step >= 1 ? `${step} m` : `${Math.round(step * 1000)} mm`;
    ctx.save();
    ctx.translate(18 * this.dpr, cam.h - 26 * this.dpr);
    ctx.strokeStyle = UI.dim; ctx.lineWidth = 1.5 * this.dpr;
    ctx.beginPath();
    ctx.moveTo(0, 0); ctx.lineTo(px, 0);
    ctx.moveTo(0, -5 * this.dpr); ctx.lineTo(0, 5 * this.dpr);
    ctx.moveTo(px, -5 * this.dpr); ctx.lineTo(px, 5 * this.dpr);
    ctx.stroke();
    ctx.fillStyle = UI.dim;
    ctx.font = `${11 * this.dpr}px ui-monospace, monospace`;
    ctx.fillText(label, 2 * this.dpr, -8 * this.dpr);
    ctx.restore();
  }

  // ------------------------------------------------------------ scene solids

  /** Extrusion offset in pixels for the 2.5-D look on scene-scale solids. */
  extrudeVec() {
    if (!this.opts.extrude) return [0, 0];
    const d = clamp(this.cam.scale * 0.015, 3, 22) * this.dpr;
    return [d * 0.55, -d * 0.42];
  }

  /**
   * Extrusion for the node field. It has to scale with the *node* size, not
   * with the zoom: a scene-sized offset applied per node smears the whole body
   * into a dark ghost instead of giving it thickness.
   */
  nodeExtrudeVec(size) {
    if (!this.opts.extrude) return [0, 0];
    const d = clamp(size * 0.42, 0.8, 7 * this.dpr);
    return [d * 0.8, -d * 0.62];
  }

  polyPath(poly) {
    const ctx = this.ctx, cam = this.cam;
    ctx.beginPath();
    for (let i = 0; i < poly.length; i += 2) {
      const [sx, sy] = cam.toScreen(poly[i], poly[i + 1]);
      if (i === 0) ctx.moveTo(sx, sy); else ctx.lineTo(sx, sy);
    }
    ctx.closePath();
  }

  drawScene(world) {
    const ctx = this.ctx;
    const [ex, ey] = this.extrudeVec();
    const dom = world.domain;
    for (const L of world.scene.activeLayers()) {
      const base = this.matColor(L.mat.color);
      const dark = this.matColor(L.mat.color2 || L.mat.color);

      // back face (extruded depth)
      if (this.opts.extrude) {
        ctx.save();
        ctx.translate(ex, ey);
        this.polyPath(L.poly);
        ctx.fillStyle = shade(dark, 0.55);
        ctx.fill();
        ctx.restore();
      }

      // front face
      this.polyPath(L.poly);
      const b = this.polyGradient(L.poly, base, dark);
      ctx.fillStyle = b;
      ctx.fill();
      ctx.lineWidth = 1 * this.dpr;
      ctx.strokeStyle = shade(base, 1.35);
      ctx.stroke();

      if (this.selection && this.selection.kind === 'layer' && this.selection.id === L.id) {
        ctx.lineWidth = 2.5 * this.dpr;
        ctx.strokeStyle = UI.accent;
        ctx.stroke();
      }
    }

    // Inside the meshed corridor the plate is drawn from nodes, so the static
    // version has to be removed there — otherwise an opened channel would have
    // undeformed plate showing through it. Only the plate is punched out, not
    // the background, so the corridor itself stays invisible.
    if (dom && this.opts.showFarField) {
      ctx.save();
      this.corridorPath(dom);
      ctx.clip();
      ctx.fillStyle = UI.bg0;
      for (const L of world.scene.activeLayers()) { this.polyPath(L.poly); ctx.fill(); }
      ctx.restore();
    }
  }

  polyGradient(poly, base, dark) {
    const ctx = this.ctx, cam = this.cam;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let i = 0; i < poly.length; i += 2) {
      x0 = Math.min(x0, poly[i]); x1 = Math.max(x1, poly[i]);
      y0 = Math.min(y0, poly[i + 1]); y1 = Math.max(y1, poly[i + 1]);
    }
    const [sx0, sy0] = cam.toScreen(x0, y1);
    const [sx1, sy1] = cam.toScreen(x1, y0);
    const g = ctx.createLinearGradient(sx0, sy0, sx1, sy1);
    g.addColorStop(0, shade(base, 1.12));
    g.addColorStop(0.55, rgb(base));
    g.addColorStop(1, shade(dark, 1.0));
    return g;
  }

  corridorPath(d) {
    const ctx = this.ctx, cam = this.cam;
    const hw = d.width / 2;
    const pts = [
      [d.ox + d.bx * -hw, d.oy + d.by * -hw],
      [d.ox + d.ax * d.length + d.bx * -hw, d.oy + d.ay * d.length + d.by * -hw],
      [d.ox + d.ax * d.length + d.bx * hw, d.oy + d.ay * d.length + d.by * hw],
      [d.ox + d.bx * hw, d.oy + d.by * hw],
    ];
    ctx.beginPath();
    pts.forEach((p, i) => {
      const [sx, sy] = cam.toScreen(p[0], p[1]);
      if (i === 0) ctx.moveTo(sx, sy); else ctx.lineTo(sx, sy);
    });
    ctx.closePath();
  }

  drawModules(world) {
    const ctx = this.ctx;
    const [ex, ey] = this.extrudeVec();
    for (const m of world.scene.modules) {
      const spec = MODULE_TYPES[m.type] || MODULE_TYPES.void;
      const poly = modulePoly(m);
      const c = this.matColor(spec.color);
      if (this.opts.extrude) {
        ctx.save(); ctx.translate(ex, ey);
        this.polyPath(poly); ctx.fillStyle = shade(c, 0.35); ctx.fill();
        ctx.restore();
      }
      this.polyPath(poly);
      const a = m.state === 'destroyed' ? 0.30 : m.state === 'damaged' ? 0.55 : 0.8;
      ctx.fillStyle = `rgba(${c[0]},${c[1]},${c[2]},${a * 0.55})`;
      ctx.fill();
      ctx.lineWidth = (this.selection && this.selection.kind === 'module' && this.selection.id === m.id ? 2.5 : 1.2) * this.dpr;
      ctx.strokeStyle = this.selection && this.selection.kind === 'module' && this.selection.id === m.id
        ? UI.accent : `rgba(${c[0]},${c[1]},${c[2]},0.95)`;
      ctx.stroke();

      if (m.state !== 'ok') {
        ctx.save();
        this.polyPath(poly); ctx.clip();
        ctx.strokeStyle = m.state === 'destroyed' ? UI.danger : UI.warn;
        ctx.lineWidth = 1.2 * this.dpr;
        const [bx0, by0] = this.cam.toScreen(m.x - m.w, m.y - m.h);
        const [bx1, by1] = this.cam.toScreen(m.x + m.w, m.y + m.h);
        ctx.beginPath();
        for (let x = Math.min(bx0, bx1); x < Math.max(bx0, bx1); x += 9 * this.dpr) {
          ctx.moveTo(x, Math.min(by0, by1)); ctx.lineTo(x + 60 * this.dpr, Math.max(by0, by1));
        }
        ctx.stroke();
        ctx.restore();
      }

      if (this.cam.scale > 200) {
        const [lx, ly] = this.cam.toScreen(m.x, m.y);
        ctx.fillStyle = UI.ink;
        ctx.font = `${10 * this.dpr}px ui-monospace, monospace`;
        ctx.textAlign = 'center';
        ctx.fillText(m.label || spec.label, lx, ly);
        ctx.textAlign = 'left';
      }
    }
  }

  // ------------------------------------------------------- peridynamic field

  nodeColor(d, i, frame) {
    const mode = this.opts.field;
    const dmg = frame ? frame.dmg[i] / 255 : d.damage[i];
    switch (mode) {
      case 'damage': return RAMP_DAMAGE(dmg);
      case 'plastic': {
        const pd = d.matTable[d.matIndex[i]].pd;
        return RAMP_PLASTIC(clamp(d.plStrain[i] / Math.max(pd.epsF * 3, 1e-4), 0, 1));
      }
      case 'temp': {
        const t = frame ? 293 + frame.tmp[i] * 8 : d.temp[i];
        return RAMP_TEMP(clamp((t - 293) / 1200, 0, 1));
      }
      case 'velocity': {
        const v = Math.hypot(d.vx[i], d.vy[i]);
        return RAMP_VELOCITY(clamp(v / this.opts.velScale, 0, 1));
      }
      case 'stress':
        return RAMP_STRESS(clamp(0.5 + d.virial[i] / (2 * this.opts.stressScale), 0, 1));
      case 'material':
      default: {
        const m = d.matTable[d.matIndex[i]].mat;
        const base = this.matColor(m.color);
        // undamaged material is drawn a little brighter than its flat swatch so
        // the meshed corridor reads as the same plate as the static far field
        const f = 1.14 - 0.72 * dmg;
        return [Math.min(255, base[0] * f), Math.min(255, base[1] * f), Math.min(255, base[2] * f)];
      }
    }
  }

  drawNodes(world, frame) {
    const ctx = this.ctx, cam = this.cam;
    const d = world.domain;
    const px = frame ? frame.px : d.px;
    const py = frame ? frame.py : d.py;
    const alv = frame ? frame.alv : null;
    const n = frame ? frame.n : d.n;
    const size = Math.max(1, d.dx * cam.scale * this.opts.nodeGain * 1.42);
    const half = size / 2;
    const [ex, ey] = this.nodeExtrudeVec(size);

    // cull to viewport
    const margin = size * 2;
    const inView = (sx, sy) => sx > -margin && sy > -margin && sx < cam.w + margin && sy < cam.h + margin;

    // pass 1: extruded depth — a single dark silhouette behind everything
    if (this.opts.extrude && size > 2) {
      ctx.save();
      ctx.translate(ex, ey);
      ctx.fillStyle = 'rgba(6,9,14,0.6)';
      for (let i = 0; i < n; i++) {
        if (alv ? !(alv[i] & 1) : !d.alive[i]) continue;
        const [sx, sy] = cam.toScreen(px[i], py[i]);
        if (!inView(sx, sy)) continue;
        ctx.fillRect(sx - half, sy - half, size, size);
      }
      ctx.restore();
    }

    // pass 2: the field itself
    // Bucket by quantised colour so long runs share a fillStyle: with several
    // thousand nodes the style changes, not the rectangles, dominate the cost.
    const buckets = new Map();
    for (let i = 0; i < n; i++) {
      if (alv ? !(alv[i] & 1) : !d.alive[i]) continue;
      const [sx, sy] = cam.toScreen(px[i], py[i]);
      if (!inView(sx, sy)) continue;
      const c = this.nodeColor(d, i, frame);
      const key = ((c[0] >> 3) << 10) | ((c[1] >> 3) << 5) | (c[2] >> 3);
      let arr = buckets.get(key);
      if (!arr) { arr = { c, pts: [] }; buckets.set(key, arr); }
      arr.pts.push(sx, sy);
    }
    for (const b of buckets.values()) {
      ctx.fillStyle = rgb([b.c[0] | 0, b.c[1] | 0, b.c[2] | 0]);
      const p = b.pts;
      for (let k = 0; k < p.length; k += 2) ctx.fillRect(p[k] - half, p[k + 1] - half, size, size);
    }

    // detached material gets a rim so spall reads as separate from the body
    if (size > 2.5) {
      ctx.strokeStyle = 'rgba(255,190,120,0.35)';
      ctx.lineWidth = Math.max(1, this.dpr * 0.8);
      ctx.beginPath();
      let count = 0;
      for (let i = 0; i < n && count < 3000; i++) {
        const free = alv ? (alv[i] & 2) : (d.flags[i] & 8);
        if (!free) continue;
        if (alv ? !(alv[i] & 1) : !d.alive[i]) continue;
        const [sx, sy] = cam.toScreen(px[i], py[i]);
        if (!inView(sx, sy)) continue;
        ctx.rect(sx - half, sy - half, size, size);
        count++;
      }
      ctx.stroke();
    }

  }

  drawVectors(world, frame) {
    const ctx = this.ctx, cam = this.cam;
    const d = world.domain;
    const px = frame ? frame.px : d.px, py = frame ? frame.py : d.py;
    const stride = Math.max(1, Math.round(d.n / 900));
    const k = 0.00012 * cam.scale;
    ctx.strokeStyle = 'rgba(120,220,255,0.55)';
    ctx.lineWidth = 1 * this.dpr;
    ctx.beginPath();
    for (let i = 0; i < d.n; i += stride) {
      if (!d.alive[i]) continue;
      const v = Math.hypot(d.vx[i], d.vy[i]);
      if (v < 25) continue;
      const [sx, sy] = cam.toScreen(px[i], py[i]);
      ctx.moveTo(sx, sy);
      ctx.lineTo(sx + d.vx[i] * k, sy - d.vy[i] * k);
    }
    ctx.stroke();
  }

  // -------------------------------------------------------------- fragments

  drawFragments(world, frame) {
    const ctx = this.ctx, cam = this.cam;
    const list = frame ? frame.frags : world.fragments.list;
    if (!list || !list.length) return;

    if (this.opts.showTrails && !frame) {
      ctx.strokeStyle = 'rgba(220,160,90,0.22)';
      ctx.lineWidth = 1 * this.dpr;
      ctx.beginPath();
      for (const f of world.fragments.list) {
        if (!f.alive || f.trail.length < 4) continue;
        const [x0, y0] = cam.toScreen(f.trail[0], f.trail[1]);
        ctx.moveTo(x0, y0);
        for (let k = 2; k < f.trail.length; k += 2) {
          const [sx, sy] = cam.toScreen(f.trail[k], f.trail[k + 1]);
          ctx.lineTo(sx, sy);
        }
      }
      ctx.stroke();
    }

    for (const f of list) {
      const x = frame ? f[0] : f.x, y = frame ? f[1] : f.y;
      const vx = frame ? f[2] : f.vx, vy = frame ? f[3] : f.vy;
      const sz = frame ? f[5] : f.size;
      const kind = frame ? f[6] : f.kind;
      if (!frame && (!f.alive)) continue;
      const [sx, sy] = cam.toScreen(x, y);
      if (sx < -20 || sy < -20 || sx > cam.w + 20 || sy > cam.h + 20) continue;
      const s = Math.max(1.4, sz * cam.scale);
      const v = Math.hypot(vx, vy);
      const hot = clamp(v / 1400, 0, 1);
      ctx.fillStyle = kind === 'penetrator'
        ? `rgb(${190 + 60 * hot | 0},${170},${150})`
        : kind === 'sabot' ? 'rgb(150,160,170)'
          : `rgb(${200 + 55 * hot | 0},${140 + 70 * hot | 0},${70})`;
      ctx.fillRect(sx - s / 2, sy - s / 2, s, s);
    }
  }

  // ------------------------------------------------------------- projectile

  drawProjectile(world, frame) {
    const p = world.projectile;
    if (!p) return;
    const inFlight = frame ? !!frame.proj : (world.state === 'flight' || world.state === 'idle');
    if (!inFlight) return;
    const ctx = this.ctx;
    const st = frame ? frame.proj : p;
    const [ex, ey] = this.extrudeVec();

    const saveX = p.x, saveY = p.y, saveA = p.ang;
    p.x = st.x; p.y = st.y; p.ang = st.ang;
    const parts = p.parts.filter((q) => !(q.sabot && !st.sabot));
    for (const pass of (this.opts.extrude ? [0, 1] : [1])) {
      ctx.save();
      if (pass === 0) ctx.translate(ex, ey);
      for (const q of parts) {
        const c = this.matColor(q.mat.color);
        this.polyPath(p.worldPoly(q.poly));
        ctx.fillStyle = pass === 0 ? shade(c, 0.35) : this.polyGradient(p.worldPoly(q.poly), c, this.matColor(q.mat.color2 || q.mat.color));
        ctx.fill();
        if (pass === 1) {
          ctx.lineWidth = 1 * this.dpr;
          ctx.strokeStyle = shade(c, 1.4);
          ctx.stroke();
        }
      }
      ctx.restore();
    }
    p.x = saveX; p.y = saveY; p.ang = saveA;
  }

  // ---------------------------------------------------------------- overlays

  drawOverlays(world) {
    const ctx = this.ctx, cam = this.cam;

    if (this.opts.showCorridor && world.domain) {
      this.corridorPath(world.domain);
      ctx.setLineDash([6 * this.dpr, 5 * this.dpr]);
      ctx.strokeStyle = UI.corridor;
      ctx.lineWidth = 1.5 * this.dpr;
      ctx.stroke();
      ctx.setLineDash([]);
      const [tx, ty] = cam.toScreen(world.domain.ox, world.domain.oy + world.domain.width / 2);
      ctx.fillStyle = UI.corridor;
      ctx.font = `${10 * this.dpr}px ui-monospace, monospace`;
      ctx.fillText('continuum domain', tx + 6 * this.dpr, ty - 6 * this.dpr);
    }

    // shot line while aiming
    if (world.state === 'idle' && world.projectile) {
      const p = world.projectile;
      const [sx, sy] = cam.toScreen(p.x, p.y);
      const [ex2, ey2] = cam.toScreen(p.x + Math.cos(p.ang) * 6, p.y + Math.sin(p.ang) * 6);
      ctx.setLineDash([3 * this.dpr, 6 * this.dpr]);
      ctx.strokeStyle = 'rgba(220,90,70,0.5)';
      ctx.lineWidth = 1.2 * this.dpr;
      ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(ex2, ey2); ctx.stroke();
      ctx.setLineDash([]);
    }

    // impact marker
    const ip = world.log.get('first-contact');
    if (ip && world.stats.impactX !== undefined) {
      const [sx, sy] = cam.toScreen(world.stats.impactX, world.stats.impactY);
      ctx.strokeStyle = 'rgba(255,120,90,0.75)';
      ctx.lineWidth = 1.2 * this.dpr;
      ctx.beginPath(); ctx.arc(sx, sy, 7 * this.dpr, 0, Math.PI * 2); ctx.stroke();
    }
  }

  /** Hit test in world space for the inspector. */
  pick(world, sx, sy) {
    const [wx, wy] = this.cam.toWorld(sx, sy);
    for (const m of world.scene.modules) {
      const p = modulePoly(m);
      if (pointIn(p, wx, wy)) return { kind: 'module', id: m.id, obj: m };
    }
    for (const L of world.scene.activeLayers()) {
      if (pointIn(L.poly, wx, wy)) return { kind: 'layer', id: L.id, obj: L };
    }
    if (world.domain) {
      const d = world.domain;
      let best = -1, bd = (d.dx * 2) ** 2;
      for (let i = 0; i < d.n; i++) {
        if (!d.alive[i]) continue;
        const dx = d.px[i] - wx, dy = d.py[i] - wy;
        const r = dx * dx + dy * dy;
        if (r < bd) { bd = r; best = i; }
      }
      if (best >= 0) return { kind: 'node', id: best, obj: best };
    }
    return null;
  }
}

function pointIn(p, x, y) {
  let inside = false;
  for (let i = 0, n = p.length / 2, j = n - 1; i < n; j = i++) {
    const xi = p[i * 2], yi = p[i * 2 + 1], xj = p[j * 2], yj = p[j * 2 + 1];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi + 1e-30) + xi) inside = !inside;
  }
  return inside;
}

export { ROLE, DEG };
