# ABAP Dojo

Browser-based ABAP playground. No SAP system required.
Runs entirely client-side using the abaplint ecosystem (MIT License).

## Tech Stack

- Framework: React + TypeScript (Vite)
- Editor: Monaco Editor (`@monaco-editor/react`)
- ABAP Engine: `@abaplint/core` + `@abaplint/transpiler` + `@abaplint/runtime`
- Styling: Tailwind CSS
- State: React state (zustand if complexity warrants)
- Deploy: Static hosting (Cloudflare Pages / Vercel / GitHub Pages)

## Build & Dev Commands

- `npm install` - install dependencies
- `npm run dev` - start Vite dev server
- `npm run build` - production build
- `npm run preview` - preview production build
- `npm run lint` - run ESLint
- `npm run typecheck` - run TypeScript type checking (`tsc -b --noEmit`)
- `npm test` - run the Vitest suite once (`npm run test:watch` for watch mode)

CI (`.github/workflows/ci.yml`) runs `lint` + `typecheck` + `test` on every PR and on
pushes to `main`. The production build is verified separately by the Cloudflare Pages
preview deployment, which is the only place CSP/`_headers` breakage surfaces.

## Code Style

- 2-space indentation, no tabs
- ES6 modules (import/export), never CommonJS
- camelCase for variables/functions, PascalCase for components/classes
- Colocate tests: `src/foo.ts` -> `src/foo.test.ts`
- Code comments in English; user-facing strings in English (i18n later)
- Prefer named exports over default exports

## Architecture Decisions

1. **Serverless** - everything runs in-browser. No backend. User code never leaves the browser
2. **Web Workers** - abaplint/transpiler run in Web Workers to avoid blocking the UI thread. Use Vite's `?worker` suffix for imports
3. **No LLM API calls** - AI Validator uses static rule-based analysis only (privacy, offline, reproducibility)
4. **Sandboxed execution** - transpiled JS runs in a sandboxed iframe. WRITE output returned via postMessage

## Project Structure

```
src/
  components/     # React components
  workers/        # Web Worker scripts (lint, transpile)
  modes/          # Playground, Validator, Modernizer mode logic
  rules/          # LLM Pitfall Detector rule definitions (JSON)
  samples/        # Sample ABAP code presets
  utils/          # Shared utility functions
```

## Three Modes

1. **Playground** (MVP) - Monaco editor + real-time lint + Run (transpile+execute)
2. **AI Validator** (Phase 2) - LLM-generated code validation with pitfall detection rules
3. **Modernizer** (Phase 2) - Legacy -> modern ABAP syntax conversion with diff view

## Analytics

Product-usage events live in `src/utils/analytics.ts`. Two rules:

1. **Never send source code.** `sanitizeParams` is a per-event allowlist: it reads
   only the keys an event declares in `EVENT_PARAMS` and drops any value that
   does not match the declared shape. Passing an extra property cannot widen what
   is sent. Do not add free-string parameters — abaplint and transpiler error
   messages embed the user's own source verbatim on a single line, so "it has no
   newline" proves nothing. Use a `count` or an `enum`.
2. **gtag loads on `abapdojo.com` only** — the host gate is duplicated in
   `index.html` and in all 7 `public/docs/*.html` pages. Local dev, `vite preview`
   and Pages previews leave `window.gtag` undefined so `track()` no-ops there.
   Trade-off: if the custom domain is ever detached and the site is served from
   `*.pages.dev`, measurement silently drops to zero.

`url_code_open` counts page loads whose `#code=` parameter *decoded*, not
shared-link arrivals — the app writes `#code=` into the user's own URL on share
and on mode switch, so a reload is indistinguishable. It also differs from the
shared-code banner, which only string-matches `code=` and so shows for links
that failed to decode.

### GA4 custom definitions must be registered before a release ships

GA4 shows event **counts** immediately, but event **parameters** are invisible in
reports until registered in Admin > Data display > Custom definitions — and
registration is **not retroactive**. Data collected before it is registered is
unrecoverable (no BigQuery export is configured). Register these when adding or
renaming a parameter:

| Register as custom **dimension** (text) | Register as custom **metric** (number) |
|---|---|
| `outcome`, `sample_id`, `mode`, `to_mode` | `line_count`, `duration_ms`, `output_lines`, `lint_issues`, `pitfalls`, `url_length` |

Do not register `duration_ms` as a dimension — it is near-unique per event and
makes the report unusable. Note `outcome` is shared by `run_result` and
`validate_result` (`pass`/`warn`/`fail`), so always filter by `event_name`
when reading it.

`run_result` reports one of eight outcomes, and `run_click`/`run_result` are
meant to reconcile 1:1 — a gap between them is an orphaned execution, not a
user who walked away. Adding a *value* to an already-registered dimension
needs no GA4 change; only a new *parameter* does.

