/** Renders EVALUATION.md and MODEL_CARD.md from evaluation/results.json (see `npm run evaluate`). */
import { readFileSync, writeFileSync } from "node:fs";
import type { EvaluationResults } from "../src/evaluation/experiments.js";
import { renderModelCard } from "../src/evaluation/modelCard.js";
import { renderEvaluationMarkdown } from "../src/evaluation/render.js";

const results = JSON.parse(readFileSync("evaluation/results.json", "utf8")) as EvaluationResults & {
  generatedWith?: { node: string; seed: number };
};
writeFileSync("EVALUATION.md", renderEvaluationMarkdown(results));
writeFileSync("MODEL_CARD.md", renderModelCard(results));
console.log("EVALUATION.md and MODEL_CARD.md written");
