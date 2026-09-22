/** Renders SAFETY_CASE.md from src/safety/hazardLog.ts. */
import { writeFileSync } from "node:fs";
import { HAZARDS } from "../src/safety/hazardLog.js";
import { renderSafetyCase } from "../src/safety/render.js";

writeFileSync("SAFETY_CASE.md", renderSafetyCase(HAZARDS));
console.log(`SAFETY_CASE.md written (${HAZARDS.length} hazards)`);
