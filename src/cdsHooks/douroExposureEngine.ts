/**
 * The Douro network's own, independent exposure-engine instance -- see
 * `exposureEngine.ts`'s docstring for what this factory does and why
 * Mondego and Douro each get a private station-state map rather than
 * sharing one.
 */

import { DOURO_CATCHMENT_ID, DOURO_FLOW_ORDER, DOURO_MEAN_VELOCITY_MS, DOURO_STATIONS } from "../data/douroNetwork.js";
import { createExposureEngine } from "./exposureEngine.js";

export const douroEngine = createExposureEngine({
  catchmentId: DOURO_CATCHMENT_ID,
  stations: DOURO_STATIONS,
  flowOrder: DOURO_FLOW_ORDER,
  meanVelocityMs: DOURO_MEAN_VELOCITY_MS,
});
