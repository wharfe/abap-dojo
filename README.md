# ABAP Dojo

Browser-based ABAP playground & AI validator. Write, lint, and execute ABAP code — no SAP system required.

**[abapdojo.com](https://abapdojo.com)**

## Features

- **Playground** — Write ABAP in Monaco Editor with real-time lint feedback, transpile to JavaScript, and execute in-browser
- **AI Validator** — Paste LLM-generated ABAP and catch common pitfalls: STRING/CHAR confusion, Python-style loops, hallucinated classes
- **163 Lint Rules** — Powered by abaplint, covering style, correctness, and best practices
- **Safe for Client Code** — Runs 100% client-side. Your code never leaves your browser. No server, no data transfer.

## How It Works

```
ABAP source → @abaplint/core (parse + lint) → @abaplint/transpiler (ABAP → JS) → sandboxed iframe (execute)
```

All processing happens in Web Workers to keep the UI responsive. Transpiled code runs in a sandboxed iframe with WRITE output returned via postMessage.

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
```

CI runs all three on every pull request.

## Project Structure

```
src/
  components/    # React components (EditorPanel, OutputPanel, HeroBanner, etc.)
  workers/       # Web Workers for abaplint/transpiler
  rules/         # LLM Pitfall Detector rule definitions
  samples/       # Sample ABAP code presets
  types/         # TypeScript type definitions
  utils/         # Shared utilities
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
