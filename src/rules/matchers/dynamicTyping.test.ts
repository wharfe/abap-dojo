import { describe, it, expect } from "vitest";
import { Registry, MemoryFile, Config } from "@abaplint/core";
import { config as transpilerConfig } from "@abaplint/transpiler";
import { matchDynamicTyping } from "./dynamicTyping";

async function parseSource(source: string): Promise<Registry> {
  const reg = new Registry(new Config(JSON.stringify(transpilerConfig)));
  reg.addFile(new MemoryFile("ztest.prog.abap", source));
  await reg.parseAsync();
  return reg;
}

describe("matchDynamicTyping", () => {
  it("detects DATA without TYPE", async () => {
    const reg = await parseSource(`REPORT ztest.\nDATA lv_value.`);
    const matches = matchDynamicTyping(reg);
    expect(matches.length).toBe(1);
    expect(matches[0].ruleId).toBe("llm-dynamic-typing");
  });

  it("ignores DATA with explicit TYPE", async () => {
    const reg = await parseSource(`REPORT ztest.\nDATA lv_value TYPE i.`);
    const matches = matchDynamicTyping(reg);
    expect(matches.length).toBe(0);
  });

  it("ignores DATA with LIKE", async () => {
    const reg = await parseSource(
      `REPORT ztest.\nDATA lv_a TYPE i.\nDATA lv_b LIKE lv_a.`,
    );
    const matches = matchDynamicTyping(reg);
    expect(matches.length).toBe(0);
  });

  it("ignores DATA: BEGIN OF structure declarations", async () => {
    const reg = await parseSource(
      `REPORT ztest.\nDATA: BEGIN OF ls_struct,\n        value TYPE i,\n      END OF ls_struct.`,
    );
    const matches = matchDynamicTyping(reg);
    expect(matches.length).toBe(0);
  });
});
