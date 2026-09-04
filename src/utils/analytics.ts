/**
 * Product-usage analytics.
 *
 * ABAP Dojo runs entirely in the browser and user code never leaves it. That
 * promise extends to analytics, and this module is where it is enforced.
 *
 * The enforcement is a per-event ALLOWLIST, not a filter. `sanitizeParams`
 * iterates the declared parameters of the event being sent and pulls only those
 * out of the caller's object, checking each against a declared shape. A key the
 * event did not declare is never read, so it cannot be forwarded — the caller
 * cannot widen what leaves the browser by passing extra properties.
 *
 * Why an allowlist and not a "looks like code?" heuristic: the abaplint and
 * transpiler error messages this app already displays embed the user's own
 * source verbatim on a single line — e.g.
 *   `Database table or view "zcust_secret" not found`
 *   `Statement Select not supported, SELECT * FROM zsecret WHERE pwd = 'x'`
 * Any heuristic that only rejects multi-line strings would forward those. The
 * only safe rule is that a string parameter must match a shape we declared.
 *
 * Adding a parameter here is therefore the only way to widen what is sent, and
 * it is a deliberate, reviewable edit. Keep every addition to metadata, and
 * prefer a `count` or an `enum` over a free string.
 *
 * The OTHER half of the promise lives in index.html, not here: the app writes
 * "#code=<user source>" into its own URL on share and on mode switch, and never
 * removes it, so by the time most of these events fire the address bar already
 * holds the source. What keeps that out of GA4 is the explicit
 * `page_location: location.origin + location.pathname` in the gtag config,
 * which persists to every later event. Do not remove it, and do not let a
 * caller pass `page_location` (see RESERVED_NAMES) to "fix SPA tracking".
 */
import type { AppMode } from "../types/validation";
import { TRANSPILE_REASONS, type TranspileReason } from "../types/diagnostics";

/**
 * Every way a run can end. The set is exhaustive on purpose: `run_click` and
 * `run_result` are meant to reconcile 1:1, so any path that leaves a run
 * without one of these is a lifecycle bug, not a user drop-off.
 *
 * - `syntax_error`    the user's ABAP did not parse — the ordinary case
 * - `transpile_error` our transpiler threw on ABAP that did parse
 * - `timeout`     the sandbox watchdog fired — nearly always a runaway loop
 * - `stalled`     the abaplint worker never answered; our pipeline broke, not the code
 * - `cancelled`   superseded by another run before it could finish
 * - `stopped`     the user pressed Stop — their choice, not a failure and not
 *                 the watchdog. Kept apart from `cancelled`, which means the
 *                 other mode took the sandbox away.
 * - `load_error`  the ABAP runtime bundle itself could not be fetched
 *
 * `syntax_error`/`transpile_error` and `timeout`/`stalled` are each kept apart
 * for the same reason: one of the pair measures what users write, the other
 * measures whether we are broken. Merged, both questions become unanswerable.
 */
export type RunOutcome =
  | "success"
  | "syntax_error"
  | "transpile_error"
  | "runtime_error"
  | "timeout"
  | "stalled"
  | "cancelled"
  | "stopped"
  | "load_error";

export type ValidateOutcome = "pass" | "warn" | "fail";

/**
 * The events we send, with the metadata each one carries.
 *
 * Every key here must have a matching entry in `EVENT_PARAMS` below, otherwise
 * it is silently dropped at runtime. `EVENT_PARAMS` is the runtime authority;
 * this interface is the compile-time mirror of it.
 */
