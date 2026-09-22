/**
 * Find the declaration whose initial value was written with `=` (#85).
 *
 * The third search of this shape, after the double quote (syntaxRepair.ts)
 * and the statement ends (statementEndRepair.ts), and it exists for the
 * bucket those two leave dark. Measured 2026-09-08..21, `syntax_statement`
 * `DATA` was 66 `parser_error` events and **65 of them carried no
 * `syntax_repair` at all** — against `WRITE`, where 48 of 201 got a hint. The
 * statement ends cannot reach them: a declaration written by an LLM ends in a
 * period, so nothing about its punctuation is what failed.
 *
 * What failed is the initialiser. In most languages a typed declaration
 * initialises with `=`; ABAP spells that `VALUE`. (ABAP's own inline form,
 * `DATA(lv) = 5.`, does use `=` — which is why the hint below is careful not
 * to claim that `=` never initialises anything.)
 *
 *   DATA lv TYPE string = 'a'.     <- parser_error
 *   DATA lv TYPE string VALUE 'a'. <- parses
 *
 * ## It does not look for `DATA`, and the hint must not pretend it does
 *
 * Nothing here reads the leading keyword, on the same reasoning that keeps
 * syntaxRepair.ts from reading the line: the rewrite is proposed wherever an
 * error row holds an `=`, and abaplint decides. `CONSTANTS` and `CLASS-DATA`
 * take `VALUE` in the same position and are therefore repaired too — a
 * consequence of the rule, not a second rule.
 *
 * **A `FORM ... USING p = 1.` with its `ENDFORM.` is a third, and it is not a
 * declaration at all.** External review found it (2026-09-22): the original
 * reports `parser_error` on the FORM row plus `structure` on the ENDFORM, the
 * rewrite parses to zero errors, and strict acceptance passes. Without the
 * `ENDFORM.` the count cannot drop and nothing is accepted — so the shape
 * needs the whole subroutine, which is exactly how someone would write it. So the search fires on a subroutine definition, and any hint that
 * says "a declaration" would be a false statement about the program on
 * screen. That is why `repairHint` states only what was observed — after the
 * rewrite no error covers that row — and offers `DATA ... VALUE` as the
 * example rather than as the diagnosis. It does not say the program now
 * parses (an unrelated error elsewhere survives any of these rewrites) and it
 * does not say the `=` caused the error (the search tracks neither identity
 * nor cause). Narrowing the search to declarations
 * instead would mean reading the leading keyword, which is the design this
 * module exists to avoid.
 *
 * Measured 2026-09-22 over the shapes probed by hand — which is a list, not a
 * survey — the rewrite took each `=`-initialised declaration to zero errors
 * and fired on none of `lv = 5.`, `IF 1 = 1`, `let x = 1`,
 * `const o = { a: 1 }`, `f(a = 1)`, `SELECT ... WHERE x = 1`,
 * `DATA(lv) = 5.` (the inline declaration, which is correct ABAP and does
 * initialise with `=`), `METHODS m IMPORTING iv TYPE i = 1.` or
 * `PARAMETERS p TYPE i = 1.`, whether those parsed or not.
 *
 * ## Whitespace is normalised, not preserved
 *
 * The other searches keep the row's trailing whitespace because they edit its
 * end. This one edits the middle, so it replaces the run of spaces around the
 * `=` with a single space either side: `TYPE i=5` has to become
 * `TYPE i VALUE 5`, and splicing `VALUE` in without spaces would produce
 * `TYPE iVALUE5`. The candidate is never shown to the user — only the hint
 * and the row number are — so the reflow costs nothing.
 *
 * Only the FIRST `=` on a row is rewritten, which is what keeps
 * `DATA lv TYPE string = 'a = b'.` repairable: the one inside the literal is
 * left alone. There is no all-at-once candidate over a single row for the
 * same reason there is no attempt to find `=` outside a literal — that is the
 * lexer this module refuses to reimplement.
 */
import type { SyntaxRepair } from "../types/diagnostics";
import { MAX_CANDIDATES, MAX_SOURCE_CHARS } from "./syntaxRepair";
import {
  firstAccepted,
  rowsOf,
  type ErrorSpan,
  type TargetedCandidate,
} from "./strictAcceptance";

