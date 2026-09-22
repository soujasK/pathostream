/**
 * The trained citizen-report triage classifier: loads the weights
 * scripts/trainCitizenClassifier.ts produced (src/citizen/model.json,
 * committed -- regenerate with `npm run train-citizen-classifier`) and
 * scores a structured citizen observation.
 *
 * WHAT THIS DOES: flags a submitted observation as "review recommended"
 * or "no concern flagged" for a HUMAN water-authority reviewer, with a
 * full, literal breakdown of why (explainLogit -- every number here sums
 * exactly to the model's output, nothing is a post-hoc approximation).
 *
 * WHAT THIS DOES NOT DO: it never confirms an exposure on its own. See
 * observations.ts -- a "review recommended" result only ever creates a
 * pending, human-reviewable record; only an explicit operator action can
 * promote it into the real exposure engine (the same engine the
 * statistical detector and manual operator reports use), and that
 * promotion is recorded with its own confirmedVia value
 * ('citizen-reported') so a clinician's card can say honestly where the
 * signal came from -- see exposureEngine.ts's ConfirmationSource and
 * patientView.ts's describeFlag().
 */

import modelData from "./model.json" with { type: "json" };
import { extractFeatures, FEATURE_NAMES, type ObservationInput } from "./features.js";
import { explainLogit, predictProbability, type LogisticModel } from "./logisticRegression.js";

const MODEL: LogisticModel = { weights: modelData.weights, bias: modelData.bias };

/** Probability at or above this triggers "review recommended". Not 0.5:
 * a false negative here (missing a real concern) is worse than a false
 * positive (an operator spends a minute reviewing a report that turns out
 * fine), so the threshold is set below the model's own 50/50 point --
 * a deliberate, documented choice, not the model's default behaviour. */
export const REVIEW_THRESHOLD = 0.35;

export interface FeatureContribution {
  feature: string;
  value: number;
  weight: number;
  contribution: number;
}

export interface TriageResult {
  probability: number;
  recommendReview: boolean;
  threshold: number;
  explanation: { bias: number; contributions: FeatureContribution[]; logit: number };
  modelInfo: { trainedOn: number; heldOutAccuracy: number; seed: number };
}

export function assessObservation(obs: ObservationInput): TriageResult {
  const features = extractFeatures(obs);
  const probability = predictProbability(MODEL, features);
  const raw = explainLogit(MODEL, features);
  return {
    probability,
    recommendReview: probability >= REVIEW_THRESHOLD,
    threshold: REVIEW_THRESHOLD,
    explanation: {
      bias: raw.bias,
      logit: raw.logit,
      contributions: raw.contributions.map((contribution, i) => ({
        feature: FEATURE_NAMES[i]!,
        value: features[i]!,
        weight: MODEL.weights[i]!,
        contribution,
      })),
    },
    modelInfo: {
      trainedOn: modelData.trainedOn.n,
      heldOutAccuracy: modelData.metrics.test.accuracy,
      seed: modelData.seed,
    },
  };
}
