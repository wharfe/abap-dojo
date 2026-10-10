import { describe, it, expect, afterEach } from "vitest";

// The matchers come from src/test/setup.ts, which vite.config.ts lists as a
// Vitest setup file. This file deliberately does not register them itself, so
// it fails if that registration is ever dropped (#77): having the dependency
// installed was never evidence that its matchers worked.
describe("DOM matchers registered by the Vitest setup (#77)", () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  function attach(): HTMLElement {
    const el = document.createElement("div");
    el.setAttribute("data-search", "done");
    document.body.append(el);
    return el;
  }

  it("passes a true expectation against a real DOM node", () => {
    const el = attach();
    expect(el).toBeInTheDocument();
    expect(el).toHaveAttribute("data-search", "done");
  });

  // Matched on the matchers' own failure text, not merely "it threw": a
  // missing matcher throws too, but never with these messages.
  it("fails a false expectation as the matcher's own assertion", () => {
    const el = attach();
    expect(() => expect(el).toHaveAttribute("data-search", "idle")).toThrow(
      /Expected the element to have attribute/,
    );
    const detached = document.createElement("div");
    expect(() => expect(detached).toBeInTheDocument()).toThrow(
      /element could not be found in the document/,
    );
  });
});
