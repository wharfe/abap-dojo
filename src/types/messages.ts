// src/types/messages.ts
import type { ValidationStage, StageResult } from "./validation";
import type { TranspileDiagnostics } from "./diagnostics";

export interface LintIssue {
  message: string;
  key: string;
  startLine: number;
  startCol: number;
  endLine: number;
  endCol: number;
  severity: "error" | "warning" | "info";
}

// Worker messages
//
// `transpile`/`transpile-result`/`transpile-error` carry a `requestId` so App
// can tell a stale response (from a run the user already abandoned via Stop)
// apart from the current one — see the guard in App.tsx's `attachWorkerHandlers`.
// `lint`/`lint-result` deliberately do NOT: lint is debounced and idempotent
// (the latest result is always the right one to show, regardless of which
// keystroke triggered it), so correlating it is issue #42's job, not this
// fix's. Widening `requestId` to every worker message is tracked there.
export type WorkerRequest =
  | { type: "lint"; source: string }
  | { type: "transpile"; source: string; requestId: string }
  | { type: "validate"; source: string };

export type WorkerResponse =
  | { type: "lint-result"; issues: LintIssue[] }
  | { type: "transpile-result"; js: string; requestId: string }
  /**
   * `kind` distinguishes the two very different things that stop a run before
   * any JavaScript exists: `syntax` is the user's own ABAP failing to parse
   * (the single most common Playground outcome), `transpile` is our transpiler
   * throwing. Lumping them together made it impossible to tell how often we
   * are the broken one.
   *
   * `diagnostics` accompanies `kind: "transpile"` only, and is the measurable
   * counterpart of `message`: the message itself embeds the user's source and
   * stays in the browser, while `diagnostics` is a closed vocabulary safe to
   * send. See src/workers/transpileDiagnostics.ts.
   *
   * Keep prose in this repo clear of bare Tailwind utility names. `src/index.css`
   * is a bare `@import "tailwindcss"` with no `source(none)`, so v4 scans every
   * file here for class candidates and a comment counts: one such word used as
   * plain English here once cost 1.64 kB of production CSS — the utility plus
   * the 14 `@property` declarations it drags in, none of them used by any
   * component. Check `npm run build`'s CSS size when rewording. See #44.
   */
  | {
      type: "transpile-error";
      kind: "syntax" | "transpile";
      message: string;
      requestId: string;
      line?: number;
      diagnostics?: TranspileDiagnostics;
    }
  | { type: "validate-progress"; stage: ValidationStage; status: "running" | "skipped" }
  | { type: "validate-stage-result"; stage: ValidationStage; result: StageResult };

// Sandbox messages — requestId for disambiguating playground vs validation executions
export type SandboxRequest =
  | { type: "execute"; js: string; requestId: string }
  /**
   * Ask the supervisor to terminate the active run early. `reason` travels
   * back unchanged on the "stopped" reply so the caller can tell a watchdog
   * timeout apart from a user-initiated stop without a second round trip.
   */
  | { type: "stop"; requestId: string; reason: "timeout" | "user" };

export type SandboxResponse =
  /** A flush of WRITE output. Batched, never one message per line: 5000 single
   *  postMessages starved the iframe's own timers down to a single tick. */
  | { type: "output"; lines: string[]; requestId: string }
  /**
   * `outputLines` is what the run produced before it errored. It is present
   * whenever the executor itself reported the error (the ordinary case) and
   * absent only when the supervisor had to synthesize the message itself
   * (e.g. the worker could not even be constructed).
   */
  | {
      type: "error";
      message: string;
      requestId: string;
      fatal?: boolean;
      outputLines?: number;
    }
  /**
   * `outputLines` is the number of lines the run actually produced, which is
   * not the number of lines we sent: display stops at MAX_LINES and a runaway
   * loop would otherwise report exactly MAX_LINES + 1 every time.
   */
  | { type: "done"; requestId: string; outputLines: number }
  /**
   * The worker was terminated from outside — the watchdog fired, or the user
   * pressed Stop. `outputLines` is what the supervisor saw go past before it
   * pulled the plug; the worker itself cannot report anything at this point.
   */
  | { type: "stopped"; requestId: string; outputLines: number; reason: "timeout" | "user" };
