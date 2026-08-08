import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { forwardRef, useEffect, useImperativeHandle } from "react";
import { render, act, screen, fireEvent } from "@testing-library/react";
import type { ExecutionSandboxHandle } from "./components/ExecutionSandbox";

/**
 * A fake AbaplintWorker whose `onmessage` the test can drive directly, so a
 * "transpile-result" can be delivered on demand rather than waiting on the
 * real (heavy) abaplint pipeline. `vi.hoisted` is required because the
 * `vi.mock` factory below runs before this file's own top-level statements.
 */
const { workerInstances, FakeWorker } = vi.hoisted(() => {
  class FakeWorker {
    onmessage: ((event: MessageEvent) => void) | null = null;
    postMessage = vi.fn();
    terminate = vi.fn();
  }
  const workerInstances: FakeWorker[] = [];
  return { workerInstances, FakeWorker };
});

vi.mock("./workers/abaplintWorker?worker", () => ({
  default: class extends FakeWorker {
    constructor() {
      super();
      workerInstances.push(this);
    }
  },
}));

/**
 * Real ExecutionSandbox fetches a Vite-resolved bundle URL jsdom cannot serve
 * (see ExecutionSandbox.test.tsx). This suite is about what App.tsx does
 * BEFORE the sandbox ever gets involved, so a stub handle is enough — and
 * makes "the sandbox was never asked to execute anything" a direct assertion
 * instead of an inference from iframe absence.
 */
const executeMock = vi.fn();
const stopMock = vi.fn();
// Captures the callback props App.tsx passes to <ExecutionSandbox> on the
// most recent render, so a test can play the sandbox's side of the message
// contract (onDone/onTimeout/onStopped/...) without a real iframe.
let sandboxProps: {
  onOutput: (lines: string[], requestId: string) => void;
  onError: (
    message: string,
    requestId: string,
    kind: "runtime" | "load",
    outputLines: number,
  ) => void;
  onDone: (requestId: string, outputLines: number) => void;
  onTimeout: (requestId: string, outputLines: number) => void;
  onStopped: (requestId: string, outputLines: number) => void;
  onCancel: (requestId: string) => void;
} | null = null;
vi.mock("./components/ExecutionSandbox", () => ({
  ExecutionSandbox: forwardRef<ExecutionSandboxHandle>(function StubSandbox(
    props,
    ref,
  ) {
    // Capturing `props` in an effect (not directly in the render body) keeps
    // this stub a pure render function; the effect flushes before `act()`
    // returns, so it is still visible to the assertion that follows.
    useEffect(() => {
      sandboxProps = props as NonNullable<typeof sandboxProps>;
    });
    useImperativeHandle(ref, () => ({ execute: executeMock, stop: stopMock }));
    return null;
  }),
  EXECUTION_TIMEOUT_SECONDS: 15,
}));

// `track` no-ops unless `window.gtag` is set (see analytics.ts), which is not
// the point of this suite. Mocking it directly makes "exactly one run_result"
// assertable regardless of that gate.
const trackMock = vi.fn();
vi.mock("./utils/analytics", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./utils/analytics")>();
  return { ...actual, track: trackMock };
});

// Imported after the mocks above so App.tsx picks them up.
const { default: App } = await import("./App");

/**
 * The `requestId` App.tsx generated for its most recent "transpile" post —
 * the real abaplintWorker.ts echoes this back verbatim on both
 * "transpile-result" and "transpile-error" (see the requestId correlation
 * fix). Tests that hand-drive `worker.onmessage` need this to build a
 * response that looks like it actually answers the run currently in flight.
 */
function lastTranspileRequestId(worker: InstanceType<typeof FakeWorker>): string {
  const calls = worker.postMessage.mock.calls as Array<
    [{ type: string; requestId?: string }]
  >;
  const call = [...calls].reverse().find(([msg]) => msg.type === "transpile");
  if (!call || call[0].requestId === undefined) {
    throw new Error("no transpile request was posted");
  }
  return call[0].requestId;
}

