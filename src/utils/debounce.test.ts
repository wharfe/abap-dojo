import { describe, it, expect, vi } from "vitest";
import { debounce } from "./debounce";

describe("debounce", () => {
  it("delays execution", async () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 50);
    debounced("a");
    expect(fn).not.toHaveBeenCalled();
    await new Promise((r) => setTimeout(r, 60));
    expect(fn).toHaveBeenCalledWith("a");
  });

  it("cancels previous call on rapid fire", async () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 50);
    debounced("a");
    debounced("b");
    debounced("c");
    await new Promise((r) => setTimeout(r, 60));
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith("c");
  });
});
