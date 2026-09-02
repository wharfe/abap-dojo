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
import { ArtifactsRules } from "@abaplint/core";
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
): SyntaxDiagnostics {
  return {
    key: isKnownRuleKey(firstKey) ? firstKey : undefined,
    errorCount,
  };
}
