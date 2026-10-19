import { describe, it, expect } from "vitest";
import { Buffer } from "buffer";
(globalThis as unknown as { Buffer: typeof Buffer }).Buffer = Buffer;

import { Registry, MemoryFile, Config, ABAPObject } from "@abaplint/core";
import type { Nodes } from "@abaplint/core";
import { config as transpilerConfig } from "@abaplint/transpiler";
import {
  CLOSER_KEYWORD,
  EXCLUDED_BARE_OPENERS,
  OPENER_KEYWORD,
  deriveBlockPairs,
  describeOpenBlock,
  findOpenBlock,
  type OpenBlockFinding,
} from "./openBlock";
import sources from "./fixtures/structureShapes.sources.json";

const abaplintConfig = new Config(JSON.stringify(transpilerConfig));

async function statementsOf(source: string): Promise<readonly Nodes.StatementNode[]> {
  const reg = new Registry(abaplintConfig);
  reg.addFile(new MemoryFile("ztest.prog.abap", source));
  await reg.parseAsync();
  return (reg.getFirstObject() as ABAPObject).getABAPFiles()[0].getStatements();
}

async function findIn(source: string): Promise<OpenBlockFinding | null> {
  return findOpenBlock(await statementsOf(source));
}

function shape(prefix: string): string {
  const key = Object.keys(sources).find((k) => k.startsWith(`${prefix} `));
  if (key === undefined) throw new Error(`no fixture shape ${prefix}`);
  return (sources as Record<string, string>)[key];
}

describe("the opener/closer table is derived from abaplint's own structures", () => {
  // Pinned so a bump that adds, removes or renames a block structure goes red
  // here, where the keyword tables below would otherwise silently lose a row.
  const EXPECTED: ReadonlyArray<[string, string, string]> = [
    ["AtFirst", "AtFirst", "EndAt"],
    ["AtLast", "AtLast", "EndAt"],
    ["At", "At", "EndAt"],
    ["CaseType", "CaseType", "EndCase"],
    ["Case", "Case", "EndCase"],
    ["CatchSystemExceptions", "CatchSystemExceptions", "EndCatch"],
    ["Chain", "Chain", "EndChain"],
    ["ClassData", "ClassDataBegin", "ClassDataEnd"],
    ["ClassDefinition", "ClassDefinition", "EndClass"],
    ["ClassImplementation", "ClassImplementation", "EndClass"],
    ["Constants", "ConstantBegin", "ConstantEnd"],
    ["Data", "DataBegin", "DataEnd"],
    ["Define", "Define", "EndOfDefinition"],
    ["Do", "Do", "EndDo"],
    ["EnhancementSection", "EnhancementSection", "EndEnhancementSection"],
    ["Enhancement", "Enhancement", "EndEnhancement"],
    ["ExecSQL", "ExecSQL", "EndExec"],
    ["Form", "Form", "EndForm"],
    ["FunctionModule", "FunctionModule", "EndFunction"],
    ["If", "If", "EndIf"],
    ["Interface", "Interface", "EndInterface"],
    ["LoopAtScreen", "LoopAtScreen", "EndLoop"],
    ["Loop", "Loop", "EndLoop"],
    ["Method", "MethodImplementation", "EndMethod"],
    ["OnChange", "OnChange", "EndOn"],
    ["Provide", "Provide", "EndProvide"],
    ["Select", "SelectLoop", "EndSelect"],
    ["DynproLoop", "DynproLoop", "EndLoop"],
    ["Statics", "StaticBegin", "StaticEnd"],
    ["TestInjection", "TestInjection", "EndTestInjection"],
    ["TestSeam", "TestSeam", "EndTestSeam"],
    ["LoopExtract", "LoopExtract", "EndLoop"],
    ["Try", "Try", "EndTry"],
    ["TypeEnum", "TypeEnumBegin", "TypeEnumEnd"],
    ["TypeMesh", "TypeMeshBegin", "TypeMeshEnd"],
    ["Types", "TypeBegin", "TypeEnd"],
    ["While", "While", "EndWhile"],
    ["With", "WithLoop", "EndWith"],
  ];

  it("derives exactly the pinned 38 pairs", () => {
    const pairs = deriveBlockPairs().map((p) => [p.structure, p.opener, p.closer]);
    expect(pairs).toEqual(EXPECTED);
    expect(pairs).toHaveLength(38);
  });

  it("excludes MODULE, which is also a bare statement in flow logic", () => {
    const openers = deriveBlockPairs().map((p) => p.opener);
    for (const name of EXCLUDED_BARE_OPENERS) expect(openers).not.toContain(name);
    expect(EXCLUDED_BARE_OPENERS).toEqual(["Module"]);
  });

  it("has a keyword for every opener and every closer, and nothing else", () => {
    const openers = [...new Set(deriveBlockPairs().map((p) => p.opener))].sort();
    const closers = [...new Set(deriveBlockPairs().map((p) => p.closer))].sort();
    expect(Object.keys(OPENER_KEYWORD).sort()).toEqual(openers);
    expect(Object.keys(CLOSER_KEYWORD).sort()).toEqual(closers);
    expect(openers).toHaveLength(38);
    expect(closers).toHaveLength(31);
  });
});

