# Terminal Ballistics Sandbox

A real-time, interactive terminal-ballistics simulator: deformable armour,
dynamic projectiles, and a rendering layer that only ever draws what the solver
computed.

The armour is a **peridynamic continuum**, not a sprite. The projectile is a
meshed body that erodes, upsets, shatters or ricochets according to its own
material state. The penetration channel is opened by the interaction over
hundreds of solver steps, and whatever shape is left at the end is the state
the solver arrived at — it can be paused, scrubbed frame by frame, and probed
node by node.

![the reference case](docs/screenshot.png)

---

## Running it

The application is plain ES modules with no build step and no dependencies, so
it needs an HTTP origin:

```bash
python3 -m http.server 8080
# then open http://localhost:8080/
```

If you would rather have one file you can double-click:

```bash
node tools/build.mjs      # writes dist/terminal-ballistics.html
```

That build inlines every module and runs from `file://`.

---

## What it does

Press **FIRE**. The projectile leaves the muzzle as a rigid body, flies with
drag and gravity, discards its sabot if it has one, and when it comes within a
few lattice spacings of the array the world hands its exact state — position,
orientation, velocity, geometry, per-part materials — to the continuum solver.
From that moment the impact is resolved at roughly 10⁻⁷ s per step.

You can:

- design layered armour arrays — thickness, material, slope, air gaps,
  lamination, and 16 armour materials from RHA to boron carbide;
- configure ten projectile types (AP, APC, APCBC, APHE, APCR, APDS, APFSDS,
  HE, HEAT, HESH), each with its own cross-section, per-part materials and
  fuzing;
- watch the projectile travel, contact, deform and erode in slow motion;
- watch the plate crater, flow, bulge, crack, spall and open a channel;
- place internal components and see which of them get hit;
- pause, step forward, step backward, scrub any recorded frame, and click any
  individual node to read its damage, plastic strain, temperature, stress and
  displacement;
- switch the field between material, damage, plastic strain, temperature,
  velocity and virial stress;
- save and load scenarios as JSON.

Change the plate thickness, the slope, the material, the projectile type, the
velocity or the mass, and the outcome changes because the physics changed —
not because a lookup table said so.

---

## Keyboard

| key | action |
|---|---|
| `space` | play / pause |
| `F` | fire |
| `R` | reset |
| `.` / `,` | step one frame forward / back |
| `1`–`6` | field mode |
| `+` / `-` / `0` | zoom in / out / fit |

Drag to pan, wheel or pinch to zoom, click to inspect.

---

## Architecture

```
src/
  core/        math, units, event log, frame recorder
  materials/   material database + peridynamic calibration
  sim/
    pd/        domain (nodes, bonds, lattice) and solver (forces, contact)
    scene      layers, modules, ray casting
    projectile rigid flight regime
    projectileTypes  geometry + behaviour per round
    fragments  ballistic transport of promoted spall
    explosive  Gurney/PER energy release
    internals  component vulnerability
    analytics  independent closed-form cross-checks
    world      regime orchestration
  render/      camera, palette, 2.5-D renderer
  ui/          panels, controls, presets
tools/         headless harnesses + single-file build
docs/MODEL.md  assumptions, equations, limitations
```

The dependency direction is one-way: `ui → render → sim → materials → core`.
The renderer reads simulation state and never writes it. Each subsystem is
replaceable on its own — `docs/MODEL.md` §9 lists what each one could be
swapped for.

### Headless harnesses

The physics can be exercised without a browser:

```bash
node tools/smoke.mjs apcbc normal    # full run, verdict, event log, energy audit
node tools/probe.mjs apcbc           # step-level solver internals
node tools/audit.mjs                 # energy-conservation audit
node tools/sweep.mjs 0.2 1 0.25      # parameter sweep across three cases
```

---

## Read this before quoting a number

`docs/MODEL.md` is the full account. The short version:

- **Nothing here is validated against firing trials.** The material data are
  representative handbook values for a class of material.
- The model is a **plane-strain 2-D section** with a single scalar correction
  for out-of-plane confinement. Genuinely three-dimensional behaviour is not
  captured.
- Bond-based peridynamics is **locked to a Poisson ratio of 1/3**.
- Bond failure uses the material's **measured failure strain**, not the
  classical fracture-energy critical stretch, because the latter is
  horizon-dependent and at practical lattice spacings makes every metal
  brittle. This is a documented departure, explained in §3.4.
- The explicit scheme is **not exactly energy conserving**. The drift is
  measured every step and displayed in the Solver diagnostics panel. Beyond
  roughly ±35 % a run should be read as qualitative.
- **Shaped-charge liner collapse is not simulated** — the jet's velocity
  gradient is imposed from the PER model, and the lattice cannot resolve a real
  jet diameter.

Closed-form engineering models (Tate/Alekseevskii, the hydrodynamic limit, de
Marre) are computed alongside every shot and shown next to the simulated
answer. They do not drive the simulation. Where they disagree with it, that
disagreement is information.

---

## Licence and provenance

Material properties, empirical correlations and the peridynamic formulation are
attributed in `docs/MODEL.md` §1 and §8, and per-entry in
`src/materials/database.js`.
