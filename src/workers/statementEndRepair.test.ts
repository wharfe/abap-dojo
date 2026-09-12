import { describe, it, expect } from "vitest";
import { Buffer } from "buffer";
(globalThis as unknown as { Buffer: typeof Buffer }).Buffer = Buffer;

import { Config, Registry, MemoryFile } from "@abaplint/core";
import { config as transpilerConfig } from "@abaplint/transpiler";
import {
  errorRowCounter,
  errorSpanOf,
  findStatementEndRepair,
  statementEndCandidates,
} from "./statementEndRepair";
import { errorIssues } from "./syntaxRepair";

/** The worker's own configuration — see the note in syntaxRepair.test.ts. */
const config = new Config(JSON.stringify(transpilerConfig));
const errorRowsIn = errorRowCounter(config, "ztest.prog.abap");

/** Search the way the worker does: take the spans from one parse, then look. */
async function repairOf(source: string) {
  const registry = new Registry(config);
  registry.addFile(new MemoryFile("ztest.prog.abap", source));
  await registry.parseAsync();
  const spans = errorIssues(registry.findIssues()).map(errorSpanOf);
  return findStatementEndRepair(source, spans, errorRowsIn);
}

describe("statementEndCandidates", () => {
  it("appends a period to the row an error ends on, keeping CRLF", () => {
    const source = `REPORT z.\r\nWRITE: 'a',\r\n  'b'\r\n`;
    expect(
      statementEndCandidates("missing_period", source, [{ start: 2, end: 3 }])[0],
    ).toEqual({
      line: 3,
      source: `REPORT z.\r\nWRITE: 'a',\r\n  'b'.\r\n`,
      targets: [2, 3],
    });
  });

  it("replaces a trailing semicolon, keeping CRLF", () => {
    expect(
      statementEndCandidates("semicolon", `REPORT z.\r\nWRITE 'a';\r\n`, [
        { start: 2, end: 2 },
      ]),
    ).toEqual([{ line: 2, source: `REPORT z.\r\nWRITE 'a'.\r\n`, targets: [2] }]);
  });

  it("does not touch a row that already ends a statement or continues a chain", () => {
    const spans = [{ start: 2, end: 3 }];
    expect(
      statementEndCandidates("missing_period", `REPORT z.\nWRITE: 'a',\nWRITE 'b'.`, spans),
    ).toEqual([]);
  });

  it("adds a rewrite-everything candidate, last and with no line, only for several rows", () => {
    const candidates = statementEndCandidates(
      "missing_period",
      `REPORT z.\nWRITE 'a'\nWRITE 'b'`,
      [{ start: 2, end: 3 }],
    );
    expect(candidates.at(-1)).toEqual({
      source: `REPORT z.\nWRITE 'a'.\nWRITE 'b'.`,
      targets: [2, 3],
    });
    expect(
      statementEndCandidates("missing_period", `REPORT z.\nWRITE 'a'`, [
        { start: 2, end: 2 },
      ]).every((c) => c.line !== undefined),
    ).toBe(true);
  });

  it("stops at the budget", () => {
    const source = Array.from({ length: 30 }, (_, i) => `WRITE ${i};`).join("\n");
    const spans = Array.from({ length: 30 }, (_, i) => ({ start: i + 1, end: i + 1 }));
    // 10 single-row candidates plus the one that rewrites everything.
    expect(statementEndCandidates("semicolon", source, spans)).toHaveLength(11);
  });

  it("narrows the rewrite-everything candidate to the errors it rewrote", () => {
    // An unrelated error elsewhere survives any rewrite, so making it a target
    // would reject a real repair (Gate2 M1).
    const candidates = statementEndCandidates(
      "missing_period",
      `REPORT z.\nWRITE 'a'\nWRITE 'b'\nWRITE 'c'.\nWRTE 'd'.`,
      [
        { start: 2, end: 3 },
        { start: 5, end: 5 },
      ],
    );
    expect(candidates.at(-1)).toEqual({
      source: `REPORT z.\nWRITE 'a'.\nWRITE 'b'.\nWRITE 'c'.\nWRTE 'd'.`,
      targets: [2, 3],
    });
  });

  it("does not search a source too large to search cheaply", () => {
    const source = `WRITE 'a';\n`.repeat(1500);
    expect(source.length).toBeGreaterThan(16 * 1024);
    expect(statementEndCandidates("semicolon", source, [{ start: 1, end: 1 }])).toEqual([]);
  });
});

