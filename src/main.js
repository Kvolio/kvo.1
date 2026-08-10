/**
 * Bootstrap and the frame loop.
 *
 * The loop order is fixed and one-directional:
 *     input (already handled by the UI)  ->  simulation  ->  camera  ->  render
 * The renderer is called after the world has advanced and is given either the
 * live state or a recorded frame. It never feeds anything back.
 *
 * On top of that this file owns the platform layer: device tiering, the
 * performance governor, and the handful of iOS Safari behaviours that have to
 * be suppressed for a full-screen canvas application (page pinch-zoom,
 * double-tap zoom, rubber-band scroll, and the frame-time spike on returning
 * from the background).
 */

import { World, QUALITY } from './sim/world.js';
import { Scene } from './sim/scene.js';
import { Camera } from './render/camera.js';
import { Renderer } from './render/renderer.js';
import { App } from './ui/app.js';
import { PRESETS } from './ui/presets.js';
import { makeProjectileConfig } from './sim/projectileTypes.js';
import { detect, Governor, TIERS } from './core/device.js';

// ---------------------------------------------------------------- platform

const device = detect();
const governor = new Governor(device);

const world = new World();
const camera = new Camera();
const renderer = new Renderer({
  base: document.getElementById('viewport'),
  field: document.getElementById('viewportField'),
  fx: document.getElementById('viewportFx'),
}, camera);

// The measured tier sets the discretisation. This is the *only* place the
// device influences the model: it chooses the node budget, exactly as the
// Discretisation control does. Nothing about the physics differs between
// tiers - a coarser lattice resolves less detail, it does not simulate less.
world.settings.quality = device.tierSpec.quality;
world.settings.deviceTier = device.tier;
world.recorder.setCapacity(device.tier === 'high' ? 480 : device.tier === 'balanced' ? 360 : 240);
renderer.setPixelRatio(governor.pixelRatio());
world.device = device;
world.governor = governor;

// ------------------------------------------------------------------ scene

const p0 = PRESETS['single-plate'];
world.setScene(Scene.fromJSON(p0.scene));
world.scene.name = p0.name;
world.setProjectile(makeProjectileConfig(p0.projectile.type, p0.projectile));

// a tier change between shots also changes the recorder's memory footprint
world.bus.on('tier-changed', ({ tier }) => {
  renderer.setPixelRatio(governor.pixelRatio());
  world.recorder.setCapacity(tier === 'high' ? 480 : tier === 'balanced' ? 360 : 240);
});

const app = new App(world, renderer, camera);
renderer.resize();          // the camera needs the real viewport before framing
app.frameScene();           // frame the target but leave the camera following
app.updateLegend();
app.syncPlayBtn();

// -------------------------------------------------- iOS Safari suppression

const view = document.getElementById('view');

// Safari's own pinch-zoom would fight the camera on a full-screen canvas.
// `touch-action: none` covers the pointer events, but Safari also emits the
// legacy gesture events, which have to be refused explicitly.
for (const ev of ['gesturestart', 'gesturechange', 'gestureend']) {
  view.addEventListener(ev, (e) => e.preventDefault(), { passive: false });
}
// double-tap-to-zoom on the viewport
view.addEventListener('dblclick', (e) => e.preventDefault(), { passive: false });
// rubber-band scrolling of the page behind the canvas
document.addEventListener('touchmove', (e) => {
  if (e.target.closest && e.target.closest('#view')) e.preventDefault();
}, { passive: false });

// Returning from the background hands back one enormous frame interval and,
// on iOS, sometimes a lost WebGL context. Skip a frame rather than integrate
// the gap or draw into a dead context.
let skipNext = false;
document.addEventListener('visibilitychange', () => { if (!document.hidden) skipNext = true; });
window.addEventListener('pageshow', () => { skipNext = true; });
window.addEventListener('orientationchange', () => {
  skipNext = true;
  setTimeout(() => { renderer.resize(); app.frameScene(); }, 250);
});

// ------------------------------------------------------------------- loop

let last = performance.now();
let acc = 0;

function frame(now) {
  const raw = now - last;
  last = now;
  if (skipNext) { skipNext = false; requestAnimationFrame(frame); return; }
  const dt = Math.min(raw / 1000, 0.1);

  if (governor.update(raw)) renderer.setPixelRatio(governor.pixelRatio());

  // carry any user overrides of the model knobs onto a freshly built solver
  if (world.solver) {
    if (world.confinementOverride !== undefined) world.solver.confinement = world.confinementOverride;
    if (world.frictionOverride !== undefined) world.solver.friction = world.frictionOverride;
    if (world.dampOverride !== undefined) world.solver.dampLin = world.dampOverride;
  }

  if (!renderer.frameOverride) world.update(dt);
  camera.update(world, dt);
  renderer.draw(world);

  acc += dt;
  if (acc > 0.1) { acc = 0; app.tick(); }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

let resizeTimer = 0;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => renderer.resize(), 60);
});

// expose for console-level inspection; this is a research tool, not a kiosk
window.TBS = { world, camera, renderer, app, device, governor, TIERS, QUALITY };
