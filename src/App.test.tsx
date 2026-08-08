import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { forwardRef, useImperativeHandle } from "react";
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
vi.mock("./components/ExecutionSandbox", () => ({
  ExecutionSandbox: forwardRef<ExecutionSandboxHandle>(function StubSandbox(
    _props,
    ref,
  ) {
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

describe("App — Stop during the transpile round trip", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    workerInstances.length = 0;
    executeMock.mockClear();
    stopMock.mockClear();
    trackMock.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // Review fix: pressing Stop while still waiting on the abaplint worker (the
  // sandbox has not taken ownership of the run yet, so ExecutionSandbox.stop
  // cannot help) must still end the run exactly once, with the `stopped`
  // outcome, and must not let the transpile-result that eventually arrives
  // start an execution nobody asked for anymore.
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

    fireEvent.click(screen.getByRole("button", { name: /Stop/i }));

    // Exactly one run_result, reporting the user's own choice.
    const runResultCalls = trackMock.mock.calls.filter(
      ([name]) => name === "run_result",
    );
    expect(runResultCalls).toHaveLength(1);
    expect(runResultCalls[0][1]).toMatchObject({ outcome: "stopped" });
    expect(executeMock).not.toHaveBeenCalled();

    // The transpile worker answers late, after the user already gave up on
    // this run. Nothing should start.
    act(() => {
      worker.onmessage?.({
        data: { type: "transpile-result", js: "console.log(1)" },
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
