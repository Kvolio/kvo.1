/**
 * UI LAYER
 * ========
 *
 * Builds the panels, binds them to the simulation, and reads state back out
 * for the readouts. The UI writes *configuration*; it never writes simulation
 * state while a run is in progress, and it never computes a physical result —
 * every number it shows was produced by the solver or by one of the clearly
 * labelled analytic cross-check models.
 */

import { el, panel, row, num, select, slider, toggle, kv, clear, panelState } from './dom.js';
import { PRESETS, PRESET_ORDER } from './presets.js';
import { MATERIALS, ARMOUR_KEYS, PENETRATOR_KEYS, getMaterial, registerMaterial } from '../materials/database.js';
import { PROJECTILE_TYPES, TYPE_ORDER, makeProjectileConfig } from '../sim/projectileTypes.js';
import { Scene, makeLayer, makeModule, MODULE_TYPES } from '../sim/scene.js';
import { QUALITY } from '../sim/world.js';
import { FIELD_MODES, RAMP_DAMAGE, RAMP_PLASTIC, RAMP_TEMP, RAMP_VELOCITY, RAMP_STRESS, rgb } from '../render/palette.js';
import * as U from '../core/units.js';
import { ROLE } from '../sim/pd/domain.js';

const FIELDS = {
  velocity: { label: 'Impact velocity', unit: 'm/s', dp: 0, step: 10 },
  caliber: { label: 'Calibre', unit: 'mm', scale: 1000, dp: 1, step: 1 },
  mass: { label: 'Mass (total)', unit: 'kg', dp: 3, step: 0.1 },
  ld: { label: 'Length / calibre', dp: 2, step: 0.1 },
  rodD: { label: 'Rod diameter', unit: 'mm', scale: 1000, dp: 1, step: 0.5 },
  rodLd: { label: 'Rod L/D', dp: 1, step: 1 },
  coreD: { label: 'Core diameter', unit: 'mm', scale: 1000, dp: 1, step: 0.5 },
  coreLd: { label: 'Core L/D', dp: 2, step: 0.1 },
  coreFrac: { label: 'Core dia / calibre', dp: 2, step: 0.02 },
  noseFrac: { label: 'Nose length fraction', dp: 2, step: 0.02 },
  capFrac: { label: 'Cap length fraction', dp: 2, step: 0.02 },
  fillFrac: { label: 'Filler fraction', dp: 2, step: 0.02 },
  fuzeDelay: { label: 'Fuze delay', unit: 'µs', scale: 1e6, dp: 0, step: 10 },
  coneAngle: { label: 'Liner cone angle', unit: '°', dp: 0, step: 5 },
  jetTip: { label: 'Jet tip velocity', unit: 'm/s', dp: 0, step: 100 },
  jetTail: { label: 'Jet tail velocity', unit: 'm/s', dp: 0, step: 100 },
  standoff: { label: 'Launch standoff', unit: 'm', dp: 2, step: 0.1 },
  sabotRange: { label: 'Sabot discard range', unit: 'm', dp: 2, step: 0.1 },
  yaw: { label: 'Yaw at impact', unit: '°', dp: 1, step: 1 },
  attack: { label: 'Attack angle', unit: '°', dp: 1, step: 1 },
  aimY: { label: 'Aim offset', unit: 'mm', scale: 1000, dp: 0, step: 10 },
};

const MAT_FIELDS = {
  core: ['Core material', PENETRATOR_KEYS],
  cap: ['Cap material', ['softcap', 'mild', 'rha', 'al7075']],
  body: ['Body material', ['al7075', 'mild', 'al5083']],
  shell: ['Casing material', ['mild', 'rha', 'cast']],
  filler: ['Filler', ['compb', 'tnt', 'octol', 'hesh']],
  liner: ['Liner material', ['copper', 'ti64', 'mild']],
  sabot: ['Sabot material', ['al7075', 'grp', 'mild']],
};

export class App {
  constructor(world, renderer, camera) {
    this.world = world; this.renderer = renderer; this.cam = camera;
    this.left = document.getElementById('left');
    this.right = document.getElementById('right');
    this.scrub = document.getElementById('scrub');
    this.tlabel = document.getElementById('tlabel');
    this.hud = document.getElementById('hud');
    this.legend = document.getElementById('legend');
    this.scrubbing = false;
    this.openLayer = null;
    this.buildLeft();
    this.buildRight();
    this.bindTop();
    this.bindViewport();
    this.bindKeys();
    this.world.bus.on('fired', () => this.refreshRight());
    this.world.bus.on('finished', () => this.refreshRight());
    this.world.bus.on('reset', () => this.refreshRight());
    this.world.bus.on('impact-begin', (info) => {
      // pull in to a scale where the deformation is actually legible
      if (this.cam.follow !== 'off') this.cam.setZoom(Math.min(this.cam.w, this.cam.h) / info.span);
    });
    this.lastPanelRefresh = 0;
  }

  // ==================================================================== left

  buildLeft() {
    const L = clear(this.left);
    L.appendChild(this.panelScenario());
    L.appendChild(this.panelProjectile());
    L.appendChild(this.panelSim());
    L.appendChild(this.panelView());
  }

  refreshLeft() {
    const scroll = this.left.scrollTop;
    this.buildLeft();
    this.left.scrollTop = scroll;
  }

