import { describe, it, expect } from "vitest";
import { Buffer } from "buffer";
(globalThis as unknown as { Buffer: typeof Buffer }).Buffer = Buffer;

import { Registry, MemoryFile, Config, Issue, Statements } from "@abaplint/core";
import { config as transpilerConfig } from "@abaplint/transpiler";
import { containersOf, explainUnexpected, INNER_KEYWORD } from "./unexpectedStatement";
import { CLOSER_KEYWORD } from "./openBlock";

const abaplintConfig = new Config(JSON.stringify(transpilerConfig));

async function errorsOf(source: string): Promise<Issue[]> {
  const reg = new Registry(abaplintConfig);
  reg.addFile(new MemoryFile("ztest.prog.abap", source));
  await reg.parseAsync();
  return reg
    .findIssues()
    .filter((i) => i.getSeverity().toString() === "Error");
}

const CAUSES =
  "The statement that opens it may be missing, closed earlier than intended, " +
  'commented out (in ABAP a " starts a comment), or written in a form abaplint ' +
  "could not parse. If other errors are listed, fix those first.";

describe("explainUnexpected against the real parser", () => {
  // The sentences are written out by hand on purpose: pinning only the
  // derived container sets would lock in a wrong derivation (Gate2 H1 — a
  // METHOD once derived "METHOD" as its own container).
  const shapes: Array<[string, string, number, string]> = [
    [
      "a bare METHOD",
      "METHOD run.\n  WRITE 'a'.\nENDMETHOD.\n",
      1,
      "Unexpected METHODIMPLEMENTATION. METHOD is only allowed inside " +
        "CLASS … IMPLEMENTATION, and abaplint saw no such block open at this line. " +
        CAUSES,
    ],
    [
      "a METHOD after a DEFINITION with no IMPLEMENTATION",
      "CLASS lcl DEFINITION.\n  PUBLIC SECTION.\n    METHODS run.\nENDCLASS.\n" +
        "METHOD run.\n  WRITE 'a'.\nENDMETHOD.\n",
      5,
      "Unexpected METHODIMPLEMENTATION. METHOD is only allowed inside " +
        "CLASS … IMPLEMENTATION, and abaplint saw no such block open at this line. " +
        CAUSES,
    ],
    [
      "a PUBLIC SECTION after ENDCLASS",
      "CLASS lcl DEFINITION.\nENDCLASS.\n  PUBLIC SECTION.\n    METHODS run.\n",
      3,
      "Unexpected PUBLIC. PUBLIC SECTION is only allowed inside CLASS … DEFINITION, " +
        "and abaplint saw no such block open at this line. " +
        CAUSES,
    ],
    [
      "a WHEN outside CASE",
      "DATA x TYPE i.\nWHEN 1.\n  WRITE 'a'.\n",
      2,
      "Unexpected WHEN. WHEN is only allowed inside CASE, and abaplint saw no " +
        "such block open at this line. " +
        CAUSES,
    ],
    [
      // The commonest real cause: the IF did not parse, so its ELSE floats.
      "an ELSE whose IF did not parse",
      "DATA x TYPE i.\nIF x == 1.\n  WRITE 'a'.\nELSE.\n  WRITE 'b'.\nENDIF.\n",
      4,
      "Unexpected ELSE. ELSE is only allowed inside IF or ON CHANGE OF, and " +
        "abaplint saw no such block open at this line. " +
        CAUSES,
    ],
    [
      "a stray ENDIF",
      "WRITE 'a'.\nENDIF.\n",
      2,
      "Unexpected ENDIF. ENDIF closes a block opened by IF, but abaplint saw no " +
        "IF block open for it to close at this line. " +
        CAUSES,
    ],
    [
      "a stray ENDCLASS",
      "WRITE 'a'.\nENDCLASS.\n",
      2,
      "Unexpected ENDCLASS. ENDCLASS closes a block opened by CLASS … DEFINITION " +
        "or CLASS … IMPLEMENTATION, but abaplint saw no CLASS … DEFINITION or " +
        "CLASS … IMPLEMENTATION block open for it to close at this line. " +
        CAUSES,
    ],
    [
      // Four kinds of LOOP share ENDLOOP and none is derived: no opener named.
      "a stray ENDLOOP",
      "WRITE 'a'.\nENDLOOP.\n",
      2,
      "Unexpected ENDLOOP. ENDLOOP closes a block, but abaplint saw no block " +
        "open for it to close at this line. " +
        CAUSES,
    ],
  ];

  it.each(shapes)("%s", async (_name, source, row, text) => {
    const [first] = await errorsOf(source);
    expect(first.getKey()).toBe("structure");
    expect(first.getStart().getRow()).toBe(row);
    expect(explainUnexpected(first.getKey(), first.getMessage())).toBe(text);
  });

  // Statements that can also stand at the top level, or that would only get
  // misleading advice, keep abaplint's own text.
  const untouched: Array<[string, string, string]> = [
    ["METHODS outside a class", "METHODS run.\n", "Unexpected METHODDEF"],
    ["CLASS-DATA at the top", "CLASS-DATA x TYPE i.\n", "Unexpected CLASSDATA"],
  ];

  it.each(untouched)("leaves %s alone", async (_name, source, message) => {
    const [first] = await errorsOf(source);
    expect(first.getMessage()).toBe(message);
    expect(explainUnexpected(first.getKey(), first.getMessage())).toBeNull();
  });
});

