import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { HeroBanner } from "./HeroBanner";

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => { store[key] = value; }),
    clear: () => { store = {}; },
  };
})();

Object.defineProperty(window, "localStorage", { value: localStorageMock });

beforeEach(() => {
  localStorageMock.clear();
  vi.clearAllMocks();
});

describe("HeroBanner", () => {
  it("renders tagline and feature pills", () => {
    render(<HeroBanner visible={true} onDismiss={() => {}} />);
    expect(screen.getByText(/Write, Lint & Run ABAP/)).toBeTruthy();
    expect(screen.getByText("Execute ABAP")).toBeTruthy();
    expect(screen.getByText("AI Pitfall Detection")).toBeTruthy();
    expect(screen.getByText("163 Lint Rules")).toBeTruthy();
    expect(screen.getByText("Safe for Client Code")).toBeTruthy();
  });

  it("renders nothing when visible is false", () => {
    const { container } = render(<HeroBanner visible={false} onDismiss={() => {}} />);
    expect(container.innerHTML).toBe("");
  });

  it("calls onDismiss when close button is clicked", () => {
    const onDismiss = vi.fn();
    render(<HeroBanner visible={true} onDismiss={onDismiss} />);
    fireEvent.click(screen.getByLabelText("Dismiss hero banner"));
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it("shows Japanese subtext", () => {
    render(<HeroBanner visible={true} onDismiss={() => {}} />);
    expect(screen.getByText(/SAPシステム不要の道場/)).toBeTruthy();
  });

  it("shows tooltip text on security pill", () => {
    render(<HeroBanner visible={true} onDismiss={() => {}} />);
    const pill = screen.getByText("Safe for Client Code").closest("[title]");
    expect(pill?.getAttribute("title")).toBe(
      "All processing runs in your browser. Your code is never sent to any server."
    );
  });
});
