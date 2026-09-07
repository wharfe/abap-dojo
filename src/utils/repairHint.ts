import type { SyntaxRepair } from "../types/diagnostics";

/**
 * What to tell someone whose parse failed on punctuation from another
 * language.
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
        `For a piece of literal data, use single quotes: WRITE 'hello'.`
      );
  }
}