export interface EventMap {
  /** Run pressed in Playground mode. */
  run_click: { line_count: number };
  /** Run finished, one way or another. */
  run_result: {
    outcome: RunOutcome;
    duration_ms: number;
    /**
     * Lines the run produced. This is the true count, not the number the UI
     * displays — the sandbox stops posting after 10,000 lines, so counting
     * received messages would report every runaway loop as exactly 10,001.
     */
    output_lines?: number;
    /**
     * Only on `outcome: "transpile_error"` — which of our own failures it was,
     * and which abaplint AST node we could not transpile. Both come out of
     * src/workers/transpileDiagnostics.ts, which classifies the message rather
     * than forwarding it; the message itself embeds the user's source and never
     * leaves the browser. `transpile_node` is already a member of abaplint's
     * exported class set by the time it arrives — the pattern below is a second
     * line of defence, not the guarantee.
     */
    transpile_reason?: TranspileReason;
    transpile_node?: string;
    /**
     * Only on `outcome: "syntax_error"` — which abaplint rule reported the
     * issue the user is being shown, and how many Error-severity issues the
     * parse produced. `syntax_key` has already been checked against the rule
     * keys abaplint enumerates by the time it arrives (see
     * src/workers/syntaxDiagnostics.ts); `RULE_KEY` below is a shape backstop.
     * `syntax_error_count` is what remains if that check ever starts dropping
     * everything — but do not expect a renamed abaplint rule to trigger that:
     * the set and the value come from the same place and move together. See the
     * header of syntaxDiagnostics.ts for what actually fails closed.
     */
    syntax_key?: string;
    syntax_error_count?: number;
    syntax_statement?: string;
  };
  /** Validate pressed in AI Validator mode. */
  validate_click: { line_count: number };
  /** Validation report completed. */
  validate_result: {
    outcome: ValidateOutcome;
    duration_ms: number;
    lint_issues: number;
    pitfalls: number;
    line_count: number;
  };
  /** A preset sample was loaded from the dropdown. */
  sample_select: { sample_id: string };
  /** Share pressed and the URL was produced. */
  share_click: { url_length: number; line_count: number };
  /** Playground <-> Validator switch. Only sent when the mode actually changes. */
  mode_switch: { to_mode: AppMode };
  /**
   * Page loaded with a code parameter in the URL that decoded successfully.
   * Not a count of shared-link arrivals: the app writes "#code=..." into the
   * user's own URL on share and on mode switch, so a reload is indistinguishable.
   */
  url_code_open: { line_count: number; mode: AppMode };
}

export type EventName = keyof EventMap;

/** The shapes a parameter is allowed to have. Anything else is dropped. */
type ParamSpec =
  | { kind: "count" }
  | { kind: "enum"; values: readonly string[] }
  | { kind: "id"; pattern: RegExp };

const MODES: readonly AppMode[] = ["playground", "validator"];

const RUN_OUTCOMES: readonly RunOutcome[] = [
  "success",
  "syntax_error",
  "transpile_error",
  "runtime_error",
  "timeout",
  "stalled",
  "cancelled",
  "stopped",
  "load_error",
];

const VALIDATE_OUTCOMES: readonly ValidateOutcome[] = ["pass", "warn", "fail"];

/**
 * Sample ids are authored literals in src/samples, never user input. They are
 * the only free-form string we send, so they are pinned to that shape.
 */
const SAMPLE_ID: ParamSpec = {
  kind: "id",
  pattern: /^[a-z0-9][a-z0-9-]{0,39}$/,
};

/**
 * An abaplint AST class name, e.g. `Multiply`. The worker has already checked
 * the name against the set abaplint exports and dropped anything else, so by
 * the time a value reaches here it is drawn from a closed vocabulary the user
 * cannot add to. That check is the guarantee; this shape is only a sanity gate
 * on it — no space, no punctuation, no newline, 40 characters at most (the
 * longest name abaplint exports is 28). Do not mistake it for a second
 * independent barrier: an underscore-free identifier such as `ZSECRET` or
 * `MARA` satisfies it, so it would not stop a leak on its own.
 */
const AST_NODE: ParamSpec = {
  kind: "id",
  pattern: /^[A-Za-z][A-Za-z0-9]{0,39}$/,
};

/**
 * An abaplint rule key, e.g. `parser_error`. Snake case, unlike the PascalCase
 * AST class names above, which is why it gets its own shape instead of reusing
 * `AST_NODE`. The worker has already tested the value for membership in the set
 * `ArtifactsRules` enumerates and dropped anything else — that test is the
 * guarantee. This pattern is a sanity gate on it and nothing more: a snake_case
 * identifier such as `zcust_secret` satisfies it, so it would not stop a leak
 * on its own.
 *
 * It has to accept every key the worker can pass, or the mismatch shows up as a
 * bucket that is permanently `(not set)` and reads as "this never happens".
 * Hence the leading character class rather than `[a-z]`: `7bit_ascii` is a real
 * abaplint rule key. `syntaxDiagnostics.test.ts` checks the whole allowed set
 * against this pattern so the next such key fails the build instead of the
 * report.
 */
const RULE_KEY: ParamSpec = {
  kind: "id",
  pattern: /^[a-z0-9][a-z0-9_]{0,39}$/,
};

