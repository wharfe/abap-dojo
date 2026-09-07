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

/** Run the current program and wait for the run to finish. */
export async function runProgram(page: Page): Promise<void> {
  await page.getByRole("button", { name: /Run/i }).click();
  await expect(page.getByRole("button", { name: /Run/i })).toBeVisible({
    timeout: 60_000,
  });
}
