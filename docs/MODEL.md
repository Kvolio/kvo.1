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
s_iso = ½ (θ_i + θ_j) ,     θ_i = (1 / N⁰_i) Σ_{intact bonds} s
s_dev = s - s_iso
```

Only `s_dev` can yield. **This is not a refinement, it is a requirement.** If
the whole bond stretch is capped at yield, the material also loses its bulk
modulus above the yield stress: under an impact shock of 10–20 GPa it behaves
like a pressure-limited fluid, dissipates the entire shock as spurious
"plastic work", heats itself past its melting point through the adiabatic
coupling, and disintegrates. With the split, hydrostatic compression stays
elastic and only shear flows — which is what real metals do.

`θ` is evaluated in the same step as the forces, not lagged.

Two details of this split are load-bearing, and getting either wrong turns the
model into an energy source rather than a constitutive law.

**`s_dev` is measured against the raw dilatation.** The tension cap (§3.3.1)
and the confinement factor (§3.6) both modify the isotropic *force*, and
neither may be folded into `s_iso` before `s_dev = s - s_iso` is taken. If
they are, part of a purely hydrostatic strain is relabelled as deviatoric and
then flows plastically: at 2 % uniform compression the confinement factor
alone manufactured a deviatoric stretch of six times yield, which heated and
softened material that was never being sheared.

**`θ` is normalised by the node's original bond count `N⁰_i`, not by the
number still intact.** Re-averaging over the survivors makes `θ` jump every
time a bond fails — the failing bond is by definition the most stretched of
the set, so removing it rescales the mean discontinuously and every other bond
on that node sees its isotropic force step. Integrated explicitly, those steps
are work done with no displacement. A fixed denominator also states the right
physics: a node that has lost most of its bonds is comminuted, and its ability
to carry hydrostatic stress should fall with the damage rather than persist
undiminished down to the last surviving bond.

**The force is the gradient of a potential.** Because `s_iso` is a *node*
average, bond (i,j)'s force depends on the stretch of every other bond at i
and j, and the reaction terms are not optional. The model integrates

```
U = Σ_b r₀ c [ ½ s_iso² + ½ s_e² + φ(s_iso) ]
```

with `φ' ` carrying the tension cap and the confinement factor, and takes the
force as `∂U/∂s` with `∂θ_i/∂s_b = 1/N⁰_i` carried through — giving a per-node
reaction term added to every bond. Differentiating only the direct path (the
obvious reading of the formula above) yields a force field that is not the
gradient of anything: it is path-dependent and does net work around a closed
loop. That defect contributed **+6.9 MJ of bond work on a 1.27 MJ impact** for
a blunt-capped AP round, throwing armour nodes out at four times the striking
velocity. The current force law is verified against a finite-difference
gradient of `U` (agreement to 0.1 %) and conserves kinetic energy to 1 % on
impacts that previously gained 150 %.

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

### 4.1a Reproducibility

The number of solver sub-steps per rendered frame is chosen from measured
wall-clock time, so that a phone keeps a usable frame rate. That makes a run
depend on the machine it ran on: identical scenarios were measured ending at
2501, 2505 and 2504 µs with different surviving masses, and a comparison
between two configurations could come out either way. For anything that has to
reproduce — a regression check, a replay, a like-for-like comparison — set
`deterministic` in the simulation settings. It fixes the sub-step count and
disables the performance re-tiering, so the result depends only on the inputs.
The headless check suite sets it; the interactive app does not.

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

**The bond-to-contact transition must be continuous.** A bond that fails in
compression is already at a separation below the contact distance, so handing
it to the shared penalty law would apply `k_c (d_c − r)` as a step change —
measured at 200× the force the bond was carrying, worst case 358×, and
delivered to a whole row of pairs in the same step when the impactor is
blunt-nosed. Each failed pair therefore latches its own contact distance to
the separation at the moment of failure: the pair is already compacted, and
contact's job is to resist *further* approach rather than to violently undo
the compaction. Pairs that fail while still separated keep the nominal `d_c`.