/**
 * The leading keyword of an ABAP statement, e.g. `WRITE`, `SELECT`, `ENDLOOP`.
 * Upper case with hyphens allowed (`NEW-LINE`), which is why it reuses neither
 * `AST_NODE` (PascalCase) nor `RULE_KEY` (snake_case).
 *
 * As with both of those, this is a shape backstop and not the guarantee. The
 * worker has already tested the value for membership in the 176 keywords
 * abaplint enumerates from its own statement classes and dropped anything
 * else — that test is what stops the user's source travelling, and this
 * pattern would not: `ZSECRET` satisfies it. The longest real keyword is 14
 * characters (`ENDENHANCEMENT`); the bound is loose so a longer one abaplint
 * adds later goes quiet in reports rather than failing to be reported at all.
 */
const STATEMENT_KEYWORD: ParamSpec = {
  kind: "id",
  pattern: /^[A-Z][A-Z0-9-]{0,29}$/,
};

const COUNT: ParamSpec = { kind: "count" };

/**
 * One ParamSpec per declared parameter of the event — `-?` strips optionality so
 * an optional field like `output_lines` still needs a spec. This is what keeps
 * `EventMap` and `EVENT_PARAMS` from drifting: adding a parameter to `EventMap`
 * without a spec is a compile error rather than a parameter that is silently
 * dropped at runtime.
 */
type SpecsFor<K extends EventName> = {
  [P in keyof EventMap[K] & string]-?: ParamSpec;
};

/**
 * The runtime allowlist: for each event, exactly which parameters may be sent
 * and what each one must look like. `sanitizeParams` reads only these keys.
 */
const EVENT_PARAMS: { readonly [K in EventName]: Readonly<SpecsFor<K>> } = {
  run_click: { line_count: COUNT },
  run_result: {
    outcome: { kind: "enum", values: RUN_OUTCOMES },
    duration_ms: COUNT,
    output_lines: COUNT,
    transpile_reason: { kind: "enum", values: TRANSPILE_REASONS },
    transpile_node: AST_NODE,
    syntax_key: RULE_KEY,
    syntax_error_count: COUNT,
    syntax_statement: STATEMENT_KEYWORD,
  },
  validate_click: { line_count: COUNT },
  validate_result: {
    outcome: { kind: "enum", values: VALIDATE_OUTCOMES },
    duration_ms: COUNT,
    lint_issues: COUNT,
    pitfalls: COUNT,
    line_count: COUNT,
  },
  sample_select: { sample_id: SAMPLE_ID },
  share_click: { url_length: COUNT, line_count: COUNT },
  mode_switch: { to_mode: { kind: "enum", values: MODES } },
  url_code_open: { line_count: COUNT, mode: { kind: "enum", values: MODES } },
};

/**
 * GA4 parameter names that override page/user context. None of our events
 * declare one, but a reserved name must never become sendable even if someone
 * adds it to EVENT_PARAMS — `page_location` in particular would re-introduce
 * the `#code=<user source>` hash that index.html deliberately strips.
 */
const RESERVED_NAMES: readonly string[] = [
  "page_location",
  "page_referrer",
  "page_title",
  "page_path",
  "screen_location",
  "user_id",
  "client_id",
  "session_id",
];

/** GA4 rejects these prefixes outright. */
const RESERVED_PREFIXES: readonly string[] = ["ga_", "google_", "firebase_"];

/** GA4 truncates parameter names at 40 characters. */
const MAX_PARAM_NAME_LENGTH = 40;

/**
 * Guards the allowlist itself. Note this checks the keys DECLARED in
 * `EVENT_PARAMS`, not the caller's keys — a caller's undeclared key is already
 * unreachable because `sanitizeParams` never iterates the caller's object. So
 * this is dead code against today's `EVENT_PARAMS` by design: it exists to make
 * a future careless entry there fail closed. Exported so that property is
 * actually tested rather than merely asserted.
 */
export function isSendableKey(key: string): boolean {
  if (key.length > MAX_PARAM_NAME_LENGTH) return false;
  if (RESERVED_NAMES.includes(key)) return false;
  return !RESERVED_PREFIXES.some((prefix) => key.startsWith(prefix));
}

