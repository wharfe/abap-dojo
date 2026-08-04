import type { StageResult, ValidationStage } from "../types/validation";

export interface ValidationTotals {
  overall: "pass" | "warn" | "fail";
  totalIssues: number;
  lintIssues: number;
  pitfalls: number;
}

/**
 * Roll the four validation stages up into one verdict. Shared by the report UI
 * and by analytics so both derive from one place.
 *
 * Note that `totalIssues` (what the report bar shows) counts stage `error`
 * strings too, while analytics sends `lintIssues` and `pitfalls` separately and
 * does not send the error count. The two therefore differ whenever a stage
 * failed — that is intentional, but it means "issues found" in GA4 is not the
 * same number the user read on screen.
 */
export function computeSummary(
  stages: Record<ValidationStage, StageResult>,
): ValidationTotals {
  let lintIssues = 0;
  let pitfalls = 0;
  let errors = 0;
  let hasError = false;
  let hasWarning = false;

  for (const result of Object.values(stages)) {
    if (result.status === "fail") hasError = true;
    if (result.status === "warn") hasWarning = true;
    lintIssues += result.issues?.length ?? 0;
    pitfalls += result.pitfalls?.length ?? 0;
    if (result.error) errors++;
  }

  return {
    overall: hasError ? "fail" : hasWarning ? "warn" : "pass",
    totalIssues: lintIssues + pitfalls + errors,
    lintIssues,
    pitfalls,
  };
}