The contact bound is evaluated **per node against its own stiffness**, not by
pairing the lightest node in the domain with the stiffest. A pair's contact
spring is two node springs in series, so it can never be stiffer than twice the
softer node's, and the effective mass never exceeds the lighter node's; bounding
each node by its own `m_i / 2k_i` is therefore still conservative and reduces to
`Δ/c_wave`, the same Courant condition the bond bound obeys. Worst-against-worst
was not merely pessimistic but wrong, and it was expensive: any array containing
something soft next to steel — an ERA charge, a polymer backing, a rubber
interlayer — ran at a step three times shorter than the same mesh in plain
steel, for no gain in accuracy.

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

The continuum phase used to be hard-bounded by a fixed clock after first
contact, on the reasoning that the mechanics deciding the outcome are over
within a few hundred microseconds. That reasoning is right for a full-calibre
shot against a single plate and wrong for everything deep, and measurement
showed the cap was ending **essentially every run**: a 120 mm long rod fired
at 600 mm of RHA was cut off 400 mm in, still travelling at about 1000 m/s,
and reported as "did not perforate, residual 1000 m/s".

That is not a result. It is a stopwatch expiring mid-event, and it reads
exactly like a round that never slows down.

Penetration time scales with depth — a rod eating through half a metre of
steel at a penetration velocity of order 1 km/s genuinely needs milliseconds —
so the window now closes on the physics instead:

- **progress stalls.** Progress is `armourDefeated`, which is bounded by the
  plate, so it stops growing the moment the round is through, stopped, or
  consumed. Depth is *not* used for this, because depth keeps growing as
  debris flies on. When no progress has been made for `stallTime` (80 µs) and
  the minimum window has elapsed, the event is over.
- **backstop.** A much larger absolute bound (`maxEventTimeHard`, 6 ms)
  catches pathological runs. When it fires the result is flagged
  `stats.truncated` and a WARN entry is written saying the reported depth and
  residual velocity are a **lower bound, not a final state** — rather than
  silently reporting a moving round as a stopped one.

`maxEventTime` survives as the *minimum* window, so short events still get
their full resolved period.

Runs are correspondingly longer now, which is the cost of not truncating them.
The same rod against 600 mm now resolves over 1.1–1.3 ms and perforates, with
residual velocity falling to 264–665 m/s depending on discretisation, instead
of stopping the clock at 998 m/s.

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

### 5.1a Explosive reactive armour

A cassette is authored as one entry and meshed as **three ordinary bonded
layers** — steel front plate, insensitive explosive, steel back plate. The
plates are ordinary deformable armour and the charge is ordinary deformable
material; `sim/era.js` only decides *whether and when* the charge functions and
applies the resulting impulse. Everything that makes ERA work — the plates
sweeping across the jet, cutting it, and the residue arriving at the main
array disturbed — is left entirely to the contact solver. No defeat mechanism
is modelled, tabulated or asserted anywhere.

**What works.** The cassette initiates from the simulated insult, the
detonation propagates, the charge is consumed, the plates leave at Gurney
velocities with their momenta balanced, and nothing joins the two plates across
the charge once it has gone. Every step of the mechanism is checked.

**Whether it helps the armour is NOT reproduced.** Once runs were made
reproducible (§4.1a) the live-versus-inert comparison came out mixed, and the
sign depends on geometry rather than on anything defensible:

| cassette | obliquity | jet surviving, live | inert | live better? |
|---|---|---|---|---|
| light | 60° | 44.7 g | 35.7 g | no |
| light | 30° | 15.7 g | 25.0 g | yes |
| heavy | 60° | 28.3 g | 56.5 g | yes |
| heavy | 30° | 29.7 g | 29.7 g | no difference |

