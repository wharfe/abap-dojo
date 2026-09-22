import { describe, it, expect } from "vitest";
import { Buffer } from "buffer";
(globalThis as unknown as { Buffer: typeof Buffer }).Buffer = Buffer;

import { Config, Registry, MemoryFile } from "@abaplint/core";
import { config as transpilerConfig } from "@abaplint/transpiler";
import { findValueAssignRepair, valueAssignCandidates } from "./valueAssignRepair";
import { errorIssues } from "./syntaxRepair";
import { errorSpanFinder, errorSpanOf, type ErrorSpan } from "./strictAcceptance";

/** The worker's own configuration — see the note in syntaxRepair.test.ts. */
const config = new Config(JSON.stringify(transpilerConfig));
const errorSpansIn = errorSpanFinder(config, "ztest.prog.abap");

/** Search the way the worker does: take the spans from one parse, then look. */
async function repairOf(source: string) {
  const registry = new Registry(config);
  registry.addFile(new MemoryFile("ztest.prog.abap", source));
  await registry.parseAsync();
  const spans = errorIssues(registry.findIssues()).map(errorSpanOf);
  return findValueAssignRepair(source, spans, errorSpansIn);
}

describe("valueAssignCandidates", () => {
  it("normalises the spacing around the equals sign", () => {
    // The other searches edit a row's end and keep its trailing whitespace.
    // This one edits the middle, so `TYPE i=5` must not become `TYPE iVALUE5`.
    expect(
      valueAssignCandidates(`REPORT z.\nDATA lv TYPE i=5.\n`, [{ start: 2, end: 2 }])[0],
    ).toEqual({
      line: 2,
      source: `REPORT z.\nDATA lv TYPE i VALUE 5.\n`,
      targets: [2],
    });
  });

  it("rewrites only the first equals sign on a row", () => {
    // What keeps `'a = b'` repairable: the one inside the literal is not ours
    // to find, and looking for it is the lexer this module refuses to write.
    expect(
      valueAssignCandidates(`REPORT z.\nDATA lv TYPE string = 'a = b'.\n`, [
        { start: 2, end: 2 },
      ])[0].source,
    ).toBe(`REPORT z.\nDATA lv TYPE string VALUE 'a = b'.\n`);
  });

  it("keeps the carriage return when the equals sign ends the row", () => {
    // The source is split on `\n`, so under CRLF every row ends in `\r`. A
    // plain `\s` in the regex would eat it and rejoin that one row with a
    // bare `\n`. A dropped `\r` is the class of bug that once silenced a
    // whole search for anyone pasting from a CRLF editor.
    expect(
      valueAssignCandidates(`REPORT z.\r\nDATA lv TYPE i =\r\n  5.\r\n`, [
        { start: 2, end: 3 },
      ])[0].source,
    ).toBe(`REPORT z.\r\nDATA lv TYPE i VALUE \r\n  5.\r\n`);
  });

  it("proposes no candidate for a row with no equals sign", () => {
    expect(valueAssignCandidates(`REPORT z.\nWRITE 'a'\n`, [{ start: 2, end: 2 }])).toEqual([]);
  });

  it("adds one candidate that rewrites every eligible row, naming no row", () => {
    const source = `REPORT z.\nDATA: lv TYPE i = 1,\n  lw TYPE i = 2.\n`;
    expect(valueAssignCandidates(source, [{ start: 2, end: 3 }]).at(-1)).toEqual({
      source: `REPORT z.\nDATA: lv TYPE i VALUE 1,\n  lw TYPE i VALUE 2.\n`,
      targets: [2, 3],
    });
  });

  it("does not search a source too large to search cheaply", () => {
    const source = `DATA lv TYPE i = 1.\n`.repeat(1000);
    expect(source.length).toBeGreaterThan(16 * 1024);
    expect(valueAssignCandidates(source, [{ start: 1, end: 1 }])).toEqual([]);
  });
});

