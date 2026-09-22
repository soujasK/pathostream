/**
 * SYNTHETIC, DOCUMENTED training data for the citizen-report triage
 * classifier. No real citizen reports exist in or were used by this
 * project -- the OneAquaHealth Citizen Science App's real submissions are
 * not available here (see IOT_ARCHITECTURE.md's equivalent disclosure for
 * sensor data). This generator exists so the classifier's training
 * process is fully reproducible and its labelling rule is a literal,
 * readable piece of code, not a black box or an invented dataset "we
 * looked at and hand-labelled."
 *
 * The labelling rule below is OUR OWN judgement call about which
 * combinations of a citizen's structured observation plausibly warrant a
 * human water-authority reviewer's attention. It is not derived from any
 * published water-quality guidance or clinical study -- unlike the
 * project's epidemiological citations (METHODS.md section 6), this is
 * explicitly a design choice, disclosed as one.
 */

import type { NoiseSource } from "../evaluation/prng.js";
import { extractFeatures, type ObservationInput } from "./features.js";
import type { LabelledExample } from "./logisticRegression.js";

/** A uniform random integer in [min, max] from a [0,1) source. */
function randomInt(rng: () => number, min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1));
}

function bernoulli(rng: () => number, p: number): boolean {
  return rng() < p;
}

/** The documented rule a synthetic observation is labelled against.
 * Exported so a test can assert the classifier's decisions are broadly
 * consistent with the rule it was trained to approximate -- the point of
 * an explainable model is that this kind of check is even possible. */
export function ruleBasedLabel(obs: ObservationInput): 0 | 1 {
  if (obs.deadWildlife) return 1;
  if (obs.clarityScore <= 2 && (obs.unusualOdor || obs.discoloration)) return 1;
  if (obs.unusualOdor && obs.discoloration && obs.foam) return 1;
  return 0;
}

/** Generates `count` synthetic observations with independent, documented
 * marginal probabilities (most reports are unremarkable, matching the
 * real citizen-science literature's expectation that most submitted
 * assessments are of normal conditions), labels each by the rule above,
 * then flips `labelNoiseRate` of the labels -- real human judgement is
 * not a clean function of a handful of checkboxes, and training on a
 * perfectly separable dataset would teach the model an unrealistically
 * sharp decision boundary. */
export function generateSyntheticTrainingSet(
  rng: () => number,
  count: number,
  labelNoiseRate = 0.05,
): LabelledExample[] {
  const examples: LabelledExample[] = [];
  for (let i = 0; i < count; i++) {
    const obs: ObservationInput = {
      clarityScore: randomInt(rng, 1, 5) as ObservationInput["clarityScore"],
      unusualOdor: bernoulli(rng, 0.15),
      deadWildlife: bernoulli(rng, 0.08),
      discoloration: bernoulli(rng, 0.15),
      foam: bernoulli(rng, 0.12),
    };
    let label = ruleBasedLabel(obs);
    if (bernoulli(rng, labelNoiseRate)) label = label === 1 ? 0 : 1;
    examples.push({ features: extractFeatures(obs), label });
  }
  return examples;
}

/** Splits a dataset into train/test partitions at a fixed fraction --
 * simple index-based split (the data has no time or group structure to
 * respect), deterministic given the input order. */
export function trainTestSplit<T>(data: T[], trainFraction: number): { train: T[]; test: T[] } {
  const cut = Math.floor(data.length * trainFraction);
  return { train: data.slice(0, cut), test: data.slice(cut) };
}

export type { NoiseSource };
