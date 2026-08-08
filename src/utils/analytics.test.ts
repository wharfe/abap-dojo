import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { track, sanitizeParams, lineCount, isSendableKey } from "./analytics";
import type { EventName, RunOutcome } from "./analytics";

/**
 * Push an object through sanitizeParams for `name` without the compile-time
 * EventMap check, so we can assert what the RUNTIME allowlist does with keys
 * and values the type system would have rejected. The type system is not the
 * boundary; these tests exist to prove the runtime is.
 */
function sanitizeUnchecked(
  name: EventName,
  params: Record<string, unknown>,
): Record<string, string | number> {
  return sanitizeParams(name, params);
}

describe("sanitizeParams", () => {
  it("keeps declared counts, enums and ids", () => {
    expect(
      sanitizeParams("validate_result", {
        outcome: "warn",
        duration_ms: 120,
        lint_issues: 3,
        pitfalls: 1,
        line_count: 42,
      }),
    ).toEqual({
      outcome: "warn",
      duration_ms: 120,
      lint_issues: 3,
      pitfalls: 1,
      line_count: 42,
    });
    expect(sanitizeParams("sample_select", { sample_id: "hello-world" })).toEqual(
      { sample_id: "hello-world" },
    );
  });

  it("drops undefined values", () => {
    expect(
      sanitizeParams("run_result", {
        outcome: "success",
        duration_ms: 5,
        output_lines: undefined,
      }),
    ).toEqual({ outcome: "success", duration_ms: 5 });
  });

  // The invariant that matters: ABAP source must never reach GA4. The boundary
  // is the per-event allowlist, so an undeclared key is not merely filtered --
  // it is never read at all.
  it("drops keys the event did not declare", () => {
    expect(
      sanitizeUnchecked("run_click", {
        line_count: 4,
        source: "REPORT ztest.\nWRITE 'x'.",
      }),
    ).toEqual({ line_count: 4 });
  });

  // Regression guard for the real leak vector: abaplint and transpiler error
  // messages embed the user's own source verbatim on a SINGLE line, so a
  // newline-based heuristic would have forwarded these.
  it("drops single-line strings that contain source code", () => {
    expect(
      sanitizeUnchecked("run_result", {
        outcome: "transpile_error",
        duration_ms: 12,
        message: `Database table or view "zcust_secret" not found`,
      }),
    ).toEqual({ outcome: "transpile_error", duration_ms: 12 });

    expect(
      sanitizeUnchecked("share_click", {
        url_length: 900,
        line_count: 2,
        snippet: "SELECT * FROM zsecret WHERE pwd = 'hunter2'.",
      }),
    ).toEqual({ url_length: 900, line_count: 2 });
  });

  // The transpile diagnostics widen run_result by two parameters, so they get
  // the same scrutiny as the rest of the boundary. The closed-set check that
  // makes `transpile_node` safe lives in the worker; this asserts the shape
  // guard behind it, which is what stands if that check ever regresses.
  it("accepts the transpile diagnostics and nothing shaped like source", () => {
    expect(
      sanitizeUnchecked("run_result", {
        outcome: "transpile_error",
        duration_ms: 30,
        transpile_reason: "unsupported_statement",
        transpile_node: "Multiply",
      }),
    ).toEqual({
      outcome: "transpile_error",
      duration_ms: 30,
      transpile_reason: "unsupported_statement",
      transpile_node: "Multiply",
    });

    for (const transpile_node of [
      "SELECT * FROM zsecret",
      "lv_secret_password",
      "Multiply;DROP",
      "",
      "Multiply ",
      "REPORT ztest.\nWRITE 'x'.",
    ]) {
      expect(
        sanitizeUnchecked("run_result", {
          outcome: "transpile_error",
          duration_ms: 30,
          transpile_node,
        }),
      ).toEqual({ outcome: "transpile_error", duration_ms: 30 });
    }

    expect(
      sanitizeUnchecked("run_result", {
        outcome: "transpile_error",
        duration_ms: 30,
        transpile_reason: "Statement Multiply not supported, MULTIPLY lv_secret BY 3.",
      }),
    ).toEqual({ outcome: "transpile_error", duration_ms: 30 });
  });

  /**
   * Pins the limit of the shape guard so nobody mistakes it for the guarantee.
   * Every case the loop above rejects contains a space, an underscore, a
   * semicolon or a newline. A bare DDIC table name has none of those and sails
   * through — which is fine, because the worker only ever hands this parameter
   * a name it has already matched against abaplint's exports, but it means the
   * pattern would not stop a leak if that check regressed.
   */
  it("does not pretend the AST_NODE pattern is the privacy guarantee", () => {
    for (const transpile_node of ["ZSECRET", "MARA", "T100", "zcustomerpii"]) {
      expect(
        sanitizeUnchecked("run_result", {
          outcome: "transpile_error",
          duration_ms: 30,
          transpile_node,
        }),
      ).toEqual({ outcome: "transpile_error", duration_ms: 30, transpile_node });
    }
  });

  /**
   * The diagnostics describe a transpile failure and mean nothing on any other
   * outcome. A per-key allowlist cannot say that, so `sanitizeParams` drops
   * them itself — the caller getting it right is not the guarantee.
   */
  it("drops the transpile diagnostics on every other outcome", () => {
    for (const outcome of [
      "success",
      "syntax_error",
      "runtime_error",
      "timeout",
      "stalled",
      "cancelled",
      "stopped",
      "load_error",
    ] satisfies RunOutcome[]) {
      expect(
        sanitizeUnchecked("run_result", {
          outcome,
          duration_ms: 30,
          transpile_reason: "unsupported_statement",
          transpile_node: "Multiply",
        }),
      ).toEqual({ outcome, duration_ms: 30 });
    }

    // Including the case where `outcome` itself was rejected: nothing is left
    // to justify the diagnostics, so they go too.
    expect(
      sanitizeUnchecked("run_result", {
        outcome: "not_a_real_outcome",
        duration_ms: 30,
        transpile_reason: "unsupported_statement",
        transpile_node: "Multiply",
      }),
    ).toEqual({ duration_ms: 30 });
  });

  /** The three categories that cannot occur are no longer accepted values. */
  it("rejects the retired transpile reasons", () => {
    for (const transpile_reason of ["db_missing", "void_type", "kernel_missing"]) {
      expect(
        sanitizeUnchecked("run_result", {
          outcome: "transpile_error",
          duration_ms: 30,
          transpile_reason,
        }),
      ).toEqual({ outcome: "transpile_error", duration_ms: 30 });
    }
  });

  it("drops multi-line strings", () => {
    expect(
      sanitizeUnchecked("sample_select", {
        sample_id: "REPORT ztest.\nWRITE 'x'.",
      }),
    ).toEqual({});
  });

  it("drops strings carrying a carriage return", () => {
    expect(sanitizeUnchecked("sample_select", { sample_id: "a\r\nb" })).toEqual(
      {},
    );
  });

  // Previously long strings were truncated to 100 chars and sent. Dropping is
  // strictly stronger: a value that does not match its declared shape never
  // leaves the browser, not even a prefix of it.
  it("drops over-long ids instead of truncating them", () => {
    expect(
      sanitizeUnchecked("sample_select", { sample_id: "x".repeat(250) }),
    ).toEqual({});
  });

  it("drops non-finite and non-integer numbers", () => {
    expect(
      sanitizeUnchecked("share_click", {
        url_length: NaN,
        line_count: Infinity,
      }),
    ).toEqual({});
    expect(
      sanitizeUnchecked("share_click", { url_length: 1.5, line_count: 10 }),
    ).toEqual({ line_count: 10 });
  });

  it("drops negative counts", () => {
    expect(
      sanitizeUnchecked("run_result", { outcome: "success", duration_ms: -1 }),
    ).toEqual({ outcome: "success" });
  });

  it("drops values of unsupported types", () => {
    expect(
      sanitizeUnchecked("run_click", { line_count: { nested: true } }),
    ).toEqual({});
    expect(sanitizeUnchecked("run_click", { line_count: () => 1 })).toEqual({});
    expect(sanitizeUnchecked("run_click", { line_count: "4" })).toEqual({});
  });

  it("drops enum values outside the declared set", () => {
    expect(sanitizeUnchecked("mode_switch", { to_mode: "modernizer" })).toEqual(
      {},
    );
    expect(
      sanitizeUnchecked("run_result", { outcome: "pass", duration_ms: 1 }),
    ).toEqual({ duration_ms: 1 });
  });

  // Every exit path in App.tsx must survive the allowlist, or the run it
  // reports vanishes and reads as a user drop-off instead.
  //
  // ALL_RUN_OUTCOMES is a Record<RunOutcome, true> rather than a plain array
  // so this stays exhaustive at compile time: a tenth outcome added to
  // RunOutcome but not here is a missing-property type error, not a test that
  // silently stops covering it (the failure mode this test exists to catch).
  it("accepts every declared run outcome", () => {
    const ALL_RUN_OUTCOMES: Record<RunOutcome, true> = {
      success: true,
      syntax_error: true,
      transpile_error: true,
      runtime_error: true,
      timeout: true,
      stalled: true,
      cancelled: true,
      stopped: true,
      load_error: true,
    };
    for (const outcome of Object.keys(ALL_RUN_OUTCOMES) as RunOutcome[]) {
      expect(sanitizeParams("run_result", { outcome, duration_ms: 1 })).toEqual({
        outcome,
        duration_ms: 1,
      });
    }
  });

  it("accepts the stopped outcome", () => {
    expect(
      sanitizeParams("run_result", {
        outcome: "stopped",
        duration_ms: 900,
        output_lines: 42,
      }),
    ).toEqual({ outcome: "stopped", duration_ms: 900, output_lines: 42 });
  });

  it("drops ids that are not the authored kebab-case shape", () => {
    expect(sanitizeUnchecked("sample_select", { sample_id: "Hello World" })).toEqual(
      {},
    );
    expect(sanitizeUnchecked("sample_select", { sample_id: "-leading" })).toEqual(
      {},
    );
  });

  // A caller passing page_location -- the "fix SPA tracking" mistake that would
  // send the "#code=<user source>" hash -- is dropped because the event does not
  // declare it. This asserts the allowlist, NOT the reserved-name guard: an
  // undeclared key never reaches that guard. See the isSendableKey suite below.
  it("never forwards reserved GA4 names passed by a caller", () => {
    const out = sanitizeUnchecked("share_click", {
      url_length: 100,
      line_count: 2,
      page_location: "https://abapdojo.com/#code=eJxLyU8uAQ",
      page_referrer: "https://abapdojo.com/#code=eJxLyU8uAQ",
      user_id: "abc",
      ga_session_id: "1",
    });
    expect(out).toEqual({ url_length: 100, line_count: 2 });
  });

  it("returns nothing for an unknown event name", () => {
    expect(
      sanitizeUnchecked("not_an_event" as EventName, { line_count: 1 }),
    ).toEqual({});
  });

  it("returns nothing when params is not an object", () => {
    expect(
      sanitizeUnchecked("run_click", null as unknown as Record<string, unknown>),
    ).toEqual({});
    expect(
      sanitizeUnchecked(
        "run_click",
        undefined as unknown as Record<string, unknown>,
      ),
    ).toEqual({});
  });
});

