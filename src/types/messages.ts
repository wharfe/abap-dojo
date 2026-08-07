// src/types/messages.ts
import type { ValidationStage, StageResult } from "./validation";

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
   */
  | {
      type: "transpile-error";
      kind: "syntax" | "transpile";
      message: string;
      line?: number;
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
