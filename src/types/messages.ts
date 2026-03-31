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
  | { type: "transpile-error"; message: string; line?: number }
  | { type: "validate-progress"; stage: ValidationStage; status: "running" | "skipped" }
  | { type: "validate-stage-result"; stage: ValidationStage; result: StageResult };

// Sandbox messages — requestId for disambiguating playground vs validation executions
export type SandboxRequest = { type: "execute"; js: string; requestId: string };

export type SandboxResponse =
  | { type: "output"; text: string; requestId: string }
  | { type: "error"; message: string; requestId: string }
  | { type: "done"; requestId: string };
