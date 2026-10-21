# Ammunition software audit

This audit covers all ten implemented ammunition types. It establishes
software contracts within the existing simplified game model; it does not
validate real ammunition performance or infer classified characteristics.

## Confirmed defects and corrections

| Finding | Reproduction / consequence | Correction |
| --- | --- | --- |
| Shared defaults replaced type defaults | HEAT's configured launch distance was replaced by the common fallback. A contradictory `type` override could also create an invalid configuration. | Type defaults override common defaults; explicit overrides apply next; the requested type remains authoritative. |
| Adaptive time was counted incorrectly | On a step which selects a new timestep, the world counted the next interval rather than the interval actually integrated. Debris received that same wrong elapsed time. | Use the duration returned by `solver.step()`. A synthetic changing-timestep regression checks both clocks. |
| Contact pulses could disappear between frames | Activity in an early substep was overwritten by later substeps before the world observed it. | Latch first contact and last activity after each substep, before dispatching events. |
| Conventional shell event clocks started before contact | APHE, HE and HESH could start their delay clock merely because the continuum mesh existed ahead of the target. | Start the existing delay from the first resolved contact timestamp; repeated checks dispatch once. No delay values or activation thresholds were calibrated. |
| HEAT reported a fictitious conventional-shell dud | HEAT's existing liner-only model was later sent through a path requiring filler nodes which it never meshed. | Mark the imposed formation event as functioned once and keep it out of the conventional-shell detonation path. The imposed formation model and its velocity parameters are unchanged. |
| Attached sabot was invisible live | The live renderer read the replay-only `sabot` field instead of `sabotAttached`. Replay and live views disagreed. | Use the appropriate state in each view; keep actual discard and mass bookkeeping unchanged. |
| APHE filler was hidden and the shell looked crude | The opaque body covered the cavity; the old blunt body and coarse rounded cap gave a stubby silhouette. | Always show the section, use a smoother pointed ogive shared by flight rendering and meshing, and add illustrative driving-band, base-plug, fuze, booster and casing-section details. There is no toggle. Impact frames continue to show actual damaged material. |
| Rendering modified live state | Drawing a recorded pose temporarily assigned it to the live projectile, leaving it there if drawing failed. | Transform polygons using an explicit pose without assigning to the projectile; restore canvas state even on failure. |
| Reset retained old outcome state | A miss could leave `finishReason` and other clocks/counters behind for the next run. | Clear event, completion, coast and progress state on reset. |
| Checkpoints retained state from the future | Positions were rewound while projectile events, roles, fragment counters, module hits, cassette state, log sequence and result fields could remain from later frames. Recomputing forces also advanced history and energy accounting. | Snapshot mutable state, forces, bond-contact references and accumulators; replace future result objects and restore the saved forces without another force evaluation. |

The local development server also now converts its file URL with
`fileURLToPath`, allowing the documented Node server to work on Windows.

## Coverage by type

| Types | Audit coverage |
| --- | --- |
| AP, APC, APCR | Configuration/default propagation, finite geometry and mass, reset, scenario round-trip, checkpoint continuation, full existing scenarios. |
| APCBC | The same coverage, plus transient contact observation and completion checks. No arbitrary strength or ricochet tuning was introduced. |
| APHE | The same coverage, contact-triggered event ordering, always-visible section view, recorded/live pixel agreement, no intact overlay after impact. |
| APDS, APFSDS | The same coverage, attached/discarded sabot visibility in live/replay views, single discard and mass accounting. |
| HE, HESH | The same coverage, no event before resolved contact, one event after the existing delay, restored event state on rewind. |
| HEAT | The same coverage, preserved type defaults, single imposed formation event, no false conventional-shell dud, restored role/event state on rewind. |

The APCBC complaint cannot be established as a real-world performance claim
from these checks. The audit corrects demonstrated software defects rather
than increasing penetration or reducing ricochet until a result looks right.

## Verification

- `node tools/ammunition-checks.mjs`: 35 software checks. Includes all ten types,
  a bonded-domain checkpoint continuation, and a generic two-particle elastic
  collision at two timesteps. The collision uses a declared 1% final energy
  tolerance; measured drift was approximately 0.037% and 0.012%, respectively,
  with unchanged mass and balanced momentum.
