/**
 * Bootstrap and the frame loop.
 *
 * The loop order is fixed and one-directional:
 *     input (already handled by the UI)  ->  simulation  ->  camera  ->  render
 * The renderer is called after the world has advanced and is given either the
 * live state or a recorded frame. It never feeds anything back.
 */

import { World } from './sim/world.js';
import { Scene } from './sim/scene.js';
import { Camera } from './render/camera.js';
import { Renderer } from './render/renderer.js';
import { App } from './ui/app.js';
import { PRESETS } from './ui/presets.js';
import { makeProjectileConfig } from './sim/projectileTypes.js';

const world = new World();
const camera = new Camera();
const renderer = new Renderer(document.getElementById('viewport'), camera);

// open on the reference case
const p0 = PRESETS['single-plate'];
world.setScene(Scene.fromJSON(p0.scene));
world.scene.name = p0.name;
world.setProjectile(makeProjectileConfig(p0.projectile.type, p0.projectile));

const app = new App(world, renderer, camera);
renderer.resize();          // the camera needs the real viewport before framing
app.frameScene();           // frame the target but leave the camera following
app.updateLegend();
app.syncPlayBtn();

let last = performance.now();
let acc = 0;
function frame(now) {
  const dt = Math.min((now - last) / 1000, 0.1);
  last = now;

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

window.addEventListener('resize', () => renderer.resize());

// expose for console-level inspection; this is a research tool, not a kiosk
window.TBS = { world, camera, renderer, app };
