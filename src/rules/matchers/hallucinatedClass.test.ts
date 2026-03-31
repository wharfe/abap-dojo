// src/rules/matchers/hallucinatedClass.test.ts
import { describe, it, expect } from "vitest";
import type { LintIssue } from "../../types/messages";
import { matchHallucinatedClass } from "./hallucinatedClass";

function makeIssue(overrides: Partial<LintIssue>): LintIssue {
  return {
    message: "Unknown type",
    key: "unknown_types",
    startLine: 5,
    startCol: 1,
    endLine: 5,
    endCol: 20,
    severity: "error",
    ...overrides,
  };
}

describe("matchHallucinatedClass", () => {
  it("relabels unknown_types issues with CL_ prefix", () => {
    const issues = [makeIssue({ message: 'Unknown type "CL_ABAP_STRINGUTILS"' })];
    const matches = matchHallucinatedClass(issues);
    expect(matches.length).toBe(1);
    expect(matches[0].ruleId).toBe("llm-hallucinated-class");
    expect(matches[0].severity).toBe("error");
  });

  it("relabels unknown_types issues with IF_ prefix", () => {
    const issues = [makeIssue({ message: 'Unknown type "IF_ABAP_HELPER"' })];
    const matches = matchHallucinatedClass(issues);
    expect(matches.length).toBe(1);
  });

  it("relabels issues with ZCL_ and ZIF_ prefixes", () => {
    const issues = [
      makeIssue({ message: 'Unknown type "ZCL_CUSTOM_UTIL"' }),
      makeIssue({ message: 'Unknown type "ZIF_CUSTOM_INTF"' }),
    ];
    const matches = matchHallucinatedClass(issues);
    expect(matches.length).toBe(2);
  });

  it("ignores unknown_types without class/interface prefix", () => {
    const issues = [makeIssue({ message: 'Unknown type "TY_CUSTOM_STRUCT"' })];
    const matches = matchHallucinatedClass(issues);
    expect(matches.length).toBe(0);
  });

  it("ignores non-unknown_types issues", () => {
    const issues = [makeIssue({ key: "begin_end_names", message: "CL_SOMETHING" })];
    const matches = matchHallucinatedClass(issues);
    expect(matches.length).toBe(0);
  });
});
