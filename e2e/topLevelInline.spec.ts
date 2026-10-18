import { test, expect } from "@playwright/test";
import { openProgram, clickRun, waitForRunToEnd } from "./helpers";

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
