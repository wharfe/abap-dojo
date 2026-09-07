import type { SyntaxRepair } from "../types/diagnostics";

/**
 * What to tell someone whose parse failed on punctuation from another
 * language.
 *
 * ## Why this is worded as a condition, not a diagnosis
 *
 * The search behind it proves that rewriting a double-quoted run as a text
 * literal makes abaplint stop complaining. It does NOT prove the user meant a
 * literal, and the two are separable — external review found a program where
 * they come apart:
 *
 *   CONCATENATE " explanatory note "
 *     'a' INTO result.
 *
 * The comment is correct ABAP; the real mistake is the missing second
 * operand. Rewriting the comment removes the error all the same, so the
 * search fires. Structurally that program is indistinguishable from
 * `WRITE "hello".` — in both, a quote swallows the rest of a statement and
 * rewriting it makes the statement parse — so no amount of parsing separates
 * them. Only intent does, and we do not have it.
 *
 * Deciding it from the shape of the line is exactly the design that was
 * rejected (see syntaxRepair.ts), so the hint is phrased to be harmless when
 * it is wrong instead: it says what happened (everything after the quote was
 * ignored — always true) and offers the fix conditionally. Someone who did
 * mean a comment reads "if you meant that as literal data" and moves on.
 *
 * Kept apart from App.tsx so the wording can be asserted in a test rather than
 * rendered to check it, and so there is one place to look when a second repair
 * kind is added. The exhaustive switch is the point: a new
 * `SyntaxRepairKind` fails the build here instead of reaching a user as an
 * error with no hint under it.
 *
 * Every string in this file is authored, never assembled from the user's
 * source — `line` is the only value that comes from them, and it is a number.
 *
 * Keep the prose clear of bare Tailwind utility names. `src/index.css` is a
 * plain `@import "tailwindcss"` with no `source(none)`, so v4 scans this file
 * for class candidates and an ordinary English word in a string counts: one
 * such word once cost 1.64 kB of production CSS (#44).
 */
export function repairHint(repair: SyntaxRepair): string {
  switch (repair.kind) {
    case "double_quote":
      return (
        `Hint: in ABAP a double quote begins a comment, so everything ` +
        `after it on line ${repair.line} was ignored. ` +
        `If you meant that as literal data rather than a comment, ` +
        `single quotes are what ABAP uses: WRITE 'hello'.`
      );
  }
}