- Existing debris lifecycle, contact-search and fragment-transport checks.
- `tools/ammunition-preview.html`, `?webgl1`, and `?canvas2d`: cutaway visibility,
  live/recorded pixel agreement, read-only rendering, and absence of an intact
  projectile overlay during impact. Projectile drawing uses the Canvas 2D
  overlay regardless of which node-field backend is available.
- Real UI: each of the 12 additions loads, displays its provenance and generic
  settings notice, and preserves the armor setup.
- `node tools/ammunition-checks.mjs --aphe-runs`: 39 passing checks, including
  the revised default APHE and all three APHE catalog entries running to completion.
- The full `tools/checks.mjs` suite passes the ten-type and 39-entry completion
  checks, but finishes with **two failures**. Both reproduce on the unchanged
  base revision `bc223a3f4881ef9f3c226b51a64befa39f722aeb`:
  the hardness-ordering case reports 290 / 320 / 295 m/s for UHH / RHA / mild
  steel in both versions, and the debris case ends at its existing 15 ms budget
  with moving fragments (4 on the base, 3 on the candidate). These are existing
  model/completion-contract limitations, not passing results or tuned-away tests.
  The full suite preceded the final APHE shape revision; the focused APHE runs
  above validate that revision separately.
- Standalone build and `git diff --check`.

No `.game-dev/adapter.json` exists in this repository. Visual evidence uses
the repository's browser fixtures rather than claiming a sealed adapter run.

## Catalog provenance and compatibility

The 27 existing preset identifiers and their configuration values are retained.
Twelve additions provide historical names with **generic type defaults**, not
reconstructed performance data. The picker explicitly identifies them as game
approximations and shows source links. Dates and vehicle associations are omitted
where they have not been verified. Undated entries follow the dated list.

The optional `approximate` and `sources` catalog fields do not change the
saved-scenario format. Selecting an entry still changes only the projectile.

Name references, not parameter validation:

- [US Army production history, table PR-8](https://www.govinfo.gov/content/pkg/GOVPUB-D114-PURL-gpo122003/pdf/GOVPUB-D114-PURL-gpo122003.pdf): M48, M42A1, M71, M72 and M51 designations.
- [US Army ordnance development history](https://history.army.mil/portals/143/Images/Publications/catalog/10-9.pdf): M304 HVAP designation.
- [US Army FSTC-CW-07-100-73 archival scan, p. 2-51](https://www.bulletpicker.com/pdf/FSTC-CW-07-100-73.pdf): BR-350B, BR-365K and BR-471B designations in a base-fuze entry; the game uses its generic APHE representation.
- [US Army ARMOR, March–April 1977, p. 20](https://mcoecbamcoepwprd01.blob.core.usgovcloudapi.net/library/CavalryArmorJournal/1970s/1977Jan-Dec.pdf): L35 HESH designation.
- [UK Defence Industrial Strategy, B6.10](https://www.gov.uk/government/uploads/system/uploads/attachment_data/file/272203/6697.pdf): L31A7 HESH designation.
- [Italian Ministry of Defence catalog, Annex A, p. 5](https://www.difesa.it/assets/allegati/57026/ter_i_92_00_materiali_001_r002.pdf): L52 APDS-T designation.

## Remaining model limits

HEAT still uses imposed liner formation, not a resolved collapse calculation.
HE and HESH still use the existing simplified impulse and material models, not
a compressible blast/gas solver. The simulation remains a 2D section, and no
new destructive-performance calibration, classified estimates, or force-law
changes are included. Numerical consistency in controlled fixtures is not
evidence of real-world ammunition accuracy.

The APHE outer profile is a generic pointed game shell, not a reconstruction of
each named service round. Its silhouette is shared with the mesher. The visible
band and fuze hardware are decorative section details fitted inside that
silhouette; they do not add materials, change the filler boundary, or define
fuze mechanisms in the solver. Existing mass targets and event settings remain.

Resume continues from the nearest stored keyframe. The checkpoint tests verify
exact solver continuation for their controlled fixtures, not every possible
scenario or a guarantee that resume starts at the exact displayed video frame.
Expanded checkpoints retain more mutable state and therefore use additional
memory; `memoryBytes()` includes their typed-array storage.
