/**
 * A small, from-scratch, from-first-principles logistic regression:
 * sigmoid(w.x + b), fit by gradient descent with L2 regularization on
 * binary cross-entropy loss -- textbook supervised machine learning, the
 * same technique named in scikit-learn's own LogisticRegression docs and
 * any standard ML reference (e.g. Hastie, Tibshirani & Friedman, *The
 * Elements of Statistical Learning*, ch. 4). No dependency pulled in for
 * this deliberately -- the whole point of citizen/classifier.ts is that
 * its weights are inspectable, not a black box, and training it here in
 * ~60 lines makes that literal.
 *
 * This is genuinely a different category of technique from
 * analytics/ewma.ts: EWMA is a fixed-form statistical control chart with
 * hand-chosen constants (lambda, L) applied unchanged to every station; a
 * logistic regression's weights are LEARNED from labelled training
 * examples via an optimization loop. That distinction matters for the EU
 * AI Act discussion in SAFETY_CASE.md section 2.2: the EWMA detector was
 * assessed as outside the AI Act's "AI system" definition; this model,
 * being a trained ML model, is assessed differently there.
 */

export interface LabelledExample {
  features: number[];
  label: 0 | 1;
}

export interface LogisticModel {
  weights: number[];
  bias: number;
}

export interface TrainOptions {
  epochs: number;
  learningRate: number;
  /** L2 penalty strength (0 disables it). Keeps weights from blowing up
   * when a feature is a near-perfect predictor in the training set. */
  l2: number;
}

function sigmoid(z: number): number {
  // Numerically stable form (avoids overflow in exp() for very negative z).
  if (z >= 0) {
    const e = Math.exp(-z);
    return 1 / (1 + e);
  }
  const e = Math.exp(z);
  return e / (1 + e);
}

export function predictProbability(model: LogisticModel, features: number[]): number {
  if (features.length !== model.weights.length) {
    throw new Error(`expected ${model.weights.length} features, got ${features.length}`);
  }
  let z = model.bias;
  for (let i = 0; i < features.length; i++) z += model.weights[i]! * features[i]!;
  return sigmoid(z);
}

/** Per-feature contribution to the logit (weight * feature value), plus
 * the bias -- these sum exactly to the pre-sigmoid logit, so "why did the
 * model say this" is a literal, checkable arithmetic breakdown, not a
 * post-hoc approximation (unlike e.g. SHAP on a nonlinear model). */
export function explainLogit(model: LogisticModel, features: number[]): { bias: number; contributions: number[]; logit: number } {
  const contributions = features.map((f, i) => model.weights[i]! * f);
  const logit = model.bias + contributions.reduce((a, b) => a + b, 0);
  return { bias: model.bias, contributions, logit };
}

/** Batch gradient descent on the average L2-regularized binary
 * cross-entropy loss. Deterministic given the same data and options (no
 * randomness in the optimizer itself -- only the training DATA, generated
 * elsewhere, is seeded). */
export function trainLogisticRegression(data: LabelledExample[], options: TrainOptions): LogisticModel {
  if (data.length === 0) throw new Error("cannot train on an empty dataset");
  const featureCount = data[0]!.features.length;
  for (const example of data) {
    if (example.features.length !== featureCount) throw new Error("all examples must have the same feature count");
  }

  const weights = new Array<number>(featureCount).fill(0);
  let bias = 0;
  const n = data.length;

  for (let epoch = 0; epoch < options.epochs; epoch++) {
    const gradW = new Array<number>(featureCount).fill(0);
    let gradB = 0;
    for (const { features, label } of data) {
      const p = predictProbability({ weights, bias }, features);
      const error = p - label; // d(loss)/d(logit) for cross-entropy + sigmoid
      for (let i = 0; i < featureCount; i++) gradW[i]! += error * features[i]!;
      gradB += error;
    }
    for (let i = 0; i < featureCount; i++) {
      const l2Term = options.l2 * weights[i]!;
      weights[i]! -= options.learningRate * (gradW[i]! / n + l2Term);
    }
    bias -= options.learningRate * (gradB / n);
  }

  return { weights, bias };
}

/** Binary cross-entropy loss and accuracy on a held-out set, for
 * evaluating the trained model honestly rather than just trusting it
 * converged. */
export function evaluate(model: LogisticModel, data: LabelledExample[]): { loss: number; accuracy: number } {
  let loss = 0;
  let correct = 0;
  const eps = 1e-12;
  for (const { features, label } of data) {
    const p = predictProbability(model, features);
    loss += -(label * Math.log(p + eps) + (1 - label) * Math.log(1 - p + eps));
    if ((p >= 0.5 ? 1 : 0) === label) correct += 1;
  }
  return { loss: loss / data.length, accuracy: correct / data.length };
}
