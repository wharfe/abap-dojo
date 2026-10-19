// src/workers/structureExplanation.ts
//
// abaplint's structure pass reports two of its three messages at (1,1)
// whatever line the mistake is on (`structure_parser.js` `runFile`: the
// `result.error` branch builds the Issue at `new Position(1, 1)`). Shown as
// is, every one of them tells the user the problem is on line 1. Measured
// 2026-09-23..10-12 that was 25.7% of `syntax_error` runs (#72).
//
// The statement in the message is the one the matcher was waiting for when it
// gave up, which is the OUTER block's closer, not the open one's: a missing
// ENDIF inside a METHOD reports `Expected ENDMETHOD`, and a FORM inside an IF
// reports `Expected ENDIF` with every IF closed. So the block that is actually
// open comes from a separate walk over the parsed statements
// (`src/workers/openBlock.ts`), and only when that walk finds one does the
// text name a block and a line. When it finds nothing, the generic text below
// lists the possibilities and names no line: a confident wrong line is worse
// than none.
//
// Display only. Analytics keep reading the original Issue, so `syntax_key`
// still reports `structure` and nothing about what is counted changes.

import { describeOpenBlock, type OpenBlockFinding } from "./openBlock";

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

export interface StructureExplanation {
  /** The text to show in place of abaplint's message. */
  text: string;
  /**
   * Where the open block starts, when the walk found one. Absent, the
   * position is unknown and the caller must not point at a line.
   */
  at?: { row: number; col: number };
}

/**
 * The text to show in place of a structure issue's message, or `null` when
 * the issue is not one of the two that abaplint pins to (1,1).
 *
 * The position is part of the test, not just the message: if abaplint ever
 * starts reporting where the problem really is, this stops rewriting and the
 * real line comes back on its own.
 *
 * `finding` is the walk's answer for this program (null when it found
 * nothing, or was not run). It is used for `Expected <X>` only:
 * `Unexpected code structure` says nothing about a closer, so a block named
 * under it would be a guess.
 */
export function explainStructure(
  key: string,
  message: string,
  row: number,
  col: number,
  finding: OpenBlockFinding | null = null,
): StructureExplanation | null {
  if (key !== "structure" || row !== 1 || col !== 1) return null;
  if (!EXPECTED.test(message) && message !== UNEXPECTED_STRUCTURE) return null;
  if (finding !== null && EXPECTED.test(message)) {
    const detail = describeOpenBlock(finding);
    if (detail !== null) {
      return {
        text: `${message}. ${detail}`,
        at: { row: finding.block.row, col: finding.block.col },
      };
    }
  }
  return { text: `${message}. ${EXPLANATION}` };
}

/** `explainStructure(...)?.text`, for callers that only need the words. */
export function explainStructureIssue(
  key: string,
  message: string,
  row: number,
  col: number,
  finding: OpenBlockFinding | null = null,
): string | null {
  return explainStructure(key, message, row, col, finding)?.text ?? null;
}