describe("App — Stop during the transpile round trip", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    workerInstances.length = 0;
    executeMock.mockClear();
    stopMock.mockReset();
    trackMock.mockClear();
    sandboxProps = null;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // Review fix: pressing Stop while still waiting on the abaplint worker (the
  // run never reached the sandbox, so `sandboxRef.current.stop()` reports
  // `false` — it does not own this requestId) must still end the run exactly
  // once, with the `stopped` outcome, and must not let the transpile-result
  // that eventually arrives start an execution nobody asked for anymore.
  // Whether `stop()` is even called is not the point here — what matters is
  // that App falls back to ending the run itself when told it isn't owned.
  it("ends the run once as `stopped` and swallows the late transpile-result", async () => {
    render(<App />);

    // Let scheduleIdle's fallback timer boot the (fake) abaplint worker.
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(workerInstances).toHaveLength(1);
    const worker = workerInstances[0];

    fireEvent.click(screen.getByRole("button", { name: /Run/i }));
    // "transpile" was posted; the worker has not answered yet, so the run is
    // still in the round trip this test targets.
    expect(worker.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: "transpile" }),
    );

    // stopMock's default (unconfigured) return is `undefined`, which is
    // falsy — the sandbox never owned this requestId (execute() was never
    // called), matching what the real ExecutionSandbox would report.
    fireEvent.click(screen.getByRole("button", { name: /Stop/i }));

    // Exactly one run_result, reporting the user's own choice.
    const runResultCalls = trackMock.mock.calls.filter(
      ([name]) => name === "run_result",
    );
    expect(runResultCalls).toHaveLength(1);
    expect(runResultCalls[0][1]).toMatchObject({ outcome: "stopped" });
    expect(executeMock).not.toHaveBeenCalled();

    // The transpile worker answers late, after the user already gave up on
    // this run. Nothing should start. Echoing the run's own requestId here
    // (rather than omitting it) shows the guard rejects it on
    // `playgroundRequestIdRef.current` being cleared, not merely on a
    // requestId mismatch.
    const abandonedRequestId = lastTranspileRequestId(worker);
    act(() => {
      worker.onmessage?.({
        data: {
          type: "transpile-result",
          js: "console.log(1)",
          requestId: abandonedRequestId,
        },
      } as MessageEvent);
    });

    expect(executeMock).not.toHaveBeenCalled();
    const runResultCallsAfter = trackMock.mock.calls.filter(
      ([name]) => name === "run_result",
    );
    expect(runResultCallsAfter).toHaveLength(1);

    // Back to Run, not stuck showing Stop for a run that no longer exists.
    // getByRole throws if the button is not found, which is the assertion.
    screen.getByRole("button", { name: /Run/i });
  });
});

