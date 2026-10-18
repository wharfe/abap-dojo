import { describe, it, expect } from "vitest";
import { Buffer } from "buffer";
// @abaplint/core initialises built-in symbols via Buffer.from(..., "hex"), the
// same reason src/workers/abaplintWorker.ts polyfills it before importing.
(globalThis as unknown as { Buffer: typeof Buffer }).Buffer = Buffer;

import { Registry, MemoryFile, Config } from "@abaplint/core";
import { Transpiler, config as transpilerConfig } from "@abaplint/transpiler";
import { buildRunnableJs } from "./topLevelInline";
import { prepareTranspiledJs } from "../utils/prepareTranspiledJs";
import { executeJs } from "../test/executeAbapJs";

/** The worker's own pipeline: same config, same file name, same transpiler call. */
async function build(source: string) {
  const reg = new Registry(new Config(JSON.stringify(transpilerConfig)));
  reg.addFile(new MemoryFile("ztest.prog.abap", source));
  await reg.parseAsync();
  const output = await new Transpiler({ ignoreSourceMap: true }).run(reg);
  const raw = output.objects.map((o) => o.chunk.getCode()).join("\n");
  return { raw, ...buildRunnableJs(reg, output) };
}

async function run(source: string) {
  const built = await build(source);
  return { ...built, lines: await executeJs(prepareTranspiledJs(built.js)) };
}

/**
 * Tripwire: the reason this feature exists is that the transpiler does NOT
 * declare these names. When this goes red, upstream has started to - delete
 * src/workers/topLevelInline.ts rather than adjusting it, or the two `let`s
 * collide.
 */
function expectUpstreamStillOmits(raw: string, ...names: string[]) {
  for (const name of names) {
    expect(
      raw,
      `upstream now declares ${name}: remove topLevelInline.ts`,
    ).not.toMatch(new RegExp(`\\b(let|var|const)\\s+${name}\\b`));
  }
}

