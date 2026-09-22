/**
 * Seeded randomness and noise models for the evaluation harness. Every
 * number in EVALUATION.md comes from a fixed seed, so re-running
 * `npm run evaluate` reproduces it exactly (same Node major version).
 */

/** mulberry32: a small, well-known 32-bit seeded PRNG. Adequate for Monte
 * Carlo at this scale; not cryptographic. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Box-Muller, using both outputs of each transform. */
export function makeNormal(rng: () => number): () => number {
  let spare: number | null = null;
  return () => {
    if (spare !== null) {
      const s = spare;
      spare = null;
      return s;
    }
    const u1 = Math.max(rng(), Number.EPSILON);
    const u2 = rng();
    const r = Math.sqrt(-2 * Math.log(u1));
    spare = r * Math.sin(2 * Math.PI * u2);
    return r * Math.cos(2 * Math.PI * u2);
  };
}

/** A source of standardised (mean 0, variance 1) noise. `restart` returns a
 * stateful source (AR(1)) to its stationary distribution at the start of a
 * fresh run. */
export interface NoiseSource {
  next(): number;
  restart(): void;
}

export function gaussianNoise(rng: () => number): NoiseSource {
  const normal = makeNormal(rng);
  return { next: normal, restart: () => undefined };
}

/** Stationary AR(1) with unit marginal variance:
 * e_t = phi * e_{t-1} + sqrt(1 - phi^2) * eps_t. Real turbidity sampled
 * every few minutes is positively autocorrelated; a control chart that
 * assumes independent readings is not robust to that. */
export function ar1Noise(rng: () => number, phi: number): NoiseSource {
  if (phi <= -1 || phi >= 1) throw new Error(`phi must be in (-1, 1), got ${phi}`);
  const normal = makeNormal(rng);
  const innovationScale = Math.sqrt(1 - phi * phi);
  let previous = normal();
  return {
    next: () => {
      previous = phi * previous + innovationScale * normal();
      return previous;
    },
    restart: () => {
      previous = normal();
    },
  };
}

/** Standardised lognormal noise with coefficient of variation `cv` -- a
 * right-skewed alternative to the Gaussian (turbidity cannot go below
 * zero and spikes upward). Mean 0, variance 1 after standardisation. */
export function lognormalNoise(rng: () => number, cv: number): NoiseSource {
  const normal = makeNormal(rng);
  const s2 = Math.log(1 + cv * cv);
  const s = Math.sqrt(s2);
  return {
    next: () => (Math.exp(s * normal() - s2 / 2) - 1) / cv,
    restart: () => undefined,
  };
}

/** Multiplies a source's noise by `ratio` -- models the true process
 * standard deviation differing from the one the chart was built with. */
export function scaledNoise(source: NoiseSource, ratio: number): NoiseSource {
  return { next: () => ratio * source.next(), restart: () => source.restart() };
}
