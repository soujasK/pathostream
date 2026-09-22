/** Renders EVALUATION.md and MODEL_CARD.md from evaluation/results.json (see `npm run evaluate`)
 * and from the committed citizen-classifier weights (see `npm run train-citizen-classifier`). */
import { readFileSync, writeFileSync } from "node:fs";
import type { EvaluationResults } from "../src/evaluation/experiments.js";
import { renderModelCard, renderCitizenModelCardSection, type CitizenModelData } from "../src/evaluation/modelCard.js";
import { renderEvaluationMarkdown } from "../src/evaluation/render.js";

const results = JSON.parse(readFileSync("evaluation/results.json", "utf8")) as EvaluationResults & {
  generatedWith?: { node: string; seed: number };
};
const citizenModel = JSON.parse(readFileSync("src/citizen/model.json", "utf8")) as CitizenModelData;

writeFileSync("EVALUATION.md", renderEvaluationMarkdown(results));
writeFileSync("MODEL_CARD.md", renderModelCard(results) + renderCitizenModelCardSection(citizenModel));
console.log("EVALUATION.md and MODEL_CARD.md written");