| Outcome | Means |
|---|---|
| `success` | ran to completion |
| `syntax_error` | the user's ABAP did not parse — the ordinary case |
| `transpile_error` | our transpiler threw on ABAP that *did* parse |
| `runtime_error` | the transpiled JS threw |
| `timeout` | 5s sandbox watchdog — see the caveat below |
| `stalled` | 20s worker watchdog — the abaplint worker never answered |
| `cancelled` | superseded by a run started in the other mode |
| `load_error` | the `@abaplint/runtime` bundle could not be fetched |

The pairs `syntax_error`/`transpile_error` and `timeout`/`stalled` exist so
that "what users write" stays separable from "whether we are broken". Merging
either pair makes both questions unanswerable.

**Do not read a low `timeout` count as "users rarely write endless loops"**
(#28). The sandbox iframe uses `srcdoc`, so it shares the parent's main thread:
a CPU-bound ABAP loop freezes the whole tab and the watchdog never gets a turn
to fire — the page dies before it can report anything. `timeout` therefore only
covers runs that yield. The same freeze also inflates the `run_click` vs
`run_result` gap, so that gap is not purely drop-off either.

`output_lines` is the count the sandbox reports in its `done` message, not the
number of `output` messages received: display stops at 10,000 lines, so
counting messages would report every runaway loop as exactly 10,001.

Also keep Enhanced Measurement's **browser-history / hash-routing** options OFF
for this property. The URL hash carries user source, and those options can make
GA4 treat a fragment change as a page view.

## Known Gotchas

- abaplint packages assume Node.js APIs. `@abaplint/core` calls `Buffer.from(..., "hex")` during built-in symbol init — polyfill via `import { Buffer } from "buffer"; globalThis.Buffer = Buffer` in `src/main.tsx` and `src/workers/abaplintWorker.ts`.
- Vite 8's rolldown minifier collapses class names to single letters by default. abaplint identifies its 166 statement handlers via `handler.constructor.name`, so without `keepNames: true` in `vite.config.ts` (both `build.rolldownOptions` and `worker.rolldownOptions`), the worker dies on boot with `syntax.ts duplicate statement syntax handler`.
- `@monaco-editor/react` defaults to fetching Monaco from `cdn.jsdelivr.net`, which is blocked by our CSP. `src/components/MonacoEditor.tsx` calls `loader.config({ monaco })` at module scope with a locally imported `monaco-editor/esm/vs/editor/editor.api.js` to short-circuit the CDN fetch. The `.api.js` entry skips TS/CSS/HTML/JSON language workers (~10 MB of unused chunks). That setup has to stay in the same module as the `<Editor>` it configures — the dynamic import is what guarantees it runs before the editor mounts.
- Monaco is loaded lazily, so it must not be imported from the entry chunk. `src/components/EditorPanel.tsx` imports `./MonacoEditor` dynamically at the first idle moment and shows `EditorSkeleton` (a real textarea) until then. Importing Monaco anywhere eagerly puts 2.7 MB back into the entry chunk and undoes it — check `npm run build` output: `index-*.js` should stay around 350 kB with a separate `MonacoEditor-*.js`.
- The skeleton is deliberately not a `<Suspense fallback>`. A fallback is a separate subtree, so React unmounts and remounts the textarea when switching — dropping focus, caret and in-flight IME composition.
- Web Worker imports use Vite's `?worker` suffix.
- Transpiler input is ABAP 7.02 syntax base; higher syntax needs downport rules first.
- DB operations (SELECT etc.) require in-memory DB simulation in browser.
- Security headers (CSP, HSTS, etc.) live in `public/_headers` — Cloudflare Pages-specific format. `vite preview` does NOT apply them, so CSP-related breakage only shows in production. Test with Playwright + production build before claiming a deploy is safe.
- **Cloudflare Pages 308-redirects `/x.html` to `/x`.** The extensionless URL is the only one that serves 200, so it is the one every `rel="canonical"`, `og:url`, `sitemap.xml` entry and internal `href` must use. Declaring the `.html` form told Google the canonical was a redirecting URL, and Search Console duly indexed both forms of the same page as separate URLs. `/docs/index.html` redirects to `/docs/`, so directory pages keep the trailing slash. `vite preview` resolves extensionless URLs to the `.html` file too, so this is verifiable locally — but the redirect itself only exists in production.

## Git Workflow

- Branch names: `feature/xxx` or `fix/xxx` (kebab-case)
- Commit messages: present tense, start with verb ("Add", "Fix", "Update")
- Small focused commits over monolithic changes

## Reference

- Full product spec: @ABAP-DOJO-HANDOFF.md
- abaplint docs: https://abaplint.org
- abaplint GitHub: https://github.com/abaplint/abaplint
