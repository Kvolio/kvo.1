# Model description, assumptions and limitations

This document is the honest account of what the simulator computes, what it
approximates, and where it should not be trusted. It is written so that a
reader can decide whether a given result is meaningful before quoting it.

**Nothing in this simulator has been validated against firing trials.** The
material data are representative open-literature values for a *class* of
material, not certified lot data, and the constitutive model is a deliberately
simplified continuum model chosen to run at interactive rates in a browser.
Treat every number as the output of a transparent model, not as a measurement.

---

## 1. What is actually simulated

The core is a **bond-based peridynamic continuum solver** running on a
plane-strain cross-section of the target and the projectile. Both bodies are
discretised into nodes connected by bonds; the bonds carry an
elastic–perfectly-plastic force with rate hardening, adiabatic thermal
softening, and a failure criterion. Everything the user sees — crater growth,
material displaced around the entry, channel walls, back-face bulging, spall,
projectile erosion, ricochet, plugging — is a consequence of integrating that
system forward in time. There is no scripted outcome anywhere in the code, no
"penetration = true" branch, and no prebuilt hole geometry.

Peridynamics was chosen over a mesh-based finite element formulation because
its governing equation is an integral rather than a differential one: it does
not require spatial derivatives of displacement, so discontinuities (cracks,
fragments, free surfaces created mid-run) are admissible solutions rather than
singularities that need remeshing or element deletion.

**Primary references for the formulation**

- Silling, S.A. (2000). *Reformulation of elasticity theory for discontinuities
  and long-range forces.* J. Mech. Phys. Solids 48, 175–209.
- Silling, S.A. & Askari, E. (2005). *A meshfree method based on the
  peridynamic model of solid mechanics.* Computers & Structures 83, 1526–1535.
- Ha, Y.D. & Bobaru, F. (2010). *Studies of dynamic crack propagation and crack
  branching with peridynamics.* Int. J. Fracture 162, 229–244.
- Johnson, G.R. & Cook, W.H. (1983). *A constitutive model and data for metals
  subjected to large strains, high strain rates and high temperatures.* Proc.
  7th Int. Symp. Ballistics.

---

## 2. Geometry and dimensionality

### 2.1 Plane-strain cross-section

The simulation is two-dimensional: a slice through the target along the shot
line, of out-of-plane depth `h` (the "slab depth"). This is the standard
reduction for an armour-array study and it is what makes the model tractable in
real time. Its consequences are real and are listed in §7.

### 2.2 Domain of interest

Only a **corridor** around the shot line is discretised — typically 5–6
calibres wide for a kinetic round. Armour outside the corridor is drawn as
static geometry and enters the mechanics only through the corridor's lateral
boundary treatment (§4.4). This is the single largest performance decision in
the model. It is sound as long as the corridor is wide compared with the
disturbed region; the "Domain bounds" view toggle draws the corridor so the
user can check that by eye.

### 2.3 Out-of-plane mass correction

A plate is prismatic, so a slice of it carries the correct mass with no
correction. A projectile is a body of revolution, so a slice of width `2r(x)`
does not. Each projectile part therefore receives a scale factor

```
scale = (π/4) · d_part / h ,        h = (π/4) · d_penetrator
```

applied to **both** its density and its micromodulus. That choice preserves the
part's true mass *and* its true axial force per unit slab, and leaves the bar
wave speed `√(E/ρ)` unchanged. The slab depth is anchored to the penetrator so
that the object doing the work has exactly its real mass; a full-calibre
component around a sub-calibre core is then correct in mass but its
*out-of-plane* flow is still not resolved.

### 2.4 Projectile mass

The user sets a target mass. The build scales the body **length** until the
measured mass matches, so density remains a real material property rather than
a fudge factor. Mass is measured by sampling the assembly on a fine grid using
the same first-match priority rule the mesher uses, so the quoted mass is
exactly the mass that gets discretised, cavities included.

---

## 3. Constitutive model

### 3.1 Elastic response

Bond micromodulus, 2-D plane-stress calibration:

```
c  = 9 E / (π h δ³)
```

with `δ` the horizon and `h` the slab depth. The 3-D counterpart
`c = 18K/(πδ⁴)` is given by Silling & Askari (2005); the 2-D reduction above is
the standard plane-stress form. Bonds crossing the horizon boundary get the
usual partial-volume correction.

### 3.2 Poisson's ratio — a hard limitation

Bond-based peridynamics is **locked to ν = 1/3 in 2-D** (ν = 1/4 in 3-D). This
is a structural property of the formulation: a central-force pairwise
interaction cannot represent an independent shear modulus. The database stores
each material's real Poisson ratio and uses it in the analytic cross-check
models and the UI, but the bond constants are calibrated at the bond-based
value. Materials whose real ν is far from 1/3 (ceramics at ~0.16–0.22, tungsten
alloys at ~0.28) therefore have a bulk-to-shear stiffness ratio that is off by
a meaningful amount. Removing this would require an ordinary state-based
formulation, which the modular layout permits (see §9).

