import { describe, it, expect } from "vitest";
import { Buffer } from "buffer";
(globalThis as unknown as { Buffer: typeof Buffer }).Buffer = Buffer;

import { doubleQuoteCandidates, findSilentLoss } from "./syntaxRepair";

/**
 * #75: every search shares one size cap, lowered from 64 kB. The work of one
 * parse grows far faster than the source — `WRITE 'value#';` on every row
 * took 120 ms at 16 kB and 1,249 ms at 64 kB in Node (2026-09-12), about ten
 * times the work for four times the text — so at 64 kB the double-quote
 * search alone took 12.8 s in Firefox.
 *
 * Since the worker now answers with the verdict BEFORE searching (#67 plan
 * Task 4), a slow search no longer turns a real `syntax_error` into
 * `stalled`. What the cap now bounds is how long this worker is unavailable
 * to `lint`, which runs on every keystroke and cannot interleave: abaplint's
 * `parseAsync` does not yield (0 macrotasks during a 1,220 ms parse,
 * measured 2026-09-12).
 */
describe("the size cap every search shares", () => {
  const under = `WRITE "a".\n`.repeat(1489);
  const over = `WRITE "a".\n`.repeat(1490);

  it("sits at 16 kB", () => {
    expect(under.length).toBeLessThanOrEqual(16 * 1024);
    expect(over.length).toBeGreaterThan(16 * 1024);
    expect(doubleQuoteCandidates(under)).not.toEqual([]);
    expect(doubleQuoteCandidates(over)).toEqual([]);
  });

  it("stops the silent-loss search too, and reports that it did not look", async () => {
    let parses = 0;
    const counting = () => {
      parses++;
      return Promise.resolve({ errors: 0, real: 1 });
    };
    await expect(
      findSilentLoss(over, { errors: 0, real: 1 }, counting),
    ).resolves.toEqual({ completed: false });
    expect(parses).toBe(0);
  });
});
