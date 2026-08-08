// src/types/diagnostics.ts
//
// The transpile-failure vocabulary, kept free of any @abaplint import on
// purpose: `src/utils/analytics.ts` needs these values to declare its allowlist,
// and analytics is reachable from the entry chunk. The classifier that maps a
// message onto them lives in src/workers/transpileDiagnostics.ts, where
// @abaplint/core is already loaded.

/**
 * Why a transpile failed, at the coarsest granularity that still separates
 * "ABAP we have not built yet" from "we have a bug". Derived by classifying
 * every message @abaplint/transpiler can *throw*, not by invention.
 *
 * - `unsupported_statement` / `unsupported_expression`
 *      a specific AST node has no transpiler — `node` names which one
 * - `not_implemented`  a feature marked "not supported" or "todo" in-tree
 * - `unknown_type`     a type the registry could not resolve
 * - `internal`         "internal error", "unexpected", a node that was undefined
 * - `other`            matched nothing above; a bucket to watch, not to ignore
 *
 * The set covers transpile-*time* throws only, which is a smaller share of
 * "ABAP we cannot run" than it looks. The transpiler handles most unsupported
 * statements by emitting `throw new Error("SetScreen, not supported, transpiler")`
 * *into the generated JS*, so they reach the user as `runtime_error` from the
 * sandbox and never pass through the classifier — `PARAMETERS` and
 * `SELECT-OPTIONS`, in nearly every ABAP report an LLM writes, are among them.
 * Read `transpile_reason` as "of the runs that died before we produced JS",
 * never as "of the ABAP we cannot support".
 *
 * Three categories that look like they belong here are deliberately absent,
 * because nothing can produce them and a permanently-zero bucket documented as
 * meaningful is worse than no bucket at all. The test for inclusion is "does
 * @abaplint/transpiler `throw` this at transpile time", and for each of these
 * the answer is no:
 *   - a missing database table — abaplint's own syntax check rejects it first
 *     (`Database table or view "x" not found`, for `MARA` and `ZSECRET` alike),
 *     so it arrives as `syntax_error`
 *   - a void or unknown DDIC type — `Void type:` and `Unknown type:` are written
 *     only into generated JS, so they surface as `runtime_error`
 *   - a missing kernel class — likewise. All eight `kernel class missing` sites
 *     are `Chunk` text of the form `if (lookup === undefined) throw ...`, so
 *     `AUTHORITY-CHECK` and friends transpile fine and die in the sandbox
 */
export const TRANSPILE_REASONS = [
  "unsupported_statement",
  "unsupported_expression",
  "not_implemented",
  "unknown_type",
  "internal",
  "other",
] as const;

export type TranspileReason = (typeof TRANSPILE_REASONS)[number];

export interface TranspileDiagnostics {
  reason: TranspileReason;
  /** Present only when the failing AST node was named and recognised. */
  node?: string;
}
