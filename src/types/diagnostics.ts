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

/**
 * Why a *syntax* failure happened, at the only granularity abaplint itself
 * offers for free: the rule key of the issue the user is looking at.
 *
 * `syntax_error` is the largest single Run outcome — 32% of runs over
 * 2026-08-12..09-01, against `transpile_error`'s 1.7% — and until now it
 * carried nothing at all. That is the same hole `transpile_reason` filled on
 * the other branch, and it is filled the same way: classify, never forward.
 * abaplint's own messages interpolate the user's source
 * (`Database table or view "zcust_secret" not found`), so the message stays in
 * the browser and only the key travels.
 *
 * There is no enum here on purpose. The vocabulary is abaplint's ~182 rule
 * keys, enumerable at runtime from `ArtifactsRules.getRules()`, and pinning a
 * copy of it into this file would rot the first time abaplint ships a rule.
 * The membership test lives with the set, in src/workers/syntaxDiagnostics.ts;
 * `RULE_KEY` in analytics.ts is a shape backstop, not the guarantee.
 *
 * Which keys actually show up, measured against real broken ABAP:
 *   - `parser_error`      syntax abaplint does not recognise (`print(lv).`)
 *   - `check_syntax`      parsed, then the semantic pass rejected it. A broad
 *                         bucket: abaplint raises this key from ~72 files, so
 *                         a missing DB table and `Into must be table typed`
 *                         arrive under the same name. **Do not read a large
 *                         `check_syntax` share as either "we are missing SAP
 *                         artifacts" or "the user's code is wrong"** — it
 *                         merges exactly those two answers. See #56
 *   - `unknown_types`     a type we do not carry. `STRING_TABLE` is one, which
 *                         is why this bucket matters: it separates "the user
 *                         wrote nonsense" from "we are missing standard SAP
 *                         artifacts", and those want opposite work
 *   - `implement_methods` structural, e.g. a CLASS with no implementation
 */
export interface SyntaxDiagnostics {
  /** Present only when the issue's key was recognised. */
  key?: string;
  /** How many Error-severity issues the parse produced. Always present. */
  errorCount: number;
  /**
   * The leading keyword of the statement abaplint could not parse — `WRITE`,
   * `SELECT`, `DATA`. Present only on `key === "parser_error"`, and only when
   * the token abaplint quoted is a member of the set of statement keywords it
   * enumerates at runtime. That membership test is the privacy guarantee: the
   * slot it comes from holds the user's own source, so `FOO`, `ZSECRET` and
   * `lv_password` arrive there identically and all three are dropped.
   *
   * Why `parser_error` needs it: the key says "abaplint did not recognise
   * this" and stops, so 155 events in two days were one undifferentiated
   * bucket. This narrows them to a named keyword — and that is ALL it does.
   *
   * It does not say whether the user was writing ABAP. ABAP shares most of its
   * keywords with JavaScript, so `class Foo {}` reports `CLASS` exactly as a
   * `CLASS` we failed to parse would. And absence has several causes it cannot
   * tell apart: a typo of a real ABAP word (`SELCT`), a word from another
   * language that happens not to collide (`const`), an identifier the user
   * invented, or a `parser_error` of one of the other three message shapes.
   * Read it as "which keyword", never as "whose fault".
   */
  statement?: string;
}
