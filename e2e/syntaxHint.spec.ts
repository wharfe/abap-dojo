import { test, expect } from "@playwright/test";
import {
  typeProgram,
  clickRun,
  lintCount,
  waitForLintToSettle,
  waitForSearchDone,
} from "./helpers";
import { MAX_SOURCE_CHARS } from "../src/workers/searchLimits";

/**
 * The hint is produced in the abaplint worker, travels on its own
 * `syntax-hint` message — which arrives AFTER the `transpile-error` that
 * failed the run (#67/#75) — and is rendered by OutputPanel. Nothing in the
 * Vitest suite crosses that boundary: `syntaxRepair.test.ts` and
 * `statementEndRepair.test.ts` prove the searches and abaplint's judgement,
 * and stop at the module; `App.test.tsx` drives a fake worker, so it proves
 * App's half of the protocol but never that the real worker sends what App
 * waits for. A hint that is computed correctly and then dropped on the way to
 * the screen would look green everywhere except here.
 */
const HINT = /double quote begins a comment/i;

/**
 * Every test here needs a run to actually finish, and on WebKit that is not
 * reliable: the transpile worker intermittently never answers and the 20s
 * watchdog reports "The ABAP engine stopped responding" instead of a result
 * (#47). Measured while writing this file — two runs of the same four tests
 * failed on two *different* pairs, and the same failures reproduce against the
 * tree without the repair search, so it is neither program-dependent nor
 * caused by the extra parses. Chromium and Firefox cover the wiring; leaving
 * WebKit in would buy a flaky suite and no signal.
 */
test.skip(
  ({ browserName }) => browserName === "webkit",
  "pre-existing intermittent WebKit transpile stall, see #47",
);

test("a double quote used as a string quote is explained", async ({ page }) => {
  await page.goto("/");
  await typeProgram(page, `REPORT ztest.\nWRITE "hello".`);
  await clickRun(page);

  const output = page.getByText(HINT);
  await expect(output).toBeVisible({ timeout: 30_000 });
  // The row matters as much as the diagnosis: abaplint reports this failure on
  // a row the user did not mistype whenever a statement follows it.
  await expect(output).toContainText("line 2");
});

test("the hint points at the row the quote is on, not the row abaplint blamed", async ({
  page,
}) => {
  await page.goto("/");
  await typeProgram(page, `REPORT ztest.\nWRITE "hello".\nWRITE 'ok'.`);
  await clickRun(page);

  await expect(page.getByText(HINT)).toContainText("line 2", {
    timeout: 30_000,
  });
});

test("a correct program with comments gets no hint", async ({ page }) => {
  await page.goto("/");
  await typeProgram(
    page,
    `REPORT ztest.\n* he said "hello" here\nWRITE 'a'. " and this is a note`,
  );
  await clickRun(page);

  await expect(page.getByText(/^a$/m)).toBeVisible({ timeout: 30_000 });
  // Output appears when execution starts; the silent-loss search answers on a
  // later message and can land after that. Without this wait the negative is
  // decided before the hint could have appeared (#70).
  await waitForSearchDone(page);
  await expect(page.getByText(HINT)).toHaveCount(0);
});

test("a syntax error we cannot explain gets no invented hint", async ({
  page,
}) => {
  await page.goto("/");
  await typeProgram(page, `REPORT ztest.\nFROBNICATE lv_x.`);
  await clickRun(page);

  await expect(page.getByText(/Syntax error/i)).toBeVisible({ timeout: 30_000 });
  await waitForSearchDone(page);
  await expect(page.getByText(HINT)).toHaveCount(0);
});

const PERIOD_HINT = /every ABAP statement ends with a period/i;
const SEMICOLON_HINT = /not a semicolon/i;

test("a missing period is explained, on the row the statement ends on", async ({
  page,
}) => {
  await page.goto("/");
  await typeProgram(page, `REPORT ztest.\nWRITE: 'a',\n       'b'`);
  await clickRun(page);

  await expect(page.getByText(PERIOD_HINT)).toContainText("line 3", {
    timeout: 30_000,
  });
});

test("a semicolon used to end a statement is explained", async ({ page }) => {
  await page.goto("/");
  await typeProgram(page, `REPORT ztest.\nWRITE 'a';`);
  await clickRun(page);

  await expect(page.getByText(SEMICOLON_HINT)).toContainText("line 2", {
    timeout: 30_000,
  });
});

