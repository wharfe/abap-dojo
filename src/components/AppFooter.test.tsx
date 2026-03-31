import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { AppFooter } from "./AppFooter";

describe("AppFooter", () => {
  it("renders site name and attribution", () => {
    render(<AppFooter />);
    expect(screen.getByText(/ABAP Dojo/)).toBeTruthy();
    expect(screen.getByText(/abaplint/)).toBeTruthy();
  });

  it("renders navigation links to docs", () => {
    render(<AppFooter />);
    const guidesLink = screen.getByRole("link", { name: "Guides" });
    expect(guidesLink.getAttribute("href")).toBe("/docs/index.html");
    const aboutLink = screen.getByRole("link", { name: "About" });
    expect(aboutLink.getAttribute("href")).toBe("/docs/about.html");
  });

  it("renders GitHub link", () => {
    render(<AppFooter />);
    const ghLink = screen.getByRole("link", { name: "GitHub" });
    expect(ghLink.getAttribute("href")).toContain("github.com");
    expect(ghLink.getAttribute("target")).toBe("_blank");
  });
});
