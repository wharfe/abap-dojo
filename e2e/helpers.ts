import { expect, type Page } from "@playwright/test";
import { encodeSource } from "../src/utils/urlShare";

/**
 * Open the app with `source` already in the editor, through the share link.
 *
 * Use this to set a test's program, not typeProgram. Typing into Monaco does
 * not reliably produce the text sent (measured 2026-10-14 in the CI image,
 * Playwright 1.59.1, by reading the source the app hands its worker):
 *
 * - Firefox doubles the first line of any multi-line insertText into Monaco,
 *   every time, even into an empty editor. `REPORT ztest.` twice is a syntax
 *   error, so a correct program printed nothing and the test failed.
 * - Chromium rewrites indented multi-line text the same way (Monaco treats it
 *   as typing, not as a paste).
 * - The old helper usually got away with it because Monaco loads at the first
 *   idle moment and the typing landed in EditorPanel's plain textarea first.
 *   When Monaco won that race, the keys either went to Monaco (above) or to a
 *   textarea that had just been removed: 22 of 100 Firefox runs left the
 *   editor holding something other than what the test meant to run.
 *
 * `#code=` is decoded straight into App's state, so the source is exact. It
 * also shows the shared-code banner and hides the hero, which nothing here
 * asserts on.
 */
export async function openProgram(page: Page, source: string): Promise<void> {
  await page.goto(`/#code=${encodeSource(source)}`);
}

/**
 * Change the program in an editor that is already open, by typing.
 *
 * NOT exact — see openProgram. Use it only where the test needs the program
 * to change and does not depend on the precise text that results (editing the
 * program after a run). Setting a test's program is openProgram's job.
 */
export async function typeProgram(page: Page, source: string): Promise<void> {
  await page.waitForSelector(".monaco-editor", { timeout: 30_000 });
  await page.click(".monaco-editor");
  // Monaco picks its select-all key from the user agent, not the host OS, so
  // ControlOrMeta+A selects nothing when a Windows UA runs on a Mac (see the
  // heavy-paste test in syntaxHint.spec.ts).
  const selectAll = (await page.evaluate(() => navigator.userAgent.includes("Macintosh")))
    ? "Meta+A"
    : "Control+A";
  await page.keyboard.press(selectAll);
  await page.keyboard.insertText(source);
}

/**
 * Press Run. Does NOT wait for the run to finish — each test waits for the
 * thing it is actually asserting.
 *
 * An earlier version claimed to wait, by asserting a `/Run/i` button was
 * visible afterwards. That is vacuous: the label only becomes `Stop` once
 * React has flushed `setIsRunning(true)`, so the assertion usually resolves
 * against the pre-click button and returns immediately. A helper whose
 * contract is stronger than its behaviour is a false green waiting for its
 * first careless caller.
 *
 * A positive wait before a negative assertion is NOT enough on its own; the
 * thing waited for has to come after the last moment the unwanted element
 * could still appear. #70 was exactly that gap: the placeholder is hidden
 * during a run no matter what, so `toHaveCount(0)` on it passed against a
 * build that did not contain the fix, 5 runs out of 12. Use
 * `waitForRunToEnd` when the negative is about the end state — and
 * `waitForSearchDone` when it is about a hint, which since #67/#75 arrives on
 * a later message than the result and can land after the run has ended.
 */
export async function clickRun(page: Page): Promise<void> {
  await page.getByRole("button", { name: /Run/i }).click();
}

/**
 * Wait until the toolbar button reads Run again, i.e. `isRunning` is false.
 *
 * Only meaningful once something has already proved the run started (output,
 * a hint, an error). Called straight after `clickRun` it has the same flaw
 * the note above describes: the pre-click button already says Run.
 */
export async function waitForRunToEnd(page: Page): Promise<void> {
  await expect(page.getByRole("button", { name: /Run/i })).toBeVisible({
    timeout: 30_000,
  });
}

/**
 * Wait until the searches that explain a failure have answered for this run.
 *
 * The worker replies twice (#67/#75): the verdict, then whatever the
 * re-parse searches found. So an error being visible no longer means "and
 * there is no hint" — the hint may still be seconds away. Any assertion that
 * a hint is ABSENT has to come after this, or it is #70 again: a negative
 * that runs before the last moment the element could appear passes against a
 * build with no fix in it at all.
 *
 * `done` also covers "App stopped waiting" — a run that ends `stalled`,
 * `stopped` or `cancelled` reaches it without any search having answered. So
 * this wait orders a negative assertion; it does not establish that the run
 * did what the test is about. Assert the expected verdict as well.
 */
export async function waitForSearchDone(page: Page): Promise<void> {
  await expect(page.locator('[data-search="done"]')).toHaveCount(1, {
    timeout: 30_000,
  });
}

/** The number in the Lint tab's label. */
export async function lintCount(page: Page): Promise<number> {
  const label =
    (await page.getByRole("button", { name: /^Lint \(\d+\)$/ }).textContent()) ?? "";
  return Number(/\((\d+)\)/.exec(label)?.[1] ?? NaN);
}

/**
 * Wait until the lint the user's own typing queued has come back.
 *
 * One worker, one thread. `typeProgram` inserts the whole program in a single
 * input event, which schedules a lint (debounced 400 ms, src/App.tsx), and the
 * worker's boot also lints whatever is in the editor by then. A Run pressed
 * while one of those is parsing does not race it — it QUEUES behind it, and
 * the verdict then costs two heavy parses instead of one. For a paste at the
 * size cap that is the difference between answering and reaching App.tsx's
 * 20s watchdog, so a test about a heavy paste fails for a reason that has
 * nothing to do with what it is testing.
 *
 * The Lint tab's own count is the signal: it can only change once a
 * `lint-result` came back from the worker, which means the thread is free. A
 * fixed sleep would be a guess about a parse that costs 32 ms or 1.4 s
 * depending on shape (Node, 2026-09-12).
 *
 * Takes the count from BEFORE the program was typed and waits for it to
 * change, rather than waiting for "not zero". Not-zero happens to work today
 * (the default program lints clean) but it is a wait that silently stops
 * waiting the day the default program gains one issue — and a guard that
 * disappears without going red is worse than no guard (Gate2 3 周目 M6).
 *
 * The timeout stays under `playwright.config.ts`'s per-test `timeout: 60_000`
 * so that running out of patience here fails as this wait, not as an opaque
 * test timeout.
 */
export async function waitForLintToSettle(page: Page, previous: number): Promise<void> {
  await expect.poll(() => lintCount(page), { timeout: 30_000 }).not.toBe(previous);
}
