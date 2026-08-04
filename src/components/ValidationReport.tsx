// src/components/ValidationReport.tsx
import { useState } from "react";
import type { LintIssue } from "../types/messages";
import type {
  StageStatus,
  StageResult,
  PitfallMatch,
  ValidationStage,
} from "../types/validation";
import { computeSummary } from "../utils/validationSummary";

interface ValidationReportProps {
  stages: Record<ValidationStage, StageResult>;
  isValidating: boolean;
}

const STATUS_ICON: Record<StageStatus, string> = {
  pending: "\u2022",
  running: "\u25F7",
  pass: "\u2713",
  warn: "\u26A0",
  fail: "\u2717",
  skipped: "\u2014",
};

const STATUS_COLOR: Record<StageStatus, string> = {
  pending: "text-gray-500",
  running: "text-blue-400 animate-pulse",
  pass: "text-green-400",
  warn: "text-yellow-400",
  fail: "text-red-400",
  skipped: "text-gray-500",
};

function statusLabel(result: StageResult): string {
  if (result.status === "pass") return "OK";
  if (result.status === "fail") return result.error ?? "Failed";
  if (result.status === "warn") {
    const count = (result.issues?.length ?? 0) + (result.pitfalls?.length ?? 0);
    return `${count} issue${count !== 1 ? "s" : ""}`;
  }
  if (result.status === "running") return "Running...";
  if (result.status === "skipped") return "Skipped";
  return "";
}

function StageRow({
  label,
  icon,
  result,
  expandable,
  children,
}: {
  label: string;
  icon: string;
  result: StageResult;
  expandable: boolean;
  children?: React.ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);
  const canExpand =
    expandable && result.status !== "pending" && result.status !== "skipped";

  return (
    <div className="border-b border-gray-800 last:border-b-0">
      <button
        className={`w-full flex items-center gap-3 px-4 py-2.5 text-left ${
          canExpand
            ? "hover:bg-gray-800/50 cursor-pointer"
            : "cursor-default"
        }`}
        onClick={() => canExpand && setExpanded(!expanded)}
        disabled={!canExpand}
      >
        <span className={`text-base ${STATUS_COLOR[result.status]}`}>
          {STATUS_ICON[result.status]}
        </span>
        <span className="text-sm text-gray-200">
          {icon ? `${icon} ` : ""}
          {label}
        </span>
        <span className="flex-1" />
        <span className={`text-xs ${STATUS_COLOR[result.status]}`}>
          {statusLabel(result)}
        </span>
        {canExpand && (
          <span className="text-gray-500 text-xs">
            {expanded ? "\u25BC" : "\u25B6"}
          </span>
        )}
      </button>
      {expanded && children && (
        <div className="px-4 pb-3 pt-1">{children}</div>
      )}
    </div>
  );
}

function LintIssueList({ issues }: { issues: LintIssue[] }) {
  if (issues.length === 0)
    return <p className="text-gray-500 text-xs">No issues.</p>;
  return (
    <ul className="space-y-0.5 font-mono text-xs">
      {issues.map((issue, i) => {
        const color =
          issue.severity === "error"
            ? "text-red-400"
            : issue.severity === "warning"
              ? "text-yellow-400"
              : "text-blue-400";
        const icon =
          issue.severity === "error"
            ? "\u2717"
            : issue.severity === "warning"
              ? "\u26A0"
              : "\u24D8";
        return (
          <li key={i} className={color}>
            {icon} L{issue.startLine}:{issue.startCol} [{issue.key}]{" "}
            {issue.message}
          </li>
        );
      })}
    </ul>
  );
}

function PitfallList({ pitfalls }: { pitfalls: PitfallMatch[] }) {
  if (pitfalls.length === 0)
    return (
      <p className="text-gray-500 text-xs">No pitfalls detected.</p>
    );
  return (
    <div className="space-y-2">
      {pitfalls.map((p, i) => (
        <div
          key={i}
          className="bg-purple-950/40 border-l-2 border-purple-500 rounded-r-md px-3 py-2"
        >
          <div className="font-mono text-xs text-yellow-400">
            {p.severity === "error" ? "\u2717" : "\u26A0"} L{p.startLine}:
            {p.startCol} {p.message}
            <span className="text-purple-400 ml-2 text-[10px]">
              [{p.ruleId}]
            </span>
          </div>
          <div className="text-purple-300 text-xs mt-1.5 leading-relaxed pl-1 border-l border-purple-800 ml-0.5">
            {p.explanation}
          </div>
          <div className="text-green-400 text-xs mt-1.5 flex items-start gap-1">
            <span>{"\uD83D\uDCA1"}</span>
            <code className="bg-green-900/40 px-1.5 py-0.5 rounded text-green-300">
              {p.suggestion}
            </code>
          </div>
        </div>
      ))}
    </div>
  );
}

