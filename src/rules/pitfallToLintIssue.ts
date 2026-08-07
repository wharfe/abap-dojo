import type { LintIssue } from "../types/messages";
import type { PitfallMatch } from "../types/validation";

/**
 * Present an LLM-pitfall match as an ordinary lint issue.
 *
 * The pitfall rules are this project's only real differentiator over
 * playground.abaplint.org, but they used to fire only in AI Validator mode,
 * which 4 people opened in a month against 780 Run presses. Emitting them as
 * lint issues puts them where users already are — inline in the editor and in
 * the Lint list — without asking anyone to pick a mode first.
 *
 * The rule id becomes the issue key, which both renderers already show as
 * `[key] message`, so a pitfall reads as a pitfall with no UI change. Every
 * string here is authored in src/rules, never user input.
 */
export function pitfallToLintIssue(pitfall: PitfallMatch): LintIssue {
  return {
    // The suggestion is the actionable half; abaplint's own messages carry
    // their fix inline too, so this keeps the two kinds reading alike.
    message: `${pitfall.message} ${pitfall.suggestion}`,
    key: pitfall.ruleId,
    startLine: pitfall.startLine,
    startCol: pitfall.startCol,
    endLine: pitfall.endLine,
    endCol: pitfall.endCol,
    severity: pitfall.severity,
  };
}