### 3.3 Plasticity — volumetric/deviatoric split

Each bond's stretch is split into an isotropic part and a deviatoric part:

```
s_iso = ½ (θ_i + θ_j) ,     θ_i = mean stretch of node i's intact bonds
s_dev = s - s_iso
```

Only `s_dev` can yield. **This is not a refinement, it is a requirement.** If
the whole bond stretch is capped at yield, the material also loses its bulk
modulus above the yield stress: under an impact shock of 10–20 GPa it behaves
like a pressure-limited fluid, dissipates the entire shock as spurious
"plastic work", heats itself past its melting point through the adiabatic
coupling, and disintegrates. With the split, hydrostatic compression stays
elastic and only shear flows — which is what real metals do.

`θ` is evaluated in the same step as the forces (a two-pass loop over the bond
list), not lagged.

### 3.4 Failure — an explicit departure from textbook peridynamics

The classical criterion is the critical stretch
`s₀ = √(4πG₀ / (9Eδ))`. It is **horizon dependent**: `s₀ ∝ δ^(-1/2)`. At the
lattice spacings that run at interactive rates (δ ≈ 5–15 mm) it predicts
`s₀ ≈ 0.005` for RHA — barely above the yield stretch `Y/E`, and two orders of
magnitude below RHA's measured ~17 % failure strain. Used directly it makes
every metal behave like glass and the plate falls apart under the first stress
wave. This was observed directly during development.

The model therefore fails bonds at the material's **measured failure strain**,
which is resolution independent:

```
tension            s     ≥ ε_f
shear/compression  |s_p| ≥ 4 ε_f       (accumulated plastic stretch)
```

The brittle and ductile regimes then separate on their own, from the material
data rather than from a switch:

- a ceramic has `ε_f ≈ 0.001`, far *below* its yield stretch, so it fails
  elastically — brittle cleavage with no plastic flow;
- a steel has `ε_f ≈ 0.17`, far *above* its yield stretch, so it yields, flows,
  heats and only then tears.

`s₀` is still computed from `G₀` and reported, so the discrepancy stays
visible. If the lattice is ever refined into the sub-millimetre range, `s₀`
becomes the better criterion and should be switched back on.

Because compression is harder to fail than tension, a ceramic survives the
compressive pulse and disintegrates under the tensile release — the mechanism
that makes ceramic armour work — without any ceramic-specific code.

### 3.5 Rate and temperature

Yield stretch is modified by a Johnson–Cook form:

```
s_y = (Y/E) · (1 + C ln ε̇) · (1 - T*^m) ,    T* = (T-T₀)/(T_m-T₀)
```

`T` rises adiabatically from the plastic work done in each bond. This coupling
is what produces adiabatic shear localisation: plugging in titanium and
high-hardness steel, and the tendency of depleted uranium (low `m`) to shed
material from the nose flanks instead of mushrooming. None of that is
special-cased.

Strain hardening (`A + Bεⁿ`) is folded into the quasi-static yield of the
database entry; the bond is perfectly plastic past `s_y`.

### 3.6 Out-of-plane confinement — a calibration factor

Opening a cavity in a plane-strain slice only requires material to flow
sideways *in the plane*. Opening the same cavity in a real plate requires
radial flow in two directions against the surrounding hoop stress, which costs
more work. Without a correction, a 2-D section systematically under-predicts
the resistance of a deep channel.

A factor (default **1.8**) multiplies the isotropic stretch **in compression
only**, so it stiffens cavity expansion without touching the tensile/spall
response. It is a calibration constant, not a derivation. It is exposed in the
Simulation panel precisely so that it is visible rather than buried.

### 3.7 Local strength scatter

Failure strain is scaled per node by a Weibull-distributed factor whose modulus
is a material property (low for cast armour and ceramics, high for wrought
steel). This is a *modelled material property* — flaw density — evaluated from
a seeded generator so that a scenario replays bit-identically. It is not used
to decide outcomes.

---

## 4. Numerics

### 4.1 Integration

Explicit velocity-Verlet. Time step from the peridynamic stability condition
(Silling & Askari 2005, eq. 30):

```
dt < √( 2ρ_i / Σ_j (c V_j / |ξ_ij|) )
```

evaluated per node in the reference configuration, with a safety factor of
0.32, further limited by the contact stiffness. Typical resulting step:
100–200 ns.

### 4.2 Contact

Two disjoint mechanisms, so no pair is ever counted twice:

