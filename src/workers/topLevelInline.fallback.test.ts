import { describe, it, expect, vi } from "vitest";
import { Buffer } from "buffer";
(globalThis as unknown as { Buffer: typeof Buffer }).Buffer = Buffer;

import { Registry, MemoryFile, Config } from "@abaplint/core";
import { Transpiler, config as transpilerConfig } from "@abaplint/transpiler";
import { buildRunnableJs } from "./topLevelInline";

// The transpiler's internals throwing at us (a changed contract that still
// typechecks) must leave the program exactly as the transpiler emitted it.
// Only `declare` is replaced: mocking the whole module would fail the import
// and test a crash instead of the fallback.
vi.mock(
  "@abaplint/transpiler/build/src/transpile_types",
  async (importOriginal) => {
    const original =
      await importOriginal<
        typeof import("@abaplint/transpiler/build/src/transpile_types")
      >();
    class TranspileTypes extends original.TranspileTypes {
      static declare(): string {
        throw new Error("internal API changed");
      }
    }
    return { ...original, TranspileTypes };
  },
);

describe("buildRunnableJs when the transpiler's internals throw", () => {
  it("returns the plain transpiler output", async () => {
    const reg = new Registry(new Config(JSON.stringify(transpilerConfig)));
    reg.addFile(
      new MemoryFile("ztest.prog.abap", "REPORT ztest.\nDATA(lv_x) = 1.\nWRITE / lv_x."),
    );
    await reg.parseAsync();
    const output = await new Transpiler({ ignoreSourceMap: true }).run(reg);
    const plain = [
      ...output.objects.map((o) => o.chunk.getCode()),
      output.initializationScript,
      output.initializationScript2,
    ].join("\n");

    const r = buildRunnableJs(reg, output);
    expect(r.fellBack).toBe(true);
    expect(r.js).toBe(plain);
  });
});
