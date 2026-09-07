import { test, expect } from "@playwright/test";
import { typeProgram, clickRun } from "./helpers";

/**
 * The hint is produced in the abaplint worker, travels on the
 * `transpile-error` message, and is rendered by OutputPanel. Nothing in the
 * Vitest suite crosses that boundary: `syntaxRepair.test.ts` proves the search
 * and abaplint's judgement, and stops at the module. App.tsx's worker wiring
 * has no unit tests at all (#17), so a hint that is computed correctly and
 * then dropped on the way to the screen would look green everywhere except
 * here.
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
  await expect(page.getByText(HINT)).toHaveCount(0);
});

test("a syntax error we cannot explain gets no invented hint", async ({
  page,
}) => {
  await page.goto("/");
  await typeProgram(page, `REPORT ztest.\nFROBNICATE lv_x.`);
  await clickRun(page);

  await expect(page.getByText(/Syntax error/i)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(HINT)).toHaveCount(0);
});