describe("explainUnexpected on messages it does not own", () => {
  it.each([
    ["structure", "Expected ENDIF"],
    ["structure", "Unexpected code structure"],
    ["structure", "Unexpected ZSECRET"],
    ["structure", "Unexpected WRITE"],
    ["parser_error", "Unexpected ENDIF"],
  ])("%s / %s -> null", (key, message) => {
    expect(explainUnexpected(key, message)).toBeNull();
  });
});

describe("containersOf", () => {
  // Pinned so an abaplint bump that moves a statement goes red here rather
  // than changing the advice silently. The hand-written sentences above are
  // what makes these values right; this only makes them stable.
  it("derives the containers each explained statement is told to go in", () => {
    const derived = Object.fromEntries(
      Object.keys(INNER_KEYWORD).map((k) => [k, containersOf(k)?.slice().sort()]),
    );
    expect(derived).toEqual({
      MethodImplementation: ["CLASS … IMPLEMENTATION"],
      Public: ["CLASS … DEFINITION"],
      Protected: ["CLASS … DEFINITION"],
      Private: ["CLASS … DEFINITION"],
      When: ["CASE"],
      WhenOthers: ["CASE", "CASE TYPE OF"],
      Else: ["IF", "ON CHANGE OF"],
      ElseIf: ["IF"],
      Catch: ["TRY"],
      Cleanup: ["TRY"],
    });
  });

  // A block that may nest in itself (CLASS-DATA BEGIN OF inside another)
  // must not be offered as its own container (Gate2 H1).
  it("never names a statement's own block as its container", () => {
    expect(containersOf("ClassDataBegin")?.slice().sort()).toEqual([
      "CLASS … DEFINITION",
      "INTERFACE",
    ]);
  });

  it("names only real statement classes", () => {
    for (const k of Object.keys(INNER_KEYWORD)) expect(Statements).toHaveProperty(k);
  });

  it("gives nothing for statements that may stand at the top level", () => {
    for (const k of ["Write", "Data", "Form", "If", "Loop", "ClassDefinition"]) {
      expect(containersOf(k)).toBeNull();
    }
  });

  it("derives the opener for most closers, never more than three", () => {
    const unnamed = Object.keys(CLOSER_KEYWORD).filter((k) => containersOf(k) === null);
    expect(unnamed).toEqual(["EndLoop"]);
  });
});