describe("buildRunnableJs: top-level inline declarations (#95)", () => {
  it("runs DATA(x) at the top level", async () => {
    const r = await run("REPORT ztest.\nDATA(lv_x) = 1.\nWRITE / lv_x.");
    expect(r.lines).toEqual(["1"]);
    expect(r.fellBack).toBe(false);
    expectUpstreamStillOmits(r.raw, "lv_x");
  });

  it("declares inside a top-level IF and DO, readable after the block", async () => {
    const r = await run(`REPORT ztest.
IF 1 = 1.
  DATA(lv_if) = 2.
ENDIF.
DO 1 TIMES.
  DATA(lv_do) = 3.
ENDDO.
WRITE / lv_if.
WRITE / lv_do.`);
    expect(r.lines).toEqual(["2", "3"]);
    expect(r.fellBack).toBe(false);
    expectUpstreamStillOmits(r.raw, "lv_if", "lv_do");
  });

  it("declares FIELD-SYMBOL(<fs>) at the top level", async () => {
    const r = await run(`REPORT ztest.
DATA lv TYPE i VALUE 7.
ASSIGN lv TO FIELD-SYMBOL(<fs>).
IF 1 = 1.
  ASSIGN lv TO FIELD-SYMBOL(<fs_in_if>).
ENDIF.
WRITE / <fs>.
WRITE / <fs_in_if>.`);
    expect(r.lines).toEqual(["7", "7"]);
    expect(r.fellBack).toBe(false);
    expectUpstreamStillOmits(r.raw, "fs_fs_");
  });

  it("leaves a top-level LOOP's own declarations to upstream", async () => {
    // Without the LOOP skip this would be a duplicate `let`; the compile
    // check would then fall back and lv_z would be undefined again, so the
    // output and fellBack together prove the skip works.
    const r = await run(`REPORT ztest.
DATA lt TYPE STANDARD TABLE OF i WITH DEFAULT KEY.
APPEND 4 TO lt.
DATA(lv_z) = 9.
LOOP AT lt INTO DATA(ls).
  DATA(lv_in) = ls.
ENDLOOP.
WRITE / lv_z.
WRITE / lv_in.`);
    expect(r.lines).toEqual(["9", "4"]);
    expect(r.fellBack).toBe(false);
    expect(r.prologue).not.toMatch(/\blet (ls|lv_in)\b/);
  });

  it("keeps a METHOD's DATA(x) and a top-level DATA(x) apart", async () => {
    const r = await run(`REPORT ztest.
CLASS lcl DEFINITION.
  PUBLIC SECTION.
    CLASS-METHODS m.
ENDCLASS.
CLASS lcl IMPLEMENTATION.
  METHOD m.
    DATA(lv_x) = 5.
    WRITE / lv_x.
  ENDMETHOD.
ENDCLASS.
START-OF-SELECTION.
  DATA(lv_x) = 6.
  lcl=>m( ).
  WRITE / lv_x.`);
    expect(r.lines).toEqual(["5", "6"]);
    expect(r.fellBack).toBe(false);
  });

  // Gate2: the transpiler rearranges the tree in place and drops
  // AT SELECTION-SCREEN, which abaplint scopes separately. Declaring from
  // both blocks would be a duplicate `let`.
  it("declares once when AT SELECTION-SCREEN reuses the name", async () => {
    const r = await run(`REPORT z.
AT SELECTION-SCREEN.
  DATA(x) = 1.
START-OF-SELECTION.
  DATA(x) = 2.
  WRITE x.`);
    expect(r.lines).toEqual(["2"]);
    expect(r.fellBack).toBe(false);
  });

  // The Program-scope filter is the second line of defence for the case
  // above: on a tree the transpiler has NOT rearranged, AT SELECTION-SCREEN is
  // still there, in its own scope. Walk such a tree (a fresh registry) against
  // a real output and the filter alone keeps the declaration single.
  it("declares once even when walking a tree the transpiler did not rearrange", async () => {
    // Different types on purpose: the JS-name dedupe alone would keep the
    // first one seen - the string from AT SELECTION-SCREEN.
    const source = `REPORT z.
AT SELECTION-SCREEN.
  DATA(x) = \`abc\`.
START-OF-SELECTION.
  DATA(x) = 2.
  WRITE x.`;
    const parse = async () => {
      const reg = new Registry(new Config(JSON.stringify(transpilerConfig)));
      reg.addFile(new MemoryFile("ztest.prog.abap", source));
      await reg.parseAsync();
      return reg;
    };
    const output = await new Transpiler({ ignoreSourceMap: true }).run(await parse());
    const r = buildRunnableJs(await parse(), output);
    expect(r.fellBack).toBe(false);
    expect(r.prologue.match(/\blet x\b/g)).toHaveLength(1);
    expect(r.prologue).toContain("abap.types.Integer");
    expect(r.prologue).not.toContain("abap.types.String");
  });

  it("runs upper- and mixed-case names", async () => {
    for (const name of ["LV_X", "Lv_X"]) {
      const r = await run(`REPORT ztest.\nDATA(${name}) = 1.\nWRITE / ${name}.`);
      expect(r.lines, name).toEqual(["1"]);
      expect(r.fellBack, name).toBe(false);
    }
  });

  it("runs the dynamic-typing pitfall page's typed version to the end", async () => {
    const r = await run(`REPORT ztest_typing.

" Explicitly typed — what ABAP expects
DATA lv_count  TYPE i.
DATA lv_name   TYPE string.
DATA lv_amount TYPE p LENGTH 8 DECIMALS 2.

lv_count  = 3.
lv_name   = 'Widget'.
lv_amount = '19.99'.

WRITE: / 'Item:', lv_name.
WRITE: / 'Count:', lv_count.
WRITE: / 'Amount:', lv_amount.

" Inline declaration still gets a type - inferred from the right-hand side
DATA(lv_total) = lv_count * lv_amount.
WRITE: / 'Total:', lv_total.`);
    expect(r.fellBack).toBe(false);
    // Pinned as observed. abaplint infers p DECIMALS 0 for the product, so
    // the total is rounded; that is a separate finding, not this feature.
    expect(r.lines).toEqual([
      "Item:Widget",
      "Count:3",
      "Amount:19,99",
      "Total:60",
    ]);
  });
});

