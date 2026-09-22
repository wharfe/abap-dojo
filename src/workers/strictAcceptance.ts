/**
 * The acceptance rule the targeted searches share, and the span vocabulary it
 * reads (#67, #78, #85).
 *
 * `findSyntaxRepair` (the double quote) keeps a rewrite whenever abaplint's
 * Error count went down. That is too generous for a search whose candidates
 * are cheap to satisfy: appending a period makes almost any line look like a
 * finished statement, and `console.log('a')` is two errors on one row that a
 * period turns into one. So the statement-end and declaration searches keep a
 * rewrite only when the count went down AND no error is left covering a row
 * the rewrite aimed at.
 *
 * It lives apart from both because it is one rule with two callers, and the
 * comparison inside it is subtle enough to have been wrong once: the targets
 * were spans while the re-parse reported only start rows, so an error that
 * covered a target row but began above it looked cleared (#78). Sharing it
 * means the next correction lands in one place rather than in whichever
 * module someone happens to open.
 */
import { Registry, MemoryFile, type Config, type Issue } from "@abaplint/core";
import { errorIssues, type RepairCandidate } from "./syntaxRepair";

/** The 1-based rows an Error-severity issue covers. */
export interface ErrorSpan {
  start: number;
  end: number;
}

export function errorSpanOf(issue: Issue): ErrorSpan {
  return { start: issue.getStart().getRow(), end: issue.getEnd().getRow() };
}

/** A candidate that also says which rows it was meant to clear. */
export interface TargetedCandidate extends RepairCandidate {
  /** Rows of the original errors this candidate is meant to clear. */
  targets: number[];
}

/** The rows a set of spans covers, ascending and without duplicates. */
export function rowsOf(spans: readonly ErrorSpan[]): number[] {
  const rows = new Set<number>();
  for (const span of spans) {
    for (let row = span.start; row <= span.end; row++) rows.add(row);
  }
  return [...rows].sort((a, b) => a - b);
}

/**
 * The spans of a candidate's Error-severity issues — one entry per issue, so
 * its length is the same count `countErrors` takes.
 *
 * Spans, not start rows, so `accepts` compares like with like. See the note
 * there for why the two cannot currently differ, and why that is not a reason
 * to keep the cheaper one.
 */
export function errorSpanFinder(
  config: Config,
  filename: string,
): (candidate: string) => Promise<ErrorSpan[]> {
  return async (candidate) => {
    const registry = new Registry(config);
    registry.addFile(new MemoryFile(filename, candidate));
    await registry.parseAsync();
    return errorIssues(registry.findIssues()).map(errorSpanOf);
  };
}

function accepts(
  candidate: TargetedCandidate,
  before: number,
  after: readonly ErrorSpan[],
): boolean {
  // An error still COVERING a target row means the rewrite did not clear what
  // it aimed at, whichever row that error starts on. Comparing start rows
  // instead answers the same on every input we could build (17 tried on
  // 2026-09-22: pasted JS, Python, JSON and SQL, and unclosed IF / FORM /
  // METHOD / CASE / TRY), and the reason is structural: these rewrites change
  // one row and cannot break an earlier statement that parsed, so a surviving
  // error over a target row starts inside a targeted span too. That argument
  // is about how abaplint draws its spans, though, and a dependency bump can
  // move it without failing a test. Overlap costs nothing and does not rest
  // on it.
  const cleared = !after.some((error) =>
    candidate.targets.some((row) => error.start <= row && row <= error.end),
  );
  return after.length < before && cleared;
}

/**
 * The first candidate abaplint accepts, or undefined.
 *
 * Precondition: `before` must be the count of EVERY Error-severity issue of
 * the original parse — it is the bar a candidate is judged against, so a
 * subset lowers it and makes the search accept a worse candidate.
 */
export async function firstAccepted<T extends TargetedCandidate>(
  candidates: readonly T[],
  before: number,
  errorSpansIn: (candidate: string) => Promise<ErrorSpan[]>,
): Promise<T | undefined> {
  for (const candidate of candidates) {
    // A candidate is source a search mangled on purpose, so it reaches the
    // parser in shapes the user's own text never would. A throw here means
    // "no hint" — and since searchDeadline.ts enforces its budget by
    // throwing, this is also how a search that ran out of time ends.
    let after: ErrorSpan[];
    try {
      after = await errorSpansIn(candidate.source);
    } catch {
      return undefined;
    }
    if (accepts(candidate, before, after)) return candidate;
  }
  return undefined;
}
