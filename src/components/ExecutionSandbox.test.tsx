import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createRef } from "react";
import { render, act } from "@testing-library/react";
import {
  ExecutionSandbox,
  EXECUTION_TIMEOUT_SECONDS,
  type ExecutionSandboxHandle,
} from "./ExecutionSandbox";

/** The watchdog deadline in ms, derived so these tests track a future change
 *  to EXECUTION_TIMEOUT_MS instead of silently under- or over-advancing. */
const EXECUTION_TIMEOUT_MS = EXECUTION_TIMEOUT_SECONDS * 1000;

// The real module fetches a Vite-resolved asset URL, which jsdom cannot serve.
// Each test decides whether loading the runtime succeeds or fails.
const getRuntimeBundle = vi.hoisted(() => vi.fn());
vi.mock("../utils/runtimeBundle", () => ({ getRuntimeBundle }));
vi.mock("../sandbox/runtime-bundle.js?url", () => ({ default: "/runtime.js" }));

function setup() {
  const handlers = {
    onOutput: vi.fn(),
    onError: vi.fn(),
    onDone: vi.fn(),
    onTimeout: vi.fn(),
    onStopped: vi.fn(),
    onCancel: vi.fn(),
  };
  const ref = createRef<ExecutionSandboxHandle>();
  const { container } = render(<ExecutionSandbox ref={ref} {...handlers} />);
  return { ref, handlers, container };
}

/**
 * Start a run and hand back its iframe, so a test can play the iframe's side
 * of the message contract: `window.dispatchEvent(new MessageEvent("message",
 * { data, source: iframe.contentWindow, origin: "null" }))`, matching what
 * `handleMessage` requires from both the source window and the (opaque, so
 * literally `"null"`) origin.
 */
async function startRun() {
  const { ref, handlers, container } = setup();
  await act(async () => {
    ref.current!.execute("js", "run-1");
  });
  const iframe = container.querySelector("iframe");
  if (!iframe) throw new Error("execute() did not create an iframe");
  return { ref, handlers, iframe };
}