describe("findOpenBlock against the real parser", () => {
  const unclosed = (className: string, row: number, outside = 0) =>
    ({ kind: "unclosed", block: expect.objectContaining({ className, row }), outside }) as const;

  const closedOver = (className: string, row: number, closerRow: number, matchedRow: number) =>
    expect.objectContaining({
      kind: "closed-over",
      block: expect.objectContaining({ className, row }),
      closer: expect.objectContaining({ row: closerRow }),
      matched: expect.objectContaining({ row: matchedRow }),
    });

  const cases: ReadonlyArray<[string, unknown]> = [
    ["A", expect.objectContaining({ kind: "method-in-definition", block: expect.objectContaining({ row: 4 }), definition: expect.objectContaining({ row: 1 }) })],
    ["B", expect.objectContaining(unclosed("ClassImplementation", 5))],
    ["C", null],
    ["D", expect.objectContaining(unclosed("ClassDefinition", 1))],
    ["E", expect.objectContaining(unclosed("ClassDefinition", 1))],
    ["F", closedOver("MethodImplementation", 6, 8, 5)],
    ["G", closedOver("If", 7, 9, 6)],
    ["H", expect.objectContaining(unclosed("ClassImplementation", 5))],
    // The METHOD without a period is an Unknown statement; its ENDMETHOD then
    // matches nothing on the stack and is ignored, so nothing is named and the
    // generic text with "the next error is on line 6" stays.
    ["J", null],
    ["K", closedOver("MethodImplementation", 6, 9, 5)],
    ["L", expect.objectContaining(unclosed("Loop", 2))],
    ["M", closedOver("Loop", 3, 5, 1)],
    ["N", expect.objectContaining(unclosed("Loop", 2))],
    ["O", null],
    ["P", expect.objectContaining({ kind: "method-in-definition", block: expect.objectContaining({ row: 3 }) })],
    ["Q", null],
    ["R", null],
    // MODULE x. is a plain statement here; the IF above it is what is open.
    ["S", expect.objectContaining(unclosed("If", 1))],
    ["T", closedOver("Loop", 3, 5, 2)],
    ["U", expect.objectContaining(unclosed("Do", 2))],
    ["V", expect.objectContaining(unclosed("Do", 2))],
    // Chained TYPES: the second BEGIN OF is on line 4, not the chain's line 1.
    ["W", expect.objectContaining(unclosed("TypeBegin", 4))],
    ["X", closedOver("If", 7, 12, 6)],
    ["Y", closedOver("Loop", 9, 11, 6)],
    ["Z", expect.objectContaining(unclosed("If", 2))],
    ["Z2", expect.objectContaining(unclosed("If", 2))],
    ["Z3", null],
    // SELECT … INTO TABLE never opens; the stray ENDSELECT is ignored rather
    // than blamed on the METHOD.
    ["Z4", null],
    ["Z5", null],
  ];

  for (const [prefix, expected] of cases) {
    it(`shape ${prefix}`, async () => {
      expect(await findIn(shape(prefix))).toEqual(expected);
    });
  }

  it("records a same-kind block closed inside (shape X) with both rows", async () => {
    const f = (await findIn(shape("X"))) as Extract<OpenBlockFinding, { kind: "closed-over" }>;
    expect(f.block.sameKind).toEqual({ closedRow: 11, closedOpenerRow: 8 });
  });

  it("lists the frames between the named block and the matched opener (shape Y)", async () => {
    const f = (await findIn(shape("Y"))) as Extract<OpenBlockFinding, { kind: "closed-over" }>;
    expect(f.between.map((b) => [b.className, b.row])).toEqual([["If", 8]]);
  });

  it("marks the same-kind evidence on a METHOD (shape I), which cannot nest", async () => {
    const f = (await findIn(shape("I"))) as Extract<OpenBlockFinding, { kind: "closed-over" }>;
    expect(f.block).toMatchObject({ className: "MethodImplementation", row: 7 });
    expect(f.block.sameKind).toEqual({ closedRow: 11, closedOpenerRow: 9 });
  });

  it("reports a macro-expanded IF at the call's row, flagged virtual (shape Z6)", async () => {
    const f = (await findIn(shape("Z6"))) as Extract<OpenBlockFinding, { kind: "unclosed" }>;
    expect(f.block).toMatchObject({ className: "If", row: 5, virtual: true });
  });

  it("finds nothing in a program with no structure error", async () => {
    expect(await findIn("FORM f.\n  MODULE m.\nENDFORM.\n")).toBeNull();
    expect(await findIn("DATA: BEGIN OF s,\n a TYPE i,\n END OF s.\n")).toBeNull();
    expect(await findIn("REPORT z.\nSELECT SINGLE * FROM ztab INTO @DATA(ls).\n")).toBeNull();
    expect(await findIn("CLASS lcl DEFINITION DEFERRED.\nWRITE 'a'.\n")).toBeNull();
    expect(await findIn("")).toBeNull();
  });

  it("keeps the keyword row for a chained IF, which is not a BEGIN OF", async () => {
    const f = await findIn("IF:\n 1 = 1.\nWRITE 'a'.\n");
    expect(f).toMatchObject({ kind: "unclosed", block: { className: "If", row: 1 } });
  });

  it("stays a single pass: 2,000 statements in well under the lint debounce", async () => {
    const source = Array.from({ length: 2000 }, (_, i) => `WRITE ${i}.`).join("\n") + "\nIF 1 = 1.\n";
    const statements = await statementsOf(source);
    const started = performance.now();
    const f = findOpenBlock(statements);
    expect(performance.now() - started).toBeLessThan(50);
    expect(f).toMatchObject({ kind: "unclosed", block: { row: 2001 } });
  });
});

