import { type Page } from "@playwright/test";

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
 * against the pre-click button and returns immediately. It happened not to
 * produce a false green here, because every negative assertion in this suite
 * is preceded by a positive wait — but a helper whose contract is stronger
 * than its behaviour is a false green waiting for its first careless caller.
 */
export async function clickRun(page: Page): Promise<void> {
  await page.getByRole("button", { name: /Run/i }).click();
}
