import { describe, it, expect } from "vitest";
import { Buffer } from "buffer";
(globalThis as unknown as { Buffer: typeof Buffer }).Buffer = Buffer;

import { Config, Registry, MemoryFile, type Issue } from "@abaplint/core";
import { config as transpilerConfig } from "@abaplint/transpiler";
import {
  errorCounter,
  statementScorer,
  doubleQuoteCandidates,
  findSyntaxRepair,
  findSilentLoss,
} from "./syntaxRepair";
import { repairHint, silentLossHint } from "../utils/repairHint";
import { sanitizeParams } from "../utils/analytics";

/**
 * The same construction abaplintWorker.ts uses, from the same imported
 * `transpilerConfig`. The syntax version is `open-abap`, not 7.02, and the
 * distinction matters here: several of the counterexamples below are 7.40
 * syntax that a 7.02 configuration would reject for unrelated reasons, which
 * would make them pass this file while proving nothing.
 */
const config = new Config(JSON.stringify(transpilerConfig));
const errorsIn = errorCounter(config, "ztest.prog.abap");

/** Search the way the worker does: count the source, then look for better. */
async function repairOf(source: string) {
  const before = await errorsIn(source);
  return findSyntaxRepair(source, before, errorsIn);
}

const scoreIn = statementScorer(config, "ztest.prog.abap");

/**
 * Search the way the worker does on the branch where abaplint said nothing,
 * and unwrap to the finding. Tests that care about the difference between "ran
 * and found nothing" and "gave up" call `findSilentLoss` directly.
 */
async function silentLossOf(source: string) {
  const search = await findSilentLoss(source, await scoreIn(source), scoreIn);
  return search.completed ? search.loss : undefined;
}

/** The Error-severity issues abaplint reports, for asserting on their keys. */
async function errorsOf(source: string): Promise<readonly Issue[]> {
  const registry = new Registry(config);
  registry.addFile(new MemoryFile("ztest.prog.abap", source));
  await registry.parseAsync();
  return registry
    .findIssues()
    .filter((issue) => issue.getSeverity().toString() === "Error");
}

