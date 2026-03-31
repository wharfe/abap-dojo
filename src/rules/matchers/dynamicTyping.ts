import { Registry, ABAPObject } from "@abaplint/core";
import type { PitfallMatch } from "../../types/validation";
import { getRuleById } from "../definitions";

export function matchDynamicTyping(registry: Registry): PitfallMatch[] {
  const rule = getRuleById("llm-dynamic-typing");
  if (!rule) return [];

  const matches: PitfallMatch[] = [];

  for (const obj of registry.getObjects()) {
    if (!ABAPObject.is(obj)) continue;

    for (const file of (obj as ABAPObject).getABAPFiles()) {
      const structure = file.getStructure();
      if (!structure) continue;

      // Walk all statements looking for DATA declarations without TYPE or LIKE
      const allStatements = structure.findAllStatementNodes();
      for (const stmt of allStatements) {
        const tokens = stmt.getTokens();
        const tokenStrs = tokens.map((t) => t.getStr().toUpperCase());

        // DATA declaration without TYPE or LIKE keyword
        if (tokenStrs[0] === "DATA" && tokenStrs.length >= 2) {
          const hasType = tokenStrs.includes("TYPE");
          const hasLike = tokenStrs.includes("LIKE");
          if (!hasType && !hasLike) {
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
  }

  return matches;
}