/**
 * The first `=` on the row, with whatever spacing around it — **except a
 * carriage return.**
 *
 * The source is split on `\n` alone, so under CRLF every row ends in `\r`.
 * A plain `\s` would match it, so a row whose `=` is its last non-blank
 * character (`DATA lv TYPE i =` / `  5.`) would have its `\r` eaten by the
 * rewrite and be rejoined with a bare `\n`. abaplint tolerates the mixed
 * ending today, so nothing is broken by it — but a dropped `\r` is the class
 * of bug that once silenced this whole feature for anyone pasting from a CRLF
 * editor (see the note in CLAUDE.md), and the sibling searches are written to
 * preserve it. `[^\S\r]` is "whitespace, but not a carriage return".
 */
const FIRST_ASSIGN = /[^\S\r]*=[^\S\r]*/;

export function valueAssignCandidates(
  source: string,
  spans: readonly ErrorSpan[],
): TargetedCandidate[] {
  if (source.length > MAX_SOURCE_CHARS) return [];

  const lines = source.split("\n");
  const eligible = (row: number): boolean =>
    row >= 1 && row <= lines.length && FIRST_ASSIGN.test(lines[row - 1]);
  const edit = (line: string): string => line.replace(FIRST_ASSIGN, " VALUE ");

  const rows = rowsOf(spans).filter(eligible);

  const candidates: TargetedCandidate[] = [];
  for (const row of rows) {
    if (candidates.length >= MAX_CANDIDATES) break;
    const edited = [...lines];
    edited[row - 1] = edit(lines[row - 1]);
    candidates.push({
      line: row,
      source: edited.join("\n"),
      targets: rowsOf(spans.filter((span) => span.start <= row && row <= span.end)),
    });
  }

  // One more with every eligible row rewritten, because a chained declaration
  // puts one `=` on each of its rows (`DATA: lv TYPE i = 1,` / `lw TYPE i = 2.`)
  // and abaplint does not stop reporting until the last is gone. It names no
  // row, for the reason the other two searches name none: the score says the
  // rewrite worked, never which of its edits mattered.
  //
  // **It is the one candidate that can outgrow the size cap, so it is
  // measured against it after the edit.** `MAX_SOURCE_CHARS` is checked on
  // the source, and this rewrite turns one character into seven on every
  // eligible row: 16,384 bytes of `=` on 8,192 rows becomes 65,536, exactly
  // 4.0x (measured 2026-09-22). The cap exists to bound how long one parse
  // freezes `lint`, and a parse of 64 kB is a different order of cost from a
  // parse of 16 kB (1,249 ms against 120 ms on one shape — see CLAUDE.md), so
  // letting this through would spend the budget the cap was protecting. The
  // per-row candidates rewrite one `=` and so run six bytes over their
  // source, which is noise against a parse rather than a change of order;
  // the sibling searches append at most one character per row. Only this
  // candidate can multiply.
  if (rows.length > 1) {
    const edited = [...lines];
    for (const row of rows) edited[row - 1] = edit(lines[row - 1]);
    const source = edited.join("\n");
    if (source.length <= MAX_SOURCE_CHARS) {
      const touched = spans.filter((span) =>
        rows.some((row) => span.start <= row && row <= span.end),
      );
      candidates.push({ source, targets: rowsOf(touched) });
    }
  }

  return candidates;
}

/**
 * Precondition: `spans` must be EVERY Error-severity span of the original
 * parse — the baseline count a candidate is judged against is `spans.length`,
 * so a subset lowers the bar and makes the search accept a worse candidate.
 */
export async function findValueAssignRepair(
  source: string,
  spans: readonly ErrorSpan[],
  errorSpansIn: (candidate: string) => Promise<ErrorSpan[]>,
): Promise<SyntaxRepair | undefined> {
  if (spans.length === 0) return undefined;

  const accepted = await firstAccepted(
    valueAssignCandidates(source, spans),
    spans.length,
    errorSpansIn,
  );
  if (accepted === undefined) return undefined;
  return accepted.line === undefined
    ? { kind: "data_value_assign" }
    : { kind: "data_value_assign", line: accepted.line };
}
