import { test, expect } from "@playwright/test";
import { typeProgram, clickRun, waitForRunToEnd } from "./helpers";

/**
 * The #68 hint, end to end.
 *
 * This is the one failure in the app that produces no error, no warning and
 * no output, so it is also the one where every layer below the screen can be
 * green while the user sees nothing. `syntaxRepair.test.ts` proves the search;
 * it stops at the module. The hint then has to survive a different worker
 * message from the #69 one (`transpile-result`, not `transpile-error`), a
 * `success` outcome, and an OutputPanel branch that renders a placeholder for
 * exactly the state this program produces — output empty, no error, no status.
 * Nothing but a real run exercises that combination.
 */
const HINT = /double quote begins a comment/i;
const PLACEHOLDER = /Click Run to execute your ABAP code/i;

/** Same reason as syntaxHint.spec.ts: the WebKit transpile stall, #47. */
test.skip(
  ({ browserName }) => browserName === "webkit",
  "pre-existing intermittent WebKit transpile stall, see #47",
);

test("a chained WRITE whose only operand was eaten is explained", async ({
  page,
}) => {
  await page.goto("/");
  await typeProgram(page, `REPORT ztest.\nWRITE: "hello".`);
  await clickRun(page);

  const hint = page.getByText(HINT);
  await expect(hint).toBeVisible({ timeout: 30_000 });
  await expect(hint).toContainText("line 2");
  // The run succeeded, so nothing must be painted as a failure.
  await expect(page.getByText(/Syntax error|Transpile error/i)).toHaveCount(0);
  // And the placeholder must have got out of the way: output is empty and
  // there is no error, which is precisely when it used to render — directly
  // under the hint, telling the user to press the button they just pressed.
  // The hint is not the end of the run — it arrives with the transpile result,
  // and the placeholder is hidden while running regardless — so wait for the
  // run to end first, or this passes without the fix (#70: 5 of 12 runs).
  await waitForRunToEnd(page);
  await expect(page.getByText(PLACEHOLDER)).toHaveCount(0);
});

test("a partly eaten chain still prints what survived, and says so", async ({
  page,
}) => {
  await page.goto("/");
  await typeProgram(page, `REPORT ztest.\nWRITE: 'a', "b".`);
  await clickRun(page);

  // `a` is written and `b` is not — the shape that makes "the run produced no
  // output" useless as a trigger.
  await expect(page.getByText(/^a$/m)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(HINT)).toBeVisible();

  // Below the output, not above it. Asserted rather than left to the JSX
  // because it is a deliberate choice about how the panel reads, and the kind
  // of thing a later edit reorders without noticing.
  const lastLine = await page
    .getByTestId("output-line")
    .last()
    .boundingBox();
  const hint = await page.getByText(HINT).boundingBox();
  expect(hint!.y).toBeGreaterThan(lastLine!.y);
});

test("a correct program that prints nothing gets no hint", async ({ page }) => {
  await page.goto("/");
  await typeProgram(
    page,
    `REPORT ztest.\n* a note about "x" and "y"\nDATA lv TYPE i.\nlv = 1.`,
  );
  await clickRun(page);

  await expect(page.getByText(PLACEHOLDER)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(HINT)).toHaveCount(0);
});

test("the hint does not outlive the program it describes", async ({ page }) => {
  // The panel clears output and error when a sample is loaded, so a hint left
  // behind would describe code the user can no longer see — and because the
  // placeholder is suppressed while a hint is showing, they would get a stale
  // warning instead of an invitation to run. Found by review; there was no
  // test for it because App.tsx's wiring has none at all (#17).
  await page.goto("/");
  await typeProgram(page, `REPORT ztest.\nWRITE: "hello".`);
  await clickRun(page);
  await expect(page.getByText(HINT)).toBeVisible({ timeout: 30_000 });

  await page.getByRole("combobox").selectOption("hello-world");

  await expect(page.getByText(HINT)).toHaveCount(0);
  await expect(page.getByText(PLACEHOLDER)).toBeVisible();
});

test("editing the program takes the hint with it", async ({ page }) => {
  // The commonest way to act on the hint is to fix the line it is about, and
  // until the run after that the panel would keep showing a warning about code
  // that is no longer there. Clearing it wherever the editor changes was tried
  // and is a list that was already wrong twice, so visibility is derived from
  // whether the editor still holds the program the hint describes.
  await page.goto("/");
  await typeProgram(page, `REPORT ztest.\nWRITE: "hello".`);
  await clickRun(page);
  await expect(page.getByText(HINT)).toBeVisible({ timeout: 30_000 });

  await typeProgram(page, `REPORT ztest.\nWRITE: 'hello'.`);

  await expect(page.getByText(HINT)).toHaveCount(0);
});
