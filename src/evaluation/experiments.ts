/**
 * The evaluation experiments behind EVALUATION.md. Pure computation over
 * the shipped detector design (analytics/detectorConfig.ts); the seed and
 * sizes live in an EvalConfig so a test can run a small version and the
 * `npm run evaluate` script the full one.
 */

import { assessBaseline } from "../analytics/baseline.js";
import { ESCALATION_THRESHOLD_TICKS, EWMA_L, EWMA_LAMBDA } from "../analytics/detectorConfig.js";
import { ewmaArlMarkov } from "./markov.js";
import { normalCdf, normalQuantile } from "./normal.js";
import {
  ar1Noise,
  gaussianNoise,
  lognormalNoise,
  makeNormal,
  mulberry32,
  scaledNoise,
  type NoiseSource,
} from "./prng.js";
import {
  calibrateParameter,
  cusumDetector,
  ewmaDetector,
  falseEscalationCycles,
  persistenceRule,
  runLength,
  simulateArl,
  summarize,
  type EwmaDesign,
  type RunLengthSummary,
} from "./runLength.js";

export interface EvalConfig {
  seed: number;
  /** Runs for the ARL0 theory-vs-simulation check. */
  arl0Runs: number;
  /** Runs per cell of the detection-delay table. */
  delayRuns: number;
  /** Runs per bisection step when calibrating the CUSUM to a target ARL0. */
  calibrationRuns: number;
  /** Stream length (ticks) per persistence value k in the false-escalation study. */
  escalationTicks: number;
  /** Stream length (ticks) per robustness scenario. */
  robustnessTicks: number;
  /** Runs per robustness scenario (ARL0). */
  robustnessRuns: number;
  /** Cap on a single run. */
  maxTicks: number;
}

export const FULL_CONFIG: EvalConfig = {
  seed: 20260921,
  arl0Runs: 40_000,
  delayRuns: 20_000,
  calibrationRuns: 8_000,
  escalationTicks: 20_000_000,
  robustnessTicks: 5_000_000,
  robustnessRuns: 10_000,
  maxTicks: 1_000_000,
};

/** Small enough for a unit test (~seconds). */
export const QUICK_CONFIG: EvalConfig = {
  seed: 7,
  arl0Runs: 6_000,
  delayRuns: 2_000,
  calibrationRuns: 1_500,
  escalationTicks: 400_000,
  robustnessTicks: 200_000,
  robustnessRuns: 1_500,
  maxTicks: 200_000,
};

export const DESIGN: EwmaDesign = { lambda: EWMA_LAMBDA, L: EWMA_L };
export const SHIFTS_SIGMA = [0.5, 1, 1.5, 2, 3, 5, 15];
export const PERSISTENCE_VALUES = [1, 2, 3, 4, 5, 6, 7, 8, 10];
export const ESCALATION_DELAY_SHIFTS = [1, 2, 3, 15];
/** Stations in the shipped network (data/catchments.ts) -- asserted equal by a test. */
export const NETWORK_STATIONS = 33;

// ---- Experiment 1: theory vs simulation --------------------------------

export interface TheoryCheck {
  shewhartArl0Exact: number;
  markovArl0: { cells: number; arl0: number }[];
  markovArl1: { shift: number; arl1: number }[];
  mcAsymptotic: RunLengthSummary;
  /** The production class, exact time-varying limits. */
  mcProduction: RunLengthSummary;
}

export function theoryCheck(config: EvalConfig): TheoryCheck {
  return {
    shewhartArl0Exact: 1 / (2 * normalCdf(-3)),
    markovArl0: [101, 201, 401].map((cells) => ({ cells, arl0: ewmaArlMarkov({ ...DESIGN, shift: 0, cells }) })),
    markovArl1: SHIFTS_SIGMA.map((shift) => ({ shift, arl1: ewmaArlMarkov({ ...DESIGN, shift }) })),
    mcAsymptotic: simulateArl(
      () => ewmaDetector(DESIGN, { limits: "asymptotic" }),
      gaussianNoise(mulberry32(config.seed + 1)),
      0,
      config.arl0Runs,
      config.maxTicks,
    ),
    mcProduction: simulateArl(
      () => ewmaDetector(DESIGN),
      gaussianNoise(mulberry32(config.seed + 2)),
      0,
      config.arl0Runs,
      config.maxTicks,
    ),
  };
}