Earlier revisions of this document claimed the benefit *was* reproduced, on the
strength of a measurement that turned out not to be repeatable: the sub-step
count was chosen from wall-clock timing, so the same scenario advanced
different amounts of simulated time on different runs and the comparison could
come out either way. That is fixed, and the corrected answer is the table
above. **Do not use this model to argue that ERA does or does not defeat a
given threat.** The mechanism is simulated honestly; the net outcome is not
yet trustworthy.

**Two defects had to be fixed before any of that was true**, and both are worth
recording because each looked like "ERA just doesn't do much":

1. *The plates were bonded to each other through the charge.* The horizon is
   about three lattice spacings and a cassette's charge is thinner than that,
   so front-plate and back-plate nodes fell inside each other's horizons and
   were bonded directly — 339 such bonds on a light cassette, against only 237
   holding the front plate to itself. Removing the charge did nothing to them,
   so the detonation was trying to throw two plates that were still stitched
   together. They are now cut when the column they belong to fires.
2. *Initiation keyed on intensity alone*, so a full-calibre AP shot — slow but
   wide — never set the cassette off. See the initiation note above.

**The charge no longer vanishes when it detonates.** It used to be deleted
outright, and that is a larger distortion than it looks. Ten millimetres of
4S20-type filler is about 16 kg/m2 of areal mass; a 3 mm HHA flyer plate is
23.5 kg/m2. So annihilating the charge handed the threat very nearly a whole
flyer plate's worth of free path, at the exact moment the cassette was supposed
to start helping — an artefact the same size as the effect being measured, and
worst where the charge is a large fraction of the cassette, which is precisely
the light-ERA case.

Real detonation products are a dense gas: no strength, but full inertia, and a
jet or rod crossing them still has to displace that mass. The charge nodes now
stay in the lattice, keep their mass, lose every bond (gas has no strength),
and receive Gurney's linear velocity profile — zero at the charge mid-plane
rising to the adjacent plate's velocity at each face. That profile carries no
net momentum for a symmetric sandwich, so the plate velocities remain the
momentum-balanced Gurney result and nothing is double-counted.

Measured against the empty-cassette control below, this moved the charge's
contribution from negative to positive in seven of eight cases, including all
four shaped-charge cases — the 68° jet case went from −72 to +258 m/s. It also
stopped the front plate being blown bodily downrange: its centroid displacement
over the event fell from 264 mm to 26 mm, because the plate now has products
behind it to work against rather than vacuum.

This is a fix to a modelling defect, not a calibration to make ERA look better.
The magnitudes are still wild (+11 to +1017 m/s) and one case, a long rod at
60°, is still negative, so the conclusion below is unchanged.

**Live-versus-inert is the wrong control, and the table above uses it.**
Detonation deletes the charge nodes, so a live cassette does not merely throw
its plates — it also removes ~10 mm of material from the threat's path that the
inert cassette still has to be chewed through. The comparison therefore
confounds "the explosive worked" with "the explosive got out of the way", and
the thinner the plates are relative to the charge the more the second effect
dominates. That is consistent with the sign flipping between light cassettes
(3 mm plates, 10 mm charge) and heavy ones (15 mm plates).

The defensible control is an **empty cassette** — the same two plates at the
same spacing with no charge between them. Measured that way, the charge is
worth between −72 and +984 m/s of residual velocity depending on threat and
obliquity. That spread is not a result either; it is a statement that the net
effect is not currently reproducible, which is the same conclusion by a better
route. The CI check deliberately asserts only that the comparison produces
finite numbers, and **not** its direction.

**Read residual velocity carefully, and read depth carefully too.** The two
measures fail in opposite regimes:

- *If the shot does not perforate*, depth is the meaningful figure.
- *If it does perforate*, depth is clipped at the back of the array (§6.1) and
  therefore cannot discriminate at all — every perforating variant reports the
  array total. Use residual velocity and surviving penetrator mass instead.
