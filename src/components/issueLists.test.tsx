import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { OutputPanel } from "./OutputPanel";
import { ValidationReport } from "./ValidationReport";
import type { LintIssue } from "../types/messages";
import type { StageResult, ValidationStage } from "../types/validation";

// Both issue lists print `L<line>:<col> ` before an issue, and that prefix is
// what told people a missing ENDIF was on line 1 (#72). These render the real
// components, so reverting either list to the old prefix turns them red.
const pinned: LintIssue = {
  message: "Expected ENDIF. abaplint could not match the block structure",
  key: "structure",
  startLine: 1,
  startCol: 1,
  endLine: 1,
  endCol: 2,
  severity: "error",
  positionUnknown: true,
};

const located: LintIssue = {
  message: "Unexpected ENDIF",
  key: "structure",
  startLine: 3,
  startCol: 1,
  endLine: 3,
  endCol: 6,
  severity: "error",
};

function renderOutputPanel(lintIssues: LintIssue[]) {
  render(
    <OutputPanel
      output={[]}
      error={null}
      statusMessage={null}
      silentLossHint={null}
      searchState="idle"
      lintIssues={lintIssues}
      isRunning={false}
      activeTab="lint"
      onTabChange={() => {}}
    />,
  );
}

function renderValidationReport(issues: LintIssue[]) {
  const stages: Record<ValidationStage, StageResult> = {
    syntax: { status: "fail", error: "Expected ENDIF" },
    lint: { status: "fail", issues, pitfalls: [] },
    transpile: { status: "skipped" },
    runtime: { status: "skipped" },
  };
  render(<ValidationReport stages={stages} isValidating={false} />);
  fireEvent.click(screen.getByRole("button", { name: /Lint/ }));
}

describe("the Playground issue list", () => {
  it("prints no position for an issue whose position is unknown", () => {
    renderOutputPanel([pinned]);
    const row = screen.getByText(/\[structure\] Expected ENDIF/);
    expect(row.textContent).not.toMatch(/L1:1/);
    expect(row.textContent).toMatch(/^\S+ \[structure\]/);
  });

  it("still prints the position of an ordinary issue", () => {
    renderOutputPanel([located]);
    expect(screen.getByText(/\[structure\] Unexpected ENDIF/).textContent).toMatch(
      /L3:1 \[structure\] Unexpected ENDIF/,
    );
  });
});

describe("the Validator issue list", () => {
  it("prints no position for an issue whose position is unknown", () => {
    renderValidationReport([pinned]);
    const row = screen.getByText(/\[structure\]/);
    expect(row.textContent).not.toMatch(/L1:1/);
    expect(row.textContent).toMatch(/^\S+ \[structure\] Expected ENDIF/);
  });

  it("still prints the position of an ordinary issue", () => {
    renderValidationReport([located]);
    expect(screen.getByText(/\[structure\]/).textContent).toMatch(
      /L3:1 \[structure\] Unexpected ENDIF/,
    );
  });
});
