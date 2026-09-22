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
 * What failed is the initialiser. In most languages a declaration initialises
 * with `=`; ABAP spells that `VALUE`, and `=` is a syntax error there rather
 * than a style choice:
 *
 *   DATA lv TYPE string = 'a'.     <- parser_error
 *   DATA lv TYPE string VALUE 'a'. <- parses
 *
 * ## It does not look for `DATA`
 *
 * Nothing here reads the leading keyword, on the same reasoning that keeps
 * syntaxRepair.ts from reading the line: the rewrite is proposed wherever an
 * error row holds an `=`, and abaplint decides. `CONSTANTS` and `CLASS-DATA`
 * take `VALUE` in the same position and are therefore repaired too — a
 * consequence of the rule, not a second rule. Measured 2026-09-22, the
 * rewrite moved every declaration shape to zero errors and fired on none of
 * `lv = 5.`, `IF 1 = 1`, `let x = 1`, `const o = { a: 1 }`, `f(a = 1)` or
 * `SELECT ... WHERE x = 1`, whether those parsed or not.
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

/** The first `=` on the row, with whatever spacing around it. */
const FIRST_ASSIGN = /\s*=\s*/;

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
  if (rows.length > 1) {
    const edited = [...lines];
    for (const row of rows) edited[row - 1] = edit(lines[row - 1]);
    const touched = spans.filter((span) =>
      rows.some((row) => span.start <= row && row <= span.end),
    );
    candidates.push({ source: edited.join("\n"), targets: rowsOf(touched) });
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