// ---- Experiment 2: detection delay vs baselines at matched ARL0 ---------

export interface DelayRow {
  shift: number;
  ewma: RunLengthSummary;
  cusum: RunLengthSummary;
  shewhartMean: number;
  shewhartMedian: number;
}

export interface DelayTable {
  targetArl0: number;
  cusum: { k: number; h: number };
  shewhartK: number;
  rows: DelayRow[];
}

export function delayTable(config: EvalConfig, targetArl0: number): DelayTable {
  const cusumK = 0.5;
  const cusumH = calibrateParameter(
    (h) => cusumDetector(cusumK, h),
    () => gaussianNoise(mulberry32(config.seed + 3)),
    targetArl0,
    1,
    12,
    config.calibrationRuns,
    config.maxTicks,
  );
  const shewhartK = normalQuantile(1 - 1 / (2 * targetArl0));

  const rows = SHIFTS_SIGMA.map((shift, index): DelayRow => {
    const noiseSeed = config.seed + 10 + index;
    const p = normalCdf(-shewhartK - shift) + normalCdf(-shewhartK + shift);
    return {
      shift,
      ewma: simulateArl(() => ewmaDetector(DESIGN), gaussianNoise(mulberry32(noiseSeed)), shift, config.delayRuns, config.maxTicks),
      cusum: simulateArl(
        () => cusumDetector(cusumK, cusumH),
        gaussianNoise(mulberry32(noiseSeed + 100)),
        shift,
        config.delayRuns,
        config.maxTicks,
      ),
      shewhartMean: 1 / p,
      shewhartMedian: Math.ceil(Math.log(0.5) / Math.log(1 - p)),
    };
  });
  return { targetArl0, cusum: { k: cusumK, h: cusumH }, shewhartK, rows };
}

// ---- Experiment 3: the k-consecutive escalation rule --------------------

export interface PersistenceRow {
  k: number;
  falseEscalation: RunLengthSummary & { totalTicks: number };
  delays: { shift: number; summary: RunLengthSummary }[];
}

export function persistenceTable(config: EvalConfig): PersistenceRow[] {
  return PERSISTENCE_VALUES.map((k, index): PersistenceRow => {
    const falseEscalation = falseEscalationCycles(
      () => ewmaDetector(DESIGN),
      k,
      gaussianNoise(mulberry32(config.seed + 200 + index)),
      config.escalationTicks,
    );
    const delays = ESCALATION_DELAY_SHIFTS.map((shift, j) => ({
      shift,
      summary: simulateArl(
        () => persistenceRule(ewmaDetector(DESIGN), k),
        gaussianNoise(mulberry32(config.seed + 300 + index * 10 + j)),
        shift,
        config.delayRuns,
        config.maxTicks,
      ),
    }));
    return { k, falseEscalation, delays };
  });
}

// ---- Experiment 4: robustness to the chart's own assumptions ------------

export interface RobustnessRow {
  scenario: string;
  detail: string;
  /** ARL0 of the bare EWMA chart. */
  arl0: RunLengthSummary;
  /** Mean ticks between false escalations under the shipped k-rule (regenerative). */
  escalationArl: (RunLengthSummary & { totalTicks: number }) | null;
}

