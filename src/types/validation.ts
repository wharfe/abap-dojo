import type { LintIssue } from "./messages";

export type ValidationStage = "syntax" | "lint" | "transpile" | "runtime";

export type StageStatus = "pending" | "running" | "pass" | "warn" | "fail" | "skipped";

export interface StageResult {
  status: StageStatus;
  issues?: LintIssue[];
  pitfalls?: PitfallMatch[];
  js?: string;
  error?: string;
}

export interface ValidationSummary {
  overall: "pass" | "warn" | "fail";
  totalIssues: number;
  stages: Record<ValidationStage, StageStatus>;
}

export interface PitfallRule {
  id: string;
  severity: "error" | "warning" | "info";
  message: string;
  explanation: string;
  suggestion: string;
}

export interface PitfallMatch {
  ruleId: string;
  message: string;
  explanation: string;
  suggestion: string;
  severity: "error" | "warning" | "info";
  startLine: number;
  startCol: number;
  endLine: number;
  endCol: number;
}

export type AppMode = "playground" | "validator";
