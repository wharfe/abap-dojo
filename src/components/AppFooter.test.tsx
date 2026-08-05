import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { AppFooter } from "./AppFooter";

function footerLinks(): HTMLAnchorElement[] {
  render(<AppFooter />);
  return Array.from(document.querySelectorAll("a"));
}

/**
 * Every static page under public/, as the URL Cloudflare Pages actually serves
 * it. Enumerated with import.meta.glob rather than node:fs, because the app
 * tsconfig has no Node types.
 */
function servedPageUrls(): string[] {
  return Object.keys(import.meta.glob("/public/**/*.html")).map((path) => {
    const rel = path.replace(/^\/public/, "");
    return rel.endsWith("/index.html")
      ? rel.replace(/index\.html$/, "")
      : rel.replace(/\.html$/, "");
  });
}

describe("AppFooter", () => {
  it("renders site name and attribution", () => {
    render(<AppFooter />);
    expect(screen.getByText(/ABAP Dojo/)).toBeTruthy();
    expect(screen.getByText(/abaplint/)).toBeTruthy();
  });

  it("renders navigation links to docs", () => {
    render(<AppFooter />);
    expect(
      screen.getByRole("link", { name: "Guides" }).getAttribute("href"),
    ).toBe("/docs/");
    expect(
      screen.getByRole("link", { name: "About" }).getAttribute("href"),
    ).toBe("/docs/about");
  });

  it("renders GitHub link", () => {
    render(<AppFooter />);
    const ghLink = screen.getByRole("link", { name: "GitHub" });
    expect(ghLink.getAttribute("href")).toContain("github.com");
    expect(ghLink.getAttribute("target")).toBe("_blank");
  });

  // Cloudflare Pages 308-redirects /x.html to /x, so a .html href sends every
  // visitor through a redirect and points crawlers at a non-canonical URL.
  it("never links an internal .html URL", () => {
    const offenders = footerLinks()
      .map((a) => a.getAttribute("href") ?? "")
      .filter((href) => href.startsWith("/") && href.split("#")[0].endsWith(".html"));
    expect(offenders).toEqual([]);
  });

  /**
   * "/" carries essentially all of this site's search authority, so a page that
   * the footer does not link is one crawlers may not discover for weeks. This
   * failed silently when four docs pages and three landing pages were added.
   */
  it("links every static page in public/", () => {
    const linked = new Set(
      footerLinks().map((a) => (a.getAttribute("href") ?? "").split("#")[0]),
    );
    const missing = servedPageUrls().filter((url) => !linked.has(url));
    expect(missing).toEqual([]);
  });
});
