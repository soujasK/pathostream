/**
 * The citizen-report feature schema, modelled on the REAL OneAquaHealth
 * Citizen Science App's own observation categories -- "structured scoring
 * of water and habitat conditions" including visible water quality and
 * "signs of pollution or alteration" (confirmed directly from
 * oneaquahealth.eu's own citizen-science project page; see METHODS.md
 * section 6d's sibling disclosure for what was and wasn't confirmed about
 * that app). Photos and video, which the real app also collects, are NOT
 * modelled here -- classifying an uploaded image needs a vision model,
 * which this project does not have credentials to call, and fabricating
 * that capability would violate this project's own disclosure policy.
 * This is a structured-score-only subset, honestly scoped.
 */

export interface ObservationInput {
  /** 1 (very cloudy / concerning) to 5 (very clear). */
  clarityScore: 1 | 2 | 3 | 4 | 5;
  unusualOdor: boolean;
  deadWildlife: boolean;
  discoloration: boolean;
  foam: boolean;
}

/** Human-readable names for each feature, in the same order
 * extractFeatures() emits them -- used to label the explanation the API
 * returns, so "why did the model say this" names real fields, not
 * "feature[2]". */
export const FEATURE_NAMES = ["clarity concern", "unusual odor", "dead wildlife", "discoloration", "foam"] as const;

/** Turns a structured observation into the model's input vector.
 * clarityScore is remapped to a signed [-1, 1] "concern" axis (1 = very
 * cloudy -> +1; 5 = very clear -> -1) so its sign, like the boolean
 * features, is directly interpretable in the logistic regression's
 * weights: a positive weight on any feature should push toward
 * "warrants review". */
export function extractFeatures(obs: ObservationInput): number[] {
  const clarityConcern = (3 - obs.clarityScore) / 2;
  return [clarityConcern, obs.unusualOdor ? 1 : 0, obs.deadWildlife ? 1 : 0, obs.discoloration ? 1 : 0, obs.foam ? 1 : 0];
}

export function isValidObservationInput(value: unknown): value is ObservationInput {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.clarityScore === "number" &&
    Number.isInteger(v.clarityScore) &&
    v.clarityScore >= 1 &&
    v.clarityScore <= 5 &&
    typeof v.unusualOdor === "boolean" &&
    typeof v.deadWildlife === "boolean" &&
    typeof v.discoloration === "boolean" &&
    typeof v.foam === "boolean"
  );
}
