/**
 * Trains the citizen-report triage classifier and writes its weights to
 * src/citizen/model.json. Deterministic: same seed, same weights, same
 * held-out accuracy -- run this again any time and get the same numbers
 * printed below. `npm run train-citizen-classifier`.
 */
import { writeFileSync } from "node:fs";
import { FEATURE_NAMES } from "../src/citizen/features.js";
import { evaluate, trainLogisticRegression } from "../src/citizen/logisticRegression.js";
import { generateSyntheticTrainingSet, trainTestSplit } from "../src/citizen/trainingData.js";
import { mulberry32 } from "../src/evaluation/prng.js";

const SEED = 20260922;
const rng = mulberry32(SEED);
const all = generateSyntheticTrainingSet(rng, 4000, 0.05);
const { train, test } = trainTestSplit(all, 0.75);

const model = trainLogisticRegression(train, { epochs: 3000, learningRate: 0.3, l2: 0.001 });
const trainMetrics = evaluate(model, train);
const testMetrics = evaluate(model, test);

console.log("weights:", model.weights.map((w, i) => `${FEATURE_NAMES[i]}=${w.toFixed(4)}`).join(", "));
console.log("bias:", model.bias.toFixed(4));
console.log("train:", trainMetrics, "n =", train.length);
console.log("test:", testMetrics, "n =", test.length);

// A trivial baseline: always predict the majority class -- the classifier
// must beat this by a wide margin or it isn't doing anything.
const majority = train.filter((e) => e.label === 1).length / train.length > 0.5 ? 1 : 0;
const baselineAcc = test.filter((e) => e.label === majority).length / test.length;
console.log("majority-class baseline accuracy:", baselineAcc.toFixed(4));

writeFileSync(
  "src/citizen/model.json",
  JSON.stringify(
    {
      seed: SEED,
      featureNames: FEATURE_NAMES,
      weights: model.weights,
      bias: model.bias,
      trainedOn: { n: train.length, heldOutN: test.length },
      metrics: { train: trainMetrics, test: testMetrics, majorityClassBaselineAccuracy: baselineAcc },
    },
    null,
    2,
  ) + "\n",
);
console.log("\nwritten to src/citizen/model.json");
