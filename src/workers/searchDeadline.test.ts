import { describe, it, expect } from "vitest";
import { Buffer } from "buffer";
(globalThis as unknown as { Buffer: typeof Buffer }).Buffer = Buffer;

import {
  bounded,
  SEARCH_BUDGET_MS,
  SearchDeadlineExceeded,
  withDeadline,
} from "./searchDeadline";
import { findSilentLoss, findSyntaxRepair } from "./syntaxRepair";
import { findStatementEndRepair } from "./statementEndRepair";

/** A clock the test moves by hand. */
function fakeClock() {
  let t = 0;
  return {
    now: () => t,
    advance: (ms: number) => {
      t += ms;
    },
  };
}

describe("withDeadline", () => {
  it("allows three seconds", () => {
    expect(SEARCH_BUDGET_MS).toBe(3000);
  });

  it("starts a re-parse before the deadline", async () => {
    const clock = fakeClock();
    const reparse = withDeadline(() => Promise.resolve(7), 100, clock.now);
    await expect(reparse("x")).resolves.toBe(7);
  });

  it("hands out a re-parse only once a deadline is named", async () => {
    const clock = fakeClock();
    let calls = 0;
    const build = bounded(() => {
      calls++;
      return Promise.resolve(7);
    }, clock.now);
    // `build` itself is not a re-parse — it takes the deadline and returns one.
    const reparse = build(100);
    await expect(reparse("x")).resolves.toBe(7);
    clock.advance(100);
    await expect(reparse("x")).rejects.toBeInstanceOf(SearchDeadlineExceeded);
    expect(calls).toBe(1);
  });

  it("refuses to start one at or after the deadline, without calling through", async () => {
    const clock = fakeClock();
    let calls = 0;
    const reparse = withDeadline(
      () => {
        calls++;
        return Promise.resolve(7);
      },
      100,
      clock.now,
    );
    clock.advance(100);
    await expect(reparse("x")).rejects.toBeInstanceOf(SearchDeadlineExceeded);
    expect(calls).toBe(0);
  });
});

/**
 * The deadline works by throwing, and every search already turns a throwing
 * re-parse into "no answer". These pin that contract for each search: if one
 * of them ever stops swallowing the throw, the throw would escape into
 * abaplintWorker.ts after the verdict was already posted, and the follow-up
 * message the App is waiting for would never be sent.
 */
describe("a search that runs out of time", () => {
  /** Each re-parse costs 60 ms of fake time against a 100 ms budget: two start, the third is refused. */
  function slow<T>(value: T) {
    const clock = fakeClock();
    let calls = 0;
    const reparse = withDeadline(
      () => {
        calls++;
        clock.advance(60);
        return Promise.resolve(value);
      },
      100,
      clock.now,
    );
    return { reparse, calls: () => calls };
  }

  it("leaves the double-quote search with no hint", async () => {
    const source = Array.from({ length: 5 }, (_, i) => `WRITE "a${i}".`).join("\n");
    // The count never drops, so nothing but the deadline ends the search.
    const { reparse, calls } = slow(99);
    await expect(findSyntaxRepair(source, 99, reparse)).resolves.toBeUndefined();
    expect(calls()).toBe(2);
  });

  it("reports the silent-loss search as not completed", async () => {
    const source = Array.from({ length: 5 }, (_, i) => `WRITE: "a${i}".`).join("\n");
    const { reparse, calls } = slow({ errors: 0, real: 1 });
    await expect(
      findSilentLoss(source, { errors: 0, real: 1 }, reparse),
    ).resolves.toEqual({ completed: false });
    expect(calls()).toBe(2);
  });

  it("leaves the statement-end search with no hint", async () => {
    const source = Array.from({ length: 5 }, (_, i) => `WRITE ${i};`).join("\n");
    const spans = Array.from({ length: 5 }, (_, i) => ({ start: i + 1, end: i + 1 }));
    // Every re-parse still reports an error on every row, so nothing is accepted.
    const { reparse, calls } = slow([1, 2, 3, 4, 5]);
    await expect(findStatementEndRepair(source, spans, reparse)).resolves.toBeUndefined();
    expect(calls()).toBe(2);
  });
});