describe("describeOpenBlock", () => {
  it("names the innermost open block and points at the closing line (shape Y)", async () => {
    const text = describeOpenBlock((await findIn(shape("Y")))!)!;
    expect(text).toContain("When abaplint reached the ENDMETHOD on line 11, the LOOP on line 9 was still open");
    expect(text).toContain("1 more between the METHOD and it (IF on line 8)");
    expect(text).toContain("If you did write ENDLOOP, abaplint did not see it as a statement.");
    expect(text).toContain('look for a " earlier on that line');
  });

  it("hedges a same-kind nesting with both candidate rows (shape X)", async () => {
    const text = describeOpenBlock((await findIn(shape("X")))!)!;
    expect(text).toContain("the IF on line 7 was still open.");
    expect(text).toContain(
      "The ENDIF on line 11 closed the IF on line 8; if it was meant for line 7, the IF on line 8 is the one left open.",
    );
  });

  it("says when the next METHOD began for a METHOD, which cannot nest (shape I)", async () => {
    const text = describeOpenBlock((await findIn(shape("I")))!)!;
    expect(text).toContain("the METHOD on line 7 was still open.");
    expect(text).toContain("It was still open when the METHOD on line 9 began.");
    expect(text).not.toContain("nested");
  });

  it("counts the blocks open outside the named one (shape Y variant at top level)", async () => {
    const text = describeOpenBlock(
      (await findIn("DATA lt TYPE STANDARD TABLE OF i.\nIF 1 = 1.\n  LOOP AT lt INTO DATA(lv).\n    WRITE lv.\n"))!,
    )!;
    expect(text).toContain("abaplint found no ENDLOOP for the LOOP on line 3 (the innermost block still open; 1 more is open outside it).");
  });

  it("omits the outside count when it is zero (shape L)", async () => {
    const text = describeOpenBlock((await findIn(shape("L")))!)!;
    expect(text).toContain("(the innermost block still open).");
  });

  it("explains a METHOD body inside CLASS … DEFINITION (shape A)", async () => {
    const text = describeOpenBlock((await findIn(shape("A")))!)!;
    expect(text).toContain("The METHOD on line 4 is inside CLASS … DEFINITION (line 1)");
    expect(text).toContain("CLASS … IMPLEMENTATION");
  });

  it("names the macro call for a virtual position (shape Z6)", async () => {
    const text = describeOpenBlock((await findIn(shape("Z6")))!)!;
    expect(text).toContain("the IF expanded from the macro call on line 5");
  });

  it("keeps the SELECT loop note", async () => {
    const text = describeOpenBlock(
      (await findIn("DATA ls TYPE i.\nSELECT * FROM ztab INTO ls.\n  WRITE ls.\n"))!,
    )!;
    expect(text).toContain("the SELECT on line 2 (a SELECT without SINGLE or INTO TABLE loops until ENDSELECT)");
  });

  it("uses the chained BEGIN OF's own row (shape W)", async () => {
    const text = describeOpenBlock((await findIn(shape("W")))!)!;
    expect(text).toContain("abaplint found no END OF for the TYPES BEGIN OF on line 4");
  });

  it("returns null for a class outside the keyword tables", () => {
    expect(
      describeOpenBlock({
        kind: "unclosed",
        block: { className: "Nope", row: 1, col: 1, virtual: false },
        outside: 0,
      }),
    ).toBeNull();
  });
});
