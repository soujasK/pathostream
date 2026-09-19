/**
 * Fischer's (1979) predictive equation for the longitudinal dispersion
 * coefficient in open-channel/river flow, derived from channel geometry
 * rather than assumed as a flat constant.
 *
 *   D_L = beta * 0.011 * U^2 * W^2 / (H * U*)
 *
 * where U is the cross-sectionally averaged velocity, W is channel width,
 * H is mean depth, and U* is shear velocity; beta is a channel-shape /
 * velocity-distribution correction factor (default 1.0, i.e. uncorrected).
 * Source: Fischer, List, Koh, Imberger & Brooks, "Mixing in Inland and
 * Coastal Waters" (1979); also reported with the explicit beta correction
 * in Liu, H. (1977), "Predicting Dispersion Coefficient of Streams",
 * ASCE Journal of the Environmental Engineering Division, 103(1), 59-69 --
 * both independently confirmed against secondary sources citing the
 * original 0.011 coefficient (see oah-mondego/METHODS.md).
 *
 * This is genuinely applicable open-channel transport theory -- what this
 * case study does NOT have is real, surveyed Mondego channel geometry
 * (width/depth/slope) at Ponte da Portela to plug into it. The flat
 * `DEFAULT_DISPERSION_COEFFICIENT_M2_S` in advectionDispersion.ts remains
 * the fallback used throughout this module; this estimator exists so a
 * deployment WITH real channel-geometry data (e.g. from APA/SNIRH
 * cross-section surveys) can compute a properly grounded value instead of
 * a guessed constant.
 */

export interface ChannelGeometry {
  /** Cross-sectionally averaged mean velocity (m/s). */
  meanVelocityMs: number;
  /** Channel width (m). */
  widthM: number;
  /** Mean channel depth (m). */
  depthM: number;
  /** Channel bed/energy slope (dimensionless, e.g. 0.001 for a 1m drop
   * per 1000m). Used to derive shear velocity via `estimateShearVelocity`
   * if `shearVelocityMs` isn't supplied directly. */
  slope?: number;
  /** Shear velocity (m/s), if already known/measured -- takes precedence
   * over `slope` when both are given. */
  shearVelocityMs?: number;
  /** Fischer/Liu's channel-shape and velocity-distribution correction
   * factor (beta). Liu (1977) reports this varying roughly 0.4-4x across
   * real channel cross-sections; 1.0 (uncorrected) is the default here. */
  betaCorrectionFactor?: number;
}

const GRAVITY_M_S2 = 9.80665;
const FISCHER_COEFFICIENT = 0.011;

/** Shear velocity from depth and slope: U* = sqrt(g * H * S), the standard
 * wide-channel approximation (hydraulic radius R ~= depth H). */
export function estimateShearVelocity(depthM: number, slope: number): number {
  if (depthM <= 0) throw new Error("depthM must be positive");
  if (slope <= 0) throw new Error("slope must be positive");
  return Math.sqrt(GRAVITY_M_S2 * depthM * slope);
}

export function estimateDispersionCoefficient(geometry: ChannelGeometry): number {
  const { meanVelocityMs, widthM, depthM } = geometry;
  if (meanVelocityMs <= 0) throw new Error("meanVelocityMs must be positive");
  if (widthM <= 0) throw new Error("widthM must be positive");
  if (depthM <= 0) throw new Error("depthM must be positive");

  const shearVelocityMs =
    geometry.shearVelocityMs ??
    (geometry.slope !== undefined ? estimateShearVelocity(depthM, geometry.slope) : undefined);
  if (shearVelocityMs === undefined || shearVelocityMs <= 0) {
    throw new Error("Either shearVelocityMs or a positive slope must be supplied");
  }

  const beta = geometry.betaCorrectionFactor ?? 1.0;
  return (beta * FISCHER_COEFFICIENT * meanVelocityMs ** 2 * widthM ** 2) / (depthM * shearVelocityMs);
}

/**
 * The Peclet number (Pe = U*L/D) for a reach: the ratio of advective to
 * dispersive transport. The Taylor-dispersion "Gaussian in time"
 * approximation used in advectionDispersion.ts is a large-Pe
 * approximation -- it gets more accurate as Pe grows (see
 * numericalValidation.ts for a direct numerical check of this). Reporting
 * Pe alongside a forecast lets a reader judge whether the approximation
 * is being used in its valid regime, rather than asserting accuracy
 * blindly.
 */
export function pecletNumber(meanVelocityMs: number, distanceM: number, dispersionCoefficientM2S: number): number {
  if (dispersionCoefficientM2S <= 0) throw new Error("dispersionCoefficientM2S must be positive");
  return (meanVelocityMs * distanceM) / dispersionCoefficientM2S;
}
