import { describe, it, expect } from "vitest";
// The same `?raw` import ExecutionSandbox.tsx uses to inline this file into a
// blob: Worker. executor.js is plain global-scope JS with no imports/exports,
// so it cannot be `import`ed as an ES module and evaluated directly — hence
// `new Function` below. node:fs would also work, but the app tsconfig has no
// Node types (see src/securityHeaders.test.ts), so this stays consistent with
// how every other test here reads a non-TS file.
import executorSource from "./executor.js?raw";

interface OutputMessage {
  type: "output";
  lines: string[];
}
interface DoneMessage {
  type: "done";
  outputLines: number;
}
interface ErrorMessage {
  type: "error";
  message: string;
  outputLines: number;
}
type PostedMessage = OutputMessage | DoneMessage | ErrorMessage;

interface Streamer {
  add(text: string): void;
  clear(): void;
  isEmpty(): boolean;
  getPendingTail(): string;
  finish(): void;
  get(): string;
  total: number;
  emitted: number;
  lastFlush: number;
}

/**
 * A fresh `OutputStreamer`, isolated per test, plus every message it would
 * have posted out of the worker.
 */
function makeStreamer(): { streamer: Streamer; messages: PostedMessage[] } {
  const messages: PostedMessage[] = [];
  const self = { postMessage: (m: PostedMessage) => messages.push(m) };
  // `new Function` over trusted first-party source (executor.js), not user
  // input — this is the test harness's way of exercising code that has no
  // module exports to `import`.
  const factory = new Function(
    "self",
    `${executorSource}\nreturn OutputStreamer;`,
  );
  const OutputStreamer = factory(self) as new () => Streamer;
  return { streamer: new OutputStreamer(), messages };
}

/** Every line from every "output" message, in the order they were sent. */
function displayedLines(messages: PostedMessage[]): string[] {
  return messages
    .filter((m): m is OutputMessage => m.type === "output")
    .flatMap((m) => m.lines);
}

/**
 * Age `lastFlush` so the next `add()` call sees FLUSH_INTERVAL_MS (50ms) as
 * already elapsed, without an actual `setTimeout`/fake-timer dance — `add`
 * reads `Date.now() - this.lastFlush` directly, so pushing `lastFlush` into
 * the past has the same effect as real time passing.
 */
function ageLastFlush(streamer: Streamer): void {
  streamer.lastFlush = Date.now() - 1000;
}

