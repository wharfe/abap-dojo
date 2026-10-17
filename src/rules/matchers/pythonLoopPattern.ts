import { Registry, ABAPObject, Statements, Nodes } from "@abaplint/core";
import type { PitfallMatch, PitfallRule } from "../../types/validation";
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
      const fileStart = matches.length;
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

      // A block that is both (a DO inside a LOOP, or the reverse) is one
      // finding: keep the LOOP report and drop the overlapping DO/WHILE one.
      const loops = matches.slice(fileStart);
      for (const m of matchIndexedReadInLoop(allStatements, rule)) {
        const overlaps = loops.some(
          (l) => m.startLine <= l.endLine && l.startLine <= m.endLine,
        );
        if (!overlaps) matches.push(m);
      }
    }
  }

  return matches.sort(
    (a, b) => a.startLine - b.startLine || a.startCol - b.startCol,
  );
}

/**
 * The shape the pitfall page shows: `for i in range(len(xs))` written as
 * DO ... TIMES (or WHILE) around `READ TABLE ... INDEX <counter>` (#95).
 * Only the loop's own counter counts: sy-index, or a variable the block
 * steps by one (`x = x + 1`, `x += 1`, `ADD 1 TO x`). Any other INDEX - a
 * constant, `lines( lt )` for a stack pop, a binary search's midpoint - is a
 * lookup, not iteration. Nested blocks are reported once, spanning the
 * outermost DO/WHILE.
 */
function matchIndexedReadInLoop(
  statements: Nodes.StatementNode[],
  rule: PitfallRule,
): PitfallMatch[] {
  const matches: PitfallMatch[] = [];
  let depth = 0;
  let blockStart: Nodes.StatementNode | null = null;
  // Collected over the whole outermost block and judged at its end, because
  // the counter is usually stepped after the READ that uses it.
  let operands: string[][] = [];
  let counters = new Set<string>();

  for (const stmt of statements) {
    const kind = stmt.get();
    const tokens = stmt.getTokens().map((t) => t.getStr().toUpperCase());
    if (kind instanceof Statements.Do || kind instanceof Statements.While) {
      if (depth === 0) {
        blockStart = stmt;
        operands = [];
        counters = new Set();
      }
      depth++;
    } else if (
      kind instanceof Statements.EndDo ||
      kind instanceof Statements.EndWhile
    ) {
      depth--;
      const found = operands.some(
        (op) =>
          op.join("").includes("SY-INDEX") ||
          op.some((t) => counters.has(t)),
      );
      if (depth === 0 && found && blockStart) {
        const start = blockStart.getFirstToken();
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
        blockStart = null;
      }
    } else if (depth > 0 && kind instanceof Statements.ReadTable) {
      // INDEX as the statement's own keyword (a direct token child), not a
      // field or table that happens to be called index.
      const children = stmt.getChildren();
      const at = children.findIndex(
        (c) =>
          c instanceof Nodes.TokenNode &&
          c.getFirstToken().getStr().toUpperCase() === "INDEX",
      );
      const operand = at === -1 ? undefined : children[at + 1];
      if (operand) {
        // A bare token (INDEX 1) has no getTokens; concatTokens covers both.
        operands.push(operand.concatTokens().toUpperCase().split(/\s+/));
      }
    } else if (depth > 0) {
      const counter = steppedCounter(kind, tokens);
      if (counter) counters.add(counter);
    }
  }

  return matches;
}

/** The variable a statement increments by one, if that is all it does. */
function steppedCounter(
  kind: unknown,
  t: string[],
): string | undefined {
  if (kind instanceof Statements.Add) {
    // ADD 1 TO x .
    return t.length === 5 && t[1] === "1" && t[2] === "TO" ? t[3] : undefined;
  }
  if (!(kind instanceof Statements.Move)) return undefined;
  const [x] = t;
  const body = t.slice(1, -1).join(" ");
  return body === `= ${x} + 1` || body === "= 1 + " + x || body === "+ = 1"
    ? x
    : undefined;
}