describe("doubleQuoteCandidates", () => {
  it("rewrites one line per candidate, in row order", () => {
    const source = `REPORT z.\nWRITE "a".\nWRITE "b".`;
    expect(doubleQuoteCandidates(source).slice(0, 2)).toEqual([
      { line: 2, source: `REPORT z.\nWRITE 'a'.\nWRITE "b".` },
      { line: 3, source: `REPORT z.\nWRITE "a".\nWRITE 'b'.` },
    ]);
  });

  it("doubles an apostrophe inside the rewritten text", () => {
    // `WRITE 'it's here'.` does not parse, so without this the one user whose
    // string contains an apostrophe is the one who gets no hint.
    expect(doubleQuoteCandidates(`WRITE "it's here".`)[0].source).toBe(
      `WRITE 'it''s here'.`,
    );
  });

  it("takes the first pair on a line for the single-line candidate", () => {
    expect(doubleQuoteCandidates(`WRITE "a" && "b".`)[0].source).toBe(
      `WRITE 'a' && "b".`,
    );
  });

  it("rewrites every pair on a line for the all-at-once candidate", () => {
    // A line can be wrong twice. Fixing one half leaves the parse exactly as
    // broken, so a candidate that stopped at the first pair could never score
    // better and `WRITE "a" && "b".` was unreachable.
    const candidates = doubleQuoteCandidates(`WRITE "a" && "b".`);
    expect(candidates.at(-1)).toEqual({ source: `WRITE 'a' && 'b'.` });
  });

  it("ignores a line with an unpaired quote", () => {
    expect(doubleQuoteCandidates(`WRITE "a.`)).toEqual([]);
  });

  it("stops at the budget rather than parsing the whole file again", () => {
    const source = Array.from({ length: 40 }, (_, i) => `WRITE "${i}".`).join(
      "\n",
    );
    // Ten one-line candidates plus the everything-at-once one.
    expect(doubleQuoteCandidates(source)).toHaveLength(11);
  });

  it("adds an everything-at-once candidate, last, and with no line", () => {
    const candidates = doubleQuoteCandidates(`WRITE "a".\nWRITE "b".`);
    expect(candidates).toHaveLength(3);
    expect(candidates.at(-1)).toEqual({ source: `WRITE 'a'.\nWRITE 'b'.` });
  });

  it("never names a row on the everything-at-once candidate", () => {
    // The row it would name is the first quoted line in the FILE, which need
    // not be one the rewrite fixed: a correct comment above the real mistake
    // takes that slot. Reported as no row rather than as the wrong one.
    const candidates = doubleQuoteCandidates(
      `* harmless "note" here\nWRITE "hello".\nWRITE "world".`,
    );
    expect(candidates.at(-1)?.line).toBeUndefined();
  });

  it("adds no everything-at-once candidate when there is only one pair", () => {
    expect(doubleQuoteCandidates(`WRITE "a".\nWRITE 'b'.`)).toHaveLength(1);
  });

  it("finds pairs on CRLF lines", () => {
    // `.` does not match `\r`, and the source is split on `\n` alone, so a
    // tail of `.*$` matched nothing under CRLF and the feature was silent for
    // anyone pasting from an editor that uses it — no error, nothing to see.
    expect(doubleQuoteCandidates(`REPORT z.\r\nWRITE "a".\r\n`)).toEqual([
      { line: 2, source: `REPORT z.\r\nWRITE 'a'.\r\n` },
    ]);
  });

  it("does not search a source too large to search cheaply", () => {
    // Each candidate re-parses the whole program, so the candidate cap bounds
    // the parses and not the work. The 20s watchdog ends the display without
    // interrupting this worker, so an unbounded search outlives the run it
    // belonged to.
    const huge = `WRITE "a".\n`.repeat(10_000);
    expect(huge.length).toBeGreaterThan(64 * 1024);
    expect(doubleQuoteCandidates(huge)).toEqual([]);
  });
});

describe("findSyntaxRepair search", () => {
  it("reports nothing when the source had no error to improve on", async () => {
    const never = () => Promise.reject(new Error("must not re-parse"));
    expect(await findSyntaxRepair(`WRITE "a".`, 0, never)).toBeUndefined();
  });

  it("reports the line of the first candidate that scores better", async () => {
    const source = `WRITE "a".\nWRITE "b".\nWRITE "c".`;
    const scores = new Map([
      [`'a'`, 2],
      [`'b'`, 1],
      [`'c'`, 0],
    ]);
    const stub = (candidate: string) =>
      Promise.resolve(
        [...scores].find(([mark]) => candidate.includes(mark))?.[1] ?? 2,
      );
    expect(await findSyntaxRepair(source, 2, stub)).toEqual({
      kind: "double_quote",
      line: 2,
    });
  });

  it("reports nothing when no candidate scores better", async () => {
    const same = () => Promise.resolve(2);
    expect(await findSyntaxRepair(`WRITE "a".`, 2, same)).toBeUndefined();
  });

  it("reports nothing rather than letting a re-parse throw escape", async () => {
    // Candidates are source this module mangled on purpose, so they reach the
    // parser in shapes the user's text never would. A throw escaping here
    // would be caught by handleTranspile's own catch, which would replace a
    // correct `syntax_error` with a `transpile_error` — the split CLAUDE.md
    // calls load-bearing, corrupted by the code meant to explain it.
    const throws = () => Promise.reject(new Error("parser blew up"));
    await expect(
      findSyntaxRepair(`WRITE "a".`, 1, throws),
    ).resolves.toBeUndefined();
  });
});

/**
 * abaplint is the judge, so these are the cases that decide whether the
 * feature is right. Each `quiet` case is a counterexample that a line-scanning
 * implementation gets wrong — they are the reason this module re-parses
 * instead of reading the source, and they must keep passing for that reason
 * and not by accident.
 */
