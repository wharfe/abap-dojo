import { describe, it, expect } from "vitest";
import { Registry, MemoryFile, Config } from "@abaplint/core";
import { config as transpilerConfig } from "@abaplint/transpiler";
import { matchPythonLoopPattern } from "./pythonLoopPattern";

async function parseSource(source: string): Promise<Registry> {
  const reg = new Registry(new Config(JSON.stringify(transpilerConfig)));
  reg.addFile(new MemoryFile("ztest.prog.abap", source));
  await reg.parseAsync();
  return reg;
}

describe("matchPythonLoopPattern", () => {
  it("detects SY-TABIX usage inside LOOP with INTO", async () => {
    const source = `REPORT ztest.
TYPES: BEGIN OF ty_item,
         name TYPE string,
       END OF ty_item.
DATA lt_items TYPE STANDARD TABLE OF ty_item WITH DEFAULT KEY.
DATA ls_item TYPE ty_item.
DATA lv_idx TYPE i.
LOOP AT lt_items INTO ls_item.
  lv_idx = sy-tabix.
  WRITE lv_idx.
ENDLOOP.`;
    const reg = await parseSource(source);
    const matches = matchPythonLoopPattern(reg);
    expect(matches.length).toBe(1);
    expect(matches[0].ruleId).toBe("llm-python-loop-pattern");
  });

  it("ignores LOOP without SY-TABIX usage", async () => {
    const source = `REPORT ztest.
TYPES: BEGIN OF ty_item,
         name TYPE string,
       END OF ty_item.
DATA lt_items TYPE STANDARD TABLE OF ty_item WITH DEFAULT KEY.
DATA ls_item TYPE ty_item.
LOOP AT lt_items INTO ls_item.
  WRITE ls_item-name.
ENDLOOP.`;
    const reg = await parseSource(source);
    const matches = matchPythonLoopPattern(reg);
    expect(matches.length).toBe(0);
  });

  it("ignores SY-TABIX outside of LOOP", async () => {
    const source = `REPORT ztest.
DATA lv_idx TYPE i.
lv_idx = sy-tabix.`;
    const reg = await parseSource(source);
    const matches = matchPythonLoopPattern(reg);
    expect(matches.length).toBe(0);
  });
});