- *But* a functioning cassette can legitimately **raise** residual velocity:
  the plates chew up the slow tail of a jet and leave the fast tip, so less
  material arrives and what does arrive is faster. Against jets, surviving mass
  is the more honest measure of the two.

There is no single number here that answers "did the ERA help". That is a real
property of the problem, not a reporting shortcut.

**Heavy cassettes are not currently a win against shaped charges** in this
model, though they are marginally better than inert against long rods. A
Kontakt-5 style cassette carries a thick front plate against a thin back plate,
and the momentum-balanced Gurney split gives that heavy plate only ~230 m/s
against the back plate's ~690. The sweep it buys does not pay for the 10 mm of
filler the detonation removes from the jet's path. The suspect is the
asymmetric split itself — the interpolation used here forces M₁V₁ = M₂V₂
exactly, which ignores the momentum carried by the products and so
over-penalises the heavy plate relative to Kennedy's full asymmetric-sandwich
solution. That is the thing to fix next, and it is a fix in `era.js`, not a
limitation of the solver.

An earlier version of this section blamed the shaped-charge jet for being too
compact in time to be swept. That was **wrong** and is recorded here so it is
not repeated: the jet arrives over 247 µs, the cassette initiates 4.3 µs after
the jet first reaches it, and the plates sweep ~147 mm laterally in that
window — far more than the 6 mm jet diameter. There was never a timing problem;
the plates were tied together.

Light cassettes carry a further problem of their own: see the resolution note
below.

**Initiation.** The criterion is a critical shock pressure evaluated on the
filler's linear shock Hugoniot, `Us = c₀ + s·u_p`, `P = ρ₀·Us·u_p`, with the
particle velocity taken as half the local material speed of the charge.

The obvious implementation — integrating the solver's own nodal stress,
Walker–Wasley `P²τ` style — was written first, measured, and **discarded
because it does not discriminate**. Every threat from a 12.7 mm AP bullet to a
shaped-charge jet produced 3.4–4.1 GPa of nodal stress in the charge, and the
jet scored *lowest* on the integral, because the integral is dominated by how
long a soft filler stays crushed rather than by how hard it was hit. The cause
is limitation 6 below: the volumetric response is linear elastic with no
equation of state, so the bulk model cannot generate the tens of GPa that
impedance matching says a jet drives into a low-impedance filler. Particle
velocity, by contrast, the solver resolves well and monotonically. Measured
peak charge speeds:

| threat | peak charge speed | shock on the Hugoniot | functions |
|---|---|---|---|
| 20 mm AP at 200 m/s | 361 m/s | 0.7 GPa | no |
| 76 mm APCBC at 800 m/s | 1146 m/s | 3.1 GPa | no |
| 12.7 mm AP at 900 m/s | 1400 m/s | 4.1 GPa | no |
| 14.5 mm AP at 1000 m/s | 1544 m/s | 4.8 GPa | no |
| 30 mm AP at 1100 m/s | 1694 m/s | 5.5 GPa | no |
| APDS at 1200 m/s | 2235 m/s | 7.1 GPa | yes |
| APFSDS at 1650 m/s | 3245 m/s | 7.5 GPa | yes |
| shaped-charge jet | 8293 m/s | 9.8 GPa | yes |

The 7 GPa threshold is where insensitive plastic-bonded compositions sit, and
it lands in the gap: the cassette functions against the threats ERA exists for
and stays inert under machine-gun and autocannon fire, which is its design
spec. It is a material property, editable, and stated with its provenance.

**Propagation.** The charge does not go off at once. Detonation spreads from
wherever it initiated at the filler's detonation velocity, so a cassette struck
near one edge throws that end of its plates first; across a 300 mm cassette at
7000 m/s that is ~43 µs of skew, the same order as the whole event.

