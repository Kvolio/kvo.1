/**
 * CALIBRATION KNOBS
 * =================
 *
 * The handful of numbers that map a continuum material onto the 2-D
 * peridynamic lattice and that are fitted rather than measured. They live in
 * one place so that tools/validate.mjs and tools/bench can move them without
 * editing solver code, and so that every departure from "use the handbook value
 * directly" is visible and explained.
 *
 * The defaults are the CALIBRATED values; see docs/MODEL.md for what each one
 * does and why it is not simply 1.
 */
export const TUNE = {
  /**
   * Strain hardening, folded into the perfectly-plastic bond. A real metal
   * flows at its 0.2 % yield only at the very start; by the 5-10 % strains of
   * penetration it is working at something between yield and ultimate. The
   * database stores the honest yield (Y) and ultimate (UTS), and the solver's
   * bond yield stretch is the flow stress
   *
   *     Y_flow = Y + hardening * (UTS - Y)
   *
   * for metals. 0.4 is the fraction of the Y-to-UTS interval reached at ~5 %
   * strain for a steel with a typical hardening exponent. Ceramics, which have
   * no tensile hardening, are not touched.
   */
  hardening: 0.4,

  /**
   * Multiplier on the failure stretch of metals. The handbook "elongation"
   * (17 % for RHA) is a uniform-plus-necking engineering strain over a 50 mm
   * gauge. The strain a small volume of metal reaches locally before it
   * separates is the TRUE FRACTURE strain, ln(1/(1-RA)), several times larger.
   * Using the elongation as the local limit makes metal tear at a fraction of
   * the strain it really survives.
   */
  failMetal: 3.0,

  /**
   * Shear/compression failure allowance, as a multiple of the tensile failure
   * stretch, applied to the ACCUMULATED PLASTIC stretch of a bond.
   */
  compDuct: 4.0,

  /**
   * Ductile-fracture suppression by pressure. In a Johnson-Cook damage law the
   * strain to failure rises as exp(-D3 * sigma*), sigma* = mean stress / flow
   * stress; under the compressive, confined flow of hole growth that is a large
   * factor, under triaxial tension it is a small one. This is the exponent
   * applied to the compressive triaxiality (0 = off).
   */
  triax: 0.0,
  triaxMax: 6.0,

  /** Extra stiffness against compressive dilatation (2-D -> 3-D confinement). */
  confinement: 1.8,

  /**
   * Obliquity closure. A sloped plate has to be cut along its line of sight, an
   * elliptical hole in three dimensions, and the surrounding plate then
   * carries the load in every direction. The 2-D slab has one cut line and a
   * single strap that can hinge, so beyond ~35 deg it offers little more than
   * its normal thickness and the shot is turned instead of being stopped
   * (measured: implied ballistic limit 0.6 x de Marre at 80 mm / 55 deg, and
   * the T-34's 76 mm round defeating a Panther glacis). The strength of a
   * sloped layer is raised by sec(slope)^obliquity to supply that missing
   * resistance; 0 turns it off.
   */
  obliquity: 0,

  /** Out-of-plane participation of a sloped layer: slab depth, and so mass and force capacity, scaled by sec(slope)^obliqueDepth. */
  obliqueDepth: 1.0,

  /**
   * Half-width of the zone around the shot line in which armour may move, as a
   * multiple of the penetrator diameter plus a multiple of the line-of-sight
   * thickness. Armour beyond it is held. A huge value restores the old
   * behaviour of leaving the whole corridor free.
   */
  /**
   * Effective flow strength of armour METAL in the slice, as a multiple of the
   * handbook yield. Cylindrical cavity expansion in plane strain needs less
   * pressure than the spherical expansion of a real hole (about Y*(1+ln(E/3Y))
   * against Y*(2/3)(1+ln(E/3Y)) with a larger confined constant in 3-D), and the
   * slice has no hoop stress to fight. Fitted so that bisected ballistic limits
   * against de Marre at 0 deg land inside +/-25 %.
   */
  plateYield: 1.5,

  /** Exponent compressing the dynamic strength of metals softer than RHA: Y_eff ~ Y^softMetalExp (1 = no compression). */
  softMetalExp: 0.42,

  /** Failure-stretch multiplier on the penetrating rod of APDS/APFSDS rounds; a rod that fails early mushrooms into a blob instead of eroding. */
  rodDuctility: 3.0,

  /** Flow-strength multiplier on the rod of APDS/APFSDS rounds (dynamic strength of WHA/DU at rod strain rates, and plane-strain squash). */
  rodStrength: 1.0,

  /**
   * Share of the Y-to-UTS interval a ROD's material works at (compare `hardening`, which governs plate
   * and shell metal). A long rod sheds its work-hardened nose as it erodes, and a stronger rod penetrates
   * LESS (Tate: Y_p resists the rod's own flow), so the rod calibration (rodDuctility, rodTargetYield)
   * was made at the handbook yield. 0 keeps it there.
   */
  rodHardening: 0.0,

  /** Armour flow strength a very long rod (L/D >= 30) sees, as a multiple of handbook yield; eases from plateYield at L/D = 6. */
  rodTargetYield: 0.7,

  /** Multiplier on the compressive flow limit of ceramics (see plateYield). */
  ceramicYield: 1.8,

  friction: 0.15,

  freeZoneD: 1.2,
  freeZoneT: 0.5,
};
