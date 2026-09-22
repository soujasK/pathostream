/**
 * A sensitivity band around a predicted travel time, so an ETA is never shown
 * as if it were known to the minute.
 *
 * Travel time is distance / mean velocity, and the mean velocity behind every
 * forecast here is an illustrative placeholder (see each river's provenance
 * rows), not a gauge measurement. If the velocity is log-normal about the
 * assumed value with log-sd `s`, the travel time is log-normal with the same
 * `s`, so the 90% band is exactly  peak / f  to  peak * f  with
 * f = exp(1.645 * s).
 *
 * WHAT THIS IS NOT: a calibrated prediction interval. `s` is an ASSUMPTION
 * (a factor of roughly two either way -- real river velocity varies with
 * discharge, but the size of that variation for any of these reaches is not
 * measured here). It shows how sensitive the ETA is to the placeholder
 * velocity; it does not say that 90% of real arrivals will fall inside it.
 * Dispersion (the arrival window's width) is a separate, additional
 * uncertainty and is not included.
 */

/** Assumed log-standard-deviation of the mean-velocity error (ASSUMPTION). */
export const ASSUMED_VELOCITY_LOG_SD = 0.5;

/** z for a two-sided 90% band (the 5th to 95th percentile). */
const Z_90 = 1.6448536269514722;

export interface TravelTimeBand {
  lowMinutes: number;
  highMinutes: number;
  /** The assumed velocity log-sd this band was computed from. */
  velocityLogSd: number;
}

export function travelTimeBand(peakMinutes: number, velocityLogSd: number = ASSUMED_VELOCITY_LOG_SD): TravelTimeBand {
  const factor = Math.exp(Z_90 * velocityLogSd);
  return { lowMinutes: peakMinutes / factor, highMinutes: peakMinutes * factor, velocityLogSd };
}

/** The band's multiplicative half-width, e.g. 2.3 for "about a factor of two". */
export function bandFactor(velocityLogSd: number = ASSUMED_VELOCITY_LOG_SD): number {
  return Math.exp(Z_90 * velocityLogSd);
}
