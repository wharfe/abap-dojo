# SEO & Landing Experience Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make ABAP Dojo SEO-ready with a Hero banner, full meta tags, structured data, GA4, and 7 static content pages targeting ABAP developer search queries.

**Architecture:** HeroBanner component added to existing App.tsx between ModeHeader and Toolbar. SEO content pages are pure static HTML in `/public/docs/`, served as-is by Vite's build. All pages share a common HTML template with Tailwind CDN, GA4 snippet, and consistent branding. No Vite config changes needed.

**Tech Stack:** React (existing), Tailwind CSS (existing + CDN for static pages), GA4 gtag.js, JSON-LD structured data.

**Spec:** `docs/superpowers/specs/2026-03-31-seo-landing-design.md`

---

## File Structure

### New Files

| File | Responsibility |
|------|---------------|
| `src/components/HeroBanner.tsx` | Dismissable hero section with tagline, feature pills, hover tooltip |
| `src/components/AppFooter.tsx` | Lightweight footer with links to docs, GitHub, abaplint attribution |
| `src/components/HeroBanner.test.tsx` | Tests for HeroBanner show/hide logic |
| `src/components/AppFooter.test.tsx` | Tests for AppFooter rendering |
| `public/favicon.svg` | SVG favicon — dojo/ABAP motif |
| `public/og-image.png` | 1200x630 OG image (placeholder, replaced later with screenshot) |
| `public/robots.txt` | Crawler directives + sitemap reference |
| `public/sitemap.xml` | URL list for all pages |
| `public/docs/index.html` | Content hub — links to all guides and pitfall pages |
| `public/docs/about.html` | Site overview, features, FAQ |
| `public/docs/guides/internal-tables.html` | Guide: internal table operations |
| `public/docs/guides/string-processing.html` | Guide: string handling |
| `public/docs/guides/modern-syntax.html` | Guide: ABAP 7.40+ features |
| `public/docs/pitfalls/string-char-confusion.html` | LLM pitfall: STRING vs CHAR |
| `public/docs/pitfalls/python-loop-pattern.html` | LLM pitfall: Python-style loops |

### Modified Files

| File | Changes |
|------|---------|
| `index.html` | Add OG tags, Twitter Card, canonical, JSON-LD, GA4 snippet, theme-color |
| `src/App.tsx:256-307` | Import and render HeroBanner + AppFooter, pass `showHero` prop based on URL hash and localStorage |

---

## Task 1: SEO Meta Tags & GA4 in index.html

**Files:**
- Modify: `index.html`

- [ ] **Step 1: Add all meta tags, JSON-LD, and GA4 to index.html**

Replace the current `<head>` content with the full SEO-ready version:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>ABAP Dojo — Browser-based ABAP Playground & AI Validator</title>
    <meta name="description" content="Write, lint, and execute ABAP code in your browser. No SAP system required. Validate LLM-generated ABAP with AI pitfall detection." />
    <link rel="canonical" href="https://abapdojo.com/" />
    <meta name="robots" content="index, follow" />

    <!-- Open Graph -->
    <meta property="og:type" content="website" />
    <meta property="og:title" content="ABAP Dojo — Browser-based ABAP Playground & AI Validator" />
    <meta property="og:description" content="Write, lint, and execute ABAP code in your browser. No SAP system required. Validate LLM-generated ABAP with AI pitfall detection." />
    <meta property="og:url" content="https://abapdojo.com/" />
    <meta property="og:image" content="https://abapdojo.com/og-image.png" />
    <meta property="og:site_name" content="ABAP Dojo" />
    <meta property="og:locale" content="en_US" />

    <!-- Twitter Card -->
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="ABAP Dojo — Browser-based ABAP Playground & AI Validator" />
    <meta name="twitter:description" content="Write, lint, and execute ABAP code in your browser. No SAP system required." />
    <meta name="twitter:image" content="https://abapdojo.com/og-image.png" />

    <!-- Theme & Icons -->
    <meta name="theme-color" content="#111827" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />

    <!-- JSON-LD: WebApplication -->
    <script type="application/ld+json">
    {
      "@context": "https://schema.org",
      "@type": "WebApplication",
      "name": "ABAP Dojo",
      "url": "https://abapdojo.com",
      "description": "Browser-based ABAP playground with real-time linting, code execution, and AI-generated code validation.",
      "applicationCategory": "DeveloperApplication",
      "operatingSystem": "Any",
      "offers": {
        "@type": "Offer",
        "price": "0",
        "priceCurrency": "USD"
      }
    }
    </script>

    <!-- JSON-LD: FAQPage -->
    <script type="application/ld+json">
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "What is ABAP Dojo?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "ABAP Dojo is a free, browser-based ABAP playground that lets you write, lint, and execute ABAP code without an SAP system. It also includes an AI Validator to detect common mistakes in LLM-generated ABAP code."
          }
        },
        {
          "@type": "Question",
          "name": "Is my code safe?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Yes. ABAP Dojo runs 100% in your browser. Your code is never sent to any server. All parsing, linting, transpiling, and execution happens client-side using the abaplint open-source ecosystem."
          }
        },
        {
          "@type": "Question",
          "name": "Do I need an SAP system to use ABAP Dojo?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "No. ABAP Dojo uses the abaplint transpiler to convert ABAP to JavaScript and run it directly in your browser. No SAP system, no BTP trial, no Docker setup required."
          }
        }
      ]
    }
    </script>

    <!-- Google Analytics 4 -->
    <script async src="https://www.googletagmanager.com/gtag/js?id=G-YY1YV51K2X"></script>
    <script>
      window.dataLayer = window.dataLayer || [];
      function gtag(){dataLayer.push(arguments);}
      gtag('js', new Date());
      gtag('config', 'G-YY1YV51K2X');
    </script>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 2: Verify the page loads correctly**

