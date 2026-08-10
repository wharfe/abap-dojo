# ABAP Dojo

Browser-based ABAP playground & AI validator. Write, lint, and execute ABAP code — no SAP system required.

**[abapdojo.com](https://abapdojo.com)**

## Features

- **Playground** — Write ABAP in Monaco Editor with real-time lint feedback, transpile to JavaScript, and execute in-browser
- **AI Pitfall Detection** — Four rules for mistakes only language models make: STRING/CHAR confusion, Python-style loops, untyped declarations, hallucinated class names. They run inline as you type, no mode switch needed
- **AI Validator** — Paste LLM-generated ABAP for a staged report: syntax, lint and pitfalls, transpile, execution — each stage explaining what the one before it proved
- **163 Lint Rules** — Powered by abaplint, covering style, correctness, and best practices
- **Safe for Client Code** — Runs 100% client-side. Your code never leaves your browser. No server, no data transfer.

## How It Works

```
ABAP source → @abaplint/core (parse + lint) → @abaplint/transpiler (ABAP → JS) → Worker inside a sandboxed iframe (execute)
```

All processing happens off the UI thread. Parsing, linting and transpiling run in a
Web Worker. The transpiled JavaScript runs in a second Worker created *inside* a
sandboxed iframe, and WRITE output is streamed back in batches via postMessage.

The two layers each defend a different thing. The iframe (`sandbox="allow-scripts"`,
no `allow-same-origin`) has an opaque origin, so the code you run cannot reach the
page's DOM, cookies or storage. The Worker inside it owns its own thread, so an
endless ABAP loop occupies a thread nobody else needs — the page stays responsive
and you can stop the run.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | React 19 + TypeScript (Vite) |
| Editor | Monaco Editor |
| ABAP Engine | [@abaplint](https://abaplint.org/) ecosystem (MIT) |
| Styling | Tailwind CSS |
| Deploy | Static hosting (Cloudflare Pages) |

### abaplint packages

| Package | Role |
|---------|------|
| `@abaplint/core` | ABAP parser + 163 lint rules |
| `@abaplint/transpiler` | ABAP → JavaScript transpiler |
| `@abaplint/runtime` | Execution runtime for transpiled code |

## Development

```bash
npm install
npm run dev        # Start dev server
```

## Build & Preview

```bash
npm run build      # Production build → dist/
npm run preview    # Preview production build locally
```

## Other Commands

```bash
npm run lint       # ESLint
npm run typecheck  # Type check
npm test           # Run tests once (npm run test:watch to watch)
npm run test:e2e   # Playwright, against the production build, on 3 engines
```

`test:e2e` builds and previews the app before it runs, so it is slow. It exists
because the thread behaviour it checks — that a runaway loop does not freeze the
page — has no meaning under jsdom, which has no threads.

CI runs all three on every pull request.

## Project Structure

```
src/
  components/    # React components (EditorPanel, OutputPanel, HeroBanner, etc.)
  workers/       # Web Workers for abaplint/transpiler
  sandbox/       # The execution iframe's supervisor and its Worker, plus the
                 # @abaplint/runtime bundle they are built from
  rules/         # LLM Pitfall Detector rule definitions
  samples/       # Sample ABAP code presets
  types/         # TypeScript type definitions
  utils/         # Shared utilities
e2e/             # Playwright tests against the production build
public/
  *.html         # Landing pages for search (online compiler, editor, practice)
  docs/          # Static content pages (guides, pitfall articles)
```

Static pages are plain HTML served straight from `public/`, so they do not go
through the Vite build. Cloudflare Pages serves them at their extensionless
path — `/docs/guides/oo-basics`, not `/docs/guides/oo-basics.html`.

## Contributing

Contributions are welcome! Areas where help is appreciated:

- **LLM Pitfall rules** — New detection patterns for AI-generated ABAP mistakes (JSON rule definitions in `src/rules/`)
- **Sample code** — Additional ABAP examples for the Playground
- **Bug reports** — Issues with transpilation, execution, or lint behavior

## License

MIT
