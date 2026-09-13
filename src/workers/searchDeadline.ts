/**
 * One time limit for every re-parse search in a Run (#75).
 *
 * ## What it protects, and what it does not
 *
 * It does NOT protect the syntax verdict. The worker posts that before any
 * search starts (abaplintWorker.ts), so a search that overruns delays a hint
 * and cannot turn a real `syntax_error` into `stalled`. An earlier design put
 * the search in front of the verdict, and then no cap could be made to
 * guarantee enough — which is why the message was split instead.
 *
 * What it protects is `lint`. abaplint's `parseAsync` does not yield to the
 * event loop — 0 macrotasks during a 1,220 ms parse (Node, 2026-09-12) — so
 * while a search runs, every `lint` queued behind it by the user's typing is
 * frozen, and the editor's underlines stop updating.
 *
 * ## It bounds, it does not guarantee
 *
 * The size cap (MAX_SOURCE_CHARS, in searchLimits.ts) bounds how large a
 * source the searches look at, but not how long one parse of it takes: at
 * 16 kB that ranges from about 30 ms to well over a second by shape alone
 * (32 ms to 1.4 s across seven shapes, Node, 2026-09-12). This deadline
 * cannot stop a parse already running, only refuse to start the next one, so
 * the worst case is the budget plus one parse — and that is the part worth
 * remembering, because the parse is what varies. On the heaviest 16 kB shape
 * (`x` on 8,192 rows) that came to a 4.0 s search after a 1.0 s first parse,
 * 5.0 s of frozen `lint` in total (Node, 2026-09-12); the same first parse
 * ranged 1.0-1.4 s between runs, and an earlier session measured one
 * candidate parse of that shape at 5.8 s. Either way it is a real cost paid
 * in editor responsiveness, and it is the reason this file exists rather
 * than nothing.
 *
 * The deadline is enforced by throwing from the wrapped re-parse, because
 * every search already treats a throwing re-parse as "no answer" —
 * `findSyntaxRepair` and `findStatementEndRepair` return undefined,
 * `findSilentLoss` reports `completed: false`. None of them needs to know the
 * deadline exists; searchDeadline.test.ts pins that for each.
 *
 * The price: for a paste heavy enough to reach it, whether a hint appears
 * depends on how fast the device is. An ordinary paste (about 20 lines per
 * Run) finishes its searches far below it.
 */

export const SEARCH_BUDGET_MS = 3000;

export class SearchDeadlineExceeded extends Error {
  constructor() {
    super("re-parse search deadline passed");
    this.name = "SearchDeadlineExceeded";
  }
}

/** `reparse`, refusing to start once `now()` has reached `deadline`. */
export function withDeadline<T>(
  reparse: (candidate: string) => Promise<T>,
  deadline: number,
  now: () => number = () => performance.now(),
): (candidate: string) => Promise<T> {
  return (candidate) =>
    now() >= deadline
      ? Promise.reject(new SearchDeadlineExceeded())
      : reparse(candidate);
}

/**
 * The same, as the only way to obtain a re-parse function at all.
 *
 * A caller holding one of these cannot hand it to a search without naming a
 * deadline first — the types do not line up — so a forgotten wrapper is a
 * compile error rather than a search that quietly runs forever. That matters
 * because nothing else can see the omission: the searches behave identically
 * with and without a deadline until an input heavy enough to reach it turns
 * up, and no test in this repo uses one (they pass their own fake re-parse).
 *
 * Wrap the raw counter where it is created (abaplintWorker.ts does this on
 * the same line), so the unbounded form is never in scope at a call site.
 */
export function bounded<T>(
  reparse: (candidate: string) => Promise<T>,
  now: () => number = () => performance.now(),
): (deadline: number) => (candidate: string) => Promise<T> {
  return (deadline) => withDeadline(reparse, deadline, now);
}