  panelScenario() {
    const p = panel('Scenario');
    const w = this.world;
    p.body.appendChild(row('Preset', select(
      [{ value: '', label: '— choose —' }, ...PRESET_ORDER.map((k) => ({ value: k, label: PRESETS[k].name }))],
      '', (k) => { if (k) this.loadPreset(k); },
    )));
    const noteEl = el('div', { class: 'note' }, w.scene.name || '');
    p.body.appendChild(noteEl);
    p.body.appendChild(el('div', { class: 'grid3' },
      el('button', { class: 'mini', onclick: () => this.exportScenario() }, 'Export'),
      el('button', { class: 'mini', onclick: () => this.importScenario() }, 'Import'),
      el('button', { class: 'mini', onclick: () => this.saveLocal() }, 'Save slot'),
    ));
    const slots = Object.keys(localStorage).filter((k) => k.startsWith('tbs:'));
    if (slots.length) {
      p.body.appendChild(row('Saved', select(
        [{ value: '', label: `${slots.length} saved` }, ...slots.map((s) => ({ value: s, label: s.slice(4) }))],
        '', (k) => { if (k) this.loadLocal(k); },
      )));
    }
    return p;
  }

  panelProjectile() {
    const w = this.world, cfg = w.projectileCfg;
    const t = PROJECTILE_TYPES[cfg.type];
    const p = panel('Projectile', { tag: t.family });
    p.body.appendChild(row('Type', select(
      TYPE_ORDER.map((k) => ({ value: k, label: PROJECTILE_TYPES[k].name.split(' — ')[0] })),
      cfg.type, (k) => { w.setProjectile(makeProjectileConfig(k)); this.refreshLeft(); this.refreshRight(); },
    )));
    p.body.appendChild(el('div', { class: 'note' }, t.mechanism));

    const set = (key, v) => {
      const next = { ...w.projectileCfg, [key]: v };
      w.setProjectile(next);
      this.refreshLeft(); this.refreshRight();
    };

    for (const key of Object.keys(FIELDS)) {
      if (!(key in cfg)) continue;
      const f = FIELDS[key];
      const sc = f.scale || 1;
      p.body.appendChild(row(f.unit ? `${f.label} (${f.unit})` : f.label,
        num(cfg[key] * sc, { dp: f.dp, step: f.step, onchange: (v) => set(key, v / sc) })));
    }
    for (const [key, [label, opts]] of Object.entries(MAT_FIELDS)) {
      if (!(key in cfg)) continue;
      p.body.appendChild(row(label, select(
        opts.map((k) => ({ value: k, label: MATERIALS[k].name })), cfg[key], (v) => set(key, v),
      )));
    }

    const d = w.projectile.describe();
    p.body.appendChild(kv([
      ['Meshed mass', U.mass(w.projectile.mass0)],
      ['Penetrator Ø', U.len(d.penDiameter)],
      ['Overall length', U.len(d.length)],
      ['L / D', d.ld.toFixed(2)],
      ['Sectional density', `${d.sectionalDensity.toFixed(0)} kg/m²`],
      ['Muzzle energy', U.energy(w.projectile.ke), 'hi'],
      ['Slab depth (2.5-D)', U.len(w.projectile.slab)],
    ]));
    p.body.appendChild(el('div', { class: 'hint' },
      'Mass is achieved by scaling the body length, so density stays a real material property. '
      + 'The slab depth is chosen to preserve the true projectile mass in the plane-strain slice.'));
    return p;
  }

  panelSim() {
    const w = this.world;
    const p = panel('Simulation');
    p.body.appendChild(row('Discretisation', select(
      Object.keys(QUALITY).map((k) => ({ value: k, label: QUALITY[k].label })),
      w.settings.quality, (v) => { w.settings.quality = v; this.refreshRight(); },
    )));

    const tsVals = [500, 1000, 2000, 4000, 10000, 40000];
    p.body.appendChild(row('Flight time scale', select(
      tsVals.map((v) => ({ value: String(v), label: `1 : ${v.toLocaleString()}` })),
      String(Math.round(1 / w.settings.timeScale)), (v) => { w.settings.timeScale = 1 / +v; },
    )));
    const isVals = [10000, 30000, 60000, 150000, 400000];
    p.body.appendChild(row('Impact time scale', select(
      isVals.map((v) => ({ value: String(v), label: `1 : ${v.toLocaleString()}` })),
      String(Math.round(1 / w.settings.impactTimeScale)), (v) => { w.settings.impactTimeScale = 1 / +v; },
    )));
    p.body.appendChild(el('div', { class: 'row' },
      el('label', {}, 'Auto slow-motion at contact'),
      toggle(w.settings.autoSlow ? 'ON' : 'AUTO', w.settings.autoSlow, (v) => { w.settings.autoSlow = v; })));

    const ev = slider(50, 800, w.settings.maxEventTime * 1e6, 10,
      (v) => { w.settings.maxEventTime = v * 1e-6; }, (v) => `${v} µs`);
    p.body.appendChild(el('div', { class: 'row' }, el('label', {}, 'Resolved window'), ev.out, ev.range));

    p.body.appendChild(el('h3', { style: 'background:none;padding:8px 0 2px;position:static' }, 'Model parameters'));
    const mk = (label, get, set, min, max, step, fmt2) => {
      const s = slider(min, max, get(), step, set, fmt2);
      p.body.appendChild(el('div', { class: 'row' }, el('label', {}, label), s.out, s.range));
    };
    mk('Out-of-plane confinement', () => (w.solver ? w.solver.confinement : 1.8),
      (v) => { w.confinementOverride = v; if (w.solver) w.solver.confinement = v; }, 1.0, 3.0, 0.05, (v) => v.toFixed(2));
    mk('Contact friction µ', () => (w.solver ? w.solver.friction : 0.15),
      (v) => { w.frictionOverride = v; if (w.solver) w.solver.friction = v; }, 0, 0.6, 0.01, (v) => v.toFixed(2));
    mk('Bond viscosity', () => (w.solver ? w.solver.dampLin : 0.2),
      (v) => { w.dampOverride = v; if (w.solver) w.solver.dampLin = v; }, 0.02, 1.0, 0.02, (v) => v.toFixed(2));
    p.body.appendChild(el('div', { class: 'hint' },
      'These are the calibration knobs of the continuum model, exposed rather than hidden. '
      + 'Confinement is the 2-D→3-D cavity-expansion correction; bond viscosity is numerical damping '
      + 'and should be as low as the run tolerates. See MODEL for what each one does.'));
    return p;
  }

