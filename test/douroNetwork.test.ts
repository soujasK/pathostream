import { describe, expect, it } from "vitest";
import { DOURO_FLOW_ORDER, DOURO_STATIONS, douroStationById } from "../src/data/douroNetwork.js";

describe("DOURO_STATIONS", () => {
  it("has 4 real, cross-border stations spanning both countries", () => {
    expect(DOURO_STATIONS).toHaveLength(4);
    const countries = new Set(DOURO_STATIONS.map((s) => s.country));
    expect(countries).toEqual(new Set(["ES", "PT"]));
  });

  it("orders stations by strictly decreasing longitude (Spain -> Atlantic, west-flowing)", () => {
    const longitudes = DOURO_STATIONS.map((s) => s.longitude);
    for (let i = 1; i < longitudes.length; i++) {
      expect(longitudes[i]!).toBeLessThan(longitudes[i - 1]!);
    }
  });

  it("puts the Spanish station first and every Portuguese station after it", () => {
    expect(DOURO_STATIONS[0]!.country).toBe("ES");
    expect(DOURO_STATIONS.slice(1).every((s) => s.country === "PT")).toBe(true);
  });

  it("has unique station ids not colliding with the Mondego network's PT-* ids", () => {
    const ids = new Set(DOURO_STATIONS.map((s) => s.id));
    expect(ids.size).toBe(DOURO_STATIONS.length);
    expect(ids.has("PT-SANTA-CLARA")).toBe(false); // a real Mondego id, must not collide
  });

  it("DOURO_FLOW_ORDER matches DOURO_STATIONS' order exactly", () => {
    expect(DOURO_FLOW_ORDER).toEqual(DOURO_STATIONS.map((s) => s.id));
  });

  it("douroStationById finds a known station and returns undefined for an unknown one", () => {
    expect(douroStationById("ES-ZAMORA")?.name).toBe("Zamora");
    expect(douroStationById("NOT-A-REAL-STATION")).toBeUndefined();
  });

  it("every station is marked verified with a non-empty verification note", () => {
    for (const station of DOURO_STATIONS) {
      expect(station.verified).toBe(true);
      expect(station.verificationNote.length).toBeGreaterThan(20);
    }
  });
});
