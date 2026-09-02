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
 * It fails in the safe direction. If abaplint renames a rule, or a bundler
 * mangles the class names `ArtifactsRules` reflects over (see `keepNames` in
 * vite.config.ts), `key` stops being reported and `errorCount` keeps going.
 * We lose detail; we never leak source.
 */
import { ArtifactsRules } from "@abaplint/core";
import type { SyntaxDiagnostics } from "../types/diagnostics";

/**
 * Two keys abaplint attaches to issues it builds outside the rule registry, so
 * `ArtifactsRules` does not know about them. `parser_error` happens to also be
 * a real rule and is already covered; `structure` is not, and without this line
 * every structure failure would be silently dropped.
 *
 * A dropped value is safe but not harmless: a bucket that can never be
 * anything but zero reads as "this never happens", which is worse than having
 * no bucket at all. Re-check this list when bumping @abaplint/core — the
 * source is the `Issue.atPosition(..., "<literal>", ...)` calls outside
 * `src/rules/`.
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
