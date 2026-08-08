import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createRef } from "react";
import { render, act } from "@testing-library/react";
import { ExecutionSandbox, type ExecutionSandboxHandle } from "./ExecutionSandbox";

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
  return { handlers, iframe };
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
      vi.advanceTimersByTime(5000);
    });

    expect(handlers.onTimeout).toHaveBeenCalledWith("run-1");
  });

  it("times out a run whose sandbox never answers", async () => {
    vi.useFakeTimers();
    const { ref, handlers } = setup();

    await act(async () => {
      ref.current!.execute("js", "run-1");
    });
    act(() => {
      vi.advanceTimersByTime(5000);
    });

    expect(handlers.onTimeout).toHaveBeenCalledWith("run-1");
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
      vi.advanceTimersByTime(5000);
    });

    expect(handlers.onTimeout).toHaveBeenCalledTimes(1);
    expect(handlers.onTimeout).toHaveBeenCalledWith("run-2");
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
          },
          source: iframe.contentWindow,
          origin: "null",
        }),
      );
    });

    expect(handlers.onError).toHaveBeenCalledWith("bundle broke", "run-1", "load");
  });

  it("maps an error without fatal to a runtime failure", async () => {
    const { handlers, iframe } = await startRun();

    await act(async () => {
      window.dispatchEvent(
        new MessageEvent("message", {
          data: { type: "error", message: "user code threw", requestId: "run-1" },
          source: iframe.contentWindow,
          origin: "null",
        }),
      );
    });

    expect(handlers.onError).toHaveBeenCalledWith(
      "user code threw",
      "run-1",
      "runtime",
    );
  });
});