/**
 * The second line of defence, guarding the allowlist itself against a careless
 * future entry in EVENT_PARAMS. Tested directly because it is unreachable
 * through sanitizeParams today — the tests above pass for a different reason.
 */
describe("isSendableKey", () => {
  it("accepts the parameter names we actually declare", () => {
    for (const key of [
      "line_count",
      "duration_ms",
      "outcome",
      "sample_id",
      "url_length",
      "to_mode",
      "mode",
      "output_lines",
      "lint_issues",
      "pitfalls",
    ]) {
      expect(isSendableKey(key)).toBe(true);
    }
  });

  it("rejects GA4 names that override page or user context", () => {
    for (const key of [
      "page_location",
      "page_referrer",
      "page_title",
      "page_path",
      "screen_location",
      "user_id",
      "client_id",
      "session_id",
    ]) {
      expect(isSendableKey(key)).toBe(false);
    }
  });

  it("rejects GA4 reserved prefixes", () => {
    expect(isSendableKey("ga_session_id")).toBe(false);
    expect(isSendableKey("google_tag")).toBe(false);
    expect(isSendableKey("firebase_screen")).toBe(false);
  });

  it("rejects names over the GA4 40-character limit", () => {
    expect(isSendableKey("a".repeat(40))).toBe(true);
    expect(isSendableKey("a".repeat(41))).toBe(false);
  });
});