describe("findSyntaxRepair against the real parser", () => {
  it("finds a misused quote on the last line", async () => {
    expect(await repairOf(`REPORT z.\nWRITE 'ok'.\nWRITE "hello".`)).toEqual({
      kind: "double_quote",
      line: 3,
    });
  });

  it("covers both keys the same mistake lands in", async () => {
    // The claim the design rests on: one mistake, two abaplint verdicts,
    // decided by whether a statement follows it. Asserted as keys rather than
    // left to a comment, because if abaplint ever files both under one key the
    // behavioural tests stay green while this coverage quietly disappears.
    const last = await errorsOf(`REPORT z.\nWRITE "hello".`);
    const followed = await errorsOf(`REPORT z.\nWRITE "hello".\nWRITE 'ok'.`);
    expect(last.map((i) => i.getKey())).toContain("parser_error");
    expect(followed.map((i) => i.getKey())).toContain("check_syntax");
    // ...and the second is reported on row 3, which the user did not mistype.
    expect(followed[0].getStart().getRow()).toBe(3);
  });

  it("finds one that abaplint reported on a later row", async () => {
    // The comment swallows the rest of row 2, so abaplint joins row 3 onto it
    // and reports `check_syntax` there. Anchoring to the error's own row would
    // point at a line the user did not mistype.
    expect(await repairOf(`REPORT z.\nWRITE "hello".\nWRITE 'ok'.`)).toEqual({
      kind: "double_quote",
      line: 2,
    });
  });

  it("finds two misused quotes on adjacent lines", async () => {
    // abaplint collapses consecutive swallowed statements into ONE error, so
    // no single-line edit lowers the count here and only the
    // everything-at-once candidate reaches it. This is the commonest shape in
    // pasted LLM output, not an edge case.
    expect(
      await repairOf(`REPORT z.\nWRITE "hello".\nWRITE "world".`),
    ).toEqual({ kind: "double_quote" });
  });

  it("finds two misused quotes on one line", async () => {
    // Both halves are wrong; fixing either alone leaves the parse broken, so
    // only the all-at-once candidate reaches it — and it cannot name a row.
    expect(await repairOf(`REPORT z.\nWRITE "a" && "b".`)).toEqual({
      kind: "double_quote",
    });
  });

  it("names no row when a harmless comment holds the first quote", async () => {
    // The row the all-at-once candidate would have named is the comment's.
    expect(
      await repairOf(
        `REPORT z.\n* harmless "note" here\nWRITE "hello".\nWRITE "world".`,
      ),
    ).toEqual({ kind: "double_quote" });
  });

  it("finds a misused quote in a program pasted with CRLF", async () => {
    expect(await repairOf(`REPORT z.\r\nWRITE "hello".`)).toEqual({
      kind: "double_quote",
      line: 2,
    });
  });

  it("finds one in a program with no REPORT line", async () => {
    expect(await repairOf(`WRITE "hello".`)).toEqual({
      kind: "double_quote",
      line: 1,
    });
  });

  it("cannot reach a comment that ate a chained operand (#68)", async () => {
    // Both of these parse, run, and print less than the user wrote:
    // the first prints nothing, the second prints `a` and drops `b`. abaplint
    // reports no error at all, so there is no score for a repair to improve
    // and this module is structurally unable to help — see #68, which needs a
    // signal that is not an error count. Pinned so the limit stays a decision
    // rather than a surprise to whoever reads the hint and expects it here.
    expect(await repairOf(`REPORT z.\nWRITE: "hello".`)).toBeUndefined();
    expect(await repairOf(`REPORT z.\nWRITE: 'a', "b".`)).toBeUndefined();
  });

  it("repairs a string that contains an apostrophe", async () => {
    expect(await repairOf(`REPORT z.\nWRITE "it's here".`)).toEqual({
      kind: "double_quote",
      line: 2,
    });
  });

  it("keeps quiet on a correct end-of-line comment", async () => {
    expect(await repairOf(`REPORT z.\nWRITE 'a'. " note`)).toBeUndefined();
  });

  it("keeps quiet on a correct full-line comment", async () => {
    expect(
      await repairOf(`REPORT z.\n* he said "hello" here\nWRITE 'a'.`),
    ).toBeUndefined();
  });

  it("keeps quiet on a comment holding an apostrophe and a quote", async () => {
    // The apostrophe opens no literal, so a scanner that strips `'...'` first
    // leaves the `"` exposed and warns about correct ABAP.
    expect(
      await repairOf(`REPORT z.\n* don't use "x" here\nWRITE 'a'.`),
    ).toBeUndefined();
  });

  it("keeps quiet on a string template containing quotes", async () => {
    expect(await repairOf(`REPORT z.\nWRITE |He said "hi"|.`)).toBeUndefined();
  });

  it("keeps quiet on a comment inside a multi-line statement", async () => {
    expect(
      await repairOf(`REPORT z.\nDATA lv TYPE i.\nlv = 1 " the first\n  + 2.`),
    ).toBeUndefined();
  });

  it("keeps quiet when an unrelated error is what failed the run", async () => {
    // `STRING_TABLE` is absent from open-abap-core, so an ordinary program can
    // carry an Error-severity issue while parsing perfectly. An
    // "are there errors?" gate would open here and warn about the comment.
    expect(
      await repairOf(
        `REPORT z.\nDATA lt TYPE STRING_TABLE.\n* he said "hello"\nWRITE 'a'.`,
      ),
    ).toBeUndefined();
  });

  /**
   * The cases above where the program is otherwise correct never reach the
   * re-parse: they have no error at all, and `findSyntaxRepair` returns early.
   * These do. A broken program that also contains an ordinary comment is the
   * common shape — `syntax_error` is around 30% of all runs — and it is the
   * only shape where the choice between judging by re-parse and judging by
   * reading the line is observable. Deleting these leaves the design
   * untested.
   */
  describe("with an unrelated error also present", () => {
    const broken = (line: string) =>
      `REPORT z.\nDATA lt TYPE STRING_TABLE.\n${line}\nWRITE 'b'.`;

    it("keeps quiet on an end-of-line comment holding a pair", async () => {
      expect(await repairOf(broken(`WRITE 'a'. " note "x" here`))).toBeUndefined();
    });

    it("keeps quiet on a full-line comment holding a pair", async () => {
      expect(await repairOf(broken(`* he said "hello" here`))).toBeUndefined();
    });

    it("keeps quiet on a string template holding a pair", async () => {
      expect(await repairOf(broken(`WRITE |He said "hi"|.`))).toBeUndefined();
    });

    it("still finds a misused quote", async () => {
      expect(await repairOf(broken(`WRITE "hello".`))).toEqual({
        kind: "double_quote",
        line: 3,
      });
    });
  });

  it("fires on a correct comment when rewriting it happens to fix the parse", async () => {
    // Found by external review. The comment is correct ABAP; the real mistake
    // is CONCATENATE's missing second operand. Rewriting the comment removes
    // the error anyway, so the search fires — and it is structurally the same
    // program as `WRITE "hello".`, so no parse separates them. Pinned as the
    // accepted limit rather than left to be rediscovered: what makes it
    // tolerable is repairHint's wording, which offers the fix conditionally
    // instead of asserting the user meant a literal.
    expect(
      await repairOf(
        `REPORT z.\nDATA result TYPE string.\nCONCATENATE " explanatory note "\n  'a' INTO result.`,
      ),
    ).toEqual({ kind: "double_quote", line: 3 });
  });

  /**
   * The rewrite-everything candidate is the newest and least constrained part
   * of the search — it changes several places at once, so it has the widest
   * surface for firing on something that was never wrong. These are the
   * shapes that surface asks for.
   */
  describe("the rewrite-everything candidate does not widen what fires", () => {
    it("keeps quiet on an odd number of quotes", async () => {
      expect(await repairOf(`REPORT z.\nWRITE "a" "b" "c".`)).toBeUndefined();
    });

    it("keeps quiet on a double quote inside a text literal", async () => {
      expect(
        await repairOf(
          `REPORT z.\nDATA lt TYPE STRING_TABLE.\nWRITE 'he said "hi" ok'.`,
        ),
      ).toBeUndefined();
    });

    it("keeps quiet when rewriting everything makes the parse worse", async () => {
      expect(
        await repairOf(
          `REPORT z.\nWRITE 'a'. " note "x" and "y"\nFROBNICATE q.`,
        ),
      ).toBeUndefined();
    });

    it("keeps quiet on two correct comments beside an unrelated error", async () => {
      // Two quoted lines, so the candidate exists; an unrelated error, so the
      // search actually runs. Both conditions are needed to exercise it.
      expect(
        await repairOf(
          `REPORT z.\nDATA lt TYPE STRING_TABLE.\n* note "a"\n* note "b"\nWRITE 'ok'.`,
        ),
      ).toBeUndefined();
    });
  });

  it("keeps quiet on a program that parses", async () => {
    expect(await repairOf(`REPORT z.\nWRITE 'a'.`)).toBeUndefined();
  });

  it("keeps quiet on a correct comment that holds a quoted pair", async () => {
    // The repair would remove the end-of-line comment entirely, which is the
    // way a plain error count could reward an edit that fixes nothing.
    expect(
      await repairOf(`REPORT z.\nWRITE 'a'. " see "x" now`),
    ).toBeUndefined();
    expect(
      await repairOf(`REPORT z.\n* use "a" or "b"\nWRITE 'a'.`),
    ).toBeUndefined();
  });
});

