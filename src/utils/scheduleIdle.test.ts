import { describe, it, expect, vi, afterEach } from "vitest";
import { scheduleIdle } from "./scheduleIdle";

// jsdom declares requestIdleCallback in its types but does not implement it, so
// these tests install their own. Going through `unknown` sidesteps the lib.dom
// signature while doing it.
const idleWindow = window as unknown as Record<string, unknown>;

const original = {
  request: idleWindow.requestIdleCallback,
  cancel: idleWindow.cancelIdleCallback,
};

afterEach(() => {
  idleWindow.requestIdleCallback = original.request;
  idleWindow.cancelIdleCallback = original.cancel;
  vi.useRealTimers();
});

describe("scheduleIdle with requestIdleCallback", () => {
  function installIdle() {
    const pending: Array<{ id: number; cb: () => void }> = [];
    let next = 1;
    idleWindow.requestIdleCallback = (cb: () => void) => {
      const id = next++;
      pending.push({ id, cb });
      return id;
    };
    idleWindow.cancelIdleCallback = (id: number) => {
      const i = pending.findIndex((p) => p.id === id);
      if (i >= 0) pending.splice(i, 1);
    };
    return {
      flush: () => pending.splice(0).forEach((p) => p.cb()),
      callbacks: () => pending.map((p) => p.cb),
    };
  }

  it("runs the task when the browser goes idle", () => {
    const idle = installIdle();
    const task = vi.fn();
    scheduleIdle(task);
    expect(task).not.toHaveBeenCalled();
    idle.flush();
    expect(task).toHaveBeenCalledTimes(1);
  });

  it("does not run the task after cancellation", () => {
    const idle = installIdle();
    const task = vi.fn();
    scheduleIdle(task)();
    idle.flush();
    expect(task).not.toHaveBeenCalled();
  });

  // cancelIdleCallback cannot un-dispatch a callback the browser already
  // handed off, so the guard has to live inside the callback too.
  it("guards the task even if a cancelled callback still fires", () => {
    const idle = installIdle();
    const kept = vi.fn();
    const dropped = vi.fn();

    scheduleIdle(kept);
    const cancel = scheduleIdle(dropped);
    const callbacks = idle.callbacks(); // grabbed before cancellation removes it
    cancel();

    callbacks.forEach((cb) => cb());
    expect(kept).toHaveBeenCalledTimes(1);
    expect(dropped).not.toHaveBeenCalled();
  });

  it("passes a timeout ceiling so a busy thread cannot starve the task", () => {
    const spy = vi.fn(() => 1);
    idleWindow.requestIdleCallback = spy;
    idleWindow.cancelIdleCallback = vi.fn();
    scheduleIdle(() => {}, 2000);
    expect(spy).toHaveBeenCalledWith(expect.any(Function), { timeout: 2000 });
  });
});

describe("scheduleIdle without requestIdleCallback", () => {
  it("falls back to a timeout", () => {
    vi.useFakeTimers();
    idleWindow.requestIdleCallback = undefined;
    const task = vi.fn();
    scheduleIdle(task);
    expect(task).not.toHaveBeenCalled();
    vi.advanceTimersByTime(200);
    expect(task).toHaveBeenCalledTimes(1);
  });

  it("cancels the fallback timeout", () => {
    vi.useFakeTimers();
    idleWindow.requestIdleCallback = undefined;
    const task = vi.fn();
    scheduleIdle(task)();
    vi.advanceTimersByTime(1000);
    expect(task).not.toHaveBeenCalled();
  });
});
