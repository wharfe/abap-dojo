import { describe, it, expect } from "vitest";
import { Registry, MemoryFile, Config } from "@abaplint/core";
import { config as transpilerConfig } from "@abaplint/transpiler";
import { pitfallToLintIssue } from "./pitfallToLintIssue";
import { detectPitfalls } from "./detector";
import type { PitfallMatch } from "../types/validation";

const pitfall: PitfallMatch = {
  ruleId: "llm-string-char-confusion",
  message: "TYPE string where a fixed-length CHAR is expected.",
  explanation: "LLMs default to string because Python has no CHAR(n).",
  suggestion: "Use TYPE c LENGTH 40 instead.",
  severity: "warning",
  startLine: 3,
  startCol: 5,
  endLine: 3,
  endCol: 20,
};

describe("pitfallToLintIssue", () => {
  it("keeps the rule id as the key, which both renderers show as [key]", () => {
    expect(pitfallToLintIssue(pitfall).key).toBe("llm-string-char-confusion");
  });

  it("carries the suggestion, not just the complaint", () => {
    expect(pitfallToLintIssue(pitfall).message).toContain("Use TYPE c LENGTH 40");
  });

  it("preserves the range so the editor can underline it", () => {
    const issue = pitfallToLintIssue(pitfall);
    expect([issue.startLine, issue.startCol, issue.endLine, issue.endCol]).toEqual([
      3, 5, 3, 20,
    ]);
    expect(issue.severity).toBe("warning");
  });
});

/**
 * The point of the change: a pitfall must reach the Playground's lint list
 * without anyone switching modes. This exercises the real detector against ABAP
 * that a linter alone would pass, so a matcher that stops firing fails here.
 */
describe("pitfalls surfaced through plain linting", () => {
  it("reports an LLM pitfall for ABAP that abaplint itself accepts", async () => {
    const source = [
      "REPORT ztest.",
      "DATA lv_matnr TYPE string.",
      "WRITE lv_matnr.",
    ].join("\n");

    const reg = new Registry(new Config(JSON.stringify(transpilerConfig)));
    reg.addFile(new MemoryFile("ztest.prog.abap", source));
    await reg.parseAsync();

    const lintIssues = reg.findIssues().map((i) => ({
      message: i.getMessage(),
      key: i.getKey(),
      startLine: i.getStart().getRow(),
      startCol: i.getStart().getCol(),
      endLine: i.getEnd().getRow(),
      endCol: i.getEnd().getCol(),
      severity: "info" as const,
    }));

    const pitfalls = detectPitfalls(reg, lintIssues).map(pitfallToLintIssue);
    expect(pitfalls.length).toBeGreaterThan(0);
    expect(pitfalls.every((p) => p.key.startsWith("llm-"))).toBe(true);
  });
});