describe("repairHint", () => {
  it("names the row the edit belongs on", () => {
    expect(repairHint({ kind: "double_quote", line: 7 })).toContain("line 7");
  });

  it("omits the row when the search cannot justify one", () => {
    const hint = repairHint({ kind: "double_quote" });
    expect(hint).not.toContain("line");
    expect(hint).toContain("everything after it was ignored");
  });

  it("offers the fix as a condition, never as a diagnosis of intent", () => {
    // The search cannot prove the user meant a literal (see the header of
    // repairHint.ts), so the wording has to stay conditional. A rewrite to
    // "use single quotes" would read as a verdict on a program where the
    // comment was correct all along.
    expect(repairHint({ kind: "double_quote", line: 1 })).toContain(
      "If you meant that as literal data",
    );
  });
});

describe("syntax_repair as a parameter", () => {
  it("survives sanitizing on a syntax_error", () => {
    expect(
      sanitizeParams("run_result", {
        outcome: "syntax_error",
        duration_ms: 1,
        output_lines: 0,
        syntax_repair: "double_quote",
      }),
    ).toMatchObject({ syntax_repair: "double_quote" });
  });

  it("is stripped from any other outcome", () => {
    expect(
      sanitizeParams("run_result", {
        outcome: "success",
        duration_ms: 1,
        output_lines: 0,
        syntax_repair: "double_quote",
      }),
    ).not.toHaveProperty("syntax_repair");
  });
});

