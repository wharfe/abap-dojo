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
        // Compared with columns, so two separate blocks on one line both stay.
        const overlaps = loops.some(
          (l) =>
            at(m.startLine, m.startCol) <= at(l.endLine, l.endCol) &&
            at(l.startLine, l.startCol) <= at(m.endLine, m.endCol),
        );
        if (!overlaps) matches.push(m);
      }
    }
  }

  return matches.sort(
    (a, b) => a.startLine - b.startLine || a.startCol - b.startCol,
  );
}

/** A source position as one comparable number. */
const at = (line: number, col: number) => line * 1_000_000 + col;

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
  let counters: string[][] = [];

  for (const stmt of statements) {
    const kind = stmt.get();
    const tokens = stmt.getTokens().map((t) => t.getStr().toUpperCase());
    if (kind instanceof Statements.Do || kind instanceof Statements.While) {
      if (depth === 0) {
        blockStart = stmt;
        operands = [];
        counters = [];
      }
      depth++;
    } else if (
      kind instanceof Statements.EndDo ||
      kind instanceof Statements.EndWhile
    ) {
      depth--;
      const found = operands.some(
        (op) =>
          hasSequence(op, SY_INDEX) ||
          counters.some((counter) => hasSequence(op, counter)),
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
        const opTokens =
          operand instanceof Nodes.TokenNode
            ? [operand.getFirstToken()]
            : operand.getTokens();
        operands.push(opTokens.map((t) => t.getStr().toUpperCase()));
      }
    } else if (depth > 0) {
      const counter = steppedCounter(kind, tokens);
      if (counter) counters.push(counter);
    }
  }

  return matches;
}

/** abaplint splits `sy-index` into three tokens. */
const SY_INDEX = ["SY", "-", "INDEX"];

/** Tokens that join a name to the one before it: `ls-x`, `lo->x`, `lc=>x`. */
const JOINERS = new Set(["-", "->", "=>"]);

/**
 * Whether `seq` occurs in `tokens` as a whole name: not the tail of a longer
 * one (`ls_sy-index` is not sy-index) and not followed by a component.
 */
function hasSequence(tokens: string[], seq: string[]): boolean {
  for (let i = 0; i + seq.length <= tokens.length; i++) {
    if (!seq.every((s, k) => tokens[i + k] === s)) continue;
    if (i > 0 && JOINERS.has(tokens[i - 1])) continue;
    if (JOINERS.has(tokens[i + seq.length] ?? "")) continue;
    return true;
  }
  return false;
}

/**
 * The target a statement increments by one, as tokens, if that is all it
 * does: `x = x + 1`, `x = 1 + x`, `x += 1`, `ADD 1 TO x`. Compared as whole
 * token sequences, so a component like `ls-idx` is a counter too.
 */
function steppedCounter(kind: unknown, t: string[]): string[] | undefined {
  const u = t.at(-1) === "." ? t.slice(0, -1) : t;
  const same = (a: string[], b: string[]) =>
    a.length === b.length && a.every((x, i) => x === b[i]);
  if (kind instanceof Statements.Add) {
    return u[1] === "1" && u[2] === "TO" && u.length > 3 ? u.slice(3) : undefined;
  }
  if (!(kind instanceof Statements.Move)) return undefined;
  if (same(u.slice(-3), ["+", "=", "1"]) && u.length > 3) return u.slice(0, -3);
  const eq = u.indexOf("=");
  if (eq < 1) return undefined;
  const target = u.slice(0, eq);
  const rhs = u.slice(eq + 1);
  return same(rhs, [...target, "+", "1"]) || same(rhs, ["1", "+", ...target])
    ? target
    : undefined;
}
