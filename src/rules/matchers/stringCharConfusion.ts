import { Registry, ABAPObject } from "@abaplint/core";
import type { PitfallMatch } from "../../types/validation";
import { getRuleById } from "../definitions";

export function matchStringCharConfusion(registry: Registry): PitfallMatch[] {
  const rule = getRuleById("llm-string-char-confusion");
  if (!rule) return [];

  const matches: PitfallMatch[] = [];

  for (const obj of registry.getObjects()) {
    if (!ABAPObject.is(obj)) continue;

    for (const file of (obj as ABAPObject).getABAPFiles()) {
      const structure = file.getStructure();
      if (!structure) continue;

      // Walk all statements looking for DATA ... TYPE STRING pattern
      const statements = structure.findAllStatementNodes();
      for (const stmt of statements) {
        const tokens = stmt.getTokens();
        const tokenStrs = tokens.map((t) => t.getStr().toUpperCase());
        const joined = tokenStrs.join(" ");

        // Match: DATA <name> TYPE STRING .
        // Skip table type declarations (TYPE STANDARD TABLE OF STRING, etc.)
        if (
          tokenStrs[0] === "DATA" &&
          joined.includes("TYPE STRING") &&
          !joined.includes("TABLE")
        ) {
          const firstToken = stmt.getFirstToken();
          const lastToken = stmt.getLastToken();
          matches.push({
            ruleId: rule.id,
            message: rule.message,
            explanation: rule.explanation,
            suggestion: rule.suggestion,
            severity: rule.severity,
            startLine: firstToken.getStart().getRow(),
            startCol: firstToken.getStart().getCol(),
            endLine: lastToken.getEnd().getRow(),
            endCol: lastToken.getEnd().getCol(),
          });
        }
      }
    }
  }

  return matches;
}