  panelView() {
    const p = panel('View');
    const o = this.renderer.opts;
    p.body.appendChild(row('Field', select(
      FIELD_MODES.map((f) => ({ value: f.key, label: f.label })), o.field,
      (v) => { o.field = v; this.updateLegend(); },
    )));
    const tg = el('div', { class: 'grid2' });
    const t = (label, key) => tg.appendChild(toggle(label, o[key], (v) => { o[key] = v; }));
    t('Grid', 'showGrid'); t('2.5-D depth', 'extrude');
    t('Fragments', 'showFragments'); t('Trails', 'showTrails');
    t('Velocity vectors', 'showVectors'); t('Domain bounds', 'showCorridor');
    p.body.appendChild(tg);
    const g = slider(0.6, 1.8, o.nodeGain, 0.05, (v) => { o.nodeGain = v; }, (v) => `${v.toFixed(2)}×`);
    p.body.appendChild(el('div', { class: 'row' }, el('label', {}, 'Node size'), g.out, g.range));
    return p;
  }

  // =================================================================== right

  buildRight() {
    const R = clear(this.right);
    R.appendChild(this.panelArray());
    R.appendChild(this.panelInternals());
    R.appendChild(this.panelReport());
    R.appendChild(this.panelAnalytics());
    R.appendChild(this.panelInspector());
    R.appendChild(this.panelDiagnostics());
    R.appendChild(this.panelLog());
  }

  refreshRight() {
    // never rebuild under the user's cursor: an input being edited would lose
    // focus and the half-typed value with it
    if (this.right.contains(document.activeElement) && document.activeElement !== document.body) return;
    const scroll = this.right.scrollTop;
    this.buildRight();
    this.right.scrollTop = scroll;
  }

  panelArray() {
    const w = this.world, sc = w.scene;
    const p = panel('Armour array', { tag: `${sc.activeLayers().length} layers` });
    const changed = () => { sc.rebuild(); w.reset(); this.refreshRight(); };

    sc.layers.forEach((Lr, idx) => {
      const m = getMaterial(Lr.material);
      const open = this.openLayer === Lr.id;
      const box = el('div', { class: `layer${open ? ' open' : ''}${this.renderer.selection && this.renderer.selection.id === Lr.id ? ' sel' : ''}` });
      const head = el('div', { class: 'lh', onclick: () => { this.openLayer = open ? null : Lr.id; this.renderer.selection = { kind: 'layer', id: Lr.id, obj: Lr }; this.refreshRight(); } },
        el('span', { class: 'sw', style: `background:${m.color}` }),
        el('span', { class: 'nm' }, Lr.label || m.name),
        el('span', { class: 'th' }, `${(Lr.thickness * 1000).toFixed(0)}mm ${Lr.slope ? `@${Lr.slope}°` : ''}`));
      const b = el('div', { class: 'lb' });
      b.appendChild(row('Material', select(
        ARMOUR_KEYS.map((k) => ({ value: k, label: MATERIALS[k].name })), Lr.material,
        (v) => { Lr.material = v; changed(); })));
      b.appendChild(row('Thickness (mm)', num(Lr.thickness * 1000, { dp: 1, step: 1, onchange: (v) => { Lr.thickness = Math.max(0.0005, v / 1000); changed(); } })));
      b.appendChild(row('Slope (°)', num(Lr.slope, { dp: 1, step: 5, onchange: (v) => { Lr.slope = v; changed(); } })));
      b.appendChild(row('Air gap in front (mm)', num(Lr.gap * 1000, { dp: 0, step: 10, onchange: (v) => { Lr.gap = Math.max(0, v / 1000); changed(); } })));
      b.appendChild(row('Height (mm)', num(Lr.height * 1000, { dp: 0, step: 50, onchange: (v) => { Lr.height = Math.max(0.05, v / 1000); changed(); } })));
      b.appendChild(row('Label', el('input', { type: 'text', value: Lr.label || '', onchange: (e) => { Lr.label = e.target.value; changed(); } })));
      b.appendChild(el('div', { class: 'grid3' },
        toggle('Bonded', Lr.bonded, (v) => { Lr.bonded = v; changed(); }),
        toggle('Enabled', Lr.enabled, (v) => { Lr.enabled = v; changed(); }),
        el('button', { class: 'mini', onclick: () => { sc.layers.splice(idx, 1); changed(); } }, 'Delete')));
      b.appendChild(kv([
        ['Density', `${m.rho} kg/m³`],
        ['Yield', U.pressure(m.Y)],
        ['Failure strain', `${(m.epsF * 100).toFixed(1)} %`],
        ['Hardness', `${m.BHN} BHN`],
        ['LOS thickness', U.len(Lr.losThickness || Lr.thickness)],
        ['Areal mass', `${(Lr.thickness * m.rho).toFixed(0)} kg/m²`],
      ]));
      if (m.notes) b.appendChild(el('div', { class: 'note' }, m.notes));
      box.appendChild(head); box.appendChild(b);
      p.body.appendChild(box);
    });

    p.body.appendChild(el('div', { class: 'grid2' },
      el('button', { class: 'mini', onclick: () => { sc.layers.push(makeLayer({ material: 'rha', thickness: 0.02, gap: 0.05 })); changed(); } }, '+ Layer'),
      el('button', { class: 'mini', onclick: () => this.customMaterial() }, '+ Material')));

    p.body.appendChild(kv([
      ['Line-of-sight total', U.len(sc.losTotal)],
      ['Normal thickness', U.len(sc.normalTotal)],
      ['Areal mass', `${sc.activeLayers().reduce((a, L) => a + L.thickness * L.mat.rho, 0).toFixed(0)} kg/m²`],
      w.analytics ? ['RHAe (indicative)', U.len(w.analytics.arrayRHAe || 0)] : null,
    ]));
    return p;
  }