function robustnessRow(
  config: EvalConfig,
  index: number,
  scenario: string,
  detail: string,
  makeNoise: (rng: () => number) => NoiseSource,
): RobustnessRow {
  const seed = config.seed + 400 + index * 10;
  return {
    scenario,
    detail,
    arl0: simulateArl(() => ewmaDetector(DESIGN), makeNoise(mulberry32(seed)), 0, config.robustnessRuns, config.maxTicks),
    escalationArl: falseEscalationCycles(
      () => ewmaDetector(DESIGN),
      ESCALATION_THRESHOLD_TICKS,
      makeNoise(mulberry32(seed + 1)),
      config.robustnessTicks,
    ),
  };
}

/** Chart built from n Phase-I readings (sample mean and sd), then run on
 * fresh in-control data: what happens when the baseline is ESTIMATED, as it
 * must be in any real deployment, instead of known exactly. */
export interface PhaseOneRow {
  n: number;
  arl0: RunLengthSummary;
  /** Share of charts that signal within their first 50 readings. */
  earlyFalseAlarmShare: number;
}

export function phaseOneTable(config: EvalConfig): PhaseOneRow[] {
  return [20, 50, 200, 1000].map((n, index): PhaseOneRow => {
    const rng = mulberry32(config.seed + 600 + index);
    const normal = makeNormal(rng);
    const lengths: number[] = [];
    let censored = 0;
    for (let run = 0; run < config.robustnessRuns; run++) {
      let sum = 0;
      let sumSq = 0;
      for (let i = 0; i < n; i++) {
        const v = normal();
        sum += v;
        sumSq += v * v;
      }
      const mean = sum / n;
      const sd = Math.sqrt(Math.max(1e-12, (sumSq - n * mean * mean) / (n - 1)));
      const detector = ewmaDetector(DESIGN, { mean, sd });
      const stream: NoiseSource = { next: normal, restart: () => undefined };
      const length = runLength(detector, stream, 0, config.maxTicks);
      if (length >= config.maxTicks) censored += 1;
      lengths.push(length);
    }
    return {
      n,
      arl0: summarize(lengths, censored),
      earlyFalseAlarmShare: lengths.filter((l) => l <= 50).length / lengths.length,
    };
  });
}

/** How often the autocorrelation half of the baseline gate
 * (analytics/baseline.ts) rejects a baseline, by true phi and window size --
 * i.e. the gate's false-reject rate (phi = 0) and power (phi > 0). */
export interface GateRow {
  n: number;
  phi: number;
  rejectShare: number;
}

export function gateTable(config: EvalConfig): GateRow[] {
  const rows: GateRow[] = [];
  const trials = Math.max(500, Math.floor(config.robustnessRuns / 2));
  let index = 0;
  for (const n of [200, 1000]) {
    for (const phi of [0, 0.1, 0.3, 0.6]) {
      const noise = phi === 0 ? gaussianNoise(mulberry32(config.seed + 700 + index)) : ar1Noise(mulberry32(config.seed + 700 + index), phi);
      let rejected = 0;
      for (let t = 0; t < trials; t++) {
        noise.restart();
        const readings = Array.from({ length: n }, () => noise.next());
        const assessment = assessBaseline(readings);
        if (assessment.problems.some((p) => p.includes("autocorrelation"))) rejected += 1;
      }
      rows.push({ n, phi, rejectShare: rejected / trials });
      index += 1;
    }
  }
  return rows;
}