Run: `npm run dev`

Open http://localhost:5173 in a browser. Check:
- Page title shows in the tab
- No console errors from GA4 or JSON-LD
- View page source to confirm all meta tags are present

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "Add SEO meta tags, JSON-LD structured data, and GA4"
```

---

## Task 2: Favicon & OG Image

**Files:**
- Create: `public/favicon.svg`
- Create: `public/og-image.png`

- [ ] **Step 1: Create favicon.svg**

Create a simple SVG favicon. Dojo-inspired design with ABAP angle brackets on dark background:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="12" fill="#1e293b"/>
  <text x="32" y="28" text-anchor="middle" font-family="monospace" font-size="14" font-weight="bold" fill="#60a5fa">ABAP</text>
  <text x="32" y="50" text-anchor="middle" font-family="serif" font-size="16" fill="#f1f5f9">道場</text>
</svg>
```

Save to `public/favicon.svg`.

- [ ] **Step 2: Create OG image placeholder**

Create a simple 1200x630 SVG-based placeholder as `public/og-image.svg`, then note that for social previews, PNG is required. For now, create a minimal SVG that can be screenshotted or converted later:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="#111827"/>
  <text x="600" y="260" text-anchor="middle" font-family="system-ui, sans-serif" font-size="72" font-weight="bold" fill="#f1f5f9">ABAP Dojo</text>
  <text x="600" y="330" text-anchor="middle" font-family="system-ui, sans-serif" font-size="28" fill="#94a3b8">Write, Lint &amp; Run ABAP — In Your Browser</text>
  <text x="600" y="400" text-anchor="middle" font-family="system-ui, sans-serif" font-size="22" fill="#64748b">No SAP system required · AI Pitfall Detection · 163 Lint Rules</text>
</svg>
```

Save as `public/og-image.svg`. Convert to PNG (1200x630) using the browser or any tool. Save as `public/og-image.png`. If conversion is not possible now, keep the SVG and update `index.html`'s og:image to point to `.svg` temporarily — social platforms prefer PNG but SVG works for initial deployment.

- [ ] **Step 3: Verify favicon appears**

Run: `npm run dev`

Check that the favicon shows in the browser tab at http://localhost:5173.

- [ ] **Step 4: Commit**

```bash
git add public/favicon.svg public/og-image.svg public/og-image.png
git commit -m "Add favicon and OG image"
```

---

## Task 3: robots.txt & sitemap.xml

**Files:**
- Create: `public/robots.txt`
- Create: `public/sitemap.xml`

- [ ] **Step 1: Create robots.txt**

```
User-agent: *
Allow: /

Sitemap: https://abapdojo.com/sitemap.xml
```

Save to `public/robots.txt`.

- [ ] **Step 2: Create sitemap.xml**

```xml
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://abapdojo.com/</loc>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>https://abapdojo.com/docs/</loc>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>
  <url>
    <loc>https://abapdojo.com/docs/about.html</loc>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>
  <url>
    <loc>https://abapdojo.com/docs/guides/internal-tables.html</loc>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>
  <url>
    <loc>https://abapdojo.com/docs/guides/string-processing.html</loc>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>
  <url>
    <loc>https://abapdojo.com/docs/guides/modern-syntax.html</loc>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>
  <url>
    <loc>https://abapdojo.com/docs/pitfalls/string-char-confusion.html</loc>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>
  <url>
    <loc>https://abapdojo.com/docs/pitfalls/python-loop-pattern.html</loc>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>
</urlset>
```

Save to `public/sitemap.xml`.

- [ ] **Step 3: Verify files are served**

Run: `npm run dev`

Check http://localhost:5173/robots.txt and http://localhost:5173/sitemap.xml load correctly.

- [ ] **Step 4: Commit**

```bash
git add public/robots.txt public/sitemap.xml
git commit -m "Add robots.txt and sitemap.xml"
```

---

## Task 4: HeroBanner Component

**Files:**
- Create: `src/components/HeroBanner.tsx`
- Create: `src/components/HeroBanner.test.tsx`

- [ ] **Step 1: Write failing tests for HeroBanner**

```tsx
// src/components/HeroBanner.test.tsx
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/components/HeroBanner.test.tsx`

Expected: FAIL — HeroBanner module not found.

Note: If `@testing-library/react` is not installed, run `npm install -D @testing-library/react @testing-library/jest-dom` first.

- [ ] **Step 3: Install test dependencies if needed**

Run: `npm install -D @testing-library/react @testing-library/jest-dom`

Add to `vite.config.ts` or `vitest.config.ts` if not already configured:

```ts
// vitest needs jsdom environment for React component tests
// Add to vite.config.ts under test config if not present
test: {
  environment: "jsdom",
}
```

- [ ] **Step 4: Implement HeroBanner**

```tsx
// src/components/HeroBanner.tsx
interface HeroBannerProps {
  visible: boolean;
  onDismiss: () => void;
}

