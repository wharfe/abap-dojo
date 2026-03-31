import { describe, it, expect } from "vitest";
import { Registry, MemoryFile, Config } from "@abaplint/core";
import { config as transpilerConfig } from "@abaplint/transpiler";
import { matchStringCharConfusion } from "./stringCharConfusion";

async function parseSource(source: string): Promise<Registry> {
  const reg = new Registry(new Config(JSON.stringify(transpilerConfig)));
  reg.addFile(new MemoryFile("ztest.prog.abap", source));
  await reg.parseAsync();
  return reg;
}

describe("matchStringCharConfusion", () => {
  it("detects STRING type in DATA declaration", async () => {
    const reg = await parseSource(`REPORT ztest.\nDATA lv_name TYPE string.`);
    const matches = matchStringCharConfusion(reg);
    expect(matches.length).toBe(1);
    expect(matches[0].ruleId).toBe("llm-string-char-confusion");
    expect(matches[0].startLine).toBeGreaterThan(0);
  });

  it("ignores non-STRING types", async () => {
    const reg = await parseSource(`REPORT ztest.\nDATA lv_name TYPE c LENGTH 40.`);
    const matches = matchStringCharConfusion(reg);
    expect(matches.length).toBe(0);
  });

  it("detects multiple STRING declarations", async () => {
    const reg = await parseSource(
      `REPORT ztest.\nDATA lv_first TYPE string.\nDATA lv_last TYPE string.`,
    );
    const matches = matchStringCharConfusion(reg);
    expect(matches.length).toBe(2);
  });

  it("ignores STRING in table types and complex structures", async () => {
    const reg = await parseSource(
      `REPORT ztest.\nDATA lt_lines TYPE STANDARD TABLE OF string WITH DEFAULT KEY.`,
    );
    const matches = matchStringCharConfusion(reg);
    expect(matches.length).toBe(0);
  });
});
