/**
 * Find the statement end a failing parse was missing (#67).
 *
 * The sibling of `findSyntaxRepair` in syntaxRepair.ts, for the two shapes the
 * `WRITE` bucket held besides the double quote: a statement with no period,
 * and one ended with a semicolon. Same method — propose an edit, hand the
 * edited source back to abaplint, keep it only if abaplint's verdict improved
 * — with two differences, both measured on 2026-09-11.
 *
 * ## Candidates come from the error's own rows
 *
 * A period could go on any line, so unlike the double quote there is nothing
 * in the text to anchor a candidate to. abaplint's error span is the anchor.
 * The period goes on the row the error ENDS on: for a statement over several
 * rows (`WRITE: 'a',` / `'b'`) the error starts on the first row, and a period
 * there splits the statement and scores 1 -> 2.
 *
 * ## The acceptance rule is stricter than the double quote's
 *
 * Appending a period makes almost any line look like a finished statement.
 * `console.log('a')` is two errors on one row and a period turns it into one,
 * so "the count went down" would tell someone who pasted JavaScript that they
 * forgot a period. A candidate is kept only if the count went down AND no
 * error is left starting on a row it targeted. The double quote keeps its own
 * rule: its data has been flowing since 2026-09-08, and changing what it
 * reports would break the comparison across that date.
 */
import { Registry, MemoryFile, type Config, type Issue } from "@abaplint/core";
import type { SyntaxRepair } from "../types/diagnostics";
import {
  MAX_CANDIDATES,
  MAX_SOURCE_CHARS,
  errorIssues,
  type RepairCandidate,
} from "./syntaxRepair";

/** The 1-based rows an Error-severity issue covers. */
export interface ErrorSpan {
  start: number;
  end: number;
}

export function errorSpanOf(issue: Issue): ErrorSpan {
  return { start: issue.getStart().getRow(), end: issue.getEnd().getRow() };
}

type StatementEndKind = "semicolon" | "missing_period";

/** Tried in this order; see the spec for why the period comes last. */
const KINDS: readonly StatementEndKind[] = ["semicolon", "missing_period"];

/**
 * Trailing whitespace is kept, not trimmed: the source is split on `\n`, so
 * under CRLF every line ends in `\r`, and dropping it would change the
 * candidate in a way the user never wrote.
 */
const TRAILING_SEMICOLON = /;(\s*)$/;
const TRAILING_WHITESPACE = /(\s*)$/;
/** A row that already ends a statement, or continues a chain onto the next. */
const TERMINATED = /[.,:]\s*$/;
const BLANK = /^\s*$/;

export interface StatementEndCandidate extends RepairCandidate {
  /** Rows of the original errors this candidate is meant to clear. */
  targets: number[];
}

function rowsOf(spans: readonly ErrorSpan[]): number[] {
  const rows = new Set<number>();
  for (const span of spans) {
    for (let row = span.start; row <= span.end; row++) rows.add(row);
  }
  return [...rows].sort((a, b) => a - b);
}

export function statementEndCandidates(
  kind: StatementEndKind,
  source: string,
  spans: readonly ErrorSpan[],
): StatementEndCandidate[] {
  if (source.length > MAX_SOURCE_CHARS) return [];

  const lines = source.split("\n");
  const eligible = (row: number): boolean => {
    if (row < 1 || row > lines.length) return false;
    const line = lines[row - 1];
    return kind === "semicolon"
      ? TRAILING_SEMICOLON.test(line)
      : !BLANK.test(line) && !TERMINATED.test(line);
  };
  const edit = (line: string): string =>
    kind === "semicolon"
      ? line.replace(TRAILING_SEMICOLON, ".$1")
      : line.replace(TRAILING_WHITESPACE, ".$1");

  // A semicolon can sit on any row of the span; a missing period belongs on
  // the row the span ends on.
  const singleRows =
    kind === "semicolon"
      ? rowsOf(spans)
      : [...new Set(spans.map((span) => span.end))].sort((a, b) => a - b);

  const candidates: StatementEndCandidate[] = [];
  for (const row of singleRows) {
    if (candidates.length >= MAX_CANDIDATES) break;
    if (!eligible(row)) continue;
    const edited = [...lines];
    edited[row - 1] = edit(lines[row - 1]);
    candidates.push({
      line: row,
      source: edited.join("\n"),
      targets: rowsOf(spans.filter((span) => span.start <= row && row <= span.end)),
    });
  }

  // One more with every eligible row rewritten, for the same reason the double
  // quote has one: abaplint reports consecutive broken statements as a single
  // error, so no one-row edit lowers the count. It names no row, because the
  // score cannot say which of its edits mattered.
  const every = rowsOf(spans).filter(eligible);
  if (every.length > 1) {
    const edited = [...lines];
    for (const row of every) edited[row - 1] = edit(lines[row - 1]);
    // Only the errors a rewritten row belongs to are targets. An unrelated
    // error elsewhere survives any rewrite, so targeting it would reject a
    // real repair.
    const touched = spans.filter((span) =>
      every.some((row) => span.start <= row && row <= span.end),
    );
    candidates.push({ source: edited.join("\n"), targets: rowsOf(touched) });
  }

  return candidates;
}

/**
 * The start rows of a candidate's Error-severity issues — one entry per
 * issue, so its length is the same count `countErrors` takes.
 */
export function errorRowCounter(
  config: Config,
  filename: string,
): (candidate: string) => Promise<number[]> {
  return async (candidate) => {
    const registry = new Registry(config);
    registry.addFile(new MemoryFile(filename, candidate));
    await registry.parseAsync();
    return errorIssues(registry.findIssues()).map((issue) =>
      issue.getStart().getRow(),
    );
  };
}

export async function findStatementEndRepair(
  source: string,
  spans: readonly ErrorSpan[],
  errorRowsIn: (candidate: string) => Promise<number[]>,
): Promise<SyntaxRepair | undefined> {
  if (spans.length === 0) return undefined;

  for (const kind of KINDS) {
    for (const candidate of statementEndCandidates(kind, source, spans)) {
      // A candidate is source this module mangled on purpose, so it reaches
      // the parser in shapes the user's own text never would. A throw here
      // means "no hint" — and since searchDeadline.ts enforces its budget by
      // throwing, this is also how a search that ran out of time ends.
      let after: number[];
      try {
        after = await errorRowsIn(candidate.source);
      } catch {
        return undefined;
      }
      const cleared = !after.some((row) => candidate.targets.includes(row));
      if (after.length < spans.length && cleared) {
        return candidate.line === undefined
          ? { kind }
          : { kind, line: candidate.line };
      }
    }
  }

  return undefined;
}