const PILLS = [
  { icon: "▶", label: "Execute ABAP", bg: "bg-blue-950/50", text: "text-blue-300" },
  { icon: "✓", label: "AI Pitfall Detection", bg: "bg-emerald-950/50", text: "text-emerald-300" },
  { icon: "⚡", label: "163 Lint Rules", bg: "bg-amber-950/50", text: "text-amber-300" },
  {
    icon: "🔒",
    label: "Safe for Client Code",
    bg: "bg-purple-950/50",
    text: "text-purple-300",
    title: "All processing runs in your browser. Your code is never sent to any server.",
  },
] as const;

export function HeroBanner({ visible, onDismiss }: HeroBannerProps) {
  if (!visible) return null;

  return (
    <section
      className="relative px-6 py-5 text-center border-b border-gray-700"
      style={{ background: "linear-gradient(180deg, #1e293b 0%, #111827 100%)" }}
    >
      <button
        onClick={onDismiss}
        aria-label="Dismiss hero banner"
        className="absolute top-2 right-3 text-gray-500 hover:text-gray-300 text-sm"
      >
        ✕
      </button>

      <h2 className="text-xl font-bold text-gray-100 tracking-wide">
        Write, Lint & Run ABAP — In Your Browser
      </h2>
      <p className="text-sm text-gray-400 mt-1.5">
        No SAP system required. Validate LLM-generated code.{" "}
        <span className="text-gray-500">SAPシステム不要の道場。</span>
      </p>

      <div className="flex flex-wrap gap-2.5 justify-center mt-4">
        {PILLS.map((pill) => (
          <span
            key={pill.label}
            title={pill.title}
            className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-sm ${pill.bg} ${pill.text}`}
          >
            <span>{pill.icon}</span>
            {pill.label}
          </span>
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/components/HeroBanner.test.tsx`

Expected: All 5 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/HeroBanner.tsx src/components/HeroBanner.test.tsx
git commit -m "Add HeroBanner component with feature pills and dismiss logic"
```

---

## Task 5: AppFooter Component

**Files:**
- Create: `src/components/AppFooter.tsx`
- Create: `src/components/AppFooter.test.tsx`

- [ ] **Step 1: Write failing tests for AppFooter**

```tsx
// src/components/AppFooter.test.tsx
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/components/AppFooter.test.tsx`

Expected: FAIL — AppFooter module not found.

- [ ] **Step 3: Implement AppFooter**

```tsx
// src/components/AppFooter.tsx
const NAV_LINKS = [
  { label: "Guides", href: "/docs/index.html" },
  { label: "AI Pitfalls", href: "/docs/index.html#pitfalls" },
  { label: "About", href: "/docs/about.html" },
  { label: "GitHub", href: "https://github.com/user/abap-dojo", external: true },
] as const;

export function AppFooter() {
  return (
    <footer className="px-4 py-3 bg-gray-800 border-t border-gray-700 text-center text-xs text-gray-500">
      <nav className="flex flex-wrap justify-center gap-3 mb-1.5">
        {NAV_LINKS.map((link) => (
          <a
            key={link.label}
            href={link.href}
            target={"external" in link ? "_blank" : undefined}
            rel={"external" in link ? "noopener noreferrer" : undefined}
            className="text-gray-400 hover:text-gray-200 transition-colors"
          >
            {link.label}
          </a>
        ))}
      </nav>
      <p>
        © 2026 ABAP Dojo — Browser-based ABAP Playground. Powered by{" "}
        <a
          href="https://abaplint.org"
          target="_blank"
          rel="noopener noreferrer"
          className="text-gray-400 hover:text-gray-200"
        >
          abaplint
        </a>
        .
      </p>
    </footer>
  );
}
```

Note: Update the GitHub URL to the actual repository URL before committing.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/components/AppFooter.test.tsx`

Expected: All 3 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/AppFooter.tsx src/components/AppFooter.test.tsx
git commit -m "Add AppFooter component with docs navigation links"
```

---

## Task 6: Integrate HeroBanner & AppFooter into App.tsx

**Files:**
- Modify: `src/App.tsx:1-11` (imports), `src/App.tsx:53-55` (state), `src/App.tsx:256-307` (JSX)

- [ ] **Step 1: Add hero visibility logic and render both components**

In `src/App.tsx`, add the following:

**Imports** — add at the top with other imports:

```tsx
import { HeroBanner } from "./components/HeroBanner";
import { AppFooter } from "./components/AppFooter";
```

**State** — add inside the `App` function, after the existing state declarations (after line ~67):

```tsx
// Hero visibility: hidden if dismissed, or if URL has code parameter
const [heroVisible, setHeroVisible] = useState(() => {
  if (localStorage.getItem("hero-dismissed") === "true") return false;
  const hash = window.location.hash;
  if (hash && hash.includes("code=")) return false;
  return true;
});

const handleDismissHero = useCallback(() => {
  setHeroVisible(false);
  localStorage.setItem("hero-dismissed", "true");
}, []);
```

**JSX** — modify the return statement. Insert `<HeroBanner>` between `<ModeHeader>` and `<Toolbar>`, and add `<AppFooter>` after `</main>`:

```tsx
return (
  <div className="h-screen flex flex-col bg-gray-900 text-gray-100">
    <ModeHeader mode={mode} onModeChange={handleModeChange} />

    <HeroBanner visible={heroVisible} onDismiss={handleDismissHero} />

    <Toolbar
      mode={mode}
      onRun={handleRun}
      onValidate={handleValidate}
      isRunning={isRunning}
      isValidating={isValidating}
      onShare={handleShare}
      onSelectSample={handleSelectSample}
    />

    <main className="flex-1 min-h-0 flex flex-col md:flex-row">
      {/* Editor */}
      <div className="h-1/2 md:h-auto md:w-1/2 min-h-0 border-b md:border-b-0 md:border-r border-gray-700">
        <EditorPanel
          value={source}
          onChange={handleChange}
          lintIssues={lintIssues}
        />
      </div>

      {/* Output / Validation */}
      <div className="h-1/2 md:h-auto md:w-1/2 min-h-0">
        {mode === "playground" ? (
          <OutputPanel
            output={output}
            error={error}
            lintIssues={lintIssues}
            isRunning={isRunning}
            activeTab={activeTab}
            onTabChange={setActiveTab}
          />
        ) : (
          <ValidationReport
            stages={validationStages}
            isValidating={isValidating}
          />
        )}
      </div>
    </main>

    <AppFooter />

    <ExecutionSandbox
      ref={sandboxRef}
      onOutput={handleOutput}
      onError={handleError}
      onDone={handleDone}
    />
  </div>
);
```

- [ ] **Step 2: Verify the app loads with Hero and Footer**

Run: `npm run dev`

Check http://localhost:5173:
- Hero banner appears between header and toolbar
- Clicking ✕ dismisses the banner and it doesn't return on reload
- Footer appears at the bottom with working links
- Clear localStorage (`localStorage.removeItem("hero-dismissed")`) and reload to see hero again

- [ ] **Step 3: Run all existing tests**

Run: `npx vitest run`

Expected: All tests PASS (existing + new HeroBanner + AppFooter tests).

- [ ] **Step 4: Run type check and lint**

Run: `npx tsc --noEmit && npm run lint`

Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx
git commit -m "Integrate HeroBanner and AppFooter into App"
```

---

## Task 7: Static SEO Content Pages — Template & Hub

**Files:**
- Create: `public/docs/index.html`
- Create: `public/docs/about.html`

Note: All docs pages use Tailwind CDN and are completely independent of the Vite build pipeline. Each page is a self-contained HTML file.

- [ ] **Step 1: Create docs hub page**

```html
<!-- public/docs/index.html -->
<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>ABAP Guides & Resources — ABAP Dojo</title>
  <meta name="description" content="Learn ABAP with interactive guides and understand common LLM pitfalls. Try every example live in ABAP Dojo." />
  <link rel="canonical" href="https://abapdojo.com/docs/" />
  <meta property="og:title" content="ABAP Guides & Resources — ABAP Dojo" />
  <meta property="og:description" content="Learn ABAP with interactive guides and understand common LLM pitfalls." />
  <meta property="og:url" content="https://abapdojo.com/docs/" />
  <meta property="og:image" content="https://abapdojo.com/og-image.png" />
  <meta name="theme-color" content="#111827" />
  <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
  <script src="https://cdn.tailwindcss.com"></script>
  <script>
    tailwind.config = {
      theme: { extend: { fontFamily: { mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'] } } }
    }
  </script>
  <!-- GA4 -->
  <script async src="https://www.googletagmanager.com/gtag/js?id=G-YY1YV51K2X"></script>
  <script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','G-YY1YV51K2X');</script>
</head>
<body class="bg-gray-900 text-gray-100 min-h-screen flex flex-col">
  <!-- Header -->
  <header class="px-6 py-4 bg-gray-800 border-b border-gray-700 flex items-center gap-4">
    <a href="/" class="text-lg font-bold text-gray-100 hover:text-blue-400 transition-colors">ABAP Dojo</a>
    <span class="text-gray-600">›</span>
    <span class="text-gray-400 text-sm">Guides & Resources</span>
  </header>

  <!-- Content -->
  <main class="flex-1 max-w-3xl mx-auto px-6 py-10 w-full">
    <h1 class="text-3xl font-bold mb-2">ABAP Guides & Resources</h1>
    <p class="text-gray-400 mb-8">Interactive tutorials and AI pitfall guides. Every example runs live in ABAP Dojo.</p>

    <section class="mb-10">
      <h2 class="text-xl font-semibold mb-4 text-gray-200">Guides</h2>
      <div class="space-y-3">
        <a href="/docs/guides/internal-tables.html" class="block p-4 bg-gray-800 rounded-lg border border-gray-700 hover:border-blue-500 transition-colors">
          <h3 class="font-medium text-gray-100">Internal Tables — LOOP, APPEND, READ TABLE</h3>
          <p class="text-sm text-gray-400 mt-1">Master ABAP internal table operations with live examples.</p>
        </a>
        <a href="/docs/guides/string-processing.html" class="block p-4 bg-gray-800 rounded-lg border border-gray-700 hover:border-blue-500 transition-colors">
          <h3 class="font-medium text-gray-100">String Processing — CONCATENATE, &&, STRLEN</h3>
          <p class="text-sm text-gray-400 mt-1">String handling techniques from legacy to modern ABAP.</p>
        </a>
        <a href="/docs/guides/modern-syntax.html" class="block p-4 bg-gray-800 rounded-lg border border-gray-700 hover:border-blue-500 transition-colors">
          <h3 class="font-medium text-gray-100">Modern ABAP Syntax — Inline Declarations, VALUE, NEW</h3>
          <p class="text-sm text-gray-400 mt-1">ABAP 7.40+ features that make your code concise and readable.</p>
        </a>
      </div>
    </section>

    <section class="mb-10" id="pitfalls">
      <h2 class="text-xl font-semibold mb-4 text-gray-200">LLM Pitfalls</h2>
      <p class="text-gray-400 text-sm mb-4">Common mistakes when AI generates ABAP code — and how to spot them.</p>
      <div class="space-y-3">
        <a href="/docs/pitfalls/string-char-confusion.html" class="block p-4 bg-gray-800 rounded-lg border border-gray-700 hover:border-emerald-500 transition-colors">
          <h3 class="font-medium text-gray-100">STRING vs CHAR Confusion</h3>
          <p class="text-sm text-gray-400 mt-1">Why LLMs default to STRING when CHAR(n) is expected.</p>
        </a>
        <a href="/docs/pitfalls/python-loop-pattern.html" class="block p-4 bg-gray-800 rounded-lg border border-gray-700 hover:border-emerald-500 transition-colors">
          <h3 class="font-medium text-gray-100">Python-Style Loop Patterns</h3>
          <p class="text-sm text-gray-400 mt-1">When LLMs write index-based loops instead of LOOP AT ... ASSIGNING.</p>
        </a>
      </div>
    </section>

    <div class="text-center mt-8">
      <a href="/" class="inline-block px-6 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-medium transition-colors">
        ← Back to ABAP Dojo
      </a>
    </div>
  </main>

  <!-- Footer -->
  <footer class="px-6 py-4 bg-gray-800 border-t border-gray-700 text-center text-xs text-gray-500">
    <p>© 2026 ABAP Dojo — Browser-based ABAP Playground. Powered by <a href="https://abaplint.org" class="text-gray-400 hover:text-gray-200">abaplint</a>.</p>
  </footer>
</body>
</html>
```

- [ ] **Step 2: Create about page**

```html
<!-- public/docs/about.html -->
<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>About ABAP Dojo — Free Online ABAP Editor & Playground</title>
  <meta name="description" content="ABAP Dojo is a free, browser-based ABAP playground. Write, lint, execute, and validate ABAP code without an SAP system. 100% client-side — your code never leaves your browser." />
  <link rel="canonical" href="https://abapdojo.com/docs/about.html" />
  <meta property="og:title" content="About ABAP Dojo — Free Online ABAP Editor" />
  <meta property="og:description" content="Write, lint, execute, and validate ABAP code in your browser. No SAP system required." />
  <meta property="og:url" content="https://abapdojo.com/docs/about.html" />
  <meta property="og:image" content="https://abapdojo.com/og-image.png" />
  <meta name="theme-color" content="#111827" />
  <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
  <script src="https://cdn.tailwindcss.com"></script>
  <script>
    tailwind.config = {
      theme: { extend: { fontFamily: { mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'] } } }
    }
  </script>
  <script async src="https://www.googletagmanager.com/gtag/js?id=G-YY1YV51K2X"></script>
  <script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','G-YY1YV51K2X');</script>
</head>
<body class="bg-gray-900 text-gray-100 min-h-screen flex flex-col">
  <header class="px-6 py-4 bg-gray-800 border-b border-gray-700 flex items-center gap-4">
    <a href="/" class="text-lg font-bold text-gray-100 hover:text-blue-400 transition-colors">ABAP Dojo</a>
    <span class="text-gray-600">›</span>
    <a href="/docs/" class="text-gray-400 hover:text-gray-200 text-sm">Guides</a>
    <span class="text-gray-600">›</span>
    <span class="text-gray-400 text-sm">About</span>
  </header>

  <main class="flex-1 max-w-3xl mx-auto px-6 py-10 w-full">
    <h1 class="text-3xl font-bold mb-6">About ABAP Dojo</h1>

    <section class="mb-8">
      <p class="text-gray-300 leading-relaxed mb-4">
        ABAP Dojo is a free, browser-based playground for writing, linting, and executing ABAP code. No SAP system, no BTP trial, no Docker setup — just open your browser and start coding.
      </p>
      <p class="text-gray-300 leading-relaxed">
        Built for ABAP developers, consultants, and learners who need a quick way to test code snippets, validate LLM-generated ABAP, or practice modern syntax.
      </p>
    </section>

    <section class="mb-8">
      <h2 class="text-2xl font-semibold mb-4">Features</h2>
      <div class="grid gap-4 sm:grid-cols-2">
        <div class="p-4 bg-gray-800 rounded-lg border border-gray-700">
          <h3 class="font-medium text-blue-300 mb-1">▶ Execute ABAP</h3>
          <p class="text-sm text-gray-400">Write ABAP, transpile to JavaScript, and run it in your browser. See WRITE output instantly.</p>
        </div>
        <div class="p-4 bg-gray-800 rounded-lg border border-gray-700">
          <h3 class="font-medium text-emerald-300 mb-1">✓ AI Pitfall Detection</h3>
          <p class="text-sm text-gray-400">Paste LLM-generated ABAP and catch common mistakes: STRING/CHAR confusion, Python-style patterns, hallucinated classes.</p>
        </div>
        <div class="p-4 bg-gray-800 rounded-lg border border-gray-700">
          <h3 class="font-medium text-amber-300 mb-1">⚡ 163 Lint Rules</h3>
          <p class="text-sm text-gray-400">Real-time linting powered by abaplint with 163 rules covering style, correctness, and best practices.</p>
        </div>
        <div class="p-4 bg-gray-800 rounded-lg border border-gray-700">
          <h3 class="font-medium text-purple-300 mb-1">🔒 Safe for Client Code</h3>
          <p class="text-sm text-gray-400">100% client-side. Your code never leaves your browser. No server, no data transfer, no risk.</p>
        </div>
      </div>
    </section>

    <section class="mb-8">
      <h2 class="text-2xl font-semibold mb-4">How It Works</h2>
      <ol class="list-decimal list-inside space-y-2 text-gray-300">
        <li>Write ABAP code in the Monaco Editor with syntax highlighting</li>
        <li>abaplint parses and lints your code in real-time (in a Web Worker)</li>
        <li>Click <strong>Run</strong> to transpile ABAP → JavaScript via the abaplint transpiler</li>
        <li>The transpiled code executes in a sandboxed iframe — WRITE output appears in the output panel</li>
      </ol>
    </section>

    <section class="mb-8">
      <h2 class="text-2xl font-semibold mb-4">Who Is This For?</h2>
      <ul class="space-y-2 text-gray-300">
        <li>• <strong>ABAP consultants</strong> who want to test snippets without an SAP system</li>
        <li>• <strong>Developers using LLMs</strong> to generate ABAP code and need validation</li>
        <li>• <strong>ABAP learners</strong> looking for a zero-setup practice environment</li>
        <li>• <strong>S/4HANA migration teams</strong> checking legacy-to-modern syntax conversions</li>
      </ul>
    </section>

    <section class="mb-8">
      <h2 class="text-2xl font-semibold mb-4">Technology</h2>
      <p class="text-gray-300 mb-3">
        ABAP Dojo is built on the <a href="https://abaplint.org" class="text-blue-400 hover:underline">abaplint</a> open-source ecosystem (MIT License):
      </p>
      <ul class="space-y-1 text-gray-400 text-sm">
        <li>• <code class="text-gray-300">@abaplint/core</code> — ABAP parser + 163 lint rules</li>
        <li>• <code class="text-gray-300">@abaplint/transpiler</code> — ABAP → JavaScript transpiler</li>
        <li>• <code class="text-gray-300">@abaplint/runtime</code> — Runtime for transpiled code</li>
      </ul>
    </section>

    <div class="text-center mt-10">
      <a href="/" class="inline-block px-6 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-medium transition-colors">
        Open ABAP Dojo →
      </a>
    </div>
  </main>

  <footer class="px-6 py-4 bg-gray-800 border-t border-gray-700 text-center text-xs text-gray-500">
    <nav class="flex flex-wrap justify-center gap-3 mb-1.5">
      <a href="/docs/" class="text-gray-400 hover:text-gray-200">Guides</a>
      <a href="/docs/about.html" class="text-gray-400 hover:text-gray-200">About</a>
      <a href="/" class="text-gray-400 hover:text-gray-200">← Back to ABAP Dojo</a>
    </nav>
    <p>© 2026 ABAP Dojo — Browser-based ABAP Playground. Powered by <a href="https://abaplint.org" class="text-gray-400 hover:text-gray-200">abaplint</a>.</p>
  </footer>
</body>
</html>
```

- [ ] **Step 3: Verify pages render**

Run: `npm run dev`

Check:
- http://localhost:5173/docs/index.html — hub page with links
- http://localhost:5173/docs/about.html — about page with features
- Verify all links work (back to app, between pages)

- [ ] **Step 4: Commit**

```bash
git add public/docs/index.html public/docs/about.html
git commit -m "Add docs hub and about page"
```

---

## Task 8: Guide Pages (3 pages)

**Files:**
- Create: `public/docs/guides/internal-tables.html`
- Create: `public/docs/guides/string-processing.html`
- Create: `public/docs/guides/modern-syntax.html`

Each guide page follows the same template as about.html but includes ABAP code examples and a CTA link that opens the code in Playground mode.

**CTA link format:** `/#code=<encoded>` where `<encoded>` is the pako-compressed, base64-encoded source code from `src/samples/index.ts`.

To generate encoded values, use the browser console on the running dev server:

```js
// In browser console at localhost:5173
import('/src/utils/urlShare.ts').then(m => {
  // Copy the code from each sample in src/samples/index.ts and encode it
  console.log(m.encodeSource(`REPORT ztest_itab.\n...`));
});
```

Or create a temporary Node script using pako directly.

- [ ] **Step 1: Generate encoded CTA URLs**

Create a temporary script to generate the encoded URLs:

```bash
node -e "
const pako = require('./node_modules/pako');
const encode = (s) => {
  const compressed = pako.deflate(new TextEncoder().encode(s));
  let binary = '';
  for (let i = 0; i < compressed.length; i++) binary += String.fromCharCode(compressed[i]);
  return btoa(binary);
};

// Internal tables sample from src/samples/index.ts
const itab = \`REPORT ztest_itab.

TYPES: BEGIN OF ty_person,
         name TYPE string,
         age  TYPE i,
       END OF ty_person.

DATA lt_people TYPE STANDARD TABLE OF ty_person WITH DEFAULT KEY.
DATA ls_person TYPE ty_person.

ls_person-name = 'Alice'.
ls_person-age = 30.
APPEND ls_person TO lt_people.

ls_person-name = 'Bob'.
ls_person-age = 25.
APPEND ls_person TO lt_people.

ls_person-name = 'Charlie'.
ls_person-age = 35.
APPEND ls_person TO lt_people.

LOOP AT lt_people INTO ls_person.
  WRITE: / ls_person-name, ls_person-age.
ENDLOOP.

WRITE: / 'Total:', LINES( lt_people ), 'people'.\`;

// String processing sample
const str = \`REPORT ztest_string.

DATA lv_first TYPE string VALUE 'Hello'.
DATA lv_last  TYPE string VALUE 'World'.
DATA lv_result TYPE string.

* Concatenation with &&
lv_result = lv_first && ' ' && lv_last.
WRITE lv_result.

* CONCATENATE statement
CONCATENATE lv_first lv_last INTO lv_result SEPARATED BY ', '.
WRITE / lv_result.

* String length
WRITE: / 'Length:', STRLEN( lv_result ).

* Case conversion
TRANSLATE lv_result TO UPPER CASE.
WRITE: / 'Upper:', lv_result.

TRANSLATE lv_result TO LOWER CASE.
WRITE: / 'Lower:', lv_result.\`;

// Modern syntax sample
const modern = \`REPORT ztest_modern.

CLASS lcl_calculator DEFINITION.
  PUBLIC SECTION.
    METHODS double
      IMPORTING iv_val TYPE i
      RETURNING VALUE(rv_result) TYPE i.
ENDCLASS.

CLASS lcl_calculator IMPLEMENTATION.
  METHOD double.
    rv_result = iv_val * 2.
  ENDMETHOD.
ENDCLASS.

DATA lo_calc TYPE REF TO lcl_calculator.

CREATE OBJECT lo_calc.

DATA lv_result TYPE i.
lv_result = lo_calc->double( 21 ).
WRITE: 'Double of 21:', lv_result.\`;

console.log('ITAB:', encode(itab));
console.log('STRING:', encode(str));
console.log('MODERN:', encode(modern));
"
```

Save the 3 encoded strings — use them in the CTA href values below.

- [ ] **Step 2: Create internal-tables.html**

Create `public/docs/guides/internal-tables.html` following the same template structure as about.html. Key content:

- **Title:** "ABAP Internal Tables — LOOP, APPEND, READ TABLE Examples"
- **Meta description:** "Learn ABAP internal table operations with live examples. LOOP AT, APPEND, READ TABLE, and LINES() — try each example in ABAP Dojo."
- **H1:** "ABAP Internal Tables — LOOP, APPEND, READ TABLE"
- **Content sections:**
  - Introduction: What are internal tables in ABAP
  - Declaring a table type and internal table
  - Appending rows with APPEND
  - Looping with LOOP AT ... INTO
  - Counting with LINES()
  - Each section includes `<pre><code>` blocks with ABAP syntax
- **CTA:** "Try this code live in ABAP Dojo →" linking to `/#code=<encoded-itab>`
- **Breadcrumb:** ABAP Dojo › Guides › Internal Tables

- [ ] **Step 3: Create string-processing.html**

Create `public/docs/guides/string-processing.html`:

- **Title:** "ABAP String Processing — CONCATENATE, && Operator, STRLEN"
- **Meta description:** "ABAP string handling from legacy to modern syntax. CONCATENATE, && operator, STRLEN, TRANSLATE — with live examples."
- **H1:** "ABAP String Processing"
- **Content sections:**
  - String types in ABAP (STRING vs CHAR)
  - Concatenation: CONCATENATE vs &&
  - String length with STRLEN()
  - Case conversion with TRANSLATE
- **CTA:** links to `/#code=<encoded-string>`

- [ ] **Step 4: Create modern-syntax.html**

Create `public/docs/guides/modern-syntax.html`:

- **Title:** "Modern ABAP Syntax — Inline Declarations, VALUE, NEW (7.40+)"
- **Meta description:** "Master ABAP 7.40+ features: inline DATA declarations, VALUE expressions, constructor operators. Try each example in ABAP Dojo."
- **H1:** "Modern ABAP Syntax (7.40+)"
- **Content sections:**
  - What changed in ABAP 7.40
  - Inline DATA declarations
  - Constructor operators (NEW, VALUE)
  - Method chaining
  - Why modern syntax matters for S/4HANA
- **CTA:** links to `/#code=<encoded-modern>`

- [ ] **Step 5: Verify all guide pages render**

Run: `npm run dev`

Check each page loads, has correct breadcrumbs, CTA buttons link to the app with pre-filled code.

- [ ] **Step 6: Commit**

```bash
git add public/docs/guides/
git commit -m "Add ABAP guide pages: internal tables, strings, modern syntax"
```

---

## Task 9: Pitfall Pages (2 pages)

**Files:**
- Create: `public/docs/pitfalls/string-char-confusion.html`
- Create: `public/docs/pitfalls/python-loop-pattern.html`

Pitfall pages CTA links point to Validator mode: `/#mode=validator&code=<encoded>`.

- [ ] **Step 1: Generate encoded CTA URLs for pitfall examples**

Create example code that demonstrates each pitfall:

```bash
node -e "
const pako = require('./node_modules/pako');
const encode = (s) => {
  const compressed = pako.deflate(new TextEncoder().encode(s));
  let binary = '';
  for (let i = 0; i < compressed.length; i++) binary += String.fromCharCode(compressed[i]);
  return btoa(binary);
};

// STRING vs CHAR pitfall example
const stringChar = \`REPORT ztest_pitfall1.
* LLM Pitfall: Using STRING where CHAR is expected
DATA lv_name TYPE string VALUE 'ABAP Dojo'.
DATA lv_code TYPE string VALUE '001'.
* In real SAP, lv_code might need to be TYPE char3
* to match a DDIC domain. STRING and CHAR behave
* differently in comparisons and DB operations.
WRITE: 'Name:', lv_name.
WRITE: / 'Code:', lv_code.\`;

// Python loop pitfall example
const pythonLoop = \`REPORT ztest_pitfall2.
* LLM Pitfall: Python-style index loop
TYPES: BEGIN OF ty_item,
         name TYPE string,
         qty  TYPE i,
       END OF ty_item.
DATA lt_items TYPE STANDARD TABLE OF ty_item WITH DEFAULT KEY.
DATA ls_item TYPE ty_item.
ls_item-name = 'Widget'.
ls_item-qty = 10.
APPEND ls_item TO lt_items.
ls_item-name = 'Gadget'.
ls_item-qty = 20.
APPEND ls_item TO lt_items.
* Instead of LOOP AT ... ASSIGNING, using SY-TABIX:
DATA lv_index TYPE i.
lv_index = 1.
DO LINES( lt_items ) TIMES.
  READ TABLE lt_items INTO ls_item INDEX lv_index.
  WRITE: / ls_item-name, ls_item-qty.
  lv_index = lv_index + 1.
ENDDO.\`;

console.log('STRING_CHAR:', encode(stringChar));
console.log('PYTHON_LOOP:', encode(pythonLoop));
"
```

- [ ] **Step 2: Create string-char-confusion.html**

Create `public/docs/pitfalls/string-char-confusion.html`:

- **Title:** "LLM Pitfall: STRING vs CHAR Confusion in ABAP"
- **Meta description:** "Why AI-generated ABAP often uses STRING when CHAR(n) is expected. Understand the difference and catch this common LLM mistake."
- **H1:** "LLM Pitfall: STRING vs CHAR Confusion"
- **Content sections:**
  - The problem: LLMs default to STRING because of Python/JS influence
  - Why it matters: CHAR and STRING differ in comparisons, DDIC compatibility, and DB behavior
  - How to spot it: DATA declarations without explicit length
  - The fix: Use CHAR(n) when interfacing with DDIC structures
  - Code example showing the pitfall
- **CTA:** "Validate this code in ABAP Dojo →" linking to `/#mode=validator&code=<encoded>`

- [ ] **Step 3: Create python-loop-pattern.html**

Create `public/docs/pitfalls/python-loop-pattern.html`:

- **Title:** "LLM Pitfall: Python-Style Loop Patterns in ABAP"
- **Meta description:** "When AI writes index-based ABAP loops instead of LOOP AT ... ASSIGNING. Detect and fix this common LLM pattern."
- **H1:** "LLM Pitfall: Python-Style Loop Patterns"
- **Content sections:**
  - The problem: LLMs generate `for i in range(len(list))` style loops in ABAP
  - What it looks like: DO/ENDDO with SY-TABIX or explicit index counters
  - Why it's bad: Verbose, error-prone, not idiomatic ABAP
  - The fix: LOOP AT ... INTO / ASSIGNING / REFERENCE INTO
  - Side-by-side comparison: pitfall code vs idiomatic code
- **CTA:** "Validate this code in ABAP Dojo →" linking to `/#mode=validator&code=<encoded>`

- [ ] **Step 4: Verify pitfall pages render**

Run: `npm run dev`

Check each page loads, CTA links open Validator mode with the example code.

- [ ] **Step 5: Commit**

```bash
git add public/docs/pitfalls/
git commit -m "Add LLM pitfall pages: STRING vs CHAR, Python-style loops"
```

---

## Task 10: Production Build Verification

**Files:** None (verification only)

- [ ] **Step 1: Run production build**

```bash
npm run build
```

Expected: Build succeeds with no errors.

- [ ] **Step 2: Verify build output contains all files**

```bash
ls -la dist/
ls -la dist/docs/
ls -la dist/docs/guides/
ls -la dist/docs/pitfalls/
cat dist/robots.txt
cat dist/sitemap.xml
```

Expected: All static files from `/public/` are copied to `/dist/`:
- `dist/favicon.svg`
- `dist/og-image.svg` (and `.png` if created)
- `dist/robots.txt`
- `dist/sitemap.xml`
- `dist/docs/index.html`
- `dist/docs/about.html`
- `dist/docs/guides/internal-tables.html`
- `dist/docs/guides/string-processing.html`
- `dist/docs/guides/modern-syntax.html`
- `dist/docs/pitfalls/string-char-confusion.html`
- `dist/docs/pitfalls/python-loop-pattern.html`

- [ ] **Step 3: Preview the production build**

```bash
npm run preview
```

Test at http://localhost:4173:
- App loads with Hero banner
- Footer links navigate to docs pages
- All docs pages load and render correctly
- CTA links open the app with pre-filled code
- robots.txt and sitemap.xml are accessible
- favicon appears in the tab

- [ ] **Step 4: Run type check and lint**

```bash
npx tsc --noEmit && npm run lint
```

Expected: No errors.

- [ ] **Step 5: Run all tests**

```bash
npx vitest run
```

Expected: All tests pass.

- [ ] **Step 6: Final commit if any fixes were needed**

```bash
git add -A
git commit -m "Fix any issues found during production verification"
```

Skip this step if no fixes were needed.
