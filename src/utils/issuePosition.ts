import type { LintIssue } from "../types/messages";

/**
 * The `L3:5 ` prefix both issue lists print, or nothing for an issue whose
 * position abaplint does not know (#72) — printing `L1:1` there is what sent
 * people to line 1 to look for a missing ENDIF.
 */
export function issuePosition(
  issue: Pick<LintIssue, "startLine" | "startCol" | "positionUnknown">,
): string {
  return issue.positionUnknown ? "" : `L${issue.startLine}:${issue.startCol} `;
}