  panelInternals() {
    const w = this.world, sc = w.scene;
    const p = panel('Internal components', { tag: `${sc.modules.length}`, collapsed: sc.modules.length === 0 });
    const changed = () => { w.reset(); this.refreshRight(); };
    sc.modules.forEach((m, idx) => {
      const spec = MODULE_TYPES[m.type];
      const open = this.openLayer === m.id;
      const box = el('div', { class: `layer${open ? ' open' : ''}` });
      const stateCol = m.state === 'destroyed' ? 'var(--danger)' : m.state === 'damaged' ? 'var(--warn)' : 'var(--ink2)';
      box.appendChild(el('div', { class: 'lh', onclick: () => { this.openLayer = open ? null : m.id; this.renderer.selection = { kind: 'module', id: m.id, obj: m }; this.refreshRight(); } },
        el('span', { class: 'sw', style: `background:${spec.color}` }),
        el('span', { class: 'nm' }, m.label || spec.label),
        el('span', { class: 'th', style: `color:${stateCol}` }, m.state)));
      const b = el('div', { class: 'lb' });
      b.appendChild(row('Type', select(Object.keys(MODULE_TYPES).map((k) => ({ value: k, label: MODULE_TYPES[k].label })), m.type, (v) => { m.type = v; changed(); })));
      b.appendChild(row('x (mm)', num(m.x * 1000, { dp: 0, step: 20, onchange: (v) => { m.x = v / 1000; changed(); } })));
      b.appendChild(row('y (mm)', num(m.y * 1000, { dp: 0, step: 20, onchange: (v) => { m.y = v / 1000; changed(); } })));
      b.appendChild(row('width (mm)', num(m.w * 1000, { dp: 0, step: 20, onchange: (v) => { m.w = Math.max(0.02, v / 1000); changed(); } })));
      b.appendChild(row('height (mm)', num(m.h * 1000, { dp: 0, step: 20, onchange: (v) => { m.h = Math.max(0.02, v / 1000); changed(); } })));
      b.appendChild(row('Casing (mm)', num(m.casing * 1000, { dp: 1, step: 1, onchange: (v) => { m.casing = Math.max(0, v / 1000); changed(); } })));
      b.appendChild(row('Label', el('input', { type: 'text', value: m.label || '', onchange: (e) => { m.label = e.target.value; changed(); } })));
      b.appendChild(el('button', { class: 'mini', onclick: () => { sc.modules.splice(idx, 1); changed(); } }, 'Delete'));
      if (m.hits.length) {
        b.appendChild(kv([
          ['Integrity', U.pct(m.integrity)],
          ['Strikes', String(m.hits.length)],
          ['Energy absorbed', U.energy(m.hits.reduce((a, h) => a + h.energy, 0))],
        ]));
      }
      if (spec.note) b.appendChild(el('div', { class: 'note' }, spec.note));
      box.appendChild(b);
      p.body.appendChild(box);
    });
    p.body.appendChild(el('button', {
      class: 'mini',
      onclick: () => { sc.modules.push(makeModule({ x: 0.5 + sc.depth, y: 0, type: 'crew' })); changed(); },
    }, '+ Component'));
    p.body.appendChild(el('div', { class: 'hint' },
      'Components are resolved analytically: a striker must beat the casing (plugging-work model), '
      + 'then the surviving energy is compared with a component toughness scale. Those scales are '
      + 'engineering placeholders, not validated vulnerability data.'));
    return p;
  }

  panelReport() {
    const w = this.world, s = w.stats;
    const p = panel('Impact report');
    const v = w.state === 'done' ? w.verdict() : null;
    if (v) {
      const cls = v.perforated ? 'pen' : (v.ricochet || v.depth === 0) ? 'stop' : '';
      p.body.appendChild(el('div', { class: `verdict ${cls}` },
        el('h4', {}, v.headline),
        el('p', {}, v.kill !== 'none' ? `Assessed effect: ${v.kill} kill` : 'No component effect')));
    } else if (w.state === 'idle') {
      p.body.appendChild(el('div', { class: 'note' }, 'Press FIRE. The projectile flies, contacts the array, and the continuum solver takes over at the struck face.'));
    }
    const at = s.atPerforation;
    p.body.appendChild(kv([
      ['Max penetration depth', U.len(s.maxDepth), s.perforated ? 'bad' : ''],
      ['Perforated', s.perforated ? 'YES' : 'no', s.perforated ? 'bad' : 'good'],
      ['Ricochet', s.ricochet ? 'YES' : 'no'],
      at ? ['Residual mass (attached)', U.mass(at.mass)] : ['Penetrator mass (attached)', U.mass(s.residualMass)],
      ['Undamaged core mass', U.mass(at ? at.coherent : (s.coherentMass || 0))],
      at ? ['Residual velocity', U.vel(at.velocity)] : ['Penetrator velocity', U.vel(s.residualVelocity)],
      at ? ['Residual energy', U.energy(at.ke)] : null,
      ['Mass eroded / lost', U.mass(at ? at.eroded : s.erodedMass)],
      ['Back-face bulge', U.len(s.backfaceBulge)],
      ['Spall mass (detached)', U.mass(s.spallMass)],
      ['Fragments transported', String(s.fragmentCount)],
      ['Failed bonds', s.brokenBonds.toLocaleString()],
      ['Peak node temperature', s.peakTemp ? U.temp(s.peakTemp) : '—'],
      ['Contact duration', s.contactTime ? U.time(s.contactTime) : '—'],
    ]));
    if (v && v.modules && (v.modules.destroyed.length || v.modules.damaged.length)) {
      p.body.appendChild(el('div', { class: 'hint' }, 'Components affected'));
      p.body.appendChild(kv([
        ...v.modules.destroyed.map((m) => [m.label || MODULE_TYPES[m.type].label, 'destroyed', 'bad']),
        ...v.modules.damaged.map((m) => [m.label || MODULE_TYPES[m.type].label, 'damaged', 'hi']),
      ]));
    }
    return p;
  }

