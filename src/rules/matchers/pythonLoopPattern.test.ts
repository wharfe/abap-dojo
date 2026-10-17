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
  // The shape the pitfall page shows, and the one LLMs actually produce:
  // for i in range(len(xs)) as DO ... TIMES with READ TABLE ... INDEX (#95).
  describe("DO / WHILE with READ TABLE ... INDEX", () => {
    const header = `REPORT ztest.
TYPES: BEGIN OF ty_item,
         name TYPE string,
       END OF ty_item.
DATA lt_items TYPE STANDARD TABLE OF ty_item WITH DEFAULT KEY.
DATA ls_item TYPE ty_item.
DATA lv_index TYPE i.
`;

    it("detects a counter-driven READ TABLE inside DO", async () => {
      const reg = await parseSource(`${header}lv_index = 1.
DO lines( lt_items ) TIMES.
  READ TABLE lt_items INTO ls_item INDEX lv_index.
  WRITE / ls_item-name.
  lv_index = lv_index + 1.
ENDDO.`);
      const matches = matchPythonLoopPattern(reg);
      expect(matches.map((m) => [m.startLine, m.endLine])).toEqual([[9, 13]]);
    });

    it("detects READ TABLE ... INDEX sy-index inside DO", async () => {
      const reg = await parseSource(`${header}DO lines( lt_items ) TIMES.
  READ TABLE lt_items INTO ls_item INDEX sy-index.
ENDDO.`);
      expect(matchPythonLoopPattern(reg).length).toBe(1);
    });

    it("detects the same shape inside WHILE", async () => {
      const reg = await parseSource(`${header}lv_index = 1.
WHILE lv_index <= lines( lt_items ).
  READ TABLE lt_items INTO ls_item INDEX lv_index.
  lv_index = lv_index + 1.
ENDWHILE.`);
      expect(matchPythonLoopPattern(reg).length).toBe(1);
    });

    it("reports a nested block once, at the outermost DO", async () => {
      const reg = await parseSource(`${header}DO 2 TIMES.
  DO lines( lt_items ) TIMES.
    READ TABLE lt_items INTO ls_item INDEX sy-index.
  ENDDO.
ENDDO.`);
      const matches = matchPythonLoopPattern(reg);
      expect(matches.map((m) => m.startLine)).toEqual([8]);
    });

    it("ignores a constant INDEX inside DO", async () => {
      const reg = await parseSource(`${header}DO 3 TIMES.
  READ TABLE lt_items INTO ls_item INDEX 1.
ENDDO.`);
      expect(matchPythonLoopPattern(reg).length).toBe(0);
    });

    it("ignores READ TABLE ... WITH KEY inside DO", async () => {
      const reg = await parseSource(`${header}DO 3 TIMES.
  READ TABLE lt_items INTO ls_item WITH KEY name = 'a'.
ENDDO.`);
      expect(matchPythonLoopPattern(reg).length).toBe(0);
    });

    // From review: INDEX must be found as the statement's keyword, and its
    // whole operand judged, not the first token after any "INDEX" string.
    it("ignores a key field named index: WITH KEY index = 1", async () => {
      const reg = await parseSource(`${header}DO 3 TIMES.
READ TABLE lt_items INTO ls_item WITH KEY index = 1.
ENDDO.`);
      expect(matchPythonLoopPattern(reg).length).toBe(0);
    });

    it("ignores a table named index read at a constant INDEX", async () => {
      const reg = await parseSource(`REPORT ztest.
TYPES: BEGIN OF ty_item,
         name TYPE string,
       END OF ty_item.
DATA index TYPE STANDARD TABLE OF ty_item WITH DEFAULT KEY.
DATA ls_item TYPE ty_item.
DO 3 TIMES.
READ TABLE index INTO ls_item INDEX 1.
ENDDO.`);
      expect(matchPythonLoopPattern(reg).length).toBe(0);
    });

    it("detects INDEX 1 + lv_index the same as INDEX lv_index + 1", async () => {
      for (const operand of ["1 + lv_index", "lv_index + 1"]) {
        const reg = await parseSource(`${header}DO 3 TIMES.
READ TABLE lt_items INTO ls_item INDEX ${operand}.
ENDDO.`);
        expect(matchPythonLoopPattern(reg).length, operand).toBe(1);
      }
    });

    it("ignores READ TABLE ... INDEX outside any loop", async () => {
      const reg = await parseSource(`${header}READ TABLE lt_items INTO ls_item INDEX lv_index.`);
      expect(matchPythonLoopPattern(reg).length).toBe(0);
    });
  });
});
