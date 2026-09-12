// The two caps that bound every re-parse search. They live in a file with no
// imports because e2e/syntaxHint.spec.ts reads MAX_SOURCE_CHARS too, and
// importing syntaxRepair.ts from a Playwright spec would pull @abaplint/core
// (2.7 MB) into the test runner. Their rationale is on the re-exports in
// syntaxRepair.ts, next to the code that obeys them.
export const MAX_CANDIDATES = 10;
export const MAX_SOURCE_CHARS = 16 * 1024;
