import { test, expect } from "@playwright/test";
import { typeProgram, clickRun } from "./helpers";

/**
 * abaplint reports `Expected ENDIF` at (1,1) wherever the IF is (#72). The
 * worker swaps the message for an explanation and drops the line; this is the
 * one place that sees the real worker's answer reach the screen. `App.test.tsx`
 * drives a fake worker and `abaplintWorker.test.ts` stops at postMessage.
 */
const EXPLANATION = /does not say where the problem is/i;

// Same reason as syntaxHint.spec.ts: WebKit's transpile worker intermittently
// never answers (#47), which says nothing about this change.
test.skip(
  ({ browserName }) => browserName === "webkit",
  "pre-existing intermittent WebKit transpile stall, see #47",
);

test("a missing ENDIF is explained without pointing at line 1", async ({ page }) => {
  await page.goto("/");
  await typeProgram(page, `REPORT ztest.\nIF 1 = 1.\n  WRITE 'a'.`);
  await clickRun(page);

  const error = page.getByText(EXPLANATION).first();
  await expect(error).toBeVisible({ timeout: 30_000 });
  await expect(error).toContainText("Expected ENDIF");
  await expect(page.getByText(/\(L1\)/)).toHaveCount(0);
});
