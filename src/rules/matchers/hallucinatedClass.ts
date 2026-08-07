// src/rules/matchers/hallucinatedClass.ts
import type { LintIssue } from "../../types/messages";
import type { PitfallMatch } from "../../types/validation";
import { getRuleById } from "../definitions";

/**
 * Prefixes that mark an ABAP global class or interface. Y* is the second
 * customer namespace alongside Z*, and both are as inventable as CL_.
 */
const CLASS_PREFIXES = ["CL_", "IF_", "ZCL_", "ZIF_", "YCL_", "YIF_"];

/**
 * Identifier-shaped runs, scanned across the whole message.
 *
 * Reading the quoted name instead — which is what this matcher used to do —
 * never worked outside a unit test, because abaplint quotes the *variable*, not
 * the type it could not resolve:
 *
 *   Variable "LO_UTIL" contains unknown: CL_ABAP_STRING_UTILITIES not found, lookup
 *   Variable "LO_REF" contains unknown: REF, unable to resolve cl_abap_json_helper
 *
 * So the quoted name is LO_UTIL, which has no class prefix, and the rule fell
 * through on every real message. Quoted names are now excluded rather than
 * preferred.
 */
const IDENTIFIER_RE = /[A-Za-z_][A-Za-z0-9_]*/g;

/**
 * The subject of the complaint, which is never the thing that failed to
 * resolve. Only this quoted name is excluded — the other shape abaplint uses,
 * `Unknown type "CL_X"`, quotes the type itself.
 */
const SUBJECT_RE = /\bVariable\s+"([^"]*)"/;

/** The class or interface abaplint could not resolve, if the message names one. */
export function extractUnresolvedClassName(message: string): string | null {
  const subject = SUBJECT_RE.exec(message)?.[1]?.toUpperCase();
  for (const [identifier] of message.matchAll(IDENTIFIER_RE)) {
    const upper = identifier.toUpperCase();
    // A variable may itself be named CL_*; that is not what went missing.
    if (upper === subject) continue;
    if (CLASS_PREFIXES.some((prefix) => upper.startsWith(prefix))) {
      return identifier;
    }
  }
  return null;
}

export function matchHallucinatedClass(lintIssues: LintIssue[]): PitfallMatch[] {
  const rule = getRuleById("llm-hallucinated-class");
  if (!rule) return [];

  const matches: PitfallMatch[] = [];

  for (const issue of lintIssues) {
    if (issue.key !== "unknown_types") continue;

    const name = extractUnresolvedClassName(issue.message);
    if (name === null) continue;

    matches.push({
      ruleId: rule.id,
      message: `${rule.message}: ${name}`,
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