1. **Broken bonds** become contact pairs. They carry no tension but still
   resist interpenetration and transmit friction — this is how channel walls,
   crater lips and comminuted ceramic keep pushing on the penetrator after the
   material has failed. Retaining broken bonds rather than deleting them is
   both cheaper and more correct.
2. **A spatial hash** handles pairs that were never reference neighbours
   (projectile against plate, fragments against anything). Pairs whose
   reference separation is inside the horizon are skipped by an O(1) test.

Contact stiffness per node is `k = E·h` — the equivalent axial spring of a node
chain at spacing Δ carrying cross-section Δ·h — and a pair uses the two in
series. A softer contact (an arbitrary penalty constant) lets the struck faces
interpenetrate by a large fraction of a lattice spacing before force builds,
and the shock never forms properly. Coulomb friction µ = 0.15 by default.

### 4.3 Viscosity

A small linear Kelvin–Voigt term (≈ 1 % of critical by default) plus a
compression-only quadratic term in the von Neumann–Richtmyer spirit, scaled so
it reaches 0.6 × critical when the relative normal velocity equals the bar wave
speed. The linear term is numerical housekeeping and is deliberately kept low:
at 5 % of critical it was found to dissipate a comparable amount of energy to
the entire impact. It is exposed in the UI.

### 4.4 Boundaries

Corridor edges that cut through material the plate continues past get an
absorbing band (velocity decay ramping quadratically towards the edge) with the
outermost rows clamped. This emulates continuation into the surrounding plate
and suppresses reflection of outgoing stress waves. Corridor edges that
coincide with a real free surface are left free.

### 4.5 Energy audit

An explicit scheme with penalty contact and rate-dependent plasticity is not
exactly conservative. Rather than hide that, the solver measures

```
drift = (KE + U_elastic + W_plastic + W_fracture + W_damping) / E₀ - 1
```

every step and reports it in the Solver diagnostics panel. **Typical drift on a
kinetic-energy impact is +20 % to +60 %**, positive (numerical energy creation
at the contact interface). Beyond roughly ±35 % a run should be read as
qualitative. Reducing bond viscosity and refining the discretisation both
reduce it. This is the single most important number for judging whether a
particular run is trustworthy, which is why it is on the face of the tool.

### 4.6 Coast fast-forward

Crossing a standoff gap or an air gap in a spaced array is free flight. When
the smallest clearance between any moving node and any solid is comfortably
larger than the lattice spacing, and the plate is quiet and nothing is
breaking, the moving material is advanced ballistically in a single step sized
so it cannot cross that clearance. As soon as the gap closes to a few lattice
spacings, every step is resolved again.

### 4.7 Resolved window

The continuum phase is hard-bounded (default 350 µs after first contact). The
mechanics that decide the outcome are over well within that; afterwards the
solver would only be tracking debris that the ballistic fragment layer handles
better and more cheaply.

---

## 5. Projectile behaviours

### 5.1 What differs between types

Each type is a geometry + per-part materials + assembly interfaces + in-flight
behaviour. Erosion, shatter, ricochet and plugging are **not** properties of
the type; they are outcomes the solver produces. Specifically:

- **AP** — monobloc hard steel. Shatter on hard plate emerges from the core
  material's low failure strain.
- **APC** — a soft cap bonded to the core with a weak interface. It spreads the
  initial shock and confines the nose; the core consequently survives impacts
  that break uncapped shot.
- **APCBC** — adds a light windscreen. It crushes away in the first
  microseconds and contributes essentially nothing, which is visible rather
  than asserted.
- **APCR/HVAP** — dense carbide core in a light alloy sleeve, joined by a weak
  interface, so the sleeve strips off on impact.
- **APDS / APFSDS** — sabot released in flight at a set range; only the core or
  rod is meshed at the target.
- **APHE** — base fuze arms on impact setback and functions after a delay
  (§5.2).
- **HE / HESH** — casing plus explosive fill (§5.2).
- **HEAT** — shaped charge (§5.3).

### 5.2 Detonation

Filler nodes are removed (they have become gas) and the surrounding metal is
given an impulsive velocity field from the **Gurney energy model** (Gurney,
BRL-405, 1943):

```
cylindrical casing   V = √(2E) · (M/C + 1/2)^(-1/2)
symmetric sandwich   V = √(2E) · (M/C + 1/3)^(-1/2)
```

with `√(2E)` the explosive's tabulated Gurney velocity. Near-field attenuation
falls off geometrically beyond the charge radius.

**Fragmentation is not scripted.** The imposed expansion field stretches the
casing bonds past their failure strain and the casing breaks up on its own,
with the fragment size distribution set by the material's failure strain and
local strength scatter — the mechanism Mott's fragmentation theory describes,
arrived at by simulation rather than by a fitted distribution.

For HESH the same machinery drives the compressive pulse into the plate; the
scab that comes off the rear face appears where the reflected tensile wave
exceeds the local bond strength. Nothing is placed there.

