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
  render(<ExecutionSandbox ref={ref} {...handlers} />);
  return { ref, handlers };
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
});
