/**
 * Run `task` once the browser has gone idle, so heavy setup does not compete
 * with first paint and first input.
 *
 * `timeout` is a ceiling, not a delay: a main thread that never goes idle would
 * otherwise postpone the task indefinitely. Returns a canceller that also
 * prevents a pending task from running, so a caller unmounting mid-wait cannot
 * be surprised by it later.
 */
export function scheduleIdle(task: () => void, timeoutMs = 1500): () => void {
  let cancelled = false;
  const run = () => {
    if (!cancelled) task();
  };

  if (typeof window.requestIdleCallback === "function") {
    const id = window.requestIdleCallback(run, { timeout: timeoutMs });
    return () => {
      cancelled = true;
      window.cancelIdleCallback(id);
    };
  }

  // Safari has no requestIdleCallback. A short macrotask delay still yields to
  // paint, which is the part that matters.
  const id = window.setTimeout(run, 200);
  return () => {
    cancelled = true;
    window.clearTimeout(id);
  };
}
