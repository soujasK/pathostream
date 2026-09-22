import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { HAZARDS } from "../src/safety/hazardLog.js";
import { renderSafetyCase } from "../src/safety/render.js";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8").replace(/\r\n/g, "\n");

/** Cache file contents so a hundred controls don't re-read the same test
 * file a hundred times. */
const fileCache = new Map<string, string | null>();
function fileContents(relativeToRepoRoot: string): string | null {
  if (!fileCache.has(relativeToRepoRoot)) {
    try {
      fileCache.set(relativeToRepoRoot, read(`../${relativeToRepoRoot}`));
    } catch {
      fileCache.set(relativeToRepoRoot, null);
    }
  }
  return fileCache.get(relativeToRepoRoot) ?? null;
}

describe("hazard log structure", () => {
  it("every hazard and control id is unique", () => {
    const hazardIds = HAZARDS.map((h) => h.id);
    expect(new Set(hazardIds).size).toBe(hazardIds.length);
    const controlIds = HAZARDS.flatMap((h) => h.controls.map((c) => c.id));
    expect(new Set(controlIds).size).toBe(controlIds.length);
  });

  it("every control id is namespaced under its own hazard id", () => {
    for (const hazard of HAZARDS) {
      for (const control of hazard.controls) {
        expect(control.id.startsWith(`${hazard.id}.`), `${control.id} should start with '${hazard.id}.'`).toBe(true);
      }
    }
  });

  it("every hazard has at least one cause and at least one control", () => {
    for (const hazard of HAZARDS) {
      expect(hazard.causes.length, hazard.id).toBeGreaterThan(0);
      expect(hazard.controls.length, hazard.id).toBeGreaterThan(0);
    }
  });

  it("a partial or open control states what is missing (`gap`)", () => {
    for (const hazard of HAZARDS) {
      for (const control of hazard.controls) {
        if (control.status !== "implemented") {
          expect(control.gap, `${control.id} is ${control.status} but has no gap statement`).toBeTruthy();
        }
      }
    }
  });
});

describe("traceability: every 'implemented' claim points at real, matching evidence", () => {
  for (const hazard of HAZARDS) {
    for (const control of hazard.controls) {
      it(`${control.id}: evidence is consistent with its status`, () => {
        if (control.status === "open") {
          // An open control claims nothing.
          expect(control.evidence).toHaveLength(0);
          expect(control.manual).toBeUndefined();
          return;
        }

        if (control.status === "implemented" && control.kind === "code" && !control.manual) {
          expect(control.evidence.length, `${control.id} is implemented code with no automated evidence and no manual note`).toBeGreaterThan(0);
        }

        // Every listed test-file reference must exist AND contain that exact title text --
        // catches a renamed test, a deleted test, or a copy-pasted reference to the wrong file.
        for (const e of control.evidence) {
          const contents = fileContents(e.file);
          expect(contents, `${control.id}: evidence file '${e.file}' does not exist`).not.toBeNull();
          expect(
            contents!.includes(e.test),
            `${control.id}: '${e.test}' not found verbatim in ${e.file} (it may have been renamed or removed)`,
          ).toBe(true);
        }
      });
    }
  }

  it("no two controls in the whole log cite an identical (file, test) pair by accident", () => {
    // Not an error in itself (shared coverage happens), but a suspicious
    // concentration is worth a human glance; assert it stays bounded.
    const seen = new Map<string, number>();
    for (const hazard of HAZARDS) {
      for (const control of hazard.controls) {
        for (const e of control.evidence) {
          const key = `${e.file}::${e.test}`;
          seen.set(key, (seen.get(key) ?? 0) + 1);
        }
      }
    }
    const maxReuse = Math.max(0, ...seen.values());
    expect(maxReuse).toBeLessThanOrEqual(3);
  });
});

describe("committed SAFETY_CASE.md is exactly what the renderer produces", () => {
  it("matches byte-for-byte", () => {
    expect(read("../SAFETY_CASE.md")).toBe(renderSafetyCase(HAZARDS));
  });

  it("mentions every hazard id and every control id at least once", () => {
    const doc = read("../SAFETY_CASE.md");
    for (const hazard of HAZARDS) {
      expect(doc.includes(hazard.id), `${hazard.id} missing from SAFETY_CASE.md`).toBe(true);
      for (const control of hazard.controls) {
        expect(doc.includes(control.id), `${control.id} missing from SAFETY_CASE.md`).toBe(true);
      }
    }
  });
});