  panelAnalytics() {
    const w = this.world;
    const p = panel('Analytic cross-checks', { collapsed: false });
    if (!w.analytics) {
      p.body.appendChild(el('div', { class: 'note' }, 'Computed when the shot is fired.'));
      return p;
    }
    p.body.appendChild(el('div', { class: 'hint' },
      'Independent closed-form models, computed from the same inputs but not used to drive the simulation. '
      + 'Large disagreement is information, not a failure.'));
    p.body.appendChild(kv(w.analytics.models.map((m) => [m.name, U.len(m.value), 'hi'])));
    for (const m of w.analytics.models) {
      p.body.appendChild(el('div', { class: 'note' }, `${m.name}: ${m.note}`));
    }
    p.body.appendChild(kv([
      ['Simulated depth', U.len(w.stats.maxDepth)],
      ['Array LOS', U.len(w.analytics.arrayLOS || 0)],
      ['Array areal mass', `${(w.analytics.arealMass || 0).toFixed(0)} kg/m²`],
    ]));
    return p;
  }

  panelInspector() {
    const p = panel('Inspector', { collapsed: !this.renderer.selection });
    const sel = this.renderer.selection;
    const w = this.world;
    if (!sel) {
      p.body.appendChild(el('div', { class: 'note' }, 'Click the viewport to inspect a plate, a component or an individual continuum node.'));
      return p;
    }
    if (sel.kind === 'node' && w.domain) {
      const d = w.domain, i = sel.id;
      const mt = d.matTable[d.matIndex[i]];
      p.body.appendChild(kv([
        ['Node', `#${i}`],
        ['Material', mt.mat.name],
        ['Role', ['armour', 'penetrator', 'projectile part', 'filler', 'component'][d.role[i]]],
        ['Position', `${(d.px[i] * 1000).toFixed(1)}, ${(d.py[i] * 1000).toFixed(1)} mm`],
        ['Displacement', U.len(Math.hypot(d.px[i] - d.rx[i], d.py[i] - d.ry[i]))],
        ['Velocity', U.vel(Math.hypot(d.vx[i], d.vy[i]), 1)],
        ['Mass', U.mass(d.mass[i])],
        ['Damage φ', `${d.damage[i].toFixed(3)} (${d.nBroken[i]}/${d.nBond0[i]} bonds)`],
        ['Plastic strain', d.plStrain[i].toFixed(4)],
        ['Temperature', U.temp(d.temp[i])],
        ['Virial stress', U.pressure(d.virial[i])],
        ['Dilatation θ', d.theta[i].toFixed(5)],
        ['Detached', (d.flags[i] & 8) ? 'yes' : 'no'],
        ['Boundary', (d.flags[i] & 4) ? 'clamped' : (d.flags[i] & 2) ? 'absorbing' : '—'],
      ]));
    } else if (sel.kind === 'layer') {
      const L = sel.obj, m = L.mat;
      p.body.appendChild(kv([
        ['Layer', L.label || m.name],
        ['Material', m.name],
        ['Thickness', U.len(L.thickness)],
        ['LOS thickness', U.len(L.losThickness)],
        ['Slope', `${L.slope}°`],
        ['Density', `${m.rho} kg/m³`],
        ["Young's modulus", U.pressure(m.E)],
        ['Yield strength', U.pressure(m.Y)],
        ['Ultimate strength', U.pressure(m.UTS)],
        ['Failure strain', `${(m.epsF * 100).toFixed(1)} %`],
        ['Fracture energy', `${(m.G0 / 1000).toFixed(1)} kJ/m²`],
        ['Hardness', `${m.BHN} BHN`],
        ['Fragment strikes', String(L.fragHits || 0)],
      ]));
      if (m.source) p.body.appendChild(el('div', { class: 'note' }, `Source: ${m.source}`));
    } else if (sel.kind === 'module') {
      const m = sel.obj, spec = MODULE_TYPES[m.type];
      p.body.appendChild(kv([
        ['Component', m.label || spec.label],
        ['State', m.state, m.state === 'destroyed' ? 'bad' : m.state === 'ok' ? 'good' : 'hi'],
        ['Integrity', U.pct(m.integrity)],
        ['Casing', U.len(m.casing)],
        ['Toughness scale', `${(m.tough ?? spec.tough)} J`],
        ['Strikes', String(m.hits.length)],
        ['Energy absorbed', U.energy(m.hits.reduce((a, h) => a + h.energy, 0))],
      ]));
    }
    return p;
  }