describe("App — a stale transpile response from an abandoned run must not affect a later run", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    workerInstances.length = 0;
    executeMock.mockClear();
    stopMock.mockReset();
    trackMock.mockClear();
    sandboxProps = null;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // Gate3 fix (CRITICAL 1): Run A -> Stop while A is still transpiling -> Run
  // B (fresh requestId) -> A's transpile-result finally arrives. Before the
  // requestId correlation fix, the guard on "transpile-result" was only
  // `if (playgroundRequestIdRef.current)` — true again once Run B set it —
  // so A's JS would execute under B's requestId, and a `transpile-error`
  // reply from A would incorrectly end B's run. Both must be impossible now
  // that the response is matched against the requestId App actually sent.
  it("ignores a stale transpile-result and lets Run B proceed on its own reply", async () => {
    render(<App />);
    act(() => {
      vi.advanceTimersByTime(200);
    });
    const worker = workerInstances[0];

    // Run A, then Stop it before the worker answers.
    fireEvent.click(screen.getByRole("button", { name: /Run/i }));
    const requestIdA = lastTranspileRequestId(worker);
    fireEvent.click(screen.getByRole("button", { name: /Stop/i }));
    expect(
      trackMock.mock.calls.filter(([name]) => name === "run_result"),
    ).toHaveLength(1);

    // Run B — a fresh requestId is now current.
    fireEvent.click(screen.getByRole("button", { name: /Run/i }));
    const requestIdB = lastTranspileRequestId(worker);
    expect(requestIdB).not.toBe(requestIdA);

    // A's transpile-result finally lands, carrying A's own (stale) requestId.
    act(() => {
      worker.onmessage?.({
        data: { type: "transpile-result", js: "console.log('A')", requestId: requestIdA },
      } as MessageEvent);
    });

    // A's JS must never reach the sandbox — neither as a fresh execution nor
    // attributed to B.
    expect(executeMock).not.toHaveBeenCalled();
    // Still exactly one run_result (A's `stopped`) — B has not resolved yet,
    // and the stale reply must not have produced a second one for it.
    expect(
      trackMock.mock.calls.filter(([name]) => name === "run_result"),
    ).toHaveLength(1);

    // B's own reply now arrives and must be the one that actually executes.
    act(() => {
      worker.onmessage?.({
        data: { type: "transpile-result", js: "console.log('B')", requestId: requestIdB },
      } as MessageEvent);
    });
    expect(executeMock).toHaveBeenCalledTimes(1);
    expect(executeMock).toHaveBeenCalledWith("console.log('B')", requestIdB);
  });

  // Same scenario, but A's stale reply is a transpile-error. Before the fix
  // this called `endRun`, emitting a spurious `run_result` for B (which had
  // not failed) and, since `endRun` clears nothing about B's own in-flight
  // request, left B's eventual real transpile-result still trying to execute
  // — i.e. two `run_result`s for one `run_click`.
  it("ignores a stale transpile-error and does not end Run B", async () => {
    render(<App />);
    act(() => {
      vi.advanceTimersByTime(200);
    });
    const worker = workerInstances[0];

    fireEvent.click(screen.getByRole("button", { name: /Run/i }));
    const requestIdA = lastTranspileRequestId(worker);
    fireEvent.click(screen.getByRole("button", { name: /Stop/i }));

    fireEvent.click(screen.getByRole("button", { name: /Run/i }));
    const requestIdB = lastTranspileRequestId(worker);
    trackMock.mockClear();

    // A's transpile-error finally lands.
    act(() => {
      worker.onmessage?.({
        data: {
          type: "transpile-error",
          kind: "syntax",
          message: "boom",
          requestId: requestIdA,
        },
      } as MessageEvent);
    });

    // Must not have ended B: no run_result from this stale reply.
    expect(
      trackMock.mock.calls.filter(([name]) => name === "run_result"),
    ).toHaveLength(0);

    // B can still finish normally afterwards.
    act(() => {
      worker.onmessage?.({
        data: { type: "transpile-result", js: "console.log('B')", requestId: requestIdB },
      } as MessageEvent);
    });
    expect(executeMock).toHaveBeenCalledWith("console.log('B')", requestIdB);
  });
});

