import { test, expect, type Page } from "@playwright/test";
import { openProgram } from "./helpers";

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

test("an endless loop does not freeze the tab", async ({ page }) => {
  await openProgram(page, "REPORT ztest.\nDO.\nENDDO.");
  await page.getByRole("button", { name: /Run/i }).click();

  // The watchdog is 15s; give it room and keep checking that the renderer is
  // still answering the whole time.
  expect(await stayedResponsive(page, 18)).toBe(true);
});

test("an endless loop still produces a terminal result", async ({ page }) => {
  await openProgram(page, "REPORT ztest.\nDO.\nENDDO.");
  await page.getByRole("button", { name: /Run/i }).click();

  // The run must end on its own: the Run button becomes usable again. The
  // button is never given a `disabled` attribute (Toolbar swaps its label
  // and handler between Run and Stop instead), so `toBeEnabled()` cannot
  // actually fail on enabled-ness here — `toBeVisible()` states what this
  // assertion checks: the label flipped back to "Run", which only happens
  // once the run has ended.
  await expect(page.getByRole("button", { name: /Run/i })).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByText(/endless loop/i)).toBeVisible();
});

test("an ordinary program still runs and prints", async ({ page }) => {
  await openProgram(page, "REPORT ztest.\nWRITE 'hello from e2e'.");
  // Pressed at once, on purpose: openProgram leaves the page still booting,
  // and a Run that beat the worker's idle boot used to post to no worker at
  // all (#47). Before the fix this failed 7 of 10 full-suite runs on WebKit.
  await page.getByRole("button", { name: /Run/i }).click();
  // Scoped to the output for the reason given in the next test: the editor
  // shows the source, and "hello from e2e" is in it.
  await expect(
    page.getByTestId("output-line").filter({ hasText: "hello from e2e" }),
  ).toBeVisible({
    timeout: 30_000,
  });
});

test("output written before a timeout is still shown", async ({ page }) => {
  await openProgram(page, "REPORT ztest.\nDO.\nWRITE 'tick'.\nENDDO.");
  await page.getByRole("button", { name: /Run/i }).click();

  // page.getByText("tick") alone is not safe here: the literal source the
  // editor is displaying contains the substring "tick" too (Monaco mirrors
  // it into syntax-highlighted spans), so that locator would match before
  // Run is even clicked. Scoping to OutputPanel's own output-line test id is
  // what actually proves output arrived (rather than a Tailwind colour class,
  // which a palette change could silently break). The loop never ends, so a
  // match can only appear if output is flushed while the program still runs.
  await expect(
    page.getByTestId("output-line").filter({ hasText: "tick" }).first(),
  ).toBeVisible({ timeout: 10_000 });
});

test("the user can stop an endless loop immediately", async ({ page }) => {
  await openProgram(page, "REPORT ztest.\nDO.\nWRITE 'tick'.\nENDDO.");
  await page.getByRole("button", { name: /Run/i }).click();

  // Wait for at least one output flush before stopping, so this test proves
  // "stop while running" rather than racing the very first flush interval
  // (the executor batches output every 500 lines or 50ms — see executor.js).
  const tickLine = page
    .getByTestId("output-line")
    .filter({ hasText: "tick" })
    .first();
  await expect(tickLine).toBeVisible({ timeout: 10_000 });

  const stop = page.getByRole("button", { name: /Stop/i });
  await expect(stop).toBeVisible();
  await stop.click();

  // Back to Run well before the 15s watchdog would have done it anyway.
  await expect(page.getByRole("button", { name: /Run/i })).toBeVisible({
    timeout: 5_000,
  });
  // Output already visible above proves the program was actually running,
  // not merely displaying its own source.
  await expect(tickLine).toBeVisible();
});
