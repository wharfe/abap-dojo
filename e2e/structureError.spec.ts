import { test, expect } from "@playwright/test";
import { openProgram, clickRun } from "./helpers";

/**
 * abaplint reports `Expected ENDIF` at (1,1) wherever the IF is (#72). The
 * worker swaps the message for an explanation that names the IF and its
 * line; this is the one place that sees the real worker's answer reach the
 * screen. `App.test.tsx` drives a fake worker and `abaplintWorker.test.ts`
 * stops at postMessage.
 */
const EXPLANATION = /abaplint found no ENDIF for the IF on line 2/i;

test("a missing ENDIF is explained with the IF's line, not line 1", async ({ page }) => {
  await openProgram(page, `REPORT ztest.\nIF 1 = 1.\n  WRITE 'a'.`);
  await clickRun(page);

  const error = page.getByText(EXPLANATION).first();
  await expect(error).toBeVisible({ timeout: 30_000 });
  await expect(error).toContainText("Expected ENDIF");
  await expect(error).toContainText("(L2)");
  await expect(page.getByText(/\(L1\)/)).toHaveCount(0);
});
