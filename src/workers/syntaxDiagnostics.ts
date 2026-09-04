/**
 * Turn a set of abaplint syntax issues into something we are allowed to measure.
 *
 * Same problem as src/workers/transpileDiagnostics.ts, one branch over: the
 * text abaplint hands us embeds the user's own source —
 *
 *   `Database table or view "zcust_secret" not found`
 *   `Statement does not exist in ABAPopen-abap(or a parser error), "print"`
 *
 * — so the message never leaves the browser. What travels is the issue's rule
 * key, and only after it is checked for membership in the set abaplint itself
 * enumerates. That check, not any pattern, is the privacy guarantee: the user
 * cannot add a key to abaplint's rule registry, so a value that passes is
 * drawn from a vocabulary they do not control.
 *
 * What the check does NOT do is notice when abaplint moves under us. The
 * allowed set and the value tested against it are both `getMetadata().key`, so
 * a renamed rule renames both at once and the new name keeps travelling: there
 * is no alarm here to hear. Do not copy the reasoning from
 * transpileDiagnostics.ts, which looks identical and is not — there the value
 * is a `constructor.name` and the set is the export names, two things a
 * minifier really can pull apart, which is what `keepNames` in vite.config.ts
 * is for. Reflection over class names plays no part in this module.
 *
 * The part that does fail closed is `NON_RULE_KEYS` below: those are hardcoded,
 * so if abaplint renames one, `key` goes quiet while `errorCount` keeps
 * reporting. We lose detail; we never leak source.
 */
import { ArtifactsRules, Statements } from "@abaplint/core";
import type { SyntaxDiagnostics } from "../types/diagnostics";

/**
 * Keys abaplint attaches to issues it builds outside its rule classes. There
 * are several — `parser_error`, `check_syntax`, `structure` — but a key only
 * needs listing here if it is *also* absent from the rule registry, and today
 * that is `structure` alone; the other two are registered rules too, so
 * `ArtifactsRules` already covers them. Without this line every structure
 * failure would be silently dropped.
 *
 * A dropped value is safe but not harmless: a bucket that can never be
 * anything but zero reads as "this never happens", which is worse than having
 * no bucket at all. So when bumping @abaplint/core, re-audit against the
 * invariant — every key abaplint can attach is in the rule registry or in this
 * list — rather than against one grep. Searching `Issue.at*(..., "<literal>",
 * ...)` outside `src/rules/` finds most of them and not all: `check_syntax`
 * comes from the syntax engine and that search misses it.
 */
const NON_RULE_KEYS: readonly string[] = ["structure"];

const RULE_KEYS: ReadonlySet<string> = new Set([
  ...ArtifactsRules.getRules().map((rule) => rule.getMetadata().key),
  ...NON_RULE_KEYS,
]);

/**
 * The leading keyword of every statement abaplint knows how to parse.
 *
 * This is the second closed set in this file, and it exists for a different
 * value than `RULE_KEYS`. `parser_error` is the largest syntax bucket, and its
 * key alone says only "abaplint did not recognise this" — never which syntax,
 * so it cannot tell "support more ABAP" from "the user typed nonsense". The
 * identifying token IS in the message, exactly as in transpileDiagnostics.ts:
 *
 *   `Statement does not exist in ABAPopen-abap(or a parser error), "FOO"`
 *
 * — but unlike `transpile_node`, the value in that slot is the user's own
 * source. `FOO` and `ZSECRET` and `lv_password` all arrive the same way. So it
 * travels only if it is a member of this set, which abaplint enumerates and
 * the user cannot extend: 176 keywords, drawn from the 317 statement classes
 * (`CALL FUNCTION` and `CALL METHOD` both reduce to `CALL`).
 *
 * The empty string is dropped deliberately. At least one matcher answers `""`,
 * and a set containing it would admit an empty token — the one value that
 * passes a membership test without meaning anything.
 */
const STATEMENT_KEYWORDS: ReadonlySet<string> = new Set(
  Object.values(Statements).flatMap((Statement) =>
    new Statement()
      .getMatcher()
      .first()
      .filter((keyword) => keyword !== ""),
  ),
);

/** True if `token` is a leading keyword of a statement abaplint can parse. */
export function isKnownStatementKeyword(token: string): boolean {
  return STATEMENT_KEYWORDS.has(token);
}

/**
 * The token abaplint quotes at the end of a `parser_error` message.
 *
 * Anchored at the end because that is where abaplint puts it, but the anchor
 * is not the safety property and must not be read as one: the user's source is
 * interpolated into the same message and can contain quotes, so a crafted
 * program can steer which characters land here. That is fine, and it is the
 * same argument `transpile_node` rests on — whatever comes out is then tested
 * against `STATEMENT_KEYWORDS`, so the only strings that can ever leave the
 * browser are 176 English ABAP keywords. Steering the extraction changes which
 * keyword is reported, never whether the user's own text can be one.
 */
function quotedTail(message: string): string | undefined {
  return /"([^"]*)"\s*$/.exec(message)?.[1];
}

/** True if `key` is one abaplint can attach to an issue. */
export function isKnownRuleKey(key: string): boolean {
  return RULE_KEYS.has(key);
}

/**
 * Describe a failed parse using `first` — the issue whose message the user is
 * being shown — and `errorCount`, how many Error-severity issues there were.
 *
 * `first` rather than a "most interesting" pick: abaplint does not promise an
 * order, and a missing period really does surface `check_syntax` ahead of the
 * `parser_error` that caused it. Ranking them would mean burying our own guess
 * about which one matters inside the measurement, and then reading that guess
 * back out as if it were evidence. Reporting what the user saw keeps the
 * number checkable against the screen; `errorCount` is what says whether one
 * line broke or the whole program did.
 */
export function classifySyntaxError(
  firstKey: string,
  errorCount: number,
  firstMessage: string,
): SyntaxDiagnostics {
  const key = isKnownRuleKey(firstKey) ? firstKey : undefined;
  return {
    key,
    errorCount,
    // `parser_error` only. The other keys interpolate different things into
    // that trailing slot — `unknown_types` puts a type name there, and
    // `check_syntax` a table or class name — none of which is drawn from a set
    // abaplint enumerates. Widening this to them is #56's problem, not a
    // one-line change here.
    statement: key === "parser_error" ? knownKeyword(firstMessage) : undefined,
  };
}

function knownKeyword(message: string): string | undefined {
  const token = quotedTail(message);
  return token !== undefined && isKnownStatementKeyword(token)
    ? token
    : undefined;
}
