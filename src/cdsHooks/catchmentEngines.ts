/**
 * One independent exposure engine per registered river. Mondego reuses
 * the engine instance `exposureEngine.ts` exports at module level, so the
 * long-standing module-level functions (`setStationState`, ...) and the
 * HTTP routes act on the SAME state; every other river gets its own
 * private instance from the same factory.
 */

import { CATCHMENTS, catchmentOfStation } from "../data/catchments.js";
import { createExposureEngine, type ExposureEngine, mondegoEngine } from "./exposureEngine.js";

const engines = new Map<string, ExposureEngine>(
  CATCHMENTS.map((c): [string, ExposureEngine] => [
    c.id,
    c.id === "mondego"
      ? mondegoEngine
      : createExposureEngine({
          catchmentId: c.catchmentId,
          stations: c.stations,
          flowOrder: c.flowOrder,
          meanVelocityMs: c.meanVelocityMs,
        }),
  ]),
);

export function engineFor(catchmentId: string): ExposureEngine {
  const engine = engines.get(catchmentId);
  if (!engine) throw new Error(`Unknown catchment '${catchmentId}'`);
  return engine;
}

export function engineForStation(stationId: string): ExposureEngine | undefined {
  const catchment = catchmentOfStation(stationId);
  return catchment ? engines.get(catchment.id) : undefined;
}
