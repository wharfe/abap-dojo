// src/workers/structureExplanation.ts
//
// abaplint's structure pass reports two of its three messages at (1,1)
// whatever line the mistake is on (`structure_parser.js` `runFile`: the
// `result.error` branch builds the Issue at `new Position(1, 1)`). Shown as
// is, every one of them tells the user the problem is on line 1. Measured
// 2026-09-23..10-12 that was 25.7% of `syntax_error` runs (#72).
//
// The explanation names no block on purpose. The statement in the message is
// the one the matcher was waiting for when it gave up, which is the OUTER
// block's closer, not the open one's: a missing ENDIF inside a METHOD reports
// `Expected ENDMETHOD`, and a FORM inside an IF reports `Expected ENDIF` with
// every IF closed. A text that named a block would be wrong on the commonest
// shape LLM output takes, so it lists the possibilities instead.
//
// Display only. Analytics keep reading the original Issue, so `syntax_key`
// still reports `structure` and nothing about what is counted changes.

const EXPECTED = /^Expected [A-Z]+$/;
const UNEXPECTED_STRUCTURE = "Unexpected code structure";

const EXPLANATION =
  "abaplint could not match the program's block structure, and it does not " +
  "say where the problem is, so no line is given. Usually a block opened earlier " +
  "is not closed (IF, LOOP, METHOD, CLASS, BEGIN OF, or a SELECT without " +
  "SINGLE or INTO TABLE, which loops until ENDSELECT), a statement appears " +
  "where its block does not allow it, or a statement ran on past its line " +
  '(in ABAP a " starts a comment). If other errors are listed, fix those ' +
  "first: this one is often a consequence of them.";

/**
 * The text to show in place of a structure issue's message, or `null` when
 * the issue is not one of the two that abaplint pins to (1,1).
 *
 * The position is part of the test, not just the message: if abaplint ever
 * starts reporting where the problem really is, this stops rewriting and the
 * real line comes back on its own.
 */
export function explainStructureIssue(
  key: string,
  message: string,
  row: number,
  col: number,
): string | null {
  if (key !== "structure" || row !== 1 || col !== 1) return null;
  if (!EXPECTED.test(message) && message !== UNEXPECTED_STRUCTURE) return null;
  return `${message}. ${EXPLANATION}`;
}
