// src/rules/matchers/hallucinatedClass.ts
import type { LintIssue } from "../../types/messages";
import type { PitfallMatch } from "../../types/validation";
import { getRuleById } from "../definitions";

const CLASS_PREFIXES = ["CL_", "IF_", "ZCL_", "ZIF_"];
const QUOTED_NAME_RE = /"([^"]+)"/;

export function matchHallucinatedClass(lintIssues: LintIssue[]): PitfallMatch[] {
  const rule = getRuleById("llm-hallucinated-class");
  if (!rule) return [];

  const matches: PitfallMatch[] = [];

  for (const issue of lintIssues) {
    if (issue.key !== "unknown_types") continue;

    // Extract the type name from the message (e.g., 'Unknown type "CL_SOMETHING"')
    const nameMatch = QUOTED_NAME_RE.exec(issue.message);
    if (!nameMatch) continue;

    const typeName = nameMatch[1].toUpperCase();
    const hasClassPrefix = CLASS_PREFIXES.some((prefix) => typeName.startsWith(prefix));
    if (!hasClassPrefix) continue;

    matches.push({
      ruleId: rule.id,
      message: `${rule.message}: ${nameMatch[1]}`,
      explanation: rule.explanation,
      suggestion: rule.suggestion,
      severity: rule.severity,
      startLine: issue.startLine,
      startCol: issue.startCol,
      endLine: issue.endLine,
      endCol: issue.endCol,
    });
  }

  return matches;
}
