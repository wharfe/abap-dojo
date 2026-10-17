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

    it("ignores sy-index used as a key value: WITH KEY qty = sy-index", async () => {
      const reg = await parseSource(`REPORT ztest.
TYPES: BEGIN OF ty_item,
         qty TYPE i,
       END OF ty_item.
DATA lt TYPE STANDARD TABLE OF ty_item WITH DEFAULT KEY.
DATA ls TYPE ty_item.
DO 3 TIMES.
READ TABLE lt INTO ls WITH KEY qty = sy-index.
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
lv_index = lv_index + 1.
ENDDO.`);
        expect(matchPythonLoopPattern(reg).length, operand).toBe(1);
      }
    });

    // From review: only the loop's own counter makes it an index loop. An
    // INDEX the block does not step is a lookup, whatever it is spelled as.
    it("detects a counter stepped with += or ADD 1 TO", async () => {
      for (const step of ["lv_index += 1.", "ADD 1 TO lv_index."]) {
        const reg = await parseSource(`${header}DO 3 TIMES.
READ TABLE lt_items INTO ls_item INDEX lv_index.
${step}
ENDDO.`);
        expect(matchPythonLoopPattern(reg).length, step).toBe(1);
      }
    });

    it("ignores a stack pop: INDEX lines( lt_stack ) inside WHILE", async () => {
      const reg = await parseSource(`${header}WHILE lines( lt_items ) > 0.
READ TABLE lt_items INTO ls_item INDEX lines( lt_items ).
DELETE lt_items INDEX lines( lt_items ).
ENDWHILE.`);
      expect(matchPythonLoopPattern(reg).length).toBe(0);
    });

    it("ignores a binary search reading INDEX lv_mid", async () => {
      const reg = await parseSource(`${header}DATA lv_lo TYPE i VALUE 1.
DATA lv_hi TYPE i.
DATA lv_mid TYPE i.
lv_hi = lines( lt_items ).
WHILE lv_lo <= lv_hi.
  lv_mid = ( lv_lo + lv_hi ) / 2.
  READ TABLE lt_items INTO ls_item INDEX lv_mid.
  lv_lo = lv_mid + 1.
ENDWHILE.`);
      expect(matchPythonLoopPattern(reg).length).toBe(0);
    });

    it("ignores a named constant: INDEX c_first", async () => {
      const reg = await parseSource(`${header}CONSTANTS c_first TYPE i VALUE 1.
DO 3 TIMES. READ TABLE lt_items INTO ls_item INDEX c_first. ENDDO.`);
      expect(matchPythonLoopPattern(reg).length).toBe(0);
    });

    it("reports LOOP and DO nested together once, in line order", async () => {
      for (const body of [
        // Both rules genuinely fire here: SY-TABIX in the LOOP, and the
        // DO's own counter driving the READ.
        `LOOP AT lt_items INTO ls_item.
lv_index = sy-tabix.
DO 2 TIMES.
READ TABLE lt_items INTO ls_item INDEX sy-index.
ENDDO.
ENDLOOP.`,
        `DO 2 TIMES.
READ TABLE lt_items INTO ls_item INDEX sy-index.
LOOP AT lt_items INTO ls_item.
lv_index = sy-tabix.
ENDLOOP.
ENDDO.`,
      ]) {
        const reg = await parseSource(header + body);
        const lines = matchPythonLoopPattern(reg).map((m) => m.startLine);
        expect(lines.length, body).toBe(1);
      }
    });

    it("returns matches in line order", async () => {
      const reg = await parseSource(`${header}DO 3 TIMES.
READ TABLE lt_items INTO ls_item INDEX sy-index.
ENDDO.
LOOP AT lt_items INTO ls_item.
lv_index = sy-tabix.
ENDLOOP.`);
      const lines = matchPythonLoopPattern(reg).map((m) => m.startLine);
      expect(lines).toEqual([...lines].sort((a, b) => a - b));
      expect(lines.length).toBe(2);
    });

    it("ignores READ TABLE ... INDEX outside any loop", async () => {
      const reg = await parseSource(`${header}READ TABLE lt_items INTO ls_item INDEX lv_index.`);
      expect(matchPythonLoopPattern(reg).length).toBe(0);
    });
  });
});
