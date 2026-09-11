import { expect, type Page } from "@playwright/test";

const EDITOR = ".monaco-editor, textarea";

/** Replace the editor contents with `source`. */
export async function typeProgram(page: Page, source: string): Promise<void> {
  await page.waitForSelector(EDITOR, { timeout: 30_000 });
  await page.click(EDITOR);
  await page.keyboard.press("ControlOrMeta+A");
  // insertText (not type): Monaco's own keydown handling (autoclosing quotes,
  // electric characters) races with per-keystroke automation and drops or
  // duplicates characters under CDP. insertText delivers the text as a single
  // paste-like input event, which Monaco applies atomically to its model.
  //
  // For this suite that is not only about speed: several programs here are
  // about the quote characters themselves, and Monaco's autoclosing would
  // rewrite them into something the test did not mean to run.
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
 * could still appear. #70 was exactly that gap: the silent-loss hint arrives
 * with the transpile result, while the run is still executing, and the
 * placeholder is hidden during a run no matter what — so `toHaveCount(0)` on
 * the placeholder passed against a build that did not contain the fix, 5 runs
 * out of 12. Use `waitForRunToEnd` when the negative is about the end state.
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
