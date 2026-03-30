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
  | { type: "transpile"; source: string };

export type WorkerResponse =
  | { type: "lint-result"; issues: LintIssue[] }
  | { type: "transpile-result"; js: string }
  | { type: "transpile-error"; message: string; line?: number };

// Sandbox messages
export type SandboxRequest = { type: "execute"; js: string };

export type SandboxResponse =
  | { type: "output"; text: string }
  | { type: "error"; message: string }
  | { type: "done" };
