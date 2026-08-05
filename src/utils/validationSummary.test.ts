import { describe, it, expect } from "vitest";
import { computeSummary } from "./validationSummary";
import type { StageResult, ValidationStage } from "../types/validation";

function stages(
  overrides: Partial<Record<ValidationStage, StageResult>>,
): Record<ValidationStage, StageResult> {
  return {
    syntax: { status: "pending" },
    lint: { status: "pending" },
    transpile: { status: "pending" },
    runtime: { status: "pending" },
    ...overrides,
  };
}

const issue = {
  message: "x",
  severity: "error" as const,
  startLine: 1,
  startCol: 1,
  endLine: 1,
  endCol: 2,
  key: "k",
};

const pitfall = {
  ruleId: "llm-string-char-confusion",
  message: "x",
  explanation: "x",
  suggestion: "x",
  severity: "warning" as const,
  startLine: 1,
  startCol: 1,
  endLine: 1,
  endCol: 2,
};

describe("computeSummary", () => {
  it("passes when nothing failed or warned", () => {
    const s = computeSummary(stages({ syntax: { status: "pass" } }));
    expect(s.overall).toBe("pass");
    expect(s.totalIssues).toBe(0);
  });

  it("fails when any stage failed", () => {
    expect(
      computeSummary(stages({ transpile: { status: "fail" } })).overall,
    ).toBe("fail");
  });

  it("warns when a stage warned and none failed", () => {
    expect(computeSummary(stages({ lint: { status: "warn" } })).overall).toBe(
      "warn",
    );
  });

  it("prefers fail over warn", () => {
    const s = computeSummary(
      stages({ lint: { status: "warn" }, runtime: { status: "fail" } }),
    );
    expect(s.overall).toBe("fail");
  });

  it("counts lint issues and pitfalls separately, and errors in the total", () => {
    const s = computeSummary(
      stages({
        lint: { status: "warn", issues: [issue, issue] },
        syntax: { status: "warn", pitfalls: [pitfall] },
        runtime: { status: "fail", error: "boom" },
      }),
    );
    expect(s.lintIssues).toBe(2);
    expect(s.pitfalls).toBe(1);
    expect(s.totalIssues).toBe(4);
  });
});