const SUMMARY_COLOR = {
  pass: "text-green-400",
  warn: "text-yellow-400",
  fail: "text-red-400",
};

const SUMMARY_LABEL = {
  pass: "PASS",
  warn: "WARN",
  fail: "FAIL",
};

export function ValidationReport({
  stages,
  isValidating,
}: ValidationReportProps) {
  const lintResult = stages.lint;
  const pitfalls = lintResult.pitfalls ?? [];
  const lintIssues = lintResult.issues ?? [];

  // Create a virtual result for the pitfalls UI row based on lint stage data
  const pitfallResult: StageResult = {
    status:
      lintResult.status === "pending"
        ? "pending"
        : lintResult.status === "running"
          ? "running"
          : pitfalls.some((p) => p.severity === "error")
            ? "fail"
            : pitfalls.length > 0
              ? "warn"
              : "pass",
    pitfalls,
  };

  // Create a lint-only result (without pitfalls) for the lint UI row
  const lintOnlyResult: StageResult = {
    status:
      lintResult.status === "pending"
        ? "pending"
        : lintResult.status === "running"
          ? "running"
          : lintIssues.some((i) => i.severity === "error")
            ? "fail"
            : lintIssues.some((i) => i.severity === "warning")
              ? "warn"
              : "pass",
    issues: lintIssues,
  };

  const allDone =
    !isValidating &&
    Object.values(stages).every(
      (s) => s.status !== "pending" && s.status !== "running",
    );

  const summary = allDone ? computeSummary(stages) : null;

  return (
    <div className="flex flex-col h-full bg-gray-900">
      <div className="flex-1 overflow-auto">
        {/* No validation run yet */}
        {!isValidating &&
          Object.values(stages).every((s) => s.status === "pending") && (
            <div className="flex items-center justify-center h-full text-gray-500 text-sm">
              Click Validate to check your ABAP code.
            </div>
          )}

        {/* Stage rows */}
        {(!Object.values(stages).every((s) => s.status === "pending") ||
          isValidating) && (
          <div>
            <StageRow
              label="Syntax"
              icon=""
              result={stages.syntax}
              expandable={false}
            />
            <StageRow
              label="Lint"
              icon=""
              result={lintOnlyResult}
              expandable={lintIssues.length > 0}
            >
              <LintIssueList issues={lintIssues} />
            </StageRow>
            <StageRow
              label="LLM Pitfalls"
              icon={"\uD83E\uDD16"}
              result={pitfallResult}
              expandable={pitfalls.length > 0}
            >
              <PitfallList pitfalls={pitfalls} />
            </StageRow>
            <StageRow
              label="Transpile"
              icon=""
              result={stages.transpile}
              expandable={stages.transpile.status === "fail"}
            >
              {stages.transpile.error && (
                <p className="text-red-400 text-xs font-mono">
                  {stages.transpile.error}
                </p>
              )}
            </StageRow>
            <StageRow
              label="Runtime"
              icon=""
              result={stages.runtime}
              expandable={stages.runtime.status === "fail"}
            >
              {stages.runtime.error && (
                <p className="text-red-400 text-xs font-mono">
                  {stages.runtime.error}
                </p>
              )}
            </StageRow>
          </div>
        )}
      </div>

      {/* Summary bar */}
      {summary && (
        <div className="px-4 py-2.5 border-t border-gray-700 flex justify-between items-center bg-gray-800/50">
          <span className="text-gray-500 text-xs uppercase tracking-wider">
            Summary
          </span>
          <span className={`font-bold ${SUMMARY_COLOR[summary.overall]}`}>
            {SUMMARY_LABEL[summary.overall]}
            {summary.totalIssues > 0 &&
              ` \u2014 ${summary.totalIssues} issue${summary.totalIssues !== 1 ? "s" : ""} found`}
          </span>
        </div>
      )}
    </div>
  );
}
