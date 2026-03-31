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
- `npx tsc --noEmit` - run TypeScript type checking (no dedicated script; `tsc -b` runs as part of `npm run build`)

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

## Known Gotchas

- abaplint packages may assume Node.js APIs; check Vite polyfill config if bundling fails
- Monaco Editor chunks are large; use lazy loading
- Web Worker imports use Vite's `?worker` suffix
- Transpiler input is ABAP 7.02 syntax base; higher syntax needs downport rules first
- DB operations (SELECT etc.) require in-memory DB simulation in browser

## Git Workflow

- Branch names: `feature/xxx` or `fix/xxx` (kebab-case)
- Commit messages: present tense, start with verb ("Add", "Fix", "Update")
- Small focused commits over monolithic changes

## Reference

- Full product spec: @ABAP-DOJO-HANDOFF.md
- abaplint docs: https://abaplint.org
- abaplint GitHub: https://github.com/abaplint/abaplint
