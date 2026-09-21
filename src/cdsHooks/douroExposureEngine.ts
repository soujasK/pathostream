/**
 * The Douro network's exposure-engine instance, now one entry in the
 * per-river registry (`catchmentEngines.ts`); kept as a named export for
 * the callers/tests that import it directly.
 */

import { engineFor } from "./catchmentEngines.js";

export const douroEngine = engineFor("douro");