**Flyer velocity.** Gurney sandwich, `V = √(2E)·(M̄/C + 1/3)^(-1/2)`, with the
pair split so that `M₁V₁ = M₂V₂` exactly — heavy ERA is asymmetric, and giving
both plates the same speed would create net momentum and push the cassette
bodily downrange. A single efficiency factor (default 0.45, exposed in the UI)
covers the gap between the plane-wave fully-confined Gurney result and a real
cassette, where the detonation runs *along* the sandwich and the products
escape sideways from a thin unconfined slab. It is a calibration constant, not
a derivation; the resulting flyer velocity is logged so it can be checked
against the 500–900 m/s that light ERA plates are usually quoted at.

**Resolution.** A layer needs a few nodes through its thickness before it
behaves as a plate rather than as a line of loosely connected points. The
mesher now takes the thinnest layer in the array into account when choosing the
lattice spacing, and narrows the deformable corridor before coarsening the
lattice — meshing 300 mm of plate that mostly sits still is worth less than
resolving the few millimetres doing the work. Even so, a **light cassette's
3 mm plates reach only 1.6 nodes through thickness at the finest
discretisation**, so they are not resolved and cannot be expected to behave as
plates at all. The run log says so explicitly whenever any layer falls below
two nodes. Heavy cassettes (15 mm front plate) resolve at about four nodes and
are the only ERA geometry this model represents honestly.

**What is not modelled.** The products are removed rather than expanded as gas,
so there is no blast loading on the surrounding structure and no drive on
anything but the two plates. Sympathetic initiation of neighbouring cassettes
is absent. Side confinement, cassette walls and mounting are absent — the
cassette is a flat sandwich, so edge effects on a real bolted box are not
represented.

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

## 6.1 Reported depths — two different measures

Penetration is reported two ways, and they are not interchangeable:

- **Normal depth** — distance through the plate along the plate's *own normal*.
  This is "how much plate thickness has been defeated" and is the figure that
  compares directly against a plate's quoted thickness. The perforation test
  uses it against the last layer's normal thickness.
- **Line-of-sight depth** — distance travelled along the shot line. On a plate
  sloped at theta it is longer by `1/cos(theta)`: 120 mm of plate at 60 deg is
  240 mm of line of sight.

Both are read as a **mass percentile, not as the deepest single node**: depth
is the deepest plane that at least 1 % of the original penetrator mass has
reached, accumulated from the deep end of a histogram over the channel. A
comminuted penetrator has a cloud for a tip and its foremost node is noise. The
perforation test reads the *same* measure against the last layer's back face,
so "the depth exceeds the plate" and "perforated" cannot disagree — they are
one number against one threshold.

Only material inside the channel counts — within about two penetrator diameters
of the shot axis, and not moving backwards out of the crater. Material thrown
sideways along the struck face is ejecta; letting it set the depth would report
a penetration that never happened.

**Both depths are clipped at the back of the array.** Once the remnant is
through, the raw measure keeps growing — but what it is then describing is how
far debris has *flown*, not how far it has penetrated. Left unbounded it
reported 466 mm of "depth" on a 266 mm array, and, far worse, it converged to
the same value for every variant of a perforating shot, because the quantity it
was really measuring was remnant velocity times whatever remained of the
resolved window. Two cassettes, one live and one inert, were measured reporting
depth **identical to the millimetre** for exactly this reason — which presents
to the user as "nothing I change makes any difference".

Past the back face the figure that still carries information is the residual
velocity, which is reported beside it. When a shot perforates, compare residual
velocities, not depths: depth is saturated by construction and cannot
discriminate.

The back-face bulge is measured in the last layer's own frame, and only for
material more than about one penetrator diameter off the shot axis. Material
pushed out through the hole is petalling, not bulging, and would otherwise
dominate the figure the moment the plate is perforated.

---

## 7. Known limitations

