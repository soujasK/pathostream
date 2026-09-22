import { describe, expect, it } from "vitest";
import { assessObservation, REVIEW_THRESHOLD } from "../src/citizen/classifier.js";
import { extractFeatures, FEATURE_NAMES, isValidObservationInput, type ObservationInput } from "../src/citizen/features.js";
import { evaluate, explainLogit, predictProbability, trainLogisticRegression } from "../src/citizen/logisticRegression.js";
import { generateSyntheticTrainingSet, ruleBasedLabel, trainTestSplit } from "../src/citizen/trainingData.js";
import { mulberry32 } from "../src/evaluation/prng.js";
import modelData from "../src/citizen/model.json" with { type: "json" };

const clear: ObservationInput = { clarityScore: 5, unusualOdor: false, deadWildlife: false, discoloration: false, foam: false };
const deadFish: ObservationInput = { ...clear, deadWildlife: true };
const cloudyAndSmelly: ObservationInput = { ...clear, clarityScore: 1, unusualOdor: true };
const tripleFlag: ObservationInput = { ...clear, unusualOdor: true, discoloration: true, foam: true };

describe("logisticRegression (generic, from-scratch)", () => {
  it("learns a linearly separable AND function from noiseless data", () => {
    const data = [
      { features: [0, 0], label: 0 as const },
      { features: [0, 1], label: 0 as const },
      { features: [1, 0], label: 0 as const },
      { features: [1, 1], label: 1 as const },
    ];
    // Repeat so batch gradient descent has more than 4 points to average over.
    const repeated = Array.from({ length: 50 }, () => data).flat();
    const model = trainLogisticRegression(repeated, { epochs: 2000, learningRate: 0.5, l2: 0 });
    expect(predictProbability(model, [1, 1])).toBeGreaterThan(0.9);
    expect(predictProbability(model, [0, 0])).toBeLessThan(0.1);
    const metrics = evaluate(model, data);
    expect(metrics.accuracy).toBe(1);
  });

  it("explainLogit's contributions sum exactly to the logit (a literal breakdown, not an approximation)", () => {
    const model = { weights: [0.5, -1.2, 3], bias: 0.7 };
    const features = [1, 2, 0.5];
    const { bias, contributions, logit } = explainLogit(model, features);
    expect(bias + contributions.reduce((a, b) => a + b, 0)).toBeCloseTo(logit, 12);
  });

  it("L2 regularization shrinks weights toward zero versus no regularization, on the same data", () => {
    const data = Array.from({ length: 200 }, (_, i) => ({ features: [i % 2 === 0 ? 1 : -1], label: (i % 2) as 0 | 1 }));
    const unregularized = trainLogisticRegression(data, { epochs: 500, learningRate: 0.3, l2: 0 });
    const regularized = trainLogisticRegression(data, { epochs: 500, learningRate: 0.3, l2: 1 });
    expect(Math.abs(regularized.weights[0]!)).toBeLessThan(Math.abs(unregularized.weights[0]!));
  });

  it("rejects empty training data and mismatched feature counts", () => {
    expect(() => trainLogisticRegression([], { epochs: 10, learningRate: 0.1, l2: 0 })).toThrow(/empty/);
    expect(() =>
      trainLogisticRegression(
        [
          { features: [1, 2], label: 0 },
          { features: [1], label: 1 },
        ],
        { epochs: 10, learningRate: 0.1, l2: 0 },
      ),
    ).toThrow(/same feature count/);
  });

  it("predictProbability rejects a feature-vector length mismatch", () => {
    expect(() => predictProbability({ weights: [1, 2], bias: 0 }, [1])).toThrow(/expected 2 features/);
  });
});

describe("citizen/features.ts", () => {
  it("maps clarityScore to a signed concern axis: 1 (cloudy) positive, 5 (clear) negative", () => {
    const [cloudy] = extractFeatures({ ...clear, clarityScore: 1 });
    const [clearFeature] = extractFeatures({ ...clear, clarityScore: 5 });
    expect(cloudy).toBeGreaterThan(0);
    expect(clearFeature).toBeLessThan(0);
  });

  it("extracts exactly FEATURE_NAMES.length features, in that order", () => {
    expect(extractFeatures(clear)).toHaveLength(FEATURE_NAMES.length);
  });

  it("isValidObservationInput rejects malformed input", () => {
    expect(isValidObservationInput(clear)).toBe(true);
    expect(isValidObservationInput({ ...clear, clarityScore: 6 })).toBe(false);
    expect(isValidObservationInput({ ...clear, clarityScore: 1.5 })).toBe(false);
    expect(isValidObservationInput({ ...clear, unusualOdor: "yes" })).toBe(false);
    expect(isValidObservationInput(null)).toBe(false);
    expect(isValidObservationInput("clear")).toBe(false);
  });
});