describe("lineCount", () => {
  it("counts lines without exposing content", () => {
    expect(lineCount("a\nb\nc")).toBe(3);
    expect(lineCount("")).toBe(0);
    expect(lineCount("single")).toBe(1);
  });

  it("treats an empty trailing line as a line, like the editor gutter", () => {
    expect(lineCount("a\n")).toBe(2);
    expect(lineCount("\n\n\n")).toBe(4);
  });

  it("counts CRLF input correctly", () => {
    expect(lineCount("a\r\nb")).toBe(2);
  });
});

/** A spy whose signature matches the `window.gtag` declaration. */
function makeGtagSpy() {
  return vi.fn((...args: unknown[]): void => {
    void args;
  });
}

describe("track", () => {
  let gtag: ReturnType<typeof makeGtagSpy>;

  beforeEach(() => {
    gtag = makeGtagSpy();
    window.gtag = gtag;
  });

  afterEach(() => {
    delete window.gtag;
  });

  it("forwards the event name and sanitized params to gtag", () => {
    track("sample_select", { sample_id: "hello-world" });
    expect(gtag).toHaveBeenCalledWith("event", "sample_select", {
      sample_id: "hello-world",
    });
  });

  it("sanitizes params before sending", () => {
    // @ts-expect-error deliberately passing source code to prove it is stripped
    track("run_click", { line_count: 4, source: "REPORT z.\nWRITE 'x'." });
    expect(gtag).toHaveBeenCalledWith("event", "run_click", { line_count: 4 });
  });

  it("does nothing when gtag is unavailable", () => {
    delete window.gtag;
    expect(() => track("run_click", { line_count: 1 })).not.toThrow();
  });

  it("never throws when gtag itself fails", () => {
    window.gtag = () => {
      throw new Error("blocked by extension");
    };
    expect(() => track("run_click", { line_count: 1 })).not.toThrow();
  });
});
