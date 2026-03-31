# ABAP Dojo

Browser-based ABAP playground. Write, lint, and execute ABAP code without a SAP system.

- **Playground** — Write ABAP, get real-time lint feedback, execute in-browser
- **AI Validator** — Validate LLM-generated ABAP code with pitfall detection

Runs 100% client-side. Your code never leaves your browser.

## Tech

Built on the [abaplint](https://abaplint.org/) ecosystem (parser, transpiler, runtime).

| Package | Role |
|---------|------|
| `@abaplint/core` | ABAP parser + 163 lint rules |
| `@abaplint/transpiler` | ABAP → JavaScript transpiler |
| `@abaplint/runtime` | Execution runtime for transpiled code |

## Development

```bash
npm install
npm run dev
```

## Build

```bash
npm run build    # Production build → dist/
npm run preview  # Preview production build locally
```

## License

MIT
