import { Registry, ABAPObject } from "@abaplint/core";
import type { PitfallMatch } from "../../types/validation";
import { getRuleById } from "../definitions";

export function matchPythonLoopPattern(registry: Registry): PitfallMatch[] {
  const rule = getRuleById("llm-python-loop-pattern");
  if (!rule) return [];

  const matches: PitfallMatch[] = [];

  for (const obj of registry.getObjects()) {
    if (!ABAPObject.is(obj)) continue;

    for (const file of (obj as ABAPObject).getABAPFiles()) {
      const structure = file.getStructure();
      if (!structure) continue;

      const allStatements = structure.findAllStatementNodes();
      let loopDepth = 0;
      let loopStartStmt: (typeof allStatements)[0] | null = null;
      let foundTabix = false;

      for (const stmt of allStatements) {
        const firstToken = stmt.getFirstToken().getStr().toUpperCase();

        if (firstToken === "LOOP") {
          if (loopDepth === 0) {
            loopStartStmt = stmt;
            foundTabix = false;
          }
          loopDepth++;
        } else if (firstToken === "ENDLOOP") {
          loopDepth--;
          if (loopDepth === 0 && foundTabix && loopStartStmt) {
            const start = loopStartStmt.getFirstToken();
            const end = stmt.getLastToken();
            matches.push({
              ruleId: rule.id,
              message: rule.message,
              explanation: rule.explanation,
              suggestion: rule.suggestion,
              severity: rule.severity,
              startLine: start.getStart().getRow(),
              startCol: start.getStart().getCol(),
              endLine: end.getEnd().getRow(),
              endCol: end.getEnd().getCol(),
            });
            loopStartStmt = null;
            foundTabix = false;
          }
        } else if (loopDepth > 0) {
          // Check all tokens in this statement for SY-TABIX references.
          // abaplint tokenizes "sy-tabix" as three separate tokens: "sy", "-", "tabix".
          // We join adjacent tokens to detect the full "SY-TABIX" pattern.
          const tokens = stmt.getTokens();
          const joined = tokens.map((t) => t.getStr()).join("").toUpperCase();
          if (joined.includes("SY-TABIX")) {
            foundTabix = true;
          }
        }
      }
    }
  }

  return matches;
}
