import { test, expect, type Page } from "@playwright/test";

const EDITOR = ".monaco-editor, textarea";

/** Replace the editor contents with `source`. */
async function typeProgram(page: Page, source: string): Promise<void> {
  await page.waitForSelector(EDITOR, { timeout: 30_000 });
  await page.click(EDITOR);
  await page.keyboard.press("ControlOrMeta+A");
  // insertText (not type): Monaco's own keydown handling (autoclosing quotes,
  // electric characters) races with per-keystroke automation and drops or
  // duplicates characters under CDP. insertText delivers the text as a single
  // paste-like input event, which Monaco applies atomically to its model.
  await page.keyboard.insertText(source);
}

/**
 * Poll the page with a SHORT per-call timeout. This is the whole trick: a
 * frozen renderer makes `evaluate` hang, and a hang is indistinguishable from
 * slowness unless you bound it. Bounded, the freeze becomes an error we can
 * assert on.
 *
 * `page.evaluate` itself has no `timeout` option (only `Locator.evaluate`
 * does; `Page.evaluate` rejects a 3rd argument outright via Playwright's own
 * `assertMaxArguments` check), so the bound has to be built by racing it
 * against a plain timer instead.
 */
async function stayedResponsive(page: Page, seconds: number): Promise<boolean> {
  for (let i = 0; i < seconds; i++) {
    const responded = await Promise.race([
      // .catch(): when the timer below wins the race, this promise keeps
      // running in the background and can later reject (e.g. "Target closed"
      // once the test tears down the page) with nothing left awaiting it —
      // an unhandled rejection. Swallowing it here just means "not a response
      // in time", which is already what happens when the timer wins.
      page
        .evaluate(() => 1 + 1)
        .then(() => true)
        .catch(() => false),
      new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 1000)),
    ]);
    if (!responded) return false;
    await page.waitForTimeout(1000);
  }
  return true;
}

test("an endless loop does not freeze the tab", async ({ page, browserName }) => {
  // On WebKit, the *transpile* worker (a different worker from the execution
  // sandbox this suite is about) never replies for this program, and the run
  // never reaches the sandbox at all — see #47. Without a fix, "the tab stays
  // responsive" would be true here for the wrong reason (nothing is running),
  // which is worse than not testing it.
  test.skip(browserName === "webkit", "pre-existing WebKit transpile stall, see #47");

  await page.goto("/");
  await typeProgram(page, "REPORT ztest.\nDO.\nENDDO.");
  await page.getByRole("button", { name: /Run/i }).click();

  // The watchdog is 5s at this point in the plan; give it room and keep
  // checking that the renderer is still answering the whole time.
  expect(await stayedResponsive(page, 8)).toBe(true);
});

test("an endless loop still produces a terminal result", async ({ page, browserName }) => {
  // See #47: the transpile worker itself stalls on WebKit for this program,
  // well before the execution sandbox this suite exercises is ever reached.
  // Confirmed pre-existing (reproduces identically on the commit before the
  // blob:-Worker-in-iframe rework this suite tests), so it's tracked
  // separately rather than gating this task's e2e coverage.
  test.skip(browserName === "webkit", "pre-existing WebKit transpile stall, see #47");

  await page.goto("/");
  await typeProgram(page, "REPORT ztest.\nDO.\nENDDO.");
  await page.getByRole("button", { name: /Run/i }).click();

  // The run must end on its own: the Run button becomes usable again.
  await expect(page.getByRole("button", { name: /Run/i })).toBeEnabled({
    timeout: 30_000,
  });
  await expect(page.getByText(/timeout/i)).toBeVisible();
});

test("an ordinary program still runs and prints", async ({ page }) => {
  await page.goto("/");
  await typeProgram(page, "REPORT ztest.\nWRITE 'hello from e2e'.");
  await page.getByRole("button", { name: /Run/i }).click();
  await expect(page.getByText("hello from e2e")).toBeVisible({
    timeout: 30_000,
  });
});