describe("findValueAssignRepair against the real parser", () => {
  it.each([
    ["a string declaration", `REPORT z.\nDATA lv TYPE string = 'a'.`, 2],
    ["a numeric declaration", `REPORT z.\nDATA lv TYPE i = 5.`, 2],
    ["a sized declaration", `REPORT z.\nDATA lv TYPE c LENGTH 2 = 'ab'.`, 2],
    ["an equals sign inside the literal", `REPORT z.\nDATA lv TYPE string = 'a = b'.`, 2],
  ])("names the row for %s", async (_, source, line) => {
    expect(await repairOf(source)).toEqual({ kind: "data_value_assign", line });
  });

  it.each([
    // The rule is "an error row holds an equals sign", never "the row starts
    // with DATA", so these are repaired as a consequence rather than by a
    // second rule of their own.
    ["CONSTANTS", `REPORT z.\nCONSTANTS lc TYPE string = 'a'.`],
    ["CLASS-DATA", `CLASS c DEFINITION.\nPUBLIC SECTION.\nCLASS-DATA gv TYPE i = 1.\nENDCLASS.`],
  ])("repairs %s too, without looking at the keyword", async (_, source) => {
    expect((await repairOf(source))?.kind).toBe("data_value_assign");
  });

  it("names no row when the chained declaration needed every row rewritten", async () => {
    expect(await repairOf(`REPORT z.\nDATA: lv TYPE i = 1,\n  lw TYPE i = 2.`)).toEqual({
      kind: "data_value_assign",
    });
  });

  it("fires on FORM ... USING p = 1., which is not a declaration at all", async () => {
    // Found by external review (2026-09-22). The search is keyword-blind by
    // design, so it reaches a subroutine definition; this is pinned rather
    // than fixed, because narrowing it would mean reading the leading
    // keyword. It is also why repairHint states what the rewrite did instead
    // of diagnosing a declaration — see the note there.
    // The ENDFORM matters: without it the original has one error and the
    // rewrite still has one, so nothing is accepted. With it, the original
    // is parser_error@2 + structure@3 and the rewrite parses clean.
    expect(
      (await repairOf(`REPORT z.\nFORM f USING p = 1.\nENDFORM.`))?.kind,
    ).toBe("data_value_assign");
  });

  it.each([
    ["an assignment that is correct ABAP", `REPORT z.\nDATA lv TYPE i.\nlv = 5.`],
    // Correct ABAP that DOES initialise with `=`: the inline declaration.
    ["an inline declaration", `REPORT z.\nDATA(lv) = 5.`],
    ["a method default", `CLASS c DEFINITION.\nPUBLIC SECTION.\nMETHODS m IMPORTING iv TYPE i = 1.\nENDCLASS.`],
    ["a declaration that already uses VALUE", `REPORT z.\nDATA lv TYPE string VALUE 'a'.`],
    ["a comparison in a broken IF", `REPORT z.\nIF 1 = 1\nWRITE 'a'.\nENDIF.`],
    ["pasted JavaScript", `REPORT z.\nlet x = 1`],
    ["a pasted JavaScript object", `REPORT z.\nconst o = { a: 1 }`],
    ["a pasted Python keyword argument", `REPORT z.\nf(a = 1)`],
    ["pasted SQL", `REPORT z.\nSELECT * FROM t WHERE x = 1`],
    ["a missing period with no equals sign", `REPORT z.\nWRITE 'a'`],
  ])("keeps quiet on %s", async (_, source) => {
    expect(await repairOf(source)).toBeUndefined();
  });

  it("reports nothing when there was no error", async () => {
    const never = () => Promise.reject(new Error("must not re-parse"));
    expect(await findValueAssignRepair(`DATA lv TYPE i = 1.`, [], never)).toBeUndefined();
  });

  it("rejects a rewrite that lowers the count but leaves its target covered", async () => {
    // The #78 shape, pinned here as well: an error covering the target row is
    // not cleared, whichever row it starts on.
    const spans: ErrorSpan[] = [
      { start: 2, end: 2 },
      { start: 3, end: 3 },
    ];
    const swallowedFromAbove = async () => [{ start: 1, end: 3 }];
    expect(
      await findValueAssignRepair(
        `REPORT z.\nDATA lv TYPE i = 1.\nDATA lw TYPE i = 2.`,
        spans,
        swallowedFromAbove,
      ),
    ).toBeUndefined();
  });
});