describe("findStatementEndRepair search", () => {
  it("reports nothing when there was no error", async () => {
    const never = () => Promise.reject(new Error("must not re-parse"));
    expect(await findStatementEndRepair(`WRITE 'a';`, [], never)).toBeUndefined();
  });

  it("rejects a rewrite that lowers the count but leaves an error where it aimed", async () => {
    // Pasted JavaScript: `console.log('a')` is two errors on one row, and a
    // period turns it into one. A plain count would call that a repair.
    const onePerRow = () => Promise.resolve([1]);
    expect(
      await findStatementEndRepair(
        `console.log('a')`,
        [
          { start: 1, end: 1 },
          { start: 1, end: 1 },
        ],
        onePerRow,
      ),
    ).toBeUndefined();
  });

  it("tries the semicolon before the period", async () => {
    const clean = () => Promise.resolve([]);
    expect(
      await findStatementEndRepair(`WRITE 'a';`, [{ start: 1, end: 1 }], clean),
    ).toEqual({ kind: "semicolon", line: 1 });
  });

  it("reports nothing rather than letting a re-parse throw escape", async () => {
    const throws = () => Promise.reject(new Error("parser blew up"));
    await expect(
      findStatementEndRepair(`WRITE 'a';`, [{ start: 1, end: 1 }], throws),
    ).resolves.toBeUndefined();
  });
});

/**
 * abaplint is the judge. Every row here was checked against the real parser
 * (2026-09-11). Most of the quiet ones would stay quiet under a plain count
 * too: only the two `console.log` rows depend on the stricter acceptance rule,
 * and the last test below is a real repair that rule gives up. The spec
 * records that trade.
 */
describe("findStatementEndRepair against the real parser", () => {
  it.each([
    ["on the last line", `REPORT z.\nWRITE 'hello'`, 2],
    ["before another statement", `REPORT z.\nWRITE 'a'\nWRITE 'b'.`, 2],
    ["inside IF", `REPORT z.\nIF 1 = 1.\n  WRITE 'a'\nENDIF.`, 3],
    ["at the end of a chain over two rows", `REPORT z.\nWRITE: 'a',\n       'b'`, 3],
    [
      "at the end of a call over two rows",
      `REPORT z.\nDATA lv TYPE string.\nlv = to_upper(\n  'a' )`,
      4,
    ],
    ["in CRLF", `REPORT z.\r\nWRITE 'hello'\r\nWRITE 'b'.`, 2],
    ["with no REPORT line", `WRITE 'hello'`, 1],
  ])("finds a missing period %s", async (_, source, line) => {
    expect(await repairOf(source)).toEqual({ kind: "missing_period", line });
  });

  it("finds consecutive missing periods, naming no row", async () => {
    // abaplint reports these as ONE error, so no one-row edit lowers the count.
    expect(await repairOf(`REPORT z.\nWRITE 'a'\nWRITE 'b'`)).toEqual({
      kind: "missing_period",
    });
    expect(await repairOf(`REPORT z.\nWRITE 'a'\nWRITE 'b'\nWRITE 'c'`)).toEqual({
      kind: "missing_period",
    });
  });

  it("finds a semicolon", async () => {
    expect(await repairOf(`REPORT z.\nWRITE 'a';`)).toEqual({ kind: "semicolon", line: 2 });
    expect(await repairOf(`REPORT z.\r\nWRITE 'a';\r\nWRITE 'b'.`)).toEqual({
      kind: "semicolon",
      line: 2,
    });
  });

  it("finds semicolons on consecutive rows, naming no row", async () => {
    expect(await repairOf(`REPORT z.\nWRITE 'a';\nWRITE 'b';`)).toEqual({
      kind: "semicolon",
    });
  });

  it("finds consecutive missing periods beside an unrelated error", async () => {
    // Gate2 M1: silent while the rewrite-everything candidate targeted row 5.
    expect(
      await repairOf(`REPORT z.\nWRITE 'a'\nWRITE 'b'\nWRITE 'c'.\nWRTE 'd'.`),
    ).toEqual({ kind: "missing_period" });
  });

  it.each([
    ["a misspelt keyword", `REPORT z.\nWRTE 'a'.`],
    ["pasted JavaScript", `REPORT z.\nconsole.log('a')`],
    ["pasted JavaScript with a semicolon", `REPORT z.\nconsole.log('a');`],
    ["a JavaScript declaration", `REPORT z.\nconst x = 5;`],
    ["two lines of JavaScript", `REPORT z.\nlet x = 1\nconsole.log(x)`],
    ["pasted Python", `REPORT z.\nprint('a')`],
    ["a missing period beside a misspelt keyword", `REPORT z.\nWRITE 'a'\nWRTE 'b'.`],
    ["a type we do not carry", `REPORT z.\nDATA lt TYPE string_table.`],
    ["a program that parses", `REPORT z.\nWRITE 'a'.`],
  ])("keeps quiet on %s", async (_, source) => {
    expect(await repairOf(source)).toBeUndefined();
  });

  it("cannot reach a missing period hidden behind an end-of-line comment", async () => {
    // The appended period lands inside the comment. Pinned so the limit stays a
    // decision rather than a surprise.
    expect(await repairOf(`REPORT z.\nWRITE 'a' " note`)).toBeUndefined();
  });

  it("cannot reach semicolons abaplint merges into one error with a misspelt keyword", async () => {
    // abaplint reports rows 2-4 as ONE error, so the misspelt row is a target
    // of every rewrite and its surviving error rejects each of them. Pinned:
    // this is the real repair the stricter rule costs.
    expect(await repairOf(`REPORT z.\nWRITE 'a';\nWRITE 'b';\nWRTE 'd'.`)).toBeUndefined();
  });
});
