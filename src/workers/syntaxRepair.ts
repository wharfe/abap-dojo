/**
 * Find the one-line edit that would have made a failing parse succeed.
 *
 * The motivating case is the double quote. In every language a visitor is
 * likely to arrive from, `"x"` is a string; in ABAP `"` opens a comment, so
 * `WRITE "hello".` is the statement `WRITE` followed by nothing, and abaplint
 * reports `Statement does not exist in the configured ABAP version` — a
 * sentence that names neither the quote nor the argument that vanished.
 *
 * ## Why this re-parses instead of reading the line
 *
 * The obvious implementation scans each line for a `"` outside a literal and
 * warns. It was written, reviewed, and thrown away: every rule that decides
 * "comment or string?" from the text of one line has counterexamples in
 * ordinary ABAP, and they are not edge cases.
 *
 *   * he said "hello" here      <- a full-line comment. Correct ABAP.
 *   WRITE 'a'. " note           <- an end-of-line comment. Correct ABAP.
 *   WRITE |He said "hi"|.       <- a 7.40 string template. Correct ABAP.
 *   lo->m( iv = 1 " first       <- a comment inside a multi-line statement.
 *   * don't use "x" here        <- an apostrophe that opens no literal.
 *
 * Separating those from `WRITE "hello".` means implementing ABAP's own
 * lexer — comment rules, `''` escaping, backtick and pipe literals, chained
 * statements — which is the thing we already have and would be reimplementing
 * approximately. So this module makes no judgement about the line at all. It
 * proposes an edit, hands the edited source back to abaplint, and keeps the
 * edit only if abaplint's own verdict improved. All five lines above stay
 * quiet because rewriting their quotes does not remove an error they never
 * caused.
 *
 * ## The score is the plain Error-severity count
 *
 * Narrowing it to the keys that mean "this did not parse" (`parser_error`,
 * `check_syntax`, `structure`) was written first, on the reasoning that
 * `implicit_start_of_selection` is Error-severity and a repair that
 * resurrects a swallowed statement *adds* it, scoring the repair worse than
 * the bug. Measured against every case in syntaxRepair.test.ts, the two
 * scores agree on all of them, so the plain count is kept for being the
 * smaller thing to explain.
 *
 * The reasoning was not wrong so much as inapplicable, and the reason is
 * worth keeping: this worker configures abaplint from
 * `@abaplint/transpiler`'s own `config`, which enables almost no style rules.
 * `implicit_start_of_selection`, `check_comments` and `keyword_case` all fire
 * under `Config.getDefault()` and none of them fire here, so the Error set
 * this score reads is already close to "did not parse". **A probe run against
 * `Config.getDefault()` therefore does not predict this module's behaviour** —
 * that mistake was made once while choosing between these two scores, and it
 * inverted the answer. Use `transpilerConfig`, as the test does.
 *
 * The `WRITE: "hello".` and `WRITE: 'a', "b".` forms, where a comment eats a
 * chained operand, are invisible to either score: abaplint reports nothing at
 * all, so the program parses, runs, and silently prints less than it should.
 * That is #68, and it needs a signal that is not an error count.
 */
import { Registry, MemoryFile, type Config, type Issue } from "@abaplint/core";
import type { SyntaxRepair } from "../types/diagnostics";

/**
 * How many candidate edits are worth a re-parse.
 *
 * Each candidate costs one full `parseAsync`, and this runs on the Run path
 * after a failure — never on the lint path, which fires on every keystroke.
 * The cap bounds the worst case (a program with a quote on every line) at ten
 * parses of a Playground-sized program. A file whose only misused quote is
 * below the tenth quoted line gets no hint, which is the right way to fail:
 * silence, not a wrong guess.
 */
const MAX_CANDIDATES = 10;

/** The first `"..."` pair on a line, if it has one. */
const DOUBLE_QUOTED = /^([^"]*)"([^"]*)"(.*)$/;

/**
 * Rewrite `inner` as an ABAP text literal, doubling any apostrophe it
 * contains. `WRITE "it's here".` has to become `WRITE 'it''s here'.` — get
 * this wrong and the candidate fails to parse, the repair is discarded, and
 * the user with the apostrophe is the one who gets no help.
 */
function asTextLiteral(inner: string): string {
  return `'${inner.replace(/'/g, "''")}'`;
}

export interface RepairCandidate {
  /** 1-based row the edit was made on. */
  line: number;
  /** The whole source with that one line rewritten. */
  source: string;
}

/**
 * Every source that differs from `source` by turning one `"..."` pair into a
 * text literal, in row order.
 *
 * Deliberately not filtered: a line beginning with `*` is a comment and could
 * be skipped, but every such skip is a second place where "is this a comment?"
 * is decided, and that question having two answers is the bug this module was
 * rewritten to avoid. Comments cost a re-parse and lose it.
 */
export function doubleQuoteCandidates(source: string): RepairCandidate[] {
  const lines = source.split("\n");
  const candidates: RepairCandidate[] = [];

  for (let i = 0; i < lines.length && candidates.length < MAX_CANDIDATES; i++) {
    const match = DOUBLE_QUOTED.exec(lines[i]);
    if (match === null) continue;
    const [, before, inner, after] = match;
    const edited = [...lines];
    edited[i] = `${before}${asTextLiteral(inner)}${after}`;
    candidates.push({ line: i + 1, source: edited.join("\n") });
  }

  return candidates;
}

/**
 * The first candidate abaplint likes better than `source`, or `undefined`.
 *
 * `errorsIn` is a parameter rather than a direct call so the two halves can
 * fail separately in a test: drive it with a stub and the *search* is under
 * test (order, budget, which line is reported); drive it with `errorCounter`
 * and abaplint's own *judgement* is. A counterexample like
 * `WRITE |He said "hi"|.` only ever exercises the second.
 *
 * `before` is the caller's own count for the unedited source, taken from the
 * parse it had to do anyway.
 */
export async function findSyntaxRepair(
  source: string,
  before: number,
  errorsIn: (candidate: string) => Promise<number>,
): Promise<SyntaxRepair | undefined> {
  // Nothing to improve on. Not reachable from the Run path, which only asks
  // after a failure, but a caller that asked about a clean program should get
  // silence rather than a search that can only find a worse score.
  if (before === 0) return undefined;

  for (const candidate of doubleQuoteCandidates(source)) {
    if ((await errorsIn(candidate.source)) < before) {
      return { kind: "double_quote", line: candidate.line };
    }
  }

  return undefined;
}

/**
 * The score a candidate is judged on: Error-severity issues, all keys.
 *
 * Exported so the worker scores the original with the same function that
 * scores the candidates. Two counts computed two ways is the whole failure
 * mode here — the comparison is between them, so a difference in how they are
 * taken is indistinguishable from a difference the repair made.
 */
export function countErrors(issues: readonly Issue[]): number {
  return issues.filter((issue) => issue.getSeverity().toString() === "Error")
    .length;
}

/**
 * An error counter bound to `config` — the real judge.
 *
 * Exported so the worker and its test share one definition rather than two
 * that drift (the shape of #63). The filename is the worker's own so that a
 * candidate is judged under exactly the conditions the original parse was.
 */
export function errorCounter(
  config: Config,
  filename: string,
): (candidate: string) => Promise<number> {
  return async (candidate) => {
    const registry = new Registry(config);
    registry.addFile(new MemoryFile(filename, candidate));
    await registry.parseAsync();
    return countErrors(registry.findIssues());
  };
}