describe("OutputStreamer", () => {
  it("fast path: two lines with no delay flush once, at finish, uncorrupted", () => {
    const { streamer, messages } = makeStreamer();
    streamer.add("a");
    streamer.add("\n");
    streamer.add("b");
    streamer.finish();

    expect(displayedLines(messages)).toEqual(["a", "b"]);
    expect(streamer.total).toBe(2);
    expect(streamer.emitted).toBe(2);
  });

  it("promotion path: an unterminated line is flushed before finish(), not buffered forever", () => {
    const { streamer, messages } = makeStreamer();
    streamer.add("tick");
    streamer.add("tick");
    // No "\n" anywhere — the exact shape of DO. WRITE 'tick'. ENDDO., which
    // never terminates. Nothing must depend on finish() ever being called.
    ageLastFlush(streamer);
    streamer.add("tick");

    const streamed = messages.filter((m): m is OutputMessage => m.type === "output");
    expect(streamed.length).toBeGreaterThan(0);
    expect(streamed[0].lines.join("")).toContain("tick");
  });

  // The three reviewer-verified regression cases. All three must produce
  // exactly the lines the program wrote — a flush landing at an unlucky
  // moment must never inject a blank line or inflate the count.
  describe("promotion followed by the newline that closes it (regression)", () => {
    it("baseline: fast two-line program, no delay at all", () => {
      const { streamer, messages } = makeStreamer();
      streamer.add("a");
      streamer.add("\n");
      streamer.add("b");
      streamer.finish();

      expect(displayedLines(messages)).toEqual(["a", "b"]);
      expect(streamer.total).toBe(2);
    });

    it("a delay lands on the plain-text call that starts a line (Critical)", () => {
      // Mirrors write.js: the runtime's very first WRITE never precedes
      // itself with "\n" (console.isEmpty() is still true), so a flush that
      // happens to land exactly on THIS call promotes plain text — not a
      // "\n" — leaving `continuation` to guard the real "\n" that follows.
      const { streamer, messages } = makeStreamer();
      ageLastFlush(streamer);
      streamer.add("a"); // promoted immediately: partial "a" is non-empty
      streamer.add("\n"); // must consume this, not render a blank line
      streamer.add("b");
      streamer.finish();

      expect(displayedLines(messages)).toEqual(["a", "b"]);
      expect(streamer.total).toBe(2);
    });

    it("a delay lands between a line's \"\\n\" and its text (Critical, the exact reviewer repro)", () => {
      // write.js issues console.add("\n") then, after formatting the value,
      // console.add(result) — two separate calls. A flush landing in that
      // gap promotes the *next* line's text while the previous line's `add`
      // has already resolved cleanly; the real newline that later closes the
      // promoted line must not be double-rendered as a blank one.
      const { streamer, messages } = makeStreamer();
      streamer.add("a");
      streamer.add("\n");
      ageLastFlush(streamer);
      streamer.add("b"); // promoted: this "add" call's flush check trips here
      streamer.add("\n"); // closes "b" — must not add a blank line
      streamer.add("c");
      streamer.finish();

      expect(displayedLines(messages)).toEqual(["a", "b", "c"]);
      expect(streamer.total).toBe(3);
    });

    it("steady one line roughly every flush interval, three lines (reviewer's exact case)", () => {
      const { streamer, messages } = makeStreamer();
      streamer.add("l1"); // first write: no leading "\n"
      ageLastFlush(streamer);
      streamer.add("\n");
      streamer.add("l2");
      ageLastFlush(streamer);
      streamer.add("\n");
      streamer.add("l3");
      streamer.finish();

      expect(displayedLines(messages)).toEqual(["l1", "l2", "l3"]);
      expect(streamer.total).toBe(3);
    });
  });

  describe("MAX_LINES truncation", () => {
    it("caps what is sent, keeps counting the true total, and reports the overage in finish()'s notice", () => {
      const { streamer, messages } = makeStreamer();
      const REAL_LINES = 10_050; // MAX_LINES (10,000) + 50, per executor.js
      for (let i = 0; i < REAL_LINES; i++) streamer.add("x\n");
      streamer.finish();

      const displayed = displayedLines(messages);
      const notice = displayed.find((l) => l.includes("output truncated"));
      expect(notice).toBeDefined();

      const realLines = displayed.filter((l) => l !== notice);
      // total/emitted diverge exactly at the cap: every real line the ABAP
      // program produced is counted, only MAX_LINES of them are ever sent.
      expect(streamer.emitted).toBe(10_000);
      expect(realLines).toHaveLength(10_000);
      expect(realLines.every((l) => l === "x")).toBe(true);
      // The overage must be the exact count, not a bare "[output truncated]"
      // — Task 2's collector reported this number and losing it was a
      // regression.
      expect(notice).toBe(
        `[output truncated: ${streamer.total - 10_000} more lines]`,
      );
      expect(streamer.total).toBeGreaterThan(streamer.emitted);
    });
  });

  // `get()` exists for one caller: @abaplint/runtime's `SKIP TO LINE n`, which
  // reads `console.get().split("\n").length` to learn the current line. The
  // direction of any error matters more than its size — over-reporting the
  // line makes `skip` clamp to zero and do nothing, while under-reporting it
  // makes `skip` emit blank lines the program never asked for.
  describe("get() reports the current line for SKIP TO LINE", () => {
    it("counts every line, including past MAX_LINES where display stops", () => {
      const { streamer } = makeStreamer();
      streamer.add("x\n".repeat(12000));

      // What `SKIP TO LINE n` computes as the current line.
      expect(streamer.get().split("\n").length).toBe(streamer.total + 1);
      expect(streamer.total).toBe(12000);
    });

    it("never under-reports, so SKIP TO LINE n behind the cursor stays a no-op", () => {
      const { streamer } = makeStreamer();
      streamer.add("x\n".repeat(12000));

      // The runtime's own arithmetic: lines = n - currentLine, clamped at 0.
      const currentLine = streamer.get().split("\n").length;
      expect(Math.max(0, 12000 - currentLine)).toBe(0);
    });
  });

  describe("MAX_OUTPUT_BYTES cap", () => {
    it("truncates with a notice and keeps flushing whatever was already buffered", () => {
      const { streamer, messages } = makeStreamer();
      const justUnderCap = "x".repeat(1024 * 1024 - 10);
      streamer.add(justUnderCap);
      // This call crosses the 1 MB cap — it must produce a truncation notice
      // rather than silently vanishing.
      streamer.add("y".repeat(100));
      // Everything from here on is past the cap and must be dropped, but the
      // *previously buffered* content must not be stranded: force a flush
      // the way the periodic timer would, and confirm it still goes out even
      // though the cap silently ignores this call's own content.
      for (let i = 0; i < 5; i++) streamer.add("more\n");
      ageLastFlush(streamer);
      streamer.add("more\n");
      streamer.finish();

      const displayed = displayedLines(messages);
      expect(displayed.some((l) => l.includes("output truncated"))).toBe(true);
      expect(displayed.some((l) => l.includes("more"))).toBe(false);
    });

    // Gate3 fix: `add()` used to stop incrementing `total` the instant the
    // byte cap tripped (an early return before the split/push block), so a
    // program that produced more than 1 MB and then finished normally
    // reported an `output_lines` that was neither the true produced count
    // nor the displayed count. CLAUDE.md documents `done`/`error` as
    // reporting "the executor's own uncapped `total`" — this held only for
    // the line-count cap (MAX_LINES), never for the byte cap, until this fix.
    it("keeps counting produced lines after the byte cap trips, without buffering or emitting them", () => {
      const { streamer, messages } = makeStreamer();
      // Land bytes on exactly MAX_OUTPUT_BYTES with a clean trailing "\n" —
      // no truncation notice gets injected, so every line from here on has
      // an unambiguous, easy-to-verify count.
      const exactlyAtCap = "x".repeat(1024 * 1024 - 1) + "\n";
      streamer.add(exactlyAtCap);

      const REAL_LINES_AFTER_CAP = 500;
      for (let i = 0; i < REAL_LINES_AFTER_CAP; i++) {
        streamer.add("past-the-cap-" + i + "\n");
      }
      // One more, unterminated line at the very end — must still be counted.
      streamer.add("trailing-partial");
      streamer.finish();

      const displayed = displayedLines(messages);
      // Nothing produced after the cap tripped reaches the display.
      expect(displayed.some((l) => l.startsWith("past-the-cap-"))).toBe(false);
      expect(displayed.some((l) => l === "trailing-partial")).toBe(false);
      expect(displayed).toHaveLength(1);
      // `total` still accounts for every line the program produced: the
      // pre-cap line counts as 2 (matching this suite's established
      // "a trailing newline's split-off empty string still counts" rule —
      // see the MAX_LINES truncation test above), plus every post-cap line,
      // plus the trailing unterminated one.
      expect(streamer.total).toBe(2 + REAL_LINES_AFTER_CAP + 1);
    });
  });

  it("isEmpty() is true initially and again after clear(), matching MemoryConsole", () => {
    const { streamer } = makeStreamer();
    expect(streamer.isEmpty()).toBe(true);

    streamer.add("hello");
    expect(streamer.isEmpty()).toBe(false);

    streamer.clear();
    expect(streamer.isEmpty()).toBe(true);

    // A fresh write after clear() must behave like nothing came before it.
    streamer.add("world");
    expect(streamer.getPendingTail()).toBe("world");
  });
});