test("pasted JavaScript is not told it forgot a period", async ({ page }) => {
  await page.goto("/");
  await typeProgram(page, `REPORT ztest.\nconsole.log('a')`);
  await clickRun(page);

  // Assert the verdict we expect BEFORE waiting, and keep it asserted: since
  // #75 `data-search="done"` also means "we stopped waiting", which a
  // `stalled` run reaches immediately. Without this line a build that stalls
  // on everything would satisfy the two negatives below and report success
  // for the opposite of what they claim (Gate2 1 周目 H2).
  await expect(page.getByText(/Syntax error/i)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/stopped responding/i)).toHaveCount(0);
  // The hint is a separate message now, so the error being on screen proves
  // nothing about its absence. Wait for the searches to answer first (#70).
  await waitForSearchDone(page);
  await expect(page.getByText(PERIOD_HINT)).toHaveCount(0);
  await expect(page.getByText(SEMICOLON_HINT)).toHaveCount(0);
});

test("the verdict does not wait for the search on a heavy paste", async ({
  page,
  browserName,
}) => {
  // One engine, not the file's usual two. What this test is about — that the
  // worker's verdict goes out ahead of its search, so App.tsx's watchdog
  // never fires on a real syntax error — is message ordering inside App and
  // the worker, and no part of it is engine-specific.
  //
  // What IS engine-specific is the price. Parsing 16 kB of abaplint twice
  // over, once per engine, at the same moment, saturates the machine: with
  // both projects running it, the verdict took over 30 s to reach the screen
  // on Firefox in 4 of 5 repeats, and one ordinary silentLoss test on the
  // other worker lost its hint the same way. That is the runner running out
  // of cores, not the app, and a test that reports it as this failure is
  // reporting the wrong thing.
  test.skip(browserName !== "chromium", "16 kB parse per engine saturates the runner");
  // Three times the usual per-test budget, for the setup rather than the
  // thing under test. Measured on this machine with one browser and nothing
  // else running: pasting 16 kB into Monaco costs 4.9 s on Chromium, the lint
  // it queues another 1.0 s, and only then does the run start; with the rest
  // of the suite alongside it the whole test lands around 17 s, and a smaller
  // CI runner has less to spare.
  //
  // This does not soften anything. What the test is about is whether App.tsx
  // paints "stopped responding", and that is decided by App's OWN 20s
  // watchdog, not by Playwright's patience: a build that put the search back
  // in front of the verdict would trip the watchdog and fail the assertion
  // below however long this budget is.
  test.slow();
  // #75: a 16 kB paste whose whole file is one statement takes abaplint
  // seconds per parse, and the search re-parses it up to 33 times. While that
  // sat in front of the reply, App.tsx's 20s watchdog fired first and this
  // real syntax error was shown as "The ABAP engine stopped responding".
  //
  // The size is the point of the test and it sits ON the boundary: one more
  // character and the search is skipped, so the run gets fast for a reason
  // that has nothing to do with the fix and this test silently stops testing
  // anything (Gate2 1 周目 M3). The real constant is imported rather than
  // retyped — a literal here would make the assertion arithmetic, true
  // whatever the app does (Gate2 2 周目 M1). searchLimits.ts has no imports
  // of its own precisely so this line does not drag abaplint into the runner.
  const source = `x\n`.repeat(MAX_SOURCE_CHARS / 2);
  expect(source.length).toBe(MAX_SOURCE_CHARS);

  await page.goto("/");
  // Wait for the real editor before pasting, and only in this test. Until
  // Monaco loads, EditorPanel shows a plain textarea, and Chromium's CDP
  // insertText into a textarea is quadratic in the text's length: measured on
  // this machine, 16 kB took 103.7 s into a bare textarea on an otherwise
  // empty page — the app is not involved — against 5.0 s into Monaco and
  // 0.3 s into the same textarea on Firefox. The whole test then died in
  // typeProgram, before Run was ever pressed. The other tests here paste a
  // couple of rows, where the difference does not register.
  await page.waitForSelector(".monaco-editor", { timeout: 30_000 });
  const lintBefore = await lintCount(page);
  await typeProgram(page, source);
  // Let the keystroke-driven lint finish before pressing Run. The worker is
  // one thread: if the boot-time lint of this same 16 kB source is still
  // parsing, the Run queues behind it and the verdict costs two heavy parses
  // instead of one — enough to reach the 20s watchdog and fail this test for
  // a reason the change cannot fix (Gate2 2 周目 H1). Task 7's measurement
  // script waits for the same reason.
  await waitForLintToSettle(page, lintBefore);
  await clickRun(page);

  await expect(page.getByText(/Syntax error/i)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/stopped responding/i)).toHaveCount(0);
});