### 5.3 Shaped charge — the largest single approximation

**Liner collapse is not simulated.** The liner is meshed as a cone, and at fuze
function each liner node is given the axial velocity gradient predicted by the
PER (Pugh–Eichelberger–Rostoker, 1952) collapse model plus a radial collapse
component. The peridynamic solver then stretches that into a jet, so jet
break-up, standoff sensitivity and spaced-armour defeat do emerge from the
simulation — but the jet's velocity distribution is imposed, not derived. The
lattice is also far too coarse to resolve a real jet diameter (a few
millimetres); HEAT results should be read as illustrative of the *mechanism*,
not as penetration predictions.

---

## 6. Fragments and internal components

Fragments are never spawned decoratively. Every fragment was promoted from the
peridynamic solution: a node whose bonds all failed and which then left the
meshed corridor, carrying the mass, velocity and energy it had at that moment.
Inside the corridor, spall is simply peridynamic material and can still collide
with the penetrator and the channel walls.

A promoted fragment striking a thin plate or a component casing is resolved
with a plugging-work model rather than a fresh continuum run:

```
E_perf = k · π · d · t² · τ                (shear-out of a plug, τ ≈ 0.6 UTS)
v_bl   = √(2 E_perf / m)
v_r    = m/(m + m_plug) · √(v² - v_bl²)    (Recht & Ipson 1963)
```

Components are resolved analytically: the striker must beat the casing, then
the surviving energy is compared with a component toughness scale. **Those
toughness scales are engineering placeholders, not validated vulnerability
data.** They are editable in the UI so that whatever is driving a verdict is
visible. Crew incapacitation thresholds in particular are order-of-magnitude
figures.

---

## 7. Known limitations

1. **Not validated.** No comparison against firing trials has been performed.
2. **Energy drift** of tens of per cent on violent impacts (§4.5).
3. **Poisson's ratio locked to 1/3** by the bond-based formulation (§3.2).
4. **Plane strain.** Radial flow, hoop stress and out-of-plane confinement are
   represented by a single scalar calibration factor (§3.6). Anything whose
   physics is genuinely three-dimensional — rod yaw out of plane, asymmetric
   ricochet, spall cone geometry — is not captured.
5. **Coarse discretisation.** Typically 8–20 nodes across the penetrator and
   20–60 through the plate. Features smaller than a few lattice spacings —
   adiabatic shear band width, real jet diameter, fine fragment size — are
   below resolution. The lattice spacing and node counts are reported in
   Solver diagnostics for exactly this reason.
6. **No equation of state.** The volumetric response is linear elastic. Above
   roughly 20–30 GPa a real material's Hugoniot stiffens substantially; the
   model does not.
7. **No erosion of the lattice.** Failed material is retained as contacting
   debris rather than removed, which is more faithful but does mean a heavily
   comminuted region carries more inertia than a real one that has been ejected.
8. **Empirical constants are fits.** The de Marre constant is fitted to two
   documented data points and is displayed as such. RHA-equivalence figures are
   coarse scalings from density/hardness/toughness and are labelled indicative.
9. **Ceramic strength collapse** at very high impact stress (the
   Wilkins/Curran "failed ceramic" regime) is not modelled.
10. **Fragment count is capped** (1400) for performance; retired mass is
    accounted but not transported.

---

## 8. Material data provenance

Every entry in `src/materials/database.js` carries a `source` and/or `notes`
field naming the specification or the class of material it represents, and the
Inspector panel shows it. Fracture energies are computed as `G₀ = K_IC²/E` from
representative toughness values. Gurney velocities and detonation velocities
are from the standard explosives-handbook range for each composition.

These are handbook figures for a class of material. Real armour plate varies
substantially with heat treatment, thickness and lot.

---

## 9. Extension points

The layering is deliberate, so a better model can replace a worse one without
touching anything else:

| Subsystem | File | Replaceable with |
|---|---|---|
| Constitutive calibration | `materials/derive.js` | ordinary state-based PD, correspondence models |
| Force integration | `sim/pd/solver.js` | higher-order integrator, GPU/WASM kernel |
| Discretisation | `sim/pd/domain.js` | adaptive refinement, dual-horizon PD |
| Failure | `sim/pd/solver.js` | energy-based criterion once Δ is sub-millimetre |
| Detonation | `sim/explosive.js` | JWL equation of state, programmed burn |
| Fragment transport | `sim/fragments.js` | THOR equations, drag by presented area |
| Component vulnerability | `sim/internals.js` | real vulnerability tables |
| Analytic checks | `sim/analytics.js` | Walker–Anderson, Lanz–Odermatt |

The renderer reads simulation state and never writes it, so none of the above
requires touching the view layer.
