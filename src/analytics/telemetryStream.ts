/**
 * Synthetic per-station turbidity telemetry: a continuous noisy signal an
 * EWMA detector (`ewma.ts`) can monitor, standing in for a real in-river
 * turbidity sensor. Nothing here is measured from the real Mondego --
 * these are illustrative, documented baseline/event magnitudes (same
 * disclosure policy as `advectionDispersion.ts`'s dispersion default), not
 * a claim about real water quality.
 *
 * Turbidity (NTU, nephelometric turbidity units) is used because a sudden
 * spike is a well-documented, fast-responding proxy for sewage/runoff
 * contamination events -- consistent with the acute-signature turbidity
 * jump this project's own synthetic breach model has used throughout
 * (150-400 NTU during a simulated sewage-backflow event).
 */

export interface TelemetryBaseline {
  meanNtu: number;
  stdDevNtu: number;
}

/** Typical clear-water urban river baseline. */
export const NORMAL_BASELINE: TelemetryBaseline = { meanNtu: 15, stdDevNtu: 3 };

/** Sustained contamination-event elevation added on top of baseline noise,
 * not a replacement of it -- the event is a mean-shift, not a different
 * noise process, which is exactly the failure mode EWMA (not a raw
 * threshold) is suited to catch early. */
export const EVENT_MEAN_SHIFT_NTU = 45;

export type RandomSource = () => number;

/** Box-Muller transform for approximately Gaussian noise from a uniform
 * random source -- standard, textbook technique, used here instead of a
 * library dependency for a single small transform. */
function gaussian(rng: RandomSource): number {
  const u1 = Math.max(rng(), Number.EPSILON);
  const u2 = rng();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

/** One simulated reading at a given tick. `eventStartTick`, if set and
 * `tick >= eventStartTick`, applies the sustained contamination mean-shift
 * -- modeling a real event's onset, not an instantaneous single-sample
 * spike, so a detector has an actual sustained shift to pick up on. */
export function nextTurbidityReading(
  tick: number,
  eventStartTick: number | null,
  rng: RandomSource = Math.random,
  baseline: TelemetryBaseline = NORMAL_BASELINE,
): number {
  const shifted = eventStartTick !== null && tick >= eventStartTick;
  const mean = shifted ? baseline.meanNtu + EVENT_MEAN_SHIFT_NTU : baseline.meanNtu;
  const reading = mean + baseline.stdDevNtu * gaussian(rng);
  return Math.max(0, Math.round(reading * 10) / 10);
}