  panelDiagnostics() {
    const w = this.world;
    const p = panel('Solver diagnostics', { collapsed: true });
    const mi = w.meshInfo;
    if (mi) {
      p.body.appendChild(kv([
        ['Nodes', mi.particles.toLocaleString()],
        ['Bonds', mi.bonds.toLocaleString()],
        ['Lattice spacing Δ', U.len(mi.dx, 2)],
        ['Horizon δ', U.len(mi.delta, 2)],
        ['Slab depth h', U.len(mi.slab)],
        ['Time step', U.time(mi.dt)],
        ['Nodes across penetrator', mi.acrossPenetrator.toFixed(1)],
        ['Nodes through plate', mi.throughThickness.map((x) => x.toFixed(0)).join(' / ')],
        ['Corridor', `${U.len(mi.width)} × ${U.len(mi.length)}`],
      ]));
    }
    if (w.solver) {
      const a = w.solver.energyAudit();
      const bad = Math.abs(a.drift) > 0.35;
      p.body.appendChild(el('div', { class: 'hint' }, 'Energy budget'));
      p.body.appendChild(kv([
        ['Initial E₀', U.energy(a.E0)],
        ['Kinetic now', U.energy(a.kinetic)],
        ['Elastic stored', U.energy(a.strain)],
        ['Plastic work', U.energy(a.plastic)],
        ['Fracture work', U.energy(a.fracture)],
        ['Viscous damping', U.energy(a.damping)],
        ['Closure drift', U.pct(a.drift, 1), bad ? 'bad' : 'good'],
      ]));
      p.body.appendChild(el('div', { class: 'note' },
        'An explicit scheme with penalty contact and rate-dependent plasticity does not conserve energy exactly. '
        + 'The drift is reported rather than hidden: beyond roughly ±35 % treat the run as qualitative only, '
        + 'and refine the discretisation or lower the bond viscosity.'));
    }
    p.body.appendChild(kv([
      ['Solver ms / frame', w.perf.msLastFrame.toFixed(2)],
      ['Steps / frame', String(w.perf.stepsLastFrame)],
      ['Recorded frames', String(w.recorder.length)],
      ['Recorder memory', `${(w.recorder.memoryBytes() / 1e6).toFixed(1)} MB`],
    ]));
    return p;
  }

  panelLog() {
    const w = this.world;
    const p = panel('Event log', { tag: `${w.log.entries.length}` });
    const box = el('div', { id: 'log' });
    for (const e of w.log.entries.slice(-160)) {
      box.appendChild(el('div', { class: `s${e.severity}` },
        el('span', { class: 't' }, U.time(e.t)),
        el('span', {}, e.text)));
    }
    p.body.appendChild(box);
    box.scrollTop = box.scrollHeight;
    return p;
  }

  // ================================================================ controls

  bindTop() {
    const w = this.world;
    const $ = (id) => document.getElementById(id);
    $('btnFire').onclick = () => { w.fire(); this.renderer.frameOverride = null; this.refreshRight(); };
    $('btnReset').onclick = () => { w.reset(); this.renderer.frameOverride = null; this.refreshRight(); };
    this.btnPlay = $('btnPlay');
    this.btnPlay.onclick = () => this.togglePlay();
    $('btnStepF').onclick = () => this.stepFrame(1);
    $('btnStepB').onclick = () => this.stepFrame(-1);
    $('btnStep10').onclick = () => { this.goLive(); w.paused = true; w.requestSteps(10); this.syncPlayBtn(); };
    $('btnDocs').onclick = () => window.open('./docs/MODEL.md', '_blank');

    $('btnZoomIn').onclick = () => this.cam.setZoom(this.cam.targetScale * 1.4);
    $('btnZoomOut').onclick = () => this.cam.setZoom(this.cam.targetScale / 1.4);
    $('btnFit').onclick = () => this.fit();
    this.btnFollow = $('btnFollow');
    this.btnFollow.classList.add('on');
    this.btnFollow.onclick = () => {
      const order = ['auto', 'projectile', 'impact', 'off'];
      const i = (order.indexOf(this.cam.follow) + 1) % order.length;
      this.cam.follow = order[i];
      this.btnFollow.classList.toggle('on', this.cam.follow !== 'off');
      this.btnFollow.title = `Camera follow: ${this.cam.follow}`;
    };
    $('btnLive').onclick = () => this.goLive();

    this.scrub.addEventListener('input', () => {
      this.scrubbing = true;
      w.paused = true;
      const f = w.recorder.frame(+this.scrub.value);
      this.renderer.frameOverride = f;
      this.syncPlayBtn();
      this.updateScrubLabel();
    });

    for (const b of document.querySelectorAll('#tabs button')) {
      b.onclick = () => {
        for (const x of document.querySelectorAll('#tabs button')) x.classList.remove('on');
        b.classList.add('on');
        this.left.classList.toggle('show', b.dataset.panel === 'left');
        this.right.classList.toggle('show', b.dataset.panel === 'right');
      };
    }
  }

  togglePlay() {
    const w = this.world;
    if (this.renderer.frameOverride) {
      // resume from the scrubbed position: restore the nearest key frame and
      // re-run forward. The solver is deterministic, so this is exact.
      const idx = +this.scrub.value;
      const k = w.recorder.keyAtOrBefore(idx);
      if (k >= 0 && w.domain) {
        w.recorder.restoreKey(w, k);
        w.recorder.frames.length = k + 1;
      }
      this.renderer.frameOverride = null;
      this.scrubbing = false;
    }
    w.paused = !w.paused;
    this.syncPlayBtn();
  }

  syncPlayBtn() {
    const paused = this.world.paused || !!this.renderer.frameOverride;
    this.btnPlay.textContent = paused ? '▶' : '⏸';
    this.btnPlay.classList.toggle('on', !paused);
  }