describe("App — Stop ownership must come from the sandbox, not an inferred timer", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    workerInstances.length = 0;
    executeMock.mockClear();
    stopMock.mockReset();
    trackMock.mockClear();
    sandboxProps = null;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // Reproduction: `workerWatchdogRef` is armed by both handleRun and
  // handleValidate. Run a Playground program to completion of the transpile
  // round trip (so the sandbox, not the ref, now owns it) → switch to
  // Validator and start (and abandon) a validation, which re-arms the same
  // ref → switch back to Playground → click Stop. Before this fix,
  // handleStopClick read the (now validation-owned) armed ref as "still in
  // MY transpile round trip", disarmed the validation's own deadlock
  // breaker, and ended the Playground run itself — even though the sandbox
  // was still actually running it. That run finishing later would then emit
  // a SECOND run_result for the one run_click (CLAUDE.md's definition of an
  // orphaned execution).
  it("does not end a run the sandbox still owns just because a validation later armed the same watchdog ref", async () => {
    render(<App />);
    act(() => {
      vi.advanceTimersByTime(200);
    });
    const worker = workerInstances[0];

    // Start a Playground run and let it reach the sandbox.
    fireEvent.click(screen.getByRole("button", { name: /Run/i }));
    act(() => {
      worker.onmessage?.({
        data: {
          type: "transpile-result",
          js: "js",
          requestId: lastTranspileRequestId(worker),
        },
      } as MessageEvent);
    });
    expect(executeMock).toHaveBeenCalledTimes(1);
    const playgroundRequestId = executeMock.mock.calls[0][1] as string;
    trackMock.mockClear();

    // Switch to Validator and click Validate — this posts "validate" and
    // re-arms workerWatchdogRef, which is the same ref handleRun used above.
    fireEvent.click(screen.getByRole("button", { name: /AI Validator/i }));
    fireEvent.click(screen.getByRole("button", { name: /Validate/i }));
    expect(worker.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: "validate" }),
    );

    // Back to Playground — the sandbox still owns playgroundRequestId, and
    // the real ExecutionSandbox.stop() would return true for it.
    fireEvent.click(screen.getByRole("button", { name: "Playground" }));
    stopMock.mockReturnValueOnce(true);
    fireEvent.click(screen.getByRole("button", { name: /Stop/i }));

    expect(stopMock).toHaveBeenCalledWith(playgroundRequestId);
    // App must not have ended the run itself: the sandbox took
    // responsibility, so no run_result should be emitted from this click —
    // only the (still pending) run itself, or the sandbox's own onStopped,
    // may produce one.
    const runResultCalls = trackMock.mock.calls.filter(
      ([name]) => name === "run_result",
    );
    expect(runResultCalls).toHaveLength(0);
  });

  // Mid-transpile case still works after the fix: `stop()` reports `false`
  // (the run never reached the sandbox), so App falls back to ending the run
  // itself. This is the same scenario as the "ends the run once as `stopped`"
  // test above, phrased for this suite's fix (no more `workerWatchdogRef`
  // read at all in handleStopClick).
  it("still ends the run itself when stop() reports it does not own the request", async () => {
    render(<App />);
    act(() => {
      vi.advanceTimersByTime(200);
    });
    const worker = workerInstances[0];

    fireEvent.click(screen.getByRole("button", { name: /Run/i }));
    expect(worker.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: "transpile" }),
    );

    // stopMock's default (unconfigured) return is undefined — falsy, exactly
    // what the real ExecutionSandbox.stop() returns when the requestId never
    // reached it.
    fireEvent.click(screen.getByRole("button", { name: /Stop/i }));

    const runResultCalls = trackMock.mock.calls.filter(
      ([name]) => name === "run_result",
    );
    expect(runResultCalls).toHaveLength(1);
    expect(runResultCalls[0][1]).toMatchObject({ outcome: "stopped" });
  });
});

describe("App — a terminal event with no requestId must never be routed to an idle validation", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    workerInstances.length = 0;
    executeMock.mockClear();
    stopMock.mockReset();
    trackMock.mockClear();
    sandboxProps = null;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // Reproduction: supervisor.js used to stamp a "stopped" reply to a "stop"
  // that arrived before any "execute" with its own not-yet-set module-level
  // `requestId`, i.e. `null`. App's dispatch sites compared that against
  // `validationRequestIdRef.current`, which is ALSO `null` whenever no
  // validation is running — `null === null` routed the event straight into
  // `endValidationRuntime`, marking a validation's runtime stage as failed
  // even though no validation exists, and never touching the real Playground
  // run at all (which then has no terminal event of its own, permanently
  // stuck showing Stop).
  it("routes a stopped reply with requestId null to Playground's endRun, not the idle validation", async () => {
    render(<App />);
    act(() => {
      vi.advanceTimersByTime(200);
    });

    // Switch to Validator mode so the runtime stage is on screen, but never
    // start a validation — validationRequestIdRef.current stays null.
    fireEvent.click(screen.getByRole("button", { name: /AI Validator/i }));
    expect(sandboxProps).not.toBeNull();

    act(() => {
      sandboxProps!.onStopped(null as unknown as string, 3);
    });

    // The idle validation's runtime stage must be untouched — this event was
    // never validation's, so nothing should mark it failed.
    expect(screen.queryByText("Execution stopped.")).toBeNull();
  });
});

