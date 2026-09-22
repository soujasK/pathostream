/**
 * `npm run evaluate` -- regenerates evaluation/results.json (the numbers)
 * and prints a plain table summary. EVALUATION.md is rendered from the same
 * results by scripts/renderEvaluation.ts. Seeded: same seed, same numbers.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { FULL_CONFIG, runEvaluation } from "../src/evaluation/experiments.js";

const started = Date.now();
const results = runEvaluation(FULL_CONFIG);
mkdirSync("evaluation", { recursive: true });
writeFileSync(
  "evaluation/results.json",
  JSON.stringify({ generatedWith: { node: process.version, seed: FULL_CONFIG.seed }, ...results }, null, 2) + "\n",
);
console.log(`evaluation finished in ${((Date.now() - started) / 1000).toFixed(1)} s -> evaluation/results.json`);
