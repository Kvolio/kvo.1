/**
 * Viewport camera: pan, zoom and the follow modes. Purely a view transform —
 * it reads simulation state and never writes it.
 */

import { clamp, lerp } from '../core/math.js';

export class Camera {
  constructor() {
    this.x = 0.35; this.y = 0;
    this.scale = 900;          // pixels per metre
    this.targetScale = 900;
    this.follow = 'auto';      // 'off' | 'projectile' | 'impact' | 'auto'
    this.w = 1; this.h = 1;
    this.dpr = 1;
    this.impactPoint = null;
    this.smoothing = 0.14;
    this.tx = this.x; this.ty = this.y;
  }

  resize(w, h, dpr) { this.w = w; this.h = h; this.dpr = dpr; }

  toScreen(wx, wy) {
    return [(wx - this.x) * this.scale + this.w / 2, this.h / 2 - (wy - this.y) * this.scale];
  }

  toWorld(sx, sy) {
    return [(sx - this.w / 2) / this.scale + this.x, this.y - (sy - this.h / 2) / this.scale];
  }

  panPixels(dx, dy) {
    this.tx -= dx / this.scale; this.ty += dy / this.scale;
    this.x = this.tx; this.y = this.ty;
    this.follow = 'off';
  }

  zoomAt(sx, sy, factor) {
    const [wx, wy] = this.toWorld(sx, sy);
    this.targetScale = clamp(this.targetScale * factor, 30, 40000);
    this.scale = this.targetScale;
    const [nx, ny] = this.toWorld(sx, sy);
    this.tx += wx - nx; this.ty += wy - ny;
    this.x = this.tx; this.y = this.ty;
  }

  setZoom(s) { this.targetScale = clamp(s, 30, 40000); }

  /** Frame a world-space rectangle. */
  frame(b, pad = 1.15) {
    const w = Math.max(b.x1 - b.x0, 1e-3) * pad;
    const h = Math.max(b.y1 - b.y0, 1e-3) * pad;
    this.tx = (b.x0 + b.x1) / 2; this.ty = (b.y0 + b.y1) / 2;
    this.x = this.tx; this.y = this.ty;
    this.targetScale = Math.min(this.w / w, this.h / h);
    this.scale = this.targetScale;
  }

  update(world, dt) {
    if (this.follow === 'off') { this.x = this.tx; this.y = this.ty; return; }
    let tx = this.tx, ty = this.ty;
    const p = world.projectile;
    if ((this.follow === 'projectile' || this.follow === 'auto') && world.state === 'flight' && p) {
      tx = p.x + 0.10; ty = p.y;
    } else if (world.domain && (this.follow === 'impact' || this.follow === 'auto' || this.follow === 'projectile')) {
      const c = centroidOfAction(world);
      if (c) { tx = c[0]; ty = c[1]; }
    }
    const k = 1 - Math.pow(1 - this.smoothing, Math.max(dt, 1e-3) * 60);
    this.tx = tx; this.ty = ty;
    this.x = lerp(this.x, tx, k);
    this.y = lerp(this.y, ty, k);
    this.scale = lerp(this.scale, this.targetScale, k);
  }
}

/** Where the interesting mechanics currently are: the leading penetrator mass. */
function centroidOfAction(world) {
  const d = world.domain;
  if (!d) return null;
  let m = 0, cx = 0, cy = 0;
  for (let i = 0; i < d.n; i++) {
    if (!d.alive[i] || d.role[i] !== 1) continue;
    if (d.damage[i] > 0.8) continue;
    cx += d.px[i] * d.mass[i]; cy += d.py[i] * d.mass[i]; m += d.mass[i];
  }
  if (m > 0) return [cx / m, cy / m];
  if (world.stats.impactX !== undefined) return [world.stats.impactX, world.stats.impactY];
  return null;
}