describe("ExecutionSandbox", () => {
  beforeEach(() => {
    getRuntimeBundle.mockResolvedValue("/* runtime */");
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  // #13 path 1: one iframe, two callers. Superseding a run used to leave the
  // previous caller's button disabled forever.
  it("tells the previous caller when its execution is superseded", async () => {
    const { ref, handlers } = setup();

    await act(async () => {
      ref.current!.execute("js", "run-1");
    });
    await act(async () => {
      ref.current!.execute("js", "validate-1");
    });

    expect(handlers.onCancel).toHaveBeenCalledTimes(1);
    expect(handlers.onCancel).toHaveBeenCalledWith("run-1");
  });

  it("does not report a cancellation for the first execution", async () => {
    const { ref, handlers } = setup();

    await act(async () => {
      ref.current!.execute("js", "run-1");
    });

    expect(handlers.onCancel).not.toHaveBeenCalled();
  });

  // #13 path 2: the runtime bundle never arrives, so no iframe is ever created
  // and nothing else can end the run.
  it("reports a load error when the runtime bundle cannot be fetched", async () => {
    getRuntimeBundle.mockRejectedValue(new Error("offline"));
    const { ref, handlers } = setup();

    await act(async () => {
      ref.current!.execute("js", "run-1");
    });

    expect(handlers.onError).toHaveBeenCalledTimes(1);
    expect(handlers.onError.mock.calls[0][1]).toBe("run-1");
    expect(handlers.onError.mock.calls[0][2]).toBe("load");
  });

  it("stays silent about a failed fetch whose run was already superseded", async () => {
    let rejectBundle!: (reason: Error) => void;
    getRuntimeBundle.mockReturnValueOnce(
      new Promise<string>((_, reject) => {
        rejectBundle = reject;
      }),
    );
    const { ref, handlers } = setup();

    await act(async () => {
      ref.current!.execute("js", "run-1");
    });
    await act(async () => {
      ref.current!.execute("js", "validate-1");
    });
    await act(async () => {
      rejectBundle(new Error("offline"));
    });

    // run-1 was already reported through onCancel; reporting it again as an
    // error would double-count it and clobber validate-1's state.
    expect(handlers.onCancel).toHaveBeenCalledWith("run-1");
    expect(handlers.onError).not.toHaveBeenCalled();
  });

  // The watchdog has to be armed before the bundle await, otherwise a fetch
  // that never settles is never timed out.
  it("times out a run whose runtime bundle never arrives", async () => {
    vi.useFakeTimers();
    getRuntimeBundle.mockReturnValue(new Promise<string>(() => {}));
    const { ref, handlers } = setup();

    act(() => {
      ref.current!.execute("js", "run-1");
    });
    act(() => {
      vi.advanceTimersByTime(EXECUTION_TIMEOUT_MS);
    });

    // No iframe exists yet (the bundle fetch never resolved), so there is
    // nothing to ask to stop and no output could have been produced.
    expect(handlers.onTimeout).toHaveBeenCalledWith("run-1", 0);
  });

  it("times out a run whose sandbox never answers", async () => {
    vi.useFakeTimers();
    const { ref, handlers } = setup();

    await act(async () => {
      ref.current!.execute("js", "run-1");
    });
    act(() => {
      // The watchdog deadline fires, which asks the (unresponsive, in this
      // test) frame to stop; the extra 250ms is the grace period before it
      // gives up waiting for a reply and tears the frame down itself.
      vi.advanceTimersByTime(EXECUTION_TIMEOUT_MS);
      vi.advanceTimersByTime(250);
    });

    expect(handlers.onTimeout).toHaveBeenCalledWith("run-1", 0);
    expect(handlers.onError).not.toHaveBeenCalled();
  });

  it("does not time out a superseded execution twice", async () => {
    vi.useFakeTimers();
    const { ref, handlers } = setup();

    await act(async () => {
      ref.current!.execute("js", "run-1");
    });
    await act(async () => {
      ref.current!.execute("js", "run-2");
    });
    act(() => {
      vi.advanceTimersByTime(EXECUTION_TIMEOUT_MS);
      vi.advanceTimersByTime(250);
    });

    expect(handlers.onTimeout).toHaveBeenCalledTimes(1);
    expect(handlers.onTimeout).toHaveBeenCalledWith("run-2", 0);
  });

  // The executor batches WRITE output into an array (never one postMessage
  // per line — see ExecutionSandbox's EXECUTION_TIMEOUT_MS comment history,
  // #28), so the relay must hand that array through unchanged rather than
  // rejoining or otherwise reshaping it.
  it("relays a batch of output lines to onOutput as an array", async () => {
    const { handlers, iframe } = await startRun();

    await act(async () => {
      window.dispatchEvent(
        new MessageEvent("message", {
          data: { type: "output", lines: ["one", "two"], requestId: "run-1" },
          source: iframe.contentWindow,
          origin: "null",
        }),
      );
    });

    expect(handlers.onOutput).toHaveBeenCalledWith(["one", "two"], "run-1");
  });

  // The supervisor sets `fatal` only when its worker never produced anything
  // (the runtime bundle itself is broken — our failure), and leaves it unset
  // for an error surfaced from the user's own ABAP. `kind` is how that
  // distinction reaches App.tsx's `load_error` vs `runtime_error` outcomes.
  it("maps a fatal error to a load failure", async () => {
    const { handlers, iframe } = await startRun();

    await act(async () => {
      window.dispatchEvent(
        new MessageEvent("message", {
          data: {
            type: "error",
            message: "bundle broke",
            requestId: "run-1",
            fatal: true,
            outputLines: 0,
          },
          source: iframe.contentWindow,
          origin: "null",
        }),
      );
    });

    expect(handlers.onError).toHaveBeenCalledWith("bundle broke", "run-1", "load", 0);
  });

  it("maps an error without fatal to a runtime failure, carrying its output count", async () => {
    const { handlers, iframe } = await startRun();

    await act(async () => {
      window.dispatchEvent(
        new MessageEvent("message", {
          data: {
            type: "error",
            message: "user code threw",
            requestId: "run-1",
            outputLines: 7,
          },
          source: iframe.contentWindow,
          origin: "null",
        }),
      );
    });

    expect(handlers.onError).toHaveBeenCalledWith(
      "user code threw",
      "run-1",
      "runtime",
      7,
    );
  });

  // Nothing the supervisor actually sends omits `outputLines` today — the
  // worker's own errors carry `streamer.total`, and the supervisor's two
  // synthesized errors (onerror, and the try/catch around constructing the
  // worker) both set it explicitly. The `?? relayedLinesRef.current` fallback
  // in handleMessage exists purely as defence against a message that somehow
  // doesn't, which this test exercises directly rather than through a real
  // supervisor code path.
  it("falls back to the relayed line count when an error omits outputLines", async () => {
    const { handlers, iframe } = await startRun();

    await act(async () => {
      window.dispatchEvent(
        new MessageEvent("message", {
          data: { type: "output", lines: ["a", "b", "c"], requestId: "run-1" },
          source: iframe.contentWindow,
          origin: "null",
        }),
      );
    });
    await act(async () => {
      window.dispatchEvent(
        new MessageEvent("message", {
          data: { type: "error", message: "worker failed", requestId: "run-1" },
          source: iframe.contentWindow,
          origin: "null",
        }),
      );
    });

    expect(handlers.onError).toHaveBeenCalledWith(
      "worker failed",
      "run-1",
      "runtime",
      3,
    );
  });

  // The Stop button (App.tsx) is what triggers this in production; exercised
  // directly here via the message contract rather than through the UI.
  it("routes a stopped/user reply to onStopped", async () => {
    const { handlers, iframe } = await startRun();

    await act(async () => {
      window.dispatchEvent(
        new MessageEvent("message", {
          data: {
            type: "stopped",
            requestId: "run-1",
            outputLines: 42,
            reason: "user",
          },
          source: iframe.contentWindow,
          origin: "null",
        }),
      );
    });

    expect(handlers.onStopped).toHaveBeenCalledWith("run-1", 42);
    expect(handlers.onTimeout).not.toHaveBeenCalled();
  });

  it("routes a stopped/timeout reply to onTimeout", async () => {
    const { handlers, iframe } = await startRun();

    await act(async () => {
      window.dispatchEvent(
        new MessageEvent("message", {
          data: {
            type: "stopped",
            requestId: "run-1",
            outputLines: 42,
            reason: "timeout",
          },
          source: iframe.contentWindow,
          origin: "null",
        }),
      );
    });

    expect(handlers.onTimeout).toHaveBeenCalledWith("run-1", 42);
    expect(handlers.onStopped).not.toHaveBeenCalled();
  });

  it("posts a stop message with reason user to the owning frame", async () => {
    const { ref, iframe } = await startRun();
    const postMessage = vi.spyOn(iframe.contentWindow!, "postMessage");

    act(() => {
      ref.current!.stop("run-1");
    });

    expect(postMessage).toHaveBeenCalledWith(
      { type: "stop", requestId: "run-1", reason: "user" },
      "*",
    );
  });

  it("does not stop a run that no longer owns the sandbox", async () => {
    const { ref, iframe } = await startRun();
    const postMessage = vi.spyOn(iframe.contentWindow!, "postMessage");

    // "run-2" never owned this sandbox (it was never passed to execute), so
    // this must be a no-op rather than reaching into someone else's run.
    act(() => {
      ref.current!.stop("run-2");
    });

    expect(postMessage).not.toHaveBeenCalled();
  });

  // Ambiguity resolution #4: the user can click Stop in the instant a run
  // finishes on its own. By the time the click handler runs, `finish()` has
  // already cleared activeRequestIdRef and torn down the iframe, so `stop`
  // must be a no-op — not a second terminal event, not a throw from posting
  // to a removed frame.
  it("is a no-op when the run already ended on its own before Stop is clicked", async () => {
    const { ref, handlers, iframe } = await startRun();

    await act(async () => {
      window.dispatchEvent(
        new MessageEvent("message", {
          data: { type: "done", requestId: "run-1", outputLines: 5 },
          source: iframe.contentWindow,
          origin: "null",
        }),
      );
    });

    expect(handlers.onDone).toHaveBeenCalledTimes(1);

    expect(() => {
      act(() => {
        ref.current!.stop("run-1");
      });
    }).not.toThrow();

    // No second terminal event of any kind for run-1.
    expect(handlers.onDone).toHaveBeenCalledTimes(1);
    expect(handlers.onStopped).not.toHaveBeenCalled();
    expect(handlers.onTimeout).not.toHaveBeenCalled();
    expect(handlers.onError).not.toHaveBeenCalled();
  });
});
