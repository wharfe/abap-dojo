import { describe, it, expect } from "vitest";
import { decodeSource } from "./utils/urlShare";

/**
 * Guards the hand-written pages under public/.
 *
 * These files never go through Vite: public/ is copied verbatim, so no type
 * check, lint or bundler touches them and CI stays green no matter what breaks.
 * That is not hypothetical — canonical tags, the sitemap and the "try it live"
 * CTAs were all broken at once while every check passed.
 *
 * The rule these tests encode is one production fact: Cloudflare Pages
 * 308-redirects /x.html to /x, so the extensionless URL is the only one that
 * answers 200 and therefore the only one a canonical, an og:url, a sitemap
 * entry or an internal link may name. Declaring the .html form told Google the
 * canonical was a redirect, and Search Console indexed both forms as separate
 * URLs.
 *
 * Files are enumerated with import.meta.glob rather than node:fs because the
 * app tsconfig has no Node types.
 */

const ORIGIN = "https://abapdojo.com";

/** GA4 must not load anywhere but production — the URL hash carries user code. */
const GA4_HOST_GUARD = "['abapdojo.com', 'www.abapdojo.com'].indexOf(location.hostname) === -1";

/** SERP truncation limits. Longer is not an error for users, but it is wasted. */
const MAX_TITLE_LENGTH = 65;
const MAX_DESCRIPTION_LENGTH = 165;

const pageSources = import.meta.glob("/public/**/*.html", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

const sitemapSources = import.meta.glob("/public/sitemap.xml", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

/** Every file under public/, by repo path — used to resolve internal links. */
const publicFilePaths = new Set(Object.keys(import.meta.glob("/public/**/*")));

/** The URL Cloudflare Pages actually serves a given public/ file at. */
function servedUrl(globPath: string): string {
  const rel = globPath.replace(/^\/public/, "");
  return rel.endsWith("/index.html")
    ? rel.replace(/index\.html$/, "")
    : rel.replace(/\.html$/, "");
}

const pages = Object.entries(pageSources).map(([path, html]) => ({
  path: path.replace(/^\/public/, "public"),
  url: servedUrl(path),
  html,
}));

const sitemapXml = Object.values(sitemapSources)[0] ?? "";

function attr(html: string, pattern: RegExp): string | null {
  return html.match(pattern)?.[1] ?? null;
}

const canonicalOf = (html: string) =>
  attr(html, /<link\s+rel="canonical"\s+href="([^"]*)"/);
const ogUrlOf = (html: string) =>
  attr(html, /<meta\s+property="og:url"\s+content="([^"]*)"/);
const titleOf = (html: string) => attr(html, /<title>([^<]*)<\/title>/);
const descriptionOf = (html: string) =>
  attr(html, /<meta\s+name="description"\s+content="([^"]*)"/);

/** Every internal href on the page, hash and query stripped. */
function internalLinks(html: string): string[] {
  return [...html.matchAll(/href="(\/[^"]*)"/g)]
    .map((m) => m[1].split("#")[0].split("?")[0])
    .filter((href) => href !== "");
}

/** The share hashes embedded in "try it live" CTAs. */
function shareHashes(html: string): string[] {
  return [...html.matchAll(/href="\/[^"]*#(?:mode=[a-z]+&)?code=([^"&]+)"/g)].map(
    (m) => m[1],
  );
}

/** Resolve an internal URL back to the file that serves it, if any. */
function resolvesToFile(url: string): boolean {
  if (url === "/") return true; // the SPA itself, built by Vite
  const candidates = url.endsWith("/")
    ? [`/public${url}index.html`]
    : [`/public${url}.html`, `/public${url}`, `/public${url}/index.html`];
  return candidates.some((c) => publicFilePaths.has(c));
}

describe("static pages under public/", () => {
  it("finds the pages and the sitemap", () => {
    // A glob that silently matches nothing would make every test below vacuous.
    expect(pages.length).toBeGreaterThan(5);
    expect(sitemapXml).toContain("<urlset");
  });

  describe.each(pages)("$path", ({ url, html }) => {
    it("declares a canonical at the URL that serves 200", () => {
      expect(canonicalOf(html)).toBe(`${ORIGIN}${url}`);
    });

    it("points og:url at the same URL as the canonical", () => {
      expect(ogUrlOf(html)).toBe(canonicalOf(html));
    });

    it("has a title within the SERP limit", () => {
      const title = titleOf(html);
      expect(title).toBeTruthy();
      expect(title!.length).toBeLessThanOrEqual(MAX_TITLE_LENGTH);
    });

    it("has a description within the SERP limit", () => {
      const description = descriptionOf(html);
      expect(description).toBeTruthy();
      expect(description!.length).toBeLessThanOrEqual(MAX_DESCRIPTION_LENGTH);
    });

    it("gates GA4 on the production host", () => {
      expect(html).toContain(GA4_HOST_GUARD);
    });

    it("never links an internal .html URL", () => {
      expect(internalLinks(html).filter((h) => h.endsWith(".html"))).toEqual([]);
    });

    it("only links internal URLs that resolve to a file", () => {
      const broken = internalLinks(html).filter((h) => !resolvesToFile(h));
      expect(broken).toEqual([]);
    });

    /**
     * The CTAs are the whole point of these pages: they carry a worked example
     * into the playground. python-loop-pattern shipped with a corrupted zlib
     * payload, so its CTA silently loaded the default snippet instead.
     */
    it("embeds share links that actually decode", () => {
      for (const hash of shareHashes(html)) {
        // base64url alphabet, with the "=" padding btoa emits and encodeSource
        // does not strip. What must never appear is "+" or "/": URLSearchParams
        // decodes "+" as a space, which is what silently emptied every share
        // link before the base64url switch.
        expect(hash, `not base64url: ${hash.slice(0, 24)}…`).toMatch(
          /^[A-Za-z0-9_-]+={0,2}$/,
        );
        expect(decodeSource(hash), `did not decode: ${hash.slice(0, 24)}…`)
          .toBeTruthy();
      }
    });
  });
});

describe("sitemap.xml", () => {
  const locs = [...sitemapXml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);

  it("lists no .html URL", () => {
    expect(locs.filter((loc) => loc.endsWith(".html"))).toEqual([]);
  });

  it("lists only absolute production URLs", () => {
    expect(locs.filter((loc) => !loc.startsWith(`${ORIGIN}/`))).toEqual([]);
  });

  it("lists every static page", () => {
    const listed = new Set(locs);
    const missing = pages
      .map((p) => `${ORIGIN}${p.url}`)
      .filter((loc) => !listed.has(loc));
    expect(missing).toEqual([]);
  });

  it("lists nothing that is not a page", () => {
    // "/" is the Vite-built SPA, which has no file under public/.
    const served = new Set([`${ORIGIN}/`, ...pages.map((p) => `${ORIGIN}${p.url}`)]);
    expect(locs.filter((loc) => !served.has(loc))).toEqual([]);
  });

  it("agrees with each page's own canonical", () => {
    const listed = new Set(locs);
    const disagreeing = pages
      .map((p) => canonicalOf(p.html))
      .filter((canonical) => canonical !== null && !listed.has(canonical));
    expect(disagreeing).toEqual([]);
  });
});