describe("findSilentLoss", () => {
  // The whole point of this branch: abaplint reports NOTHING for these, so
  // there is no error count for the #69 search to improve on. Every source
  // here parses cleanly and runs; what is lost is output the user asked for.
  it("finds the operand a comment ate out of a one-item chain", async () => {
    expect(await silentLossOf(`REPORT z.\nWRITE: "hello".`)).toEqual({
      kind: "double_quote",
      line: 2,
    });
  });

  it("finds a lost operand even when the rest of the chain still prints", async () => {
    // `a` is written and `b` is not. Nothing on screen says so, which is why
    // "the run produced no output" cannot be the trigger for this search.
    expect(await silentLossOf(`REPORT z.\nWRITE: 'a', "b".`)).toEqual({
      kind: "double_quote",
      line: 2,
    });
  });

  it("follows a chain across lines", async () => {
    expect(await silentLossOf(`REPORT z.\nWRITE: 'a',\n       "b".`)).toEqual({
      kind: "double_quote",
      line: 3,
    });
  });

  it("finds the loss when the chain keyword is alone on its own line", async () => {
    // An ordinary ABAP layout, and the textbook shape of the bug: the FIRST
    // operand is the quoted one, so no statement survives to end in a comma.
    expect(await silentLossOf(`REPORT z.\nWRITE:\n  "a",\n  'b'.`)).toEqual({
      kind: "double_quote",
      line: 3,
    });
  });

  it("finds the loss when a comment line sits inside the chain", async () => {
    expect(
      await silentLossOf(`REPORT z.\nWRITE: 'a',\n" a note\n       "b".`),
    ).toBeDefined();
  });

  it("reports no row when only the all-at-once rewrite reaches it", async () => {
    // One operand, two pairs. Fixing either half alone leaves the expression
    // broken (`WRITE: 'a' &&` does not parse), so the single-line candidates
    // both score worse and only the combined rewrite scores better. The row
    // is dropped for the same reason it is in the #69 search: the score
    // credits no single edit.
    expect(await silentLossOf(`REPORT z.\nWRITE: "a" && "b".`)).toEqual({
      kind: "double_quote",
    });
  });

  // Correct ABAP. Each of these holds a `"..."` pair, so each one COSTS a
  // re-parse and has to lose it.
  it.each([
    [`a full-line comment`, `REPORT z.\n* he said "hello" here\nWRITE 'a'.`],
    [`a commented-out line`, `REPORT z.\n" WRITE "hello".\nWRITE 'a'.`],
    [`an end-of-line comment`, `REPORT z.\nWRITE 'a'. " note "x" here`],
    [`a string template`, `REPORT z.\nWRITE |He said "hi"|.`],
    [
      `ABAPDoc`,
      `CLASS zcl_x DEFINITION PUBLIC.\n  PUBLIC SECTION.\n` +
        `    "! <p class="shorttext synchronized">does a thing</p>\n` +
        `    METHODS m.\nENDCLASS.\n` +
        `CLASS zcl_x IMPLEMENTATION.\n  METHOD m.\n  ENDMETHOD.\nENDCLASS.`,
    ],
  ])("keeps quiet on %s", async (_name, source) => {
    expect(await silentLossOf(source)).toBeUndefined();
  });

  // The reach of the search is "an operand where a text literal is legal", and
  // these are outside it: `'lv2 TYPE i'` is not a declaration. They are here so
  // that the limit is a fixed, visible fact rather than something a future
  // reader assumes was covered.
  it.each([
    [`a DATA chain`, `REPORT z.\nDATA: lv1 TYPE i, "lv2 TYPE i".`],
    [`a CLEAR chain`, `REPORT z.\nDATA lv TYPE i.\nCLEAR: lv, "lv".`],
  ])("cannot reach %s, and says nothing rather than guessing", async (_n, source) => {
    expect(await silentLossOf(source)).toBeUndefined();
  });

  it("reports an abandoned search as incomplete, not as a clean result", async () => {
    // The worker sets `silentLossChecked` before calling this, so a search
    // that gave up has to say so: otherwise App reports `silent_loss: "none"`
    // — "we looked and found nothing" — for a search that never finished, and
    // the denominator the parameter exists for is quietly wrong.
    const throwing = async () => {
      throw new Error("boom");
    };
    await expect(
      findSilentLoss(`REPORT z.\nWRITE: "hello".`, { errors: 0, real: 1 }, throwing),
    ).resolves.toEqual({ completed: false });
  });

  it("swallows a parse failure rather than letting it out", async () => {
    // The worker wraps this call in the same try whose catch reports a
    // `transpile_error`. A throw escaping here would turn a program that
    // parses AND transpiles into a transpile failure with a bogus diagnosis —
    // the exact accident findSyntaxRepair is written to avoid one branch over.
    const throwing = async () => {
      throw new Error("boom");
    };
    await expect(
      findSilentLoss(`REPORT z.\nWRITE: "hello".`, { errors: 0, real: 1 }, throwing),
    ).resolves.not.toThrow();
  });

  it("reports a source too large to search as not searched", async () => {
    // `doubleQuoteCandidates` returns nothing above its size cap, which makes
    // the loop below it indistinguishable from a clean sweep. Reported as
    // `none`, a paste nobody looked at would count as a paste with no problem.
    const huge = `REPORT z.\nWRITE: "hello".\n` + `" pad "x"\n`.repeat(9000);
    expect(huge.length).toBeGreaterThan(64 * 1024);
    await expect(
      findSilentLoss(huge, { errors: 0, real: 1 }, scoreIn),
    ).resolves.toEqual({ completed: false });
  });

  it("misses a loss on a line whose literal also holds double quotes", async () => {
    // A gap, recorded rather than fixed: the single-line candidate rewrites
    // the FIRST pair, which here is the one inside `'he said "hi"'`, breaking
    // the literal; the all-at-once candidate breaks it too. Neither scores
    // better, so the real loss (`"b"`) goes unreported. It fails silent rather
    // than wrong, which is this module's stated preference — but the reach
    // limits are documented as a fixed list, so this belongs on it.
    expect(await silentLossOf(`REPORT z.\nWRITE: 'he said "hi"', "b".`)).toBeUndefined();
  });
});