describe("buildRunnableJs: never worse than the transpiler alone", () => {
  it("returns the plain output untouched when nothing is declared at the top", async () => {
    const r = await build("REPORT ztest.\nDATA lv TYPE i.\nWRITE / lv.");
    expect(r.prologue).toBe("");
    expect(r.fellBack).toBe(false);
    expect(r.js.startsWith(r.raw)).toBe(true);
  });

  // Gate2: an unsupported type declares as a throw. Upstream only reaches it
  // on an executed path; moved to line 1 it would kill a working program.
  it("does not hoist a declaration that throws", async () => {
    const r = await run(`REPORT z.
WRITE / 'hello'.
IF 1 = 2.
  DATA(lv_d) = CONV decfloat16( '1.5' ).
ENDIF.
WRITE / 'end'.`);
    expect(r.lines).toEqual(["hello", "end"]);
    expect(r.prologue).not.toContain("typeTodo");
  });

  // Gate1 review: a declaration that collides with emitted JS is caught by
  // the compile check, and the plain output is used instead.
  it("falls back when a declaration collides with a local class", async () => {
    const r = await build(`REPORT ztest.
CLASS lcl DEFINITION.
ENDCLASS.
CLASS lcl IMPLEMENTATION.
ENDCLASS.
START-OF-SELECTION.
  DATA(lcl) = 1.`);
    expect(r.fellBack).toBe(true);
    expect(r.js.startsWith(r.raw)).toBe(true);
    expect(r.js).not.toContain(r.prologue);
  });

  // Gate3 (codex), input verbatim: `let undefined = ...` compiles fine and
  // silently redefines `undefined` for all generated code, so a failed ASSIGN
  // started to "succeed". Plain output prints 4.
  it("does not declare a name the generated code relies on: undefined", async () => {
    const source = `REPORT ztest.
DATA lt TYPE STANDARD TABLE OF i WITH DEFAULT KEY.
FIELD-SYMBOLS <fs> TYPE i.
IF 1 = 2.
  DATA(undefined) = 1.
ENDIF.
ASSIGN lt[ 1 ] TO <fs>.
WRITE / sy-subrc.`;
    const r = await run(source);
    expect(r.lines).toEqual(["4"]);
    expect(r.prologue).not.toMatch(/\blet undefined\b/);
  });

  it("does not declare a namespaced name it cannot escape", async () => {
    const r = await build("REPORT ztest.\nDATA(/abc/x) = 1.");
    expect(r.prologue).not.toContain("/abc/");
  });

  // Gate2: a LOOP nested in a top-level IF. Upstream declares its variable
  // inside the `if {}` block; declaring it again at the top would be shadowed
  // and a later read would print a stale value without any error. It stays
  // broken on purpose - do not "fix" it by removing Loop from the skip set.
  it("leaves a LOOP inside a top-level IF alone", async () => {
    const r = await build(`REPORT ztest.
DATA lt TYPE STANDARD TABLE OF i WITH DEFAULT KEY.
APPEND 5 TO lt.
IF 1 = 1.
  LOOP AT lt INTO DATA(ls).
  ENDLOOP.
ENDIF.
WRITE / ls.`);
    expect(r.prologue).not.toMatch(/\blet ls\b/);
    // Still the transpiler's own failure, unchanged - not a stale value.
    await expect(executeJs(prepareTranspiledJs(r.js))).rejects.toThrow(
      /ls is not defined/,
    );
  });
});
