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
export type WorkerRequest =
  | { type: "lint"; source: string }
  | { type: "transpile"; source: string }
  | { type: "validate"; source: string };

export type WorkerResponse =
  | { type: "lint-result"; issues: LintIssue[] }
  | { type: "transpile-result"; js: string }
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
      line?: number;
      diagnostics?: TranspileDiagnostics;
    }
  | { type: "validate-progress"; stage: ValidationStage; status: "running" | "skipped" }
  | { type: "validate-stage-result"; stage: ValidationStage; result: StageResult };

// Sandbox messages — requestId for disambiguating playground vs validation executions
export type SandboxRequest = { type: "execute"; js: string; requestId: string };

export type SandboxResponse =
  | { type: "output"; text: string; requestId: string }
  | { type: "error"; message: string; requestId: string }
  /**
   * `outputLines` is the number of lines the run actually produced, which is
   * not the number of "output" messages that preceded this one: the sandbox
   * stops posting after MAX_LINES and sends a single truncation notice instead.
   */
  | { type: "done"; requestId: string; outputLines: number };
