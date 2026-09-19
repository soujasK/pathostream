/**
 * 1D advection-dispersion transport model for a pulse contaminant release
 * in an open channel.
 *
 * Uses the standard Taylor-dispersion (Fischer, List, Koh, Imberger &
 * Brooks, "Mixing in Inland and Coastal Waters", 1979) approximation: the
 * temporal concentration profile observed at a fixed downstream distance x
 * from an instantaneous release is approximately Gaussian in time, with
 *
 *   peak (centroid) time:      t_peak = x / u
 *   temporal variance:         sigma_t^2 = 2 * D * x / u^3
 *
 * where u is the mean flow velocity and D is the longitudinal dispersion
 * coefficient. This is real, standard river-transport theory -- what is
 * NOT real/verified is the specific `dispersionCoefficientM2S` value for
 * the actual Mondego River (no calibration data was available for this
 * case study); it is a documented, tunable illustrative default within the
 * literature's typical range for small-to-medium urban channels (Fischer
 * et al. cite roughly 1-100 m^2/s depending on channel geometry).
 */

export interface AdvectionDispersionParams {
  distanceKm: number;
  meanVelocityMs: number;
  /** Longitudinal dispersion coefficient (m^2/s). NOT calibrated to the
   * real Mondego -- see module docstring. */
  dispersionCoefficientM2S?: number;
  /** z-score defining the arrival/clearance bounds around the peak.
   * 1.645 corresponds to the 5th/95th percentiles of a Gaussian. */
  boundaryZScore?: number;
}

export interface TransportForecast {
  distanceKm: number;
  peakTimeMinutes: number;
  arrivalTimeMinutes: number;
  clearanceTimeMinutes: number;
  temporalSpreadMinutes: number;
  dispersionCoefficientM2S: number;
}

export const DEFAULT_DISPERSION_COEFFICIENT_M2_S = 8;
export const DEFAULT_BOUNDARY_Z_SCORE = 1.645;

export function computeTransportForecast(params: AdvectionDispersionParams): TransportForecast {
  const { distanceKm, meanVelocityMs } = params;
  const dispersionCoefficientM2S = params.dispersionCoefficientM2S ?? DEFAULT_DISPERSION_COEFFICIENT_M2_S;
  const boundaryZScore = params.boundaryZScore ?? DEFAULT_BOUNDARY_Z_SCORE;

  if (distanceKm <= 0) throw new Error("distanceKm must be positive");
  if (meanVelocityMs <= 0) throw new Error("meanVelocityMs must be positive");
  if (dispersionCoefficientM2S <= 0) throw new Error("dispersionCoefficientM2S must be positive");

  const distanceM = distanceKm * 1000;
  const peakTimeSeconds = distanceM / meanVelocityMs;
  const varianceSeconds2 = (2 * dispersionCoefficientM2S * distanceM) / meanVelocityMs ** 3;
  const sigmaSeconds = Math.sqrt(varianceSeconds2);

  const arrivalTimeSeconds = Math.max(0, peakTimeSeconds - boundaryZScore * sigmaSeconds);
  const clearanceTimeSeconds = peakTimeSeconds + boundaryZScore * sigmaSeconds;

  return {
    distanceKm,
    peakTimeMinutes: peakTimeSeconds / 60,
    arrivalTimeMinutes: arrivalTimeSeconds / 60,
    clearanceTimeMinutes: clearanceTimeSeconds / 60,
    temporalSpreadMinutes: sigmaSeconds / 60,
    dispersionCoefficientM2S,
  };
}

/**
 * Relative (peak-normalized, [0,1]) concentration intensity of the Gaussian
 * breakthrough curve at the given elapsed time. This is a RELATIVE index,
 * not an absolute concentration -- no real mass-loading/discharge data
 * exists for this illustrative case study, so an absolute mg/L prediction
 * would be fabricated. Multiply by an upstream severity index (e.g. a
 * CCI-style score) to get a scaled downstream severity estimate.
 */
export function relativeIntensityAt(elapsedMinutes: number, forecast: TransportForecast): number {
  const elapsedSeconds = elapsedMinutes * 60;
  const peakSeconds = forecast.peakTimeMinutes * 60;
  const sigmaSeconds = forecast.temporalSpreadMinutes * 60;
  if (sigmaSeconds <= 0) return elapsedSeconds === peakSeconds ? 1 : 0;
  const z = (elapsedSeconds - peakSeconds) / sigmaSeconds;
  return Math.exp(-0.5 * z * z);
}

/** Standard normal CDF via the Abramowitz & Stegun (1964) rational
 * approximation, "Handbook of Mathematical Functions", formula 7.1.26 --
 * a standard, citable numerical approximation (max error ~1.5e-7), not an
 * ad hoc curve fit. */
function standardNormalCdf(z: number): number {
  const sign = z < 0 ? -1 : 1;
  const x = Math.abs(z) / Math.SQRT2;
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;
  const t = 1 / (1 + p * x);
  const y = 1 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
  return 0.5 * (1 + sign * y);
}

/**
 * Probability that the contamination front has arrived by `elapsedMinutes`,
 * under the model's own Gaussian-breakthrough assumption: P(arrived) =
 * Phi((t - t_peak) / sigma_t), the CDF of the same Gaussian this module
 * already fits to the transport model (see `computeTransportForecast`).
 *
 * This replaces an earlier ad hoc "probability" heuristic (a severity-
 * weighted linear decay unrelated to the transport model) with a quantity
 * that means something specific and is derived from the SAME physics as
 * the rest of the forecast: 0 well before the predicted window, 0.5 at
 * exactly the predicted peak, approaching 1 well after. It intentionally
 * does NOT fold in upstream severity (how bad the contamination is) --
 * that is a separate, orthogonal dimension reported alongside it, not
 * multiplied in, to avoid conflating "has transport occurred" with "how
 * bad is it".
 */
export function arrivalProbability(elapsedMinutes: number, forecast: TransportForecast): number {
  const elapsedSeconds = elapsedMinutes * 60;
  const peakSeconds = forecast.peakTimeMinutes * 60;
  const sigmaSeconds = forecast.temporalSpreadMinutes * 60;
  if (sigmaSeconds <= 0) return elapsedSeconds >= peakSeconds ? 1 : 0;
  const z = (elapsedSeconds - peakSeconds) / sigmaSeconds;
  return standardNormalCdf(z);
}