describe("silentLossHint", () => {
  it("names the row when the search can justify one", () => {
    expect(silentLossHint({ kind: "double_quote", line: 4 })).toContain("line 4");
  });

  it("omits the row when it cannot", () => {
    expect(silentLossHint({ kind: "double_quote" })).not.toContain("line");
  });

  it("makes the claim that something did not run conditional, never flat", () => {
    // External review found this program, and the finding survives: it is not
    // correct ABAP (the comment eats the period, so the chain is never closed
    // — the parsed statement is `WRITE 'a',`), but nothing the user wanted was
    // lost either, and the search fires on it all the same:
    //
    //   REPORT z.
    //   WRITE: 'a', " note for maintainers".
    //
    // Structurally that is `WRITE: 'a', "b".` — a quote swallows the tail of a
    // chain and rewriting it recovers an operand — so no amount of parsing
    // separates them; only intent does, and we do not have it. Same shape as
    // the CONCATENATE misfire documented for repairHint. So the sentence that
    // something did not run has to be governed by "if you meant that as data",
    // or the hint asserts a fact about a program where it is false.
    const hint = silentLossHint({ kind: "double_quote" });
    const claim = hint.indexOf("never ran");
    const condition = hint.indexOf("If you meant");
    expect(claim).toBeGreaterThan(-1);
    expect(condition).toBeGreaterThan(-1);
    expect(condition).toBeLessThan(claim);
  });

  it("states the part that is true whatever the user meant", () => {
    expect(silentLossHint({ kind: "double_quote" })).toContain(
      "was read as a comment",
    );
  });

  it("offers the fix as a condition, never as a diagnosis of intent", () => {
    expect(silentLossHint({ kind: "double_quote" })).toContain(
      "If you meant that as literal data",
    );
  });
});

describe("silent_loss as a parameter", () => {
  it("survives sanitizing on a success, which is the outcome it exists for", () => {
    expect(
      sanitizeParams("run_result", {
        outcome: "success",
        duration_ms: 1,
        output_lines: 0,
        silent_loss: "double_quote",
      }),
    ).toMatchObject({ silent_loss: "double_quote" });
  });

  it("carries `none` so that 'nothing found' and 'never looked' stay apart", () => {
    expect(
      sanitizeParams("run_result", {
        outcome: "success",
        duration_ms: 1,
        output_lines: 0,
        silent_loss: "none",
      }),
    ).toMatchObject({ silent_loss: "none" });
  });

  it("drops a value outside the enum", () => {
    expect(
      sanitizeParams("run_result", {
        outcome: "success",
        duration_ms: 1,
        output_lines: 0,
        silent_loss: "ZSECRET" as never,
      }),
    ).not.toHaveProperty("silent_loss");
  });
});