1. **Not validated.** No comparison against firing trials has been performed.
2. **Energy drift** of tens of per cent on violent impacts (§4.5). The
   *creation* of energy has been eliminated — kinetic energy no longer grows
   over the course of an impact for any projectile type, and the bond force is
   verified against a finite-difference gradient of its potential (§3.3) — but
   the audit does not yet close. What remains is bookkeeping rather than a
   blow-up: the broken-bond contact branch records neither its damping nor its
   friction work, so dissipation goes unattributed, and fracture releases a
   bond's whole potential while its neighbours' dilatational energy shifts
   unaccounted at the same instant. Read the reported drift as the width of the
   error bar on the energy breakdown, not as a statement that the run is
   diverging.
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
9. **Comminuted material has no pressure-dependent strength.** This is the
    most consequential gap for brittle penetrators and ceramic armour. Once a
    region's bonds have failed, load transfer is by short-range contact with a
    single Coulomb friction coefficient. Real comminuted ceramic and carbide
    retain substantial strength under confining pressure — that is the entire
    basis of the Johnson-Holmquist family of models, which carry separate
    intact and failed strength surfaces with the failed surface rising with
    pressure. Without it, a tungsten-carbide core that shatters on impact
    (which it correctly does — WC fails at ~0.4 % strain, and lateral Poisson
    expansion under a 50+ GPa shock reaches several times that) then does less
    work than it should as a confined granular slug. Expect this model to
    under-predict for APCR and APDS, and for ceramic arrays, more than for
    monolithic steel. Adding a JH-style failed-strength surface in
    `materials/derive.js` and `sim/pd/solver.js` is the single highest-value
    improvement available.
10. **Ceramic strength collapse** at very high impact stress (the
    Wilkins/Curran "failed ceramic" regime) is not modelled.
11. **Fragment count is capped** (1400) for performance; retired mass is
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

### 8.1 Textolite and the Soviet laminate glacis

`textolite` is a phenolic–cotton laminate of the PTK class, the filler used
between steel plates in Soviet combination glacis armour from the T-64 onward.
It is in the database as a genuinely soft, light, weak material — roughly a
fifth the density of steel and a tenth its tensile strength — because that is
what it is. It does not stop rounds; it is there to add line-of-sight
thickness and disrupt a jet for very little mass.

The `t72-ural-ufp`, `t72b-ufp` and `t90a-ufp` presets use it. Their layer
stacks (80/105/20 mm at 68° for the T-72 Ural, and so on) are **representative
published figures, not measurements**, and the elastic and failure constants
for the laminate are class-typical rather than lot-specific. The geometry is
asserted in CI; the penetration result the model produces from that geometry
is not, and should not be quoted as an armour-performance figure.

### 8.2 The historic ammunition catalogue

`src/ui/ammo.js` holds 27 service rounds from 1939 to 2003, selectable
independently of the scenario presets so one target can be shot with several
generations of round. Its header documents the provenance in full; the three
things that matter most:

- **Muzzle velocity is used as the striking velocity.** There is no exterior
  ballistics in this simulation, so every round arrives as though fired at
  point blank. A round quoted at 1700 m/s does not arrive at 1700 m/s at
  2000 m, and the model will happily let you forget that.
- **Sub-calibre rod dimensions are reconstructions.** Calibre, projectile mass
  and muzzle velocity are published and reliable. `rodD` and `rodLd` for
  modern APFSDS mostly are not, and where they are not they are inferred from
  the published mass at a plausible L/D. They are consistent with the mass —
  which is what the solver actually integrates — but they are not the real rod.
- **Core materials are a class, not a specification** — steel, tungsten
  carbide, tungsten heavy alloy, depleted uranium.

So the catalogue is a set of plausible reconstructions with correct mass and
velocity, not a data table, and the penetration figures it produces inherit
that status. CI asserts that every entry meshes and fires with finite stats,
and that the 1939 and 2003 rounds do not land in the same place. It does not
assert any round's penetration against any plate, because there is nothing
here to validate that against.

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
