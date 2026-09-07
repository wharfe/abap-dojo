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
 * The cap bounds the worst case (a program with a quote on every line) at
 * eleven parses of a Playground-sized program. A file whose only misused
 * quote is below the tenth quoted line gets no hint, which is the right way
 * to fail: silence, not a wrong guess.
 */
const MAX_CANDIDATES = 10;

/**
 * Above this many characters, do not search at all.
 *
 * The candidate cap bounds the number of parses but not the work: each parse
 * is over the whole source, so the cost is the cap times the input. Measured
 * at ~138 ms for ten parses of a 302-line program, which is nothing against
 * the 20s watchdog — but that watchdog only ends the *display*, it does not
 * interrupt this worker, so a large enough paste would occupy it after the
 * user has already been told the run stalled. 64 kB is far above any program
 * anyone types and far below the size where that matters.
 */
const MAX_SOURCE_CHARS = 64 * 1024;

/**
 * The first `"..."` pair on a line, if it has one.
 *
 * `ALL_DOUBLE_QUOTED` below is the same idea without the "first": the
 * all-at-once candidate needs every pair, because a line can be wrong twice
 * (`WRITE "a" && "b".`) and fixing one of them leaves the parse as broken as
 * it was.
 *
 * The tail is `[\s\S]*` rather than `.*` because `.` excludes `\r`, and the
 * source is split on `\n` alone. Under CRLF every line ends in `\r`, so `.*$`
 * matched nothing and the whole feature went silent for anyone who pasted
 * from an editor that uses CRLF — with no error and no way to notice. The
 * input here is always a single line, so `[\s\S]` cannot over-reach.
 */
const DOUBLE_QUOTED = /^([^"]*)"([^"]*)"([\s\S]*)$/;

/** Every `"..."` pair on a line. See the note above. */
const ALL_DOUBLE_QUOTED = /"([^"]*)"/g;

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
  /**
   * 1-based row the edit was made on, or `undefined` for the candidate that
   * rewrites everything — always undefined there, even when it happened to
   * touch one row, because that row can hold several pairs and the score
   * attributes the improvement to none of them in particular.
   */
  line?: number;
  /** The whole source with the edit applied. */
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
  if (source.length > MAX_SOURCE_CHARS) return [];

  const lines = source.split("\n");
  const candidates: RepairCandidate[] = [];
  const all = [...lines];
  let rewritten = 0;

  for (let i = 0; i < lines.length; i++) {
    const match = DOUBLE_QUOTED.exec(lines[i]);
    if (match === null) continue;
    // The all-at-once line takes EVERY pair, not just the one the single-line
    // candidate rewrites.
    all[i] = lines[i].replace(ALL_DOUBLE_QUOTED, (_, inner: string) =>
      asTextLiteral(inner),
    );
    rewritten++;
    if (candidates.length < MAX_CANDIDATES) {
      const [, before, inner, after] = match;
      const edited = [...lines];
      edited[i] = `${before}${asTextLiteral(inner)}${after}`;
      candidates.push({ line: i + 1, source: edited.join("\n") });
    }
  }

  // One more, with everything rewritten at once, and it is not an
  // optimisation — it is the only candidate that reaches two shapes that
  // matter. abaplint collapses consecutive swallowed statements into a SINGLE
  // error, so with two misused quotes on adjacent lines no one-line edit
  // lowers the count; and a line wrong twice needs both halves fixed:
  //
  //   WRITE "hello".                   before 1, one-line candidate 0 -> found
  //   WRITE "hello". / WRITE "world".  before 1, every one-line one 1 -> missed
  //   WRITE "a" && "b".                before 1, first-pair-only    1 -> missed
  //
  // It comes last so a single-line diagnosis wins when there is one, because
  // that one can name the row and this one CANNOT: the rewrite touched
  // several places and the search does not know which mattered. Naming the
  // first is worse than naming none — put a correct `* note "x"` above two
  // misused quotes and the first is the comment, so the hint would point at a
  // line that was never wrong.
  const multi = rewritten > 1 || all.join("\n") !== candidates[0]?.source;
  if (rewritten > 0 && multi) {
    candidates.push({ source: all.join("\n") });
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
    // A candidate is source this module mangled on purpose, so it reaches the
    // parser in shapes the user's own text never would. If one of them throws,
    // the only correct outcome is "no hint": the caller has already computed
    // the real verdict and letting the throw out would replace a correct
    // `syntax_error` with a `transpile_error` — the split CLAUDE.md calls
    // load-bearing, corrupted by the thing that was meant to explain it.
    let after: number;
    try {
      after = await errorsIn(candidate.source);
    } catch {
      return undefined;
    }
    if (after < before) {
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
