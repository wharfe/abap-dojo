import { describe, it, expect } from "vitest";
import { Buffer } from "buffer";
(globalThis as unknown as { Buffer: typeof Buffer }).Buffer = Buffer;

import { Registry, MemoryFile, Config } from "@abaplint/core";
import { config as transpilerConfig } from "@abaplint/transpiler";
import { classifySyntaxError } from "./syntaxDiagnostics";
import sources from "./fixtures/structureShapes.sources.json";
import expected from "./fixtures/structureShapes.expected.json";

/**
 * What analytics see for a structure error must not move when the explanation
 * does. `expected.json` was recorded on main before the open-block walk
 * existed, from exactly this computation, so a difference here means the raw
 * issues — the thing `classifySyntaxError` reads — changed. The shapes with
 * two errors (J, K, N, Q, Z2) are the ones where ordering could move;
 * the rest are here for the keys. Re-record after an `@abaplint/core` bump
 * that legitimately changes a verdict.
 */
const abaplintConfig = new Config(JSON.stringify(transpilerConfig));

describe("structure shapes: the raw issues analytics read are unchanged", () => {
  for (const [name, source] of Object.entries(sources as Record<string, string>)) {
    it(name, async () => {
      const reg = new Registry(abaplintConfig);
      reg.addFile(new MemoryFile("ztest.prog.abap", source));
      await reg.parseAsync();
      const all = reg.findIssues();
      const errors = all.filter((i) => i.getSeverity().toString() === "Error");
      const actual = {
        keys: all.map((i) => `${i.getKey()}@${i.getStart().getRow()}:${i.getStart().getCol()}`),
        syntaxDiagnostics:
          errors.length === 0
            ? null
            : classifySyntaxError(errors[0].getKey(), errors.length, errors[0].getMessage()),
      };
      expect(actual).toEqual((expected as Record<string, unknown>)[name]);
    });
  }
});
