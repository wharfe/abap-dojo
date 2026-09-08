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

/**
 * A single-line edit that makes a failing parse succeed.
 *
 * This is the third measurable half on the syntax branch, and it exists
 * because the other two stop one step short of an answer. `syntax_key` says
 * `parser_error`; `syntax_statement` narrows that to `WRITE`; neither says
 * what is wrong with the WRITE — and measured over 2026-09-04..07, `WRITE` was
 * 87 of the ~292 `parser_error` events, the largest identified bucket by far.
 *
 * Probing it locally showed the keyword was a red herring: all 20 real `WRITE`
 * forms parse (`WRITE / x`, `WRITE 5(10) x`, `WRITE x COLOR 3`, ...). What
 * fails is punctuation borrowed from another language, and the commonest is
 * the double quote — which in ABAP starts a comment, so `WRITE "hello".`
 * silently loses its own argument and abaplint reports only that a statement
 * it cannot name went missing.
 *
 * The value is produced by re-parsing, never by reading the line: see
 * src/workers/syntaxRepair.ts for why a regex over the source cannot tell a
 * misused quote from `* he said "hello"` or from `WRITE |He said "hi"|.`
 */
export const SYNTAX_REPAIRS = ["double_quote"] as const;

export type SyntaxRepairKind = (typeof SYNTAX_REPAIRS)[number];

export interface SyntaxRepair {
  /** Which repair worked. An enum, so nothing the user writes can be sent. */
  kind: SyntaxRepairKind;
  /**
   * The 1-based row the edit was made on, for the hint shown in the browser.
   * Never sent: a line number is not source, but it is not evidence of
   * anything either, and `run_result` already carries the counts that are.
   *
   * **Absent whenever the rewrite-everything candidate is the one that
   * worked** — always, even where that candidate touched a single row,
   * because a row can hold several pairs and the search does not know which
   * of them mattered any more than it knows which row did. It gets there
   * because abaplint collapses consecutive swallowed statements into one
   * error (see syntaxRepair.ts), so the score cannot attribute the
   * improvement to any one edit. Naming the first is worse than naming none:
   * put a correct comment above two misused quotes and the first row is the
   * comment. The hint drops the row rather than point somewhere never wrong.
   */
  line?: number;
}

/**
 * A statement the user wrote that abaplint parsed away without complaint.
 *
 * The third failure shape on this branch, and the only one nobody could see.
 * `WRITE: "hello".` is a chain whose single operand is eaten by the comment
 * the double quote opens; what is left is an empty chain, which is legal ABAP.
 * abaplint reports no issue, the transpiler emits working JS, the run is
 * counted a `success`, and the program prints nothing. There is no error, no
 * warning, and no output — so unlike every other failure this app measures,
 * the user has nothing at all to go on, and neither did we: not one of these
 * runs was distinguishable in GA4 from a program that had nothing to print.
 *
 * Deliberately NOT a member of `SYNTAX_REPAIRS`. That array is the enum of the
 * registered GA4 dimension `syntax_repair`, whose documented meaning is "the
 * one-line edit that made a failing parse succeed" and whose readers are told
 * to filter by `outcome = syntax_error`. Nothing here failed to parse and the
 * outcome is usually `success`, so a value added there would be read under a
 * definition that does not hold for it — and GA4 registration is not
 * retroactive, so the two could never be told apart afterwards.
 *
 * It reaches only operands where a text literal is grammatically legal, and
 * one more shape is out of reach for a different reason: a line whose own
 * single-quoted literal contains double quotes (`WRITE: 'he said "hi"', "b".`).
 * The single-line candidate rewrites the FIRST pair on the line, which there
 * is the one inside the literal, and the all-at-once candidate rewrites that
 * one too — so neither scores better and the real loss goes unreported. It
 * fails silent rather than wrong, which is this module's preference, but it is
 * a limit rather than an accident and `syntaxRepair.test.ts` fixes it in place.
 *
 * `none` is a value rather than an absence on purpose: it means the search ran
 * to the end and found nothing, and absence means it never ran. Without the
 * distinction, "we looked and found nothing" and "we never looked" would both
 * arrive as `(not set)` and no rate could be computed from either.
 *
 * **The biggest cause of absence is not an accident: every `syntax_error`
 * run.** The worker returns from the branch that handles Error-severity issues
 * before this search is reached, so the largest failure bucket in the app
 * sends nothing here. A search that gave up part way and a source too large to
 * search are the other two; a run that ended before the parse (`stalled`, or a
 * Stop pressed before transpiling) is the fourth. Do not read `(not set)` as
 * "the run stalled".
 */
export const SILENT_LOSSES = ["double_quote", "none"] as const;

export type SilentLossKind = (typeof SILENT_LOSSES)[number];

export interface SilentLoss {
  /** Which shape was found. An enum, so nothing the user writes can be sent. */
  kind: Exclude<SilentLossKind, "none">;
  /**
   * The 1-based row the edit was made on, when the search can name one.
   *
   * Absent for the same reason as `SyntaxRepair.line`: the candidate that
   * rewrites every pair at once is credited by the score as a whole, and a
   * single row can hold more than one pair. `WRITE: "a" && "b".` is the shape
   * that needs it — one operand, two pairs, and fixing either half alone
   * leaves an expression that does not parse, so only the combined rewrite
   * scores better and none of its edits can be singled out.
   */
  line?: number;
}