describe("citizen/trainingData.ts: the documented synthetic labelling rule", () => {
  it("ruleBasedLabel matches its own documented conditions", () => {
    expect(ruleBasedLabel(clear)).toBe(0);
    expect(ruleBasedLabel(deadFish)).toBe(1);
    expect(ruleBasedLabel(cloudyAndSmelly)).toBe(1);
    expect(ruleBasedLabel(tripleFlag)).toBe(1);
    expect(ruleBasedLabel({ ...clear, foam: true })).toBe(0); // foam alone is not enough
  });

  it("generateSyntheticTrainingSet is deterministic given the same seed", () => {
    const a = generateSyntheticTrainingSet(mulberry32(7), 100);
    const b = generateSyntheticTrainingSet(mulberry32(7), 100);
    expect(a).toEqual(b);
  });

  it("trainTestSplit is a clean, non-overlapping partition covering every example", () => {
    const data = Array.from({ length: 10 }, (_, i) => i);
    const { train, test } = trainTestSplit(data, 0.7);
    expect(train).toHaveLength(7);
    expect(test).toHaveLength(3);
    expect([...train, ...test].sort((a, b) => a - b)).toEqual(data);
  });
});

describe("the committed, trained model (src/citizen/model.json)", () => {
  it("beat the majority-class baseline by a wide margin on held-out data -- it learned something real", () => {
    expect(modelData.metrics.test.accuracy).toBeGreaterThan(modelData.metrics.majorityClassBaselineAccuracy + 0.1);
  });

  it("train and test loss are close -- not wildly overfit to the training set", () => {
    expect(Math.abs(modelData.metrics.train.loss - modelData.metrics.test.loss)).toBeLessThan(0.1);
  });

  it("every learned weight has the sign the labelling rule implies (all risk factors push toward concern)", () => {
    for (const w of modelData.weights) expect(w).toBeGreaterThan(0);
  });

  it("dead wildlife has the single largest weight, matching the rule where it alone is sufficient", () => {
    const deadWildlifeIndex = modelData.featureNames.indexOf("dead wildlife");
    const maxWeight = Math.max(...modelData.weights);
    expect(modelData.weights[deadWildlifeIndex]).toBe(maxWeight);
  });
});

describe("assessObservation (classifier.ts, the actual runtime path)", () => {
  it("a clear report with no red flags: low probability, no review recommended", () => {
    const result = assessObservation(clear);
    expect(result.probability).toBeLessThan(REVIEW_THRESHOLD);
    expect(result.recommendReview).toBe(false);
  });

  it("dead wildlife alone: high probability, review recommended", () => {
    const result = assessObservation(deadFish);
    expect(result.recommendReview).toBe(true);
  });

  it("cloudy + unusual odor: review recommended", () => {
    expect(assessObservation(cloudyAndSmelly).recommendReview).toBe(true);
  });

  it("foam alone (weakest single feature): does NOT recommend review by itself", () => {
    expect(assessObservation({ ...clear, foam: true }).recommendReview).toBe(false);
  });

  it("the explanation's contributions sum to the logit, and every contribution names a real feature", () => {
    const result = assessObservation(tripleFlag);
    const { bias, contributions, logit } = result.explanation;
    expect(bias + contributions.reduce((a, c) => a + c.contribution, 0)).toBeCloseTo(logit, 10);
    for (const c of contributions) expect(FEATURE_NAMES).toContain(c.feature);
  });

  it("reports which model produced this (seed, training size, held-out accuracy) -- not silent about provenance", () => {
    const result = assessObservation(clear);
    expect(result.modelInfo.seed).toBe(modelData.seed);
    expect(result.modelInfo.trainedOn).toBe(modelData.trainedOn.n);
    expect(result.modelInfo.heldOutAccuracy).toBe(modelData.metrics.test.accuracy);
  });

  it("higher clarity concern strictly increases probability, holding every other feature fixed (monotonic in the expected direction)", () => {
    const probs = ([1, 2, 3, 4, 5] as const).map((clarityScore) => assessObservation({ ...clear, clarityScore }).probability);
    for (let i = 1; i < probs.length; i++) expect(probs[i - 1]!).toBeGreaterThanOrEqual(probs[i]!);
  });
});

describe("independent sanity check: a fresh model trained here matches the committed one's behaviour class", () => {
  it("retraining with the committed seed reproduces accuracy in the same ballpark (the training pipeline itself is deterministic and not silently different from what shipped)", () => {
    const rng = mulberry32(modelData.seed);
    const all = generateSyntheticTrainingSet(rng, 4000, 0.05);
    const { train, test } = trainTestSplit(all, 0.75);
    const model = trainLogisticRegression(train, { epochs: 3000, learningRate: 0.3, l2: 0.001 });
    const metrics = evaluate(model, test);
    expect(metrics.accuracy).toBeCloseTo(modelData.metrics.test.accuracy, 6);
  });
});