export function robustnessTable(config: EvalConfig): RobustnessRow[] {
  const scenarios: { scenario: string; detail: string; make: (rng: () => number) => NoiseSource }[] = [
    { scenario: "Design assumptions hold", detail: "independent Gaussian, sd as assumed", make: gaussianNoise },
    { scenario: "True sd 1.25x assumed", detail: "baseline noise underestimated by 20%", make: (r) => scaledNoise(gaussianNoise(r), 1.25) },
    { scenario: "True sd 1.5x assumed", detail: "baseline noise underestimated by a third", make: (r) => scaledNoise(gaussianNoise(r), 1.5) },
    { scenario: "True sd 2x assumed", detail: "baseline noise underestimated by half", make: (r) => scaledNoise(gaussianNoise(r), 2) },
    { scenario: "Autocorrelated, phi = 0.1", detail: "AR(1), unit marginal variance", make: (r) => ar1Noise(r, 0.1) },
    { scenario: "Autocorrelated, phi = 0.2", detail: "AR(1), unit marginal variance", make: (r) => ar1Noise(r, 0.2) },
    { scenario: "Autocorrelated, phi = 0.3", detail: "AR(1), unit marginal variance", make: (r) => ar1Noise(r, 0.3) },
    { scenario: "Autocorrelated, phi = 0.6", detail: "AR(1), unit marginal variance", make: (r) => ar1Noise(r, 0.6) },
    { scenario: "Autocorrelated, phi = 0.9", detail: "AR(1), unit marginal variance", make: (r) => ar1Noise(r, 0.9) },
    { scenario: "Right-skewed (lognormal, CV 0.2)", detail: "skewness ~0.6, same mean and sd", make: (r) => lognormalNoise(r, 0.2) },
  ];
  return scenarios.map((s, index) => robustnessRow(config, index, s.scenario, s.detail, s.make));
}

// ---- Everything ---------------------------------------------------------

export interface EvaluationResults {
  config: EvalConfig;
  design: EwmaDesign & { escalationThresholdTicks: number };
  networkStations: number;
  theory: TheoryCheck;
  delay: DelayTable;
  persistence: PersistenceRow[];
  robustness: RobustnessRow[];
  phaseOne: PhaseOneRow[];
  gate: GateRow[];
}

export function runEvaluation(config: EvalConfig): EvaluationResults {
  const theory = theoryCheck(config);
  return {
    config,
    design: { ...DESIGN, escalationThresholdTicks: ESCALATION_THRESHOLD_TICKS },
    networkStations: NETWORK_STATIONS,
    theory,
    delay: delayTable(config, theory.mcProduction.mean),
    persistence: persistenceTable(config),
    robustness: robustnessTable(config),
    phaseOne: phaseOneTable(config),
    gate: gateTable(config),
  };
}

// ---- The design target the escalation rule is justified against ---------

/** OUR design target -- not a standard, not clinical guidance: the network
 * should raise at most this many FALSE auto-escalations per 30 days,
 * across all stations, at the assumed sampling interval. Whether that is
 * acceptable is an operator's policy call; the number exists so the rule's
 * threshold is derived from something explicit rather than asserted. */
export const TARGET_FALSE_ESCALATIONS_PER_30_DAYS = 1;
/** Assumed telemetry interval for the target above (real turbidity
 * sondes are commonly logged every few to 15 minutes; this is an
 * assumption, flagged as one in EVALUATION.md). */
export const ASSUMED_SAMPLING_MINUTES = 15;
/** Fewer completed cycles than this and a false-escalation ARL is not
 * reported as a measurement (the estimator is right-truncated). */
export const MIN_RELIABLE_CYCLES = 30;

/** Per-station mean ticks between false escalations needed to meet the target. */
export function requiredPerStationArl(stations: number): number {
  const ticksPer30Days = (30 * 24 * 60) / ASSUMED_SAMPLING_MINUTES;
  return (stations * ticksPer30Days) / TARGET_FALSE_ESCALATIONS_PER_30_DAYS;
}

/** The smallest persistence k whose false-escalation ARL meets the target
 * even at the LOWER end of its 95% interval, counting only estimates from
 * enough completed cycles to be trusted. */
export function smallestPersistenceMeetingTarget(rows: PersistenceRow[], stations: number): number | null {
  const required = requiredPerStationArl(stations);
  for (const row of rows) {
    const e = row.falseEscalation;
    if (e.n >= MIN_RELIABLE_CYCLES && e.mean - 1.96 * e.se >= required) return row.k;
  }
  return null;
}