function coerce(spec: ParamSpec, value: unknown): string | number | undefined {
  if (spec.kind === "count") {
    // Counts and durations: a non-negative safe integer or nothing.
    if (typeof value !== "number") return undefined;
    if (!Number.isSafeInteger(value) || value < 0) return undefined;
    return value;
  }
  if (typeof value !== "string") return undefined;
  if (spec.kind === "enum") {
    return spec.values.includes(value) ? value : undefined;
  }
  return spec.pattern.test(value) ? value : undefined;
}

/**
 * Which parameters are meaningful on which `run_result` outcome, and nowhere
 * else. Typed against `RunOutcome` and the `run_result` parameter names on
 * purpose: this table is the only thing that knows a parameter is
 * outcome-scoped, so a rename that missed it would leave the strip a silent
 * no-op and let the parameter ride on every outcome — exactly the widening
 * `refine` exists to prevent. Bound to those types, that rename stops the
 * build instead.
 */
const OUTCOME_ONLY_PARAMS: ReadonlyArray<
  readonly [RunOutcome, ReadonlyArray<keyof EventMap["run_result"]>]
> = [
  ["transpile_error", ["transpile_reason", "transpile_node"]],
  ["syntax_error", ["syntax_key", "syntax_error_count", "syntax_statement"]],
];

/**
 * The one rule a per-key allowlist cannot express: a parameter can be valid in
 * shape and still be meaningless — `transpile_reason` describes a transpile
 * failure, `syntax_key` a syntax one, and neither says anything on any other
 * outcome. Enforced here rather than left to the caller because that is this
 * module's whole stance: the runtime is the boundary, not the types. A future
 * caller that attaches diagnostics to a `success` gets them dropped instead of
 * quietly widening what a successful run reports.
 *
 * Note this is a strip, not a rejection — the rest of the event still goes.
 * Losing a misplaced parameter is always better than losing the outcome it was
 * attached to, because `run_click`/`run_result` are meant to reconcile 1:1 and
 * a dropped `run_result` reads as an orphaned execution.
 */
function refine(name: EventName, clean: Record<string, string | number>): void {
  if (name !== "run_result") return;
  for (const [outcome, params] of OUTCOME_ONLY_PARAMS) {
    if (clean.outcome === outcome) continue;
    for (const param of params) delete clean[param];
  }
  // `syntax_statement` is narrower than its outcome: it describes the one
  // `parser_error` message that names an unparsed statement, and says nothing
  // about a `check_syntax` or `unknown_types` failure. The worker's classifier
  // already scopes it, and that is exactly why it is repeated here — this
  // module's stance is that the runtime is the boundary, not the caller, and a
  // rule enforced only in the producer is a rule one refactor away from being
  // enforced nowhere.
  if (clean.syntax_key !== "parser_error") delete clean.syntax_statement;
}

/**
 * Build the parameter object for `name` by pulling only its declared keys out
 * of `params`. Undeclared keys are never read; declared keys whose value does
 * not match the declared shape are dropped rather than coerced or truncated.
 */
export function sanitizeParams(
  name: EventName,
  params: Record<string, unknown>,
): Record<string, string | number> {
  const clean: Record<string, string | number> = {};
  const allowed = EVENT_PARAMS[name];
  if (!allowed || params === null || typeof params !== "object") return clean;
  for (const [key, spec] of Object.entries(allowed)) {
    if (!isSendableKey(key)) continue;
    const value = coerce(spec, params[key]);
    if (value !== undefined) clean[key] = value;
  }
  refine(name, clean);
  return clean;
}

/** Line count of a source buffer — a metric, never the content itself. */
export function lineCount(source: string): number {
  if (source === "") return 0;
  let lines = 1;
  for (let i = 0; i < source.length; i++) {
    if (source.charCodeAt(i) === 10) lines++;
  }
  return lines;
}

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
  }
}

/**
 * Send one event. Never throws: analytics must not be able to break the app.
 *
 * `gtag` is absent whenever index.html decides not to load it (any host other
 * than the production domain, so local dev and preview builds stay out of the
 * production property), in tests, and whenever a blocker removes it.
 */
export function track<K extends EventName>(name: K, params: EventMap[K]): void {
  try {
    const gtag = (globalThis as { gtag?: (...args: unknown[]) => void }).gtag;
    if (typeof gtag !== "function") return;
    gtag("event", name, sanitizeParams(name, params as Record<string, unknown>));
  } catch {
    // Ignore — a failed measurement is never worth a broken playground.
  }
}