describe("App — Playground and Validator each own their own watchdog (#49)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    workerInstances.length = 0;
    executeMock.mockClear();
    stopMock.mockReset();
    trackMock.mockClear();
    sandboxProps = null;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // Gate3 fix (IMPORTANT 3): before this fix, `workerWatchdogRef` was a
  // single ref armed by both handleRun and handleValidate. Starting a
  // validation, then starting (and completing) a Playground run while the
  // validation was still awaiting its own worker reply, re-armed the shared
  // ref for Playground and then disarmed it when Playground finished —
  // silently stripping the validation's deadlock breaker. If the abaplint
  // worker then stalled on the validation, `isValidating` never returned to
  // false. This test proves the validation's watchdog still fires on
  // schedule even though a whole Playground run started and completed while
  // it was pending.
  it("a completed Playground run leaves a concurrent validation's watchdog armed", async () => {
    render(<App />);
    act(() => {
      vi.advanceTimersByTime(200);
    });
    const worker = workerInstances[0];

    // Start a validation and leave it pending (no reply yet).
    fireEvent.click(screen.getByRole("button", { name: /AI Validator/i }));
    fireEvent.click(screen.getByRole("button", { name: /Validate/i }));
    expect(worker.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: "validate" }),
    );

    // Switch to Playground, run to completion.
    fireEvent.click(screen.getByRole("button", { name: "Playground" }));
    fireEvent.click(screen.getByRole("button", { name: /Run/i }));
    const playgroundRequestId = lastTranspileRequestId(worker);
    act(() => {
      worker.onmessage?.({
        data: {
          type: "transpile-result",
          js: "js",
          requestId: playgroundRequestId,
        },
      } as MessageEvent);
    });
    expect(executeMock).toHaveBeenCalledWith("js", playgroundRequestId);
    act(() => {
      sandboxProps!.onDone(playgroundRequestId, 1);
    });
    expect(
      trackMock.mock.calls.filter(([name]) => name === "run_result"),
    ).toHaveLength(1);

    // The validation never got a reply. If Playground's completion had
    // disarmed the shared ref (the pre-fix bug), this timeout would never
    // fire and no `validate_result` would ever be tracked.
    act(() => {
      vi.advanceTimersByTime(20000);
    });
    const validateResultCalls = trackMock.mock.calls.filter(
      ([name]) => name === "validate_result",
    );
    expect(validateResultCalls).toHaveLength(1);
    expect(validateResultCalls[0][1]).toMatchObject({ outcome: "fail" });
  });

  // Symmetric case: a validation completing normally must not strip
  // Playground's watchdog. Before the fix, `endValidationRuntime`'s
  // `disarmWorkerWatchdog()` would clear the very timer Playground was
  // relying on to ever end a run whose transpile reply never arrives.
  it("a completed validation leaves a concurrent Playground run's watchdog armed", async () => {
    render(<App />);
    act(() => {
      vi.advanceTimersByTime(200);
    });
    const worker = workerInstances[0];

    // Start a Playground run and leave it pending (no reply yet).
    fireEvent.click(screen.getByRole("button", { name: /Run/i }));
    expect(worker.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: "transpile" }),
    );

    // Switch to Validator and complete a validation via a syntax failure —
    // the shortest path to `isValidating` going back to false.
    fireEvent.click(screen.getByRole("button", { name: /AI Validator/i }));
    fireEvent.click(screen.getByRole("button", { name: /Validate/i }));
    act(() => {
      worker.onmessage?.({
        data: {
          type: "validate-stage-result",
          stage: "transpile",
          result: { status: "fail", error: "syntax error" },
        },
      } as MessageEvent);
    });
    expect(
      trackMock.mock.calls.filter(([name]) => name === "validate_result"),
    ).toHaveLength(1);

    // Playground's transpile reply never arrived. If validation's completion
    // had disarmed the shared ref (the pre-fix bug), this timeout would
    // never fire and Playground would stay "running" forever.
    act(() => {
      vi.advanceTimersByTime(20000);
    });
    const runResultCalls = trackMock.mock.calls.filter(
      ([name]) => name === "run_result",
    );
    expect(runResultCalls).toHaveLength(1);
    expect(runResultCalls[0][1]).toMatchObject({ outcome: "stalled" });
  });
});
