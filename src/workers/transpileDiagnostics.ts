/**
 * Turn a transpiler error message into something we are allowed to measure.
 *
 * A quarter of all Run presses end in `transpile_error`, which by our own
 * definition means our transpiler broke rather than the user writing bad ABAP.
 * We could not act on that number because `run_result` carried nothing saying
 * WHAT failed — and the obvious fix, sending the error message, is exactly what
 * `src/utils/analytics.ts` forbids: almost every transpiler throw interpolates
 * the user's own source into its message.
 *
 *   `Statement ${node.get().constructor.name} not supported, ${node.concatTokens()}`
 *                ^ abaplint AST class name                     ^ the user's code
 *
 * So `node` reads only the left slot: it is lifted out of an anchored pattern
 * and then kept ONLY if it is a member of the set abaplint itself exports —
 * `Statements` for a statement, `Expressions` for an expression, looked up in
 * their own set so a statement name cannot be reported as an expression. (Six
 * names — `Select`, `SelectLoop`, `Field`, `FieldSymbol`, `Type`, `Constant` —
 * are exported as both, so for those the separation decides nothing.) An
 * unrecognised name is dropped, never sent.
 *
 * That closed-set check, not the regex, is the privacy guarantee. A regex
 * capture is only as good as its anchors; membership in a vocabulary the user
 * cannot add to holds regardless of what the message says. It also fails in the
 * safe direction: if abaplint renames an export, or a bundler mangles class
 * names (see `keepNames` in vite.config.ts), we stop reporting `node` and keep
 * reporting `reason`. We lose detail; we never leak source.
 *
 * `reason` gets no such guarantee and does not need one: it is a fixed enum, so
 * nothing the user writes can be *emitted*. But be clear that the fallback tests
 * below read the WHOLE message, interpolated source included, so what the user
 * writes can still steer which bucket we land in — an ABAP variable named `todo`
 * can push an internal failure into `not_implemented`. The word boundaries keep
 * the common underscore-prefixed shapes out (`lv_todo`, `gv_unexpected`), but a
 * bare `todo` collides, and so does a structure component `ls_row-todo`, since
 * `-` is not a word character. The cost is a slightly noisy metric, never a leak.
 */
import { Statements, Expressions } from "@abaplint/core";
import type { TranspileDiagnostics } from "../types/diagnostics";

const STATEMENT_NAMES: ReadonlySet<string> = new Set(Object.keys(Statements));
const EXPRESSION_NAMES: ReadonlySet<string> = new Set(Object.keys(Expressions));

/** True if `name` is an AST class abaplint exports — a statement or expression. */
export function isKnownAstNode(name: string): boolean {
  return STATEMENT_NAMES.has(name) || EXPRESSION_NAMES.has(name);
}

/**
 * The two throw sites that name their node. Anchored at the start of the
 * message so a fragment appearing inside interpolated user source cannot
 * masquerade as the real prefix. The character class excludes `_`, which no
 * abaplint class name uses but ABAP identifiers use constantly.
 */
const UNSUPPORTED_NODE = /^(Statement|Expression) ([A-Za-z][A-Za-z0-9]*) not supported/;

export function classifyTranspileError(message: string): TranspileDiagnostics {
  const named = UNSUPPORTED_NODE.exec(message);
  if (named !== null) {
    const isStatement = named[1] === "Statement";
    const name = named[2];
    const vocabulary = isStatement ? STATEMENT_NAMES : EXPRESSION_NAMES;
    return {
      reason: isStatement ? "unsupported_statement" : "unsupported_expression",
      node: vocabulary.has(name) ? name : undefined,
    };
  }

  // Order matters: the specific phrasings first, then the broad ones. "internal
  // error, InsertDatabaseTranspiler" and "transpiler: REF # unexpected type"
  // both reach the `internal` test, and neither may fall through to the much
  // broader `not_implemented` one below.
  if (message.includes("type not found")) return { reason: "unknown_type" };
  if (
    message.includes("internal error") ||
    /\bunexpected\b/.test(message) ||
    message.includes("node undefined") ||
    message.includes("is undefined") ||
    message.includes("unable to lookup")
  ) {
    return { reason: "internal" };
  }
  // `todo\d?` because the transpiler really does say "todo1" and "todo2"; the
  // leading boundary is what keeps an ABAP `lv_todo` from landing here.
  // "not implemented" is a separate phrasing from "not supported" and only
  // RaiseTranspiler uses it, but it is the whole of that message.
  if (
    message.includes("not supported") ||
    message.includes("not implemented") ||
    /\btodo\d?\b/.test(message)
  ) {
    return { reason: "not_implemented" };
  }
  return { reason: "other" };
}