  stepFrame(dir) {
    const w = this.world;
    if (dir > 0 && !this.renderer.frameOverride) {
      w.paused = true; w.requestSteps(1); this.syncPlayBtn(); return;
    }
    const i = Math.max(0, Math.min(w.recorder.length - 1, (+this.scrub.value) + dir));
    this.scrub.value = String(i);
    this.renderer.frameOverride = w.recorder.frame(i);
    w.paused = true;
    this.scrubbing = true;
    this.syncPlayBtn();
    this.updateScrubLabel();
  }

  goLive() {
    this.renderer.frameOverride = null;
    this.scrubbing = false;
    this.scrub.value = String(Math.max(0, this.world.recorder.length - 1));
    this.updateScrubLabel();
    this.syncPlayBtn();
  }

  /** Frame the whole target. Called by the user, so it stops the camera following. */
  fit() {
    this.frameScene();
    this.cam.follow = 'off';
    if (this.btnFollow) this.btnFollow.classList.remove('on');
  }

  /** Frame the target without changing the follow mode. */
  frameScene() { this.cam.frame(this.world.scene.bounds()); }

  bindViewport() {
    const c = this.renderer.canvas;
    let dragging = false, lastX = 0, lastY = 0, moved = 0;
    const pointers = new Map();
    let pinchDist = 0;

    c.addEventListener('pointerdown', (e) => {
      c.setPointerCapture(e.pointerId);
      pointers.set(e.pointerId, [e.clientX, e.clientY]);
      dragging = true; moved = 0;
      lastX = e.clientX; lastY = e.clientY;
    });
    c.addEventListener('pointermove', (e) => {
      if (!pointers.has(e.pointerId)) return;
      pointers.set(e.pointerId, [e.clientX, e.clientY]);
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
        if (pinchDist > 0) {
          const r = c.getBoundingClientRect();
          this.cam.zoomAt(((a[0] + b[0]) / 2 - r.left) * this.renderer.dpr,
            ((a[1] + b[1]) / 2 - r.top) * this.renderer.dpr, d / pinchDist);
        }
        pinchDist = d;
        return;
      }
      if (!dragging) return;
      const dx = e.clientX - lastX, dy = e.clientY - lastY;
      moved += Math.abs(dx) + Math.abs(dy);
      lastX = e.clientX; lastY = e.clientY;
      this.cam.panPixels(dx * this.renderer.dpr, dy * this.renderer.dpr);
      this.btnFollow.classList.remove('on');
    });
    const up = (e) => {
      pointers.delete(e.pointerId);
      if (pointers.size < 2) pinchDist = 0;
      if (dragging && moved < 5) {
        const r = c.getBoundingClientRect();
        const hit = this.renderer.pick(this.world,
          (e.clientX - r.left) * this.renderer.dpr, (e.clientY - r.top) * this.renderer.dpr);
        this.renderer.selection = hit;
        this.refreshRight();
      }
      dragging = false;
    };
    c.addEventListener('pointerup', up);
    c.addEventListener('pointercancel', up);
    c.addEventListener('wheel', (e) => {
      e.preventDefault();
      const r = c.getBoundingClientRect();
      this.cam.zoomAt((e.clientX - r.left) * this.renderer.dpr, (e.clientY - r.top) * this.renderer.dpr,
        Math.exp(-e.deltaY * 0.0016));
    }, { passive: false });
  }

  bindKeys() {
    window.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
      switch (e.key) {
        case ' ': e.preventDefault(); this.togglePlay(); break;
        case 'f': case 'F': this.world.fire(); this.renderer.frameOverride = null; this.refreshRight(); break;
        case 'r': case 'R': this.world.reset(); this.renderer.frameOverride = null; this.refreshRight(); break;
        case '.': this.stepFrame(1); break;
        case ',': this.stepFrame(-1); break;
        case '=': case '+': this.cam.setZoom(this.cam.targetScale * 1.3); break;
        case '-': this.cam.setZoom(this.cam.targetScale / 1.3); break;
        case '0': this.fit(); break;
        default: {
          const i = '123456'.indexOf(e.key);
          if (i >= 0) { this.renderer.opts.field = FIELD_MODES[i].key; this.updateLegend(); this.refreshLeft(); }
        }
      }
    });
  }

  // ================================================================= per-frame

  tick() {
    const w = this.world;
    const $ = (id) => document.getElementById(id);
    $('roState').textContent = w.state + (w.coastMode ? ' ·coast' : '');
    $('roTime').textContent = U.time(w.simTime);
    $('roDepth').textContent = w.stats.maxDepth ? U.len(w.stats.maxDepth) : '—';
    $('roVres').textContent = w.stats.residualVelocity ? U.vel(w.stats.residualVelocity) : '—';
    $('roNodes').textContent = w.domain ? `${w.domain.n} / ${w.domain.nb}` : '—';
    $('roPerf').textContent = `${w.perf.msLastFrame.toFixed(1)}`;

    if (!this.scrubbing) {
      const n = w.recorder.length;
      this.scrub.max = String(Math.max(0, n - 1));
      if (!this.renderer.frameOverride) this.scrub.value = String(Math.max(0, n - 1));
      this.updateScrubLabel();
    }
    this.updateHud();
    if (!this.legendMode || this.legendMode !== this.renderer.opts.field) this.updateLegend();

    // keep the numeric panels live while a run is in progress
    const now = performance.now();
    const running = w.state !== 'idle';
    if (w.state === 'done' && this.lastState !== 'done') { this.refreshRight(); this.lastPanelRefresh = now; }
    else if (running && now - this.lastPanelRefresh > 500) { this.refreshRight(); this.lastPanelRefresh = now; }
    this.lastState = w.state;
  }

  updateScrubLabel() {
    const w = this.world;
    const i = +this.scrub.value;
    const f = w.recorder.frame(i);
    this.tlabel.textContent = `frame ${i} / ${Math.max(0, w.recorder.length - 1)}`
      + (f ? `  ·  ${U.time(f.t)}` : '');
  }

  updateHud() {
    const w = this.world;
    const rows = [];
    const push = (h, alert) => rows.push({ h, alert });
    if (w.state === 'flight' && w.projectile) {
      push(`<b>flight</b> ${U.vel(w.projectile.speed)} · ${U.energy(w.projectile.ke)} · ${w.projectile.distance.toFixed(2)} m`);
    }
    if (w.domain) {
      const s = w.stats;
      push(`<b>penetration</b> ${U.len(s.maxDepth)} of ${U.len(w.scene.losTotal)} LOS`);
      push(`<b>penetrator</b> ${U.mass(s.residualMass)} @ ${U.vel(s.residualVelocity)}  ·  eroded ${U.mass(s.erodedMass)}`);
      push(`<b>armour</b> ${s.brokenBonds.toLocaleString()} failed bonds · spall ${U.mass(s.spallMass)} · bulge ${U.len(s.backfaceBulge)}`);
      if (s.perforated) push('<b>PERFORATED</b>', true);
      if (s.ricochet) push('<b>RICOCHET</b>', true);
    }
    if (this.renderer.frameOverride) push('<b>scrubbing</b> — recorded frame, solver held');
    const hud = this.hud;
    clear(hud);
    for (const r of rows) hud.appendChild(el('div', { class: `chip${r.alert ? ' alert' : ''}`, html: r.h }));
  }

  updateLegend() {
    const mode = this.renderer.opts.field;
    this.legendMode = mode;
    const spec = FIELD_MODES.find((f) => f.key === mode);
    const L = clear(this.legend);
    L.appendChild(el('div', {}, el('b', {}, spec.label)));
    if (mode === 'material') {
      const seen = new Set();
      const list = el('div', {});
      for (const Lr of this.world.scene.activeLayers()) {
        if (seen.has(Lr.material)) continue;
        seen.add(Lr.material);
        list.appendChild(el('div', { style: 'display:flex;gap:5px;align-items:center;margin-top:2px' },
          el('span', { style: `width:10px;height:10px;border-radius:2px;background:${Lr.mat.color}` }),
          el('span', {}, Lr.mat.name)));
      }
      L.appendChild(list);
    } else {
      const ramp = { damage: RAMP_DAMAGE, plastic: RAMP_PLASTIC, temp: RAMP_TEMP, velocity: RAMP_VELOCITY, stress: RAMP_STRESS }[mode];
      const bar = el('div', { class: 'bar' });
      for (let i = 0; i < 5; i++) bar.style.setProperty(`--l${i}`, rgb(ramp(i / 4)));
      L.appendChild(bar);
      const ends = { damage: ['intact', 'failed'], plastic: ['0', '3 εf'], temp: ['20 °C', '1200 °C'], velocity: ['0', `${this.renderer.opts.velScale} m/s`], stress: ['compression', 'tension'] }[mode];
      L.appendChild(el('div', { class: 'ends' }, el('span', {}, ends[0]), el('span', {}, ends[1])));
    }
    L.appendChild(el('div', { style: 'color:var(--dim);margin-top:4px;line-height:1.4' }, spec.legend));
  }

  // ============================================================ scenario I/O

  loadPreset(key) {
    const p = PRESETS[key];
    const w = this.world;
    w.setScene(Scene.fromJSON(p.scene));
    w.scene.name = p.name;
    w.setProjectile(makeProjectileConfig(p.projectile.type, p.projectile));
    this.openLayer = null;
    this.renderer.selection = null;
    this.buildLeft(); this.buildRight();
    this.frameScene();
  }

  exportScenario() {
    const j = JSON.stringify(this.world.toJSON(), null, 2);
    const blob = new Blob([j], { type: 'application/json' });
    const a = el('a', { href: URL.createObjectURL(blob), download: `${(this.world.scene.name || 'scenario').replace(/\W+/g, '-')}.tbs.json` });
    document.body.appendChild(a); a.click(); a.remove();
  }

  importScenario() {
    const inp = el('input', { type: 'file', accept: '.json,application/json' });
    inp.onchange = async () => {
      const f = inp.files[0];
      if (!f) return;
      try {
        this.world.loadJSON(JSON.parse(await f.text()));
        this.buildLeft(); this.buildRight(); this.fit();
      } catch (err) { alert(`Could not load scenario: ${err.message}`); }
    };
    inp.click();
  }

  saveLocal() {
    const name = prompt('Save scenario as', this.world.scene.name || 'scenario');
    if (!name) return;
    localStorage.setItem(`tbs:${name}`, JSON.stringify(this.world.toJSON()));
    this.refreshLeft();
  }

  loadLocal(key) {
    try {
      this.world.loadJSON(JSON.parse(localStorage.getItem(key)));
      this.buildLeft(); this.buildRight(); this.fit();
    } catch (err) { alert(`Could not load: ${err.message}`); }
  }

  customMaterial() {
    const base = prompt('Clone which material? (key)', 'rha');
    if (!base || !MATERIALS[base]) return;
    const name = prompt('New material name', `${MATERIALS[base].name} variant`);
    if (!name) return;
    const key = `custom_${Date.now().toString(36)}`;
    registerMaterial({ ...MATERIALS[base], key, name, custom: true });
    ARMOUR_KEYS.push(key);
    this.world.scene.layers.push(makeLayer({ material: key, thickness: 0.02, gap: 0.02 }));
    this.world.scene.rebuild();
    this.world.reset();
    this.refreshRight();
  }
}

export { ROLE };
