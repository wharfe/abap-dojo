import { test, expect } from "@playwright/test";
import { openProgram, clickRun, waitForRunToEnd } from "./helpers";
import { encodeSource } from "../src/utils/urlShare";

/**
 * #95, end to end: top-level inline declarations run.
 *
 * topLevelInline.test.ts proves the declarations against the real runtime;
 * this is what it cannot reach. The feature deep-imports the transpiler's
 * build output, and only the production worker bundle shows whether those
 * imports survived Vite (CJS interop, keepNames), and whether Run actually
 * goes through buildRunnableJs rather than a second copy of the join.
 */
test("a report with top-level DATA(x) runs and prints", async ({ page }) => {
  await openProgram(
    page,
    `REPORT ztest.
DATA(lv_greeting) = \`Hello\`.
IF lv_greeting IS NOT INITIAL.
  DATA(lv_count) = 3.
ENDIF.
WRITE / lv_greeting.
WRITE / lv_count.`,
  );
  await clickRun(page);

  const lines = page.getByTestId("output-line");
  await expect(lines.filter({ hasText: /^Hello$/ })).toBeVisible({
    timeout: 30_000,
  });
  await expect(lines.filter({ hasText: /^3$/ })).toBeVisible();
  await waitForRunToEnd(page);
  await expect(page.getByText(/is not defined/)).toHaveCount(0);
});

// The Validator transpiles in its own handler; both go through
// buildRunnableJs, and this is the only test that exercises the second one.
test("the Validator's runtime stage passes with top-level DATA(x)", async ({
  page,
}) => {
  await page.goto(
    `/#mode=validator&code=${encodeSource(`REPORT ztest.
DATA(lv_total) = 2 * 3.
WRITE / lv_total.`)}`,
  );
  await page.getByRole("button", { name: /Validate/i }).first().click();
  const runtime = page.getByRole("button", { name: /Runtime/ });
  await expect(runtime).toContainText(/OK|pass/i, { timeout: 30_000 });
  await expect(runtime).not.toContainText(/is not defined/);
});
