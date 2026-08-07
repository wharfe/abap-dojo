import { describe, it, expect, beforeEach, vi } from "vitest";
import { getRuntimeBundle, resetRuntimeBundleCache } from "./runtimeBundle";

const URL = "/runtime-bundle.js";

function ok(text: string) {
  return Promise.resolve({ ok: true, text: () => Promise.resolve(text) });
}

describe("getRuntimeBundle", () => {
  beforeEach(() => {
    resetRuntimeBundleCache();
  });

  it("fetches once and reuses the result", async () => {
    const fetchImpl = vi.fn(() => ok("BUNDLE"));

    expect(await getRuntimeBundle(URL, fetchImpl)).toBe("BUNDLE");
    expect(await getRuntimeBundle(URL, fetchImpl)).toBe("BUNDLE");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("shares a single in-flight request between concurrent callers", async () => {
    const fetchImpl = vi.fn(() => ok("BUNDLE"));

    const [a, b] = await Promise.all([
      getRuntimeBundle(URL, fetchImpl),
      getRuntimeBundle(URL, fetchImpl),
    ]);

    expect([a, b]).toEqual(["BUNDLE", "BUNDLE"]);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  // The regression this module exists for: a poisoned cache used to make every
  // execution after the first network failure hang with no terminal event.
  it("does not cache a rejection — a later call retries and can succeed", async () => {
    const fetchImpl = vi
      .fn<FetchLike>()
      .mockRejectedValueOnce(new Error("offline"))
      .mockImplementation(() => ok("BUNDLE"));

    await expect(getRuntimeBundle(URL, fetchImpl)).rejects.toThrow("offline");
    expect(await getRuntimeBundle(URL, fetchImpl)).toBe("BUNDLE");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("rejects on a non-ok response instead of inlining the error page", async () => {
    const fetchImpl = vi.fn(() =>
      Promise.resolve({ ok: false, text: () => Promise.resolve("<html>404</html>") }),
    );

    await expect(getRuntimeBundle(URL, fetchImpl)).rejects.toThrow(
      /Failed to load the ABAP runtime/,
    );
  });
});

type FetchLike = (url: string) => Promise<{ ok: boolean; text(): Promise<string> }>;
