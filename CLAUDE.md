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
- `npm run test:e2e` - run the Playwright suite (Chromium, Firefox, WebKit). Its
  `webServer` config runs `npm run build` and serves the production build, so
  this is also the one command that exercises the real bundle rather than a
  dev/test double.

CI (`.github/workflows/ci.yml`) runs `lint` + `typecheck` + `test` + `test:e2e`
on every PR and on pushes to `main`. `test:e2e` is the only suite that can
catch a threading regression like #28: jsdom has no threads, so Vitest is
structurally unable to notice a CPU-bound loop blocking a thread it never
modeled in the first place. The production build itself is still also
verified separately by the Cloudflare Pages preview deployment, which remains
the only place CSP/`_headers` breakage surfaces (Playwright's `webServer`
build is not deployed to Pages, so it does not get Pages' `_headers`).

- `node scripts/encode-share-url.mjs <file.abap>` — produce the `#code=` hash for a
  static page's "try it live" CTA. `--fix` rewrites every CTA under `public/` to
  base64url. Hand-rolling these is how one page shipped with a payload that could
  not be decoded; `src/staticPages.test.ts` now fails on it either way.

- `npm run build:runtime` — regenerate `src/sandbox/runtime-bundle.js` from the
  installed `@abaplint/runtime`. **Run it after every `@abaplint/runtime` bump.**
  The bundle is a committed build artifact, so npm can move the transpiler while
  the runtime it emits calls into stays frozen in the repo: that is exactly how
  `SKIP` nearly shipped as a runtime crash — the transpiler learned to emit
  `abap.statements.skip()` against a bundle built before the statement existed.
  Forgetting it is guarded in two places, and they catch different things:
  `npm run build:runtime:check` (`--check`, wired into CI) rebuilds and compares
  byte-for-byte, so it sees *any* drift; `src/sandbox/runtime-bundle.test.ts`
  transpiles *and then executes*, so it sees the drift that actually breaks a
  program, and also compares the bundle's banner against the installed
  `@abaplint/runtime` version. Neither alone is enough — the behavioural tests
  can only notice a stale bundle once some statement they run needs a runtime
  method it lacks.

  That test executes against the **real `OutputStreamer` from `executor.js`**,
  not a mock, and it has to stay that way. Its first version used a hand-written
  fake console that happened to have a `get()` method; `SKIP TO LINE n` is the
  one statement the runtime implements by calling `console.get()`, and the real
  streamer had no such method — so the mock was green while the sandbox threw
  `TypeError: this.context.console.get is not a function`. The console contract
  between `@abaplint/runtime` and `executor.js` is the thing under test, and a
  mock cannot hold it. Check that contract after every runtime bump with
  `grep -o 'console\.[a-zA-Z]*(' src/sandbox/runtime-bundle.js | sort -u`: it
  currently prints `add`, `dir`, `get`, `isEmpty`, `log`. Only `add`, `get` and
  `isEmpty` are calls on the console *we inject* — `log`/`dir` are the runtime
  using the host's own global `console` — so the grep is a candidate list to
  read, not an answer.

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
4. **Sandboxed execution** - a `sandbox="allow-scripts"` iframe (no
   `allow-same-origin`, so it has an opaque origin) hosts the execution: that
   opacity is the actual isolation from the parent's DOM, cookies and
   localStorage. The iframe itself executes nothing — as of #28 it builds the
   transpiled JS into a `blob:` Worker and supervises it, so a runaway ABAP
   loop occupies a thread nobody else needs instead of the iframe's own main
   thread (which used to be shared with the parent page and froze the whole
   tab). Removing the iframe would drop the isolation; removing the Worker
   would bring back the freeze — both parts are load-bearing. WRITE output
   streams back to the parent via postMessage, batched rather than one message
   per line (see `src/sandbox/executor.js`)

## Project Structure

```
src/
  components/     # React components
  workers/        # Web Worker scripts (lint, transpile, validate)
  rules/          # LLM Pitfall Detector — definitions.ts, detector.ts, matchers/
  sandbox/        # runtime-bundle.js (the @abaplint/runtime bundle), plus
                  # executor.js (runs inside the blob: Worker) and
                  # supervisor.js (runs inside the iframe, relays messages
                  # between the parent and the Worker) — see #28
  samples/        # Sample ABAP code presets
  types/          # Shared message and validation types
  utils/          # Shared utility functions
  App.tsx         # Mode state, worker wiring, run/validation lifecycle
scripts/          # Dev tools, not part of the build
public/           # Copied verbatim — static pages, sitemap, _headers
e2e/              # Playwright specs, run by `npm run test:e2e` against a
                  # production build (see Build & Dev Commands)
```

Mode logic lives in `App.tsx` rather than a `modes/` directory: both modes share
one editor, one worker and one execution sandbox, and splitting them was what
let a Playground run and a Validator run orphan each other (#13).

`src/staticPages.test.ts` and `src/securityHeaders.test.ts` sit at the `src/`
root on purpose — they test `public/`, which nothing else in the toolchain
reads, and colocating them with their subject would put test files in the
directory Cloudflare serves.

## Three Modes

1. **Playground** (MVP) - Monaco editor + real-time lint + Run (transpile+execute)
2. **AI Validator** (Phase 2) - LLM-generated code validation with pitfall detection rules

The LLM-pitfall rules run in **both** modes. `handleLint` in the worker emits
them as ordinary `LintIssue`s via `pitfallToLintIssue`, so they appear inline in
the editor and in the Lint list without a mode switch; `handleValidate` also
returns them separately, because the Validator report lists them as their own
stage with the explanation and suggestion spelled out. Keeping them behind the
mode switch meant 4 people saw them in a month against 780 Run presses. The rule
id is the issue key, and both renderers print `[key] message`, so a pitfall is
self-labelling with no UI branch.
3. **Modernizer** (Phase 2) - Legacy -> modern ABAP syntax conversion with diff view

## Analytics

Product-usage events live in `src/utils/analytics.ts`. Two rules:

1. **Never send source code.** `sanitizeParams` is a per-event allowlist: it reads
   only the keys an event declares in `EVENT_PARAMS` and drops any value that
   does not match the declared shape. Passing an extra property cannot widen what
   is sent. Do not add free-string parameters — abaplint and transpiler error
   messages embed the user's own source verbatim on a single line, so "it has no
   newline" proves nothing. Use a `count` or an `enum`.

   A string parameter is allowed only when every value it can hold is checked
   for membership in a **closed set the user cannot extend** — and the check has
   to live where that set does, which is generally not here. `transpile_node` is
   the one such parameter today: the worker matches it against the class names
   `@abaplint/core` exports and drops anything else, and `AST_NODE` in
   `analytics.ts` is a shape backstop, not the guarantee (`ZSECRET` satisfies
   it). "It comes from a fixed list" is not the bar; a runtime membership test
   against an enumerable set is. If you cannot point at the set and the line
   that tests against it, use a `count` or an `enum` instead.
2. **gtag loads on `abapdojo.com` only** — the host gate is duplicated in
   `index.html` and in all 7 `public/docs/*.html` pages. Local dev, `vite preview`
   and Pages previews leave `window.gtag` undefined so `track()` no-ops there.
   Trade-off: if the custom domain is ever detached and the site is served from
   `*.pages.dev`, measurement silently drops to zero.

### Reading the parameters production hands to `gtag`, without sending them

The standing rule is that a live production run needs explicit permission every time. GA4 has a
way out that costs nothing: **block the tag script, keep the inline snippet.**

`index.html` defines `window.gtag` inline as `dataLayer.push(arguments)` and loads
`googletagmanager.com/gtag/js` separately (lines ~92-98). Abort that one request in Playwright and
`gtag()` still runs — every call lands in `window.dataLayer` and **nothing is transmitted**:

```js
await page.route('**/googletagmanager.com/**', r => r.abort())
await page.goto('https://abapdojo.com/')
const events = await page.evaluate(() => window.dataLayer)
```

So you can read what the **production bundle** passes to `gtag()` — the application-defined
parameters `analytics.ts` produced — from production, with zero writes to the GA4 property. This is
the verification to reach for before asking to run for real: it checks the thing local dev cannot
(local leaves `window.gtag` undefined, so `track()` no-ops).

**It stops at the call arguments.** Everything `gtag.js` itself would do is absent because the tag
never loads: merging config/global/event scopes, automatically collected parameters, Enhanced
Measurement's extra events, hash/history settings, and any transformation, drop, or destination
routing configured in the GA4 admin. So this does **not** verify the final network payload, and it
does not tell you whether GA4 accepts and stores the event, nor whether the custom definitions are
registered (see the section above). To check the wire format instead, load the real tag and abort
the request to the collection endpoint — a different test, not this one.

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
| `outcome`, `sample_id`, `mode`, `to_mode`, `transpile_reason`, `transpile_node`, `syntax_key`, `syntax_statement`, `syntax_error_count` | `line_count`, `duration_ms`, `output_lines`, `lint_issues`, `pitfalls`, `url_length` |

`syntax_error_count` is registered as a **dimension**, not a metric, and that is
deliberate rather than a mistake to fix: its values top out around 19, so the
distribution is readable and more useful than a sum (measured 2026-09-04: 181
events at 1, 82 at 2, 42 at 3, tailing off — about half of all syntax errors are
a single error). The `duration_ms` warning below does not apply to it.

Do not register `duration_ms` as a dimension — it is near-unique per event and
makes the report unusable. Note `outcome` is shared by `run_result` and
`validate_result` (`pass`/`warn`/`fail`), so always filter by `event_name`
when reading it.

`run_result` reports one of nine outcomes, and `run_click`/`run_result` are
meant to reconcile 1:1 — a gap between them is an orphaned execution, not a
user who walked away. Adding a *value* to an already-registered dimension
needs no GA4 change; only a new *parameter* does.

| Outcome | Means |
|---|---|
| `success` | ran to completion |
| `syntax_error` | the user's ABAP did not parse — the ordinary case |
| `transpile_error` | our transpiler threw on ABAP that *did* parse |
| `runtime_error` | the transpiled JS threw |
| `timeout` | 15s sandbox watchdog — see the caveat below |
| `stalled` | 20s worker watchdog — the abaplint worker never answered |
| `cancelled` | superseded by a run started in the other mode |
| `stopped` | the user pressed Stop |
| `load_error` | the `@abaplint/runtime` bundle could not be fetched |

The pairs `syntax_error`/`transpile_error` and `timeout`/`stalled` exist so
that "what users write" stays separable from "whether we are broken". Merging
either pair makes both questions unanswerable. `stopped` and `cancelled` are
kept apart for the same kind of reason: `stopped` is the user's own choice
(they pressed Stop), `cancelled` means the other mode took the sandbox away
from underneath them — merging those would hide whether people are actually
using the Stop button.

### `transpile_error` carries its own diagnosis

That split earned its keep: over 2026-08-05..08, `transpile_error` was 25.6% of
runs against `syntax_error`'s 2.5%. Visitors write valid ABAP; we fail to
transpile a quarter of it.

**That ratio has since inverted, and the inversion is the point of keeping them
apart.** Over 2026-08-12..09-01: `success` 58.3%, `syntax_error` 31.9% (2,883
runs), `runtime_error` 6.4%, `transpile_error` **1.7%** (157 runs). The failure
that dominates is no longer ours. Read either number alone and you would pick
the wrong work; the pair is what shows the subject changed. Note the same
period puts `other` — the `transpile_reason` bucket #43 exists to empty — at 21
events total, so #43 is now a small fix, not the large one it was written as.

`run_result` therefore also carries
`transpile_reason` (a 6-value enum: which *kind* of failure) and
`transpile_node` (which abaplint AST class had no transpiler, e.g. `Multiply`),
both produced by `src/workers/transpileDiagnostics.ts` and set on no other
outcome.

The rule against free strings still holds, and this is how: the transpiler's
messages interpolate the user's own source
(`` `Statement ${node.get().constructor.name} not supported, ${node.concatTokens()}` ``),
so `transpile_node` is lifted from the left slot only and then kept **only if it
is a member of the set `@abaplint/core` exports** — `Statements` for a
statement, `Expressions` for an expression, looked up in their own set (six
names are exported as both, so for those the separation decides nothing).
Membership in a vocabulary the user cannot add to is the guarantee; the anchored
regex and the `AST_NODE` shape in `analytics.ts` are backups, and `AST_NODE`
alone would not stop a leak — `ZSECRET` satisfies it. It fails safe: rename an
export, or lose `keepNames`, and `transpile_node` stops being reported while
`transpile_reason` continues.

`transpile_reason` gets no such guarantee and needs none — it is an enum, so
nothing the user writes can be emitted. But its fallback tests substring-match
the *whole* message, and most of those messages end in `${node.concatTokens()}`.
So the user's own source can steer the bucket, and not only at the margins:
`ComponentCondSubTranspiler, unexpected: <source>` is an `internal` failure, but
source containing the words "type not found" reclassifies it as `unknown_type`,
because that test runs first. Word boundaries keep `lv_todo` out of
`not_implemented`; they do nothing about this. Treat the fallback buckets as
indicative, not exact — the anchored fix is #43, and it is the same fix that
empties `other`. Neither is a leak: `transpile_reason` can only ever emit one of
its six declared values.

**Three things this metric does not tell you.** Read it wrong and it will point
you at the wrong work:

1. **It covers transpile-*time* throws only.** Most unsupported statements are
   handled by emitting `throw new Error("SelectOption, not supported, transpiler")`
   *into the generated JS*, so they reach the sandbox and land in
   `runtime_error`. `PARAMETERS` and `SELECT-OPTIONS` — in nearly every ABAP
   report an LLM writes — are among them, as is every `kernel class missing`
   case (`AUTHORITY-CHECK`, `WAIT`, `CALL TRANSFORMATION`). A quiet
   `unsupported_statement` count does not mean we support the statement. When
   adding a reason, check whether the message is a `throw` or a `Chunk` string;
   only the first kind can ever reach the classifier.

   **A dependency bump can move a statement across this line, and it did.**
   Upgrading `@abaplint/transpiler` 2.13.1 -> 2.13.74 added handlers for
   `FORMAT`, `NEW-PAGE` and `CALL SELECTION-SCREEN`, but all three are handlers
   that emit a `throw` into the generated JS. They therefore stop appearing as
   `transpile_error` with a `transpile_node` and start appearing as
   `runtime_error` with no diagnosis at all, so our measurement gets worse
   (see #45). The user's experience changes too, though less: the program now
   *runs* up to the embedded throw, so any `WRITE` before it is displayed
   first, where previously the run died during transpilation and printed
   nothing. `SKIP` moved the other way and is genuinely fixed. So a fall in
   `transpile_error` after a bump is not by itself good news: check which of
   the two kinds of handler landed.

   **The bump did not clear the rest of #55, and the numbers there are still
   the numbers.** Measured against 2.13.74: `SKIP`, `SKIP n` and `ULINE`
   transpile cleanly now, but `NEW-LINE` (20 events — the second-largest
   bucket in #55), `PRINT-CONTROL` (4) and `POSITION` (1) still throw at
   transpile time and still arrive as `transpile_error` with a
   `transpile_node`. `FORMAT` did **not** get the no-op #55 asked for; it got
   an embedded throw, which is the opposite direction. Re-run the
   classification before trusting any of this
   (`transpile` each statement and look for `throw new Error` in the emitted
   chunk vs. a throw out of `Transpiler.run` itself).
2. **Filter by `outcome = transpile_error`, not just `event_name`.** Both
   parameters are absent on the other ~98% of `run_result` events, so a
   `run_result` × `transpile_node` exploration renders `(not set)` as its
   dominant row. Same trap as `outcome` above.
3. **`other` is a to-do, not a residue — but it is no longer large.** Roughly
   half of the transpiler's transpile-time throw sites match no rule and land
   there, so the *coverage* gap is real; the *volume* through it is now 21
   events (see the re-measurement above), which is why #43 is a small fix. The
   identifying token is present — those messages start with the transpiler class
   that failed (`CastTranspiler, Source not found`) — and that name comes from
   another closed set we already import. See #43.

### `syntax_error` carries its own diagnosis too

`syntax_error` is now the largest failure by a wide margin — five times
`runtime_error`, the next one, and nineteen times `transpile_error` — so it gets
the same treatment: `run_result` carries `syntax_key` (which abaplint rule
reported the issue) and `syntax_error_count` (how many Error-severity issues
the parse produced), both set on no other outcome, both produced by
`src/workers/syntaxDiagnostics.ts`.

The privacy argument is the same one, with a different closed set. abaplint's
messages interpolate the user's source just as the transpiler's do
(`Database table or view "zcust_secret" not found`), so the message stays in
the browser and only the key travels — and only after being tested for
membership in the keys `ArtifactsRules.getRules()` enumerates at runtime (~182,
plus the literal `structure`, which `structure_parser.ts` attaches without
going through a rule). **That runtime membership test is the guarantee**;
`RULE_KEY` in `analytics.ts` is a shape backstop and would not stop a leak on
its own — `zcust_secret` satisfies it.

**It does not fail safe the same way, and that is the one place the two
branches genuinely differ.** For `transpile_node` the value is a
`constructor.name` and the set is the export names, so a minifier can pull them
apart and the parameter goes quiet — a real alarm, and what `keepNames` is
guarding. For `syntax_key` the set and the value are both
`getMetadata().key`: a renamed rule renames both at once and the new name keeps
travelling, so **there is no rename alarm here to wait for**. What the
membership test buys is still the whole privacy argument — only a key abaplint
itself attaches can travel — but the only thing that actually fails closed is
the hardcoded `structure` entry. Do not read a healthy `syntax_key` as evidence
that our vocabulary is still in sync with abaplint's.

### `parser_error` says *that* we failed, `syntax_statement` says *at what*

`parser_error` is the largest bucket inside the largest failure, and on its own
it is close to useless for deciding work: it means "abaplint did not recognise
this" and stops. That merges the two answers that point at opposite
investments — a form of `WRITE` we cannot parse, and a line of JavaScript
somebody pasted in.

So `run_result` also carries `syntax_statement` on `parser_error` **only**: the
leading keyword of the statement that failed, produced by
`src/workers/syntaxDiagnostics.ts`.

The privacy argument is the third instance of the same one, and this time the
slot genuinely holds the user's source. abaplint's message is
`Statement does not exist in the configured ABAP version(or a parser error), "FOO"`,
and that quoted token is whatever the user typed. It travels only if it is a
member of the set of leading keywords abaplint enumerates from its own 317
statement classes at runtime — 176 of them, `CALL FUNCTION` and `CALL METHOD`
both reducing to `CALL`. **That membership test is the guarantee.** The
end-of-line anchor is not: the user's source is interpolated into the same
message and can contain quotes, so a crafted program can steer which characters
land in the slot. It does not matter — steering changes *which real ABAP
keyword* is reported, never whether the user's own text can be one.
`STATEMENT_KEYWORD` in `analytics.ts` is a shape backstop and would not stop a
leak alone: `ZSECRET` satisfies it.

One trap in building that set: at least one matcher answers `""` for its first
token, and a set containing the empty string admits an empty token — the one
value that passes a membership test while meaning nothing. It is dropped
explicitly.

**The token is case-folded before the test, and that is load-bearing.** ABAP is
case-insensitive and abaplint quotes the token exactly as the user typed it, so
`write` and `WRITE` are one finding. LLMs write lower-case ABAP routinely, so
testing the raw token would drop most real keywords — and, because of the rule
below, would make that emptiness read as "not ABAP" when the truth was the
opposite. Folding does not widen what can travel (`zsecret` folds to `ZSECRET`,
still not a member), and what is emitted is the folded string that `has` proved
identical to a set member, so the value leaving the browser is abaplint's own
keyword rather than a string the user shaped. `toUpperCase`, never
`toLocaleUpperCase`: the locale-aware one maps `i` to `İ` under a Turkish
locale and would silently stop recognising `IF`.

**Absence is a finding, not a gap.** Measured against the real Registry:

| the user wrote | `syntax_statement` | what it means |
|---|---|---|
| `WRITE 'a'` with no period | `WRITE` | **ours** — a statement every ABAP developer uses, in a form we cannot parse |
| `FROBNICATE zsecret_table.` | *(absent)* | not ABAP |
| `const x = 5.` | *(absent)* | not ABAP |
| `SELCT * FROM mara.` | *(absent)* | a typo |

On `parser_error` the message always ends with a quoted token, so `(not set)`
there means "the token was not ABAP vocabulary" rather than "extraction
failed". Do not read it as a residue to be emptied the way `transpile_reason`'s
`other` is (#43) — a large `(not set)` share is the answer that visitors are
pasting non-ABAP, and the work that implies is a better error message, not more
parser coverage.

The usual two traps apply: filter by `outcome = syntax_error` **and**
`syntax_key = parser_error`, or `(not set)` swamps the report for a third
reason; and a new *value* needs no GA4 change while a new *parameter* does.

`syntax_key` is the key of `errors[0]` — the same issue whose message the user
is shown — deliberately, not the "most interesting" one. abaplint promises no
order, and a missing period really does surface `check_syntax` ahead of the
`parser_error` that caused it. Ranking them would bury our own guess about
which error matters inside the measurement, and we would then read that guess
back out as if it were evidence. Reporting what the user saw keeps the number
checkable against the screen; `syntax_error_count` is what separates "one line
broke" from "the whole program did".

**What the buckets mean, and why the split is worth a GA4 registration:**

| `syntax_key` | Means | The work it implies |
|---|---|---|
| `parser_error` | abaplint does not recognise the syntax | support more syntax |
| `check_syntax` | parsed, then the semantic pass rejected it — **anything** from a missing DB table to a type mismatch | **not decidable from this key alone** |
| `unknown_types` | a type we do not have. **`STRING_TABLE` is one** | carry more standard artifacts |
| `implement_methods` | structural, e.g. a `CLASS` with no implementation | genuinely the user's bug |

`parser_error` and `unknown_types` point at opposite investments, and before
this parameter existed the metric could not tell them apart. Do not assume the
answer is "LLMs write broken ABAP": `STRING_TABLE` is a type every ABAP
developer expects to exist, and here it is a `syntax_error`.

**`check_syntax` is the bucket to be careful with, and it will probably be
large.** abaplint raises it from ~72 files across its whole semantic pass, so
it carries missing lookups (`Database table or view "x" not found`,
`Class or type "x" not found`) *and* ordinary type errors
(`Into must be table typed`, `Field x does not exist in table row structure`)
under one key. **A big `check_syntax` share therefore says nothing about
whether the work is "carry more of the SAP standard" or "the user's code is
wrong"** — those are the two answers it merges. Splitting it needs a second
signal that does not exist yet (#56); until then, read `check_syntax` as
"we do not know" rather than as evidence for either.

Two traps, both the same shape as the `transpile_*` ones: filter by
`outcome = syntax_error` and not just `event_name`, or `(not set)` dominates
the report; and a *new value* of `syntax_key` needs no GA4 change, while a new
*parameter* does.

Only Playground is instrumented. `handleValidate` catches the same throws but
`validate_result` carries no `transpile_reason`; that is a scope call, not an
oversight — Playground carries the volume this section is about.

The vocabulary lives in `src/types/diagnostics.ts`, apart from the classifier,
because `analytics.ts` needs the enum and is reachable from the entry chunk —
importing `@abaplint/core` there would put 2.7 MB back into `index-*.js`.

**Do not compare `timeout` rates across 2026-08-08** (#28, #41). Before that
date the sandbox iframe ran the transpiled JS directly with `srcdoc`, sharing
the parent's main thread: a CPU-bound ABAP loop froze the whole tab and the
watchdog never got a turn to fire — the page died before it could report
anything. `timeout` from that era therefore does not mean endless loops were
rare; it means the page usually couldn't tell you about them. As of #28 the
transpiled JS runs in a Worker inside the frame, so the frame and the parent
both stay free and the watchdog reliably fires (now at 15s — see
`EXECUTION_TIMEOUT_MS` in `src/components/ExecutionSandbox.tsx`). A `timeout`
count from before that change and one from after are not the same
measurement; do not chart them as one series.

`output_lines` is the count the sandbox reports in its terminal message
(`done`, `stopped`, or the timeout path), not the number of `output` messages
received: display stops at 10,000 lines, so counting messages would report
every runaway loop as exactly 10,001. Since #28 this count is a real number on
every exit path, including a killed run — before that, a run torn down by the
watchdog frequently reported nothing because the frame that knew the count was
already unresponsive. It is not the same kind of number on every path, though:
`done`/`error` report the executor's own uncapped `total`, while `stopped` and
the timeout path report the supervisor's `linesRelayed` — only what actually
made it out in a batch before the worker was terminated, which flattens at
`MAX_LINES` (10,000) the same way the display does. For a runaway loop killed
past that point, the reported number is the capped relayed count, not the true
total produced.

Two `stopped` paths report a hard `0` from the parent rather than any count at
all: `ExecutionSandbox.stop()`'s no-frame branch, and `handleStopClick`'s
fallback for a Stop pressed before the sandbox owned the run. Both cover a run
that had not begun executing, so `0` is the truth — but they are not the
supervisor's count and will never be nonzero.

**A loop that never writes a real newline inflates `output_lines` to roughly
`elapsed_ms / 50`, not the number of `WRITE`s it executed.** The execution
worker (`src/sandbox/executor.js`) flushes output every 500 buffered lines or
50ms, whichever comes first; a program shaped like `DO. WRITE 'x'. ENDDO.`
(no `WRITE /` or explicit `NEW-LINE`) never produces a `"\n"` on its own, so
the 50ms timer is the only thing that ever turns its output into a "line" —
each flush interval that elapses counts as one more. This matches what the UI
displays and what the supervisor's own relayed-line count would say, so it is
not a bug, but do not read a 15-second `timeout` with `output_lines: 300` as
"300 `WRITE` statements ran" — it more likely means one `WRITE` ran continuously
for 15 seconds with no line break.

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
- **The syntax version is `open-abap`, not 7.02.** `@abaplint/transpiler`'s
  exported `config.syntax.version` is what `abaplintWorker.ts` feeds `Config`,
  and it reads `open-abap` — verify with
  `node -e 'console.log(require("@abaplint/transpiler").config.syntax)'` rather
  than trusting this line. This matters because "we pin 7.02" is the obvious
  explanation for a `syntax_error` rate of 32%, and it is the wrong one: modern
  expressions parse. What fails is the semantic pass, and part of that is
  artifacts we do not carry — `STRING_TABLE`, a DDIC table, a `CL_*` class —
  because open-abap-core holds a fraction of the SAP standard. Downport rules
  address none of it. How much of the 32% is that missing-artifact half rather
  than ordinary type errors is **not yet known**: abaplint files both under
  `check_syntax` (see #56).
- **`src/index.css` is a bare `@import "tailwindcss"` with no `source(none)`, so Tailwind v4
  automatically detects sources — it scans the project's non-ignored files rather than the files
  the build imports** (`.gitignore`d paths, `node_modules`, CSS, binaries and common lockfiles are
  excluded). An ordinary English word in a comment can therefore become a utility class in
  production CSS (`lowercase`, `shrink`; measured 2026-09-02, twice in one session — see #44 and
  the note in `src/types/messages.ts`).

  Two consequences when you try to isolate which change caused a CSS size delta:

  - **A plain `git stash` does not give you a baseline.** It leaves untracked files on disk, and
    disk is what v4 detects from, so a new untracked `*.ts` keeps contributing classes after the
    stash. Either stash them too (`git stash -u`) or **move the files out of the repo**
    (`mv src/workers/foo.ts /tmp/x/`) before building.
  - **Diff the CSS with the rules split onto lines**, or a one-rule delta is invisible inside one
    long line (verified 2026-09-03 by deleting a real rule and watching it appear):

    ```bash
    diff <(tr "}" "\n" < before.css) <(tr "}" "\n" < after.css)
    # > .shrink{flex-shrink:1
    ```

- DB operations (SELECT etc.) require in-memory DB simulation in browser.
- Security headers (CSP, HSTS, etc.) live in `public/_headers` — Cloudflare Pages-specific format. `vite preview` does NOT apply them, so CSP-related breakage only shows in production. Test with Playwright + production build before claiming a deploy is safe.
- **Cloudflare Pages 308-redirects `/x.html` to `/x`.** The extensionless URL is the only one that serves 200, so it is the one every `rel="canonical"`, `og:url`, `sitemap.xml` entry and internal `href` must use. Declaring the `.html` form told Google the canonical was a redirecting URL, and Search Console duly indexed both forms of the same page as separate URLs. `/docs/index.html` redirects to `/docs/`, so directory pages keep the trailing slash. `vite preview` resolves extensionless URLs to the `.html` file too, so this is verifiable locally — but the redirect itself only exists in production.
- **Both files in `src/sandbox/` that are not the runtime bundle are inlined as
  raw text and never parsed as modules.** `executor.js` goes via `?raw` into
  the `blob:` URL the execution Worker is built from (concatenated after the
  runtime bundle); `supervisor.js` goes via `?raw` into an inline `<script>` in
  the iframe's `srcdoc`. Neither runs through Vite/Babel/TS transforms. Adding
  an `import`/`export` to either, or writing syntax that depends on a bundler
  transform, does not fail the build: it fails silently at runtime inside the
  sandboxed iframe, as an unexplained Run failure with nothing in the console
  the parent page can see.

## Git Workflow

- Branch names: `feature/xxx` or `fix/xxx` (kebab-case)
- Commit messages: present tense, start with verb ("Add", "Fix", "Update")
- Small focused commits over monolithic changes

## Reference

- Full product spec: @ABAP-DOJO-HANDOFF.md
- abaplint docs: https://abaplint.org
- abaplint GitHub: https://github.com/abaplint/abaplint
