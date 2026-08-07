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

  it("does not mistake a CL_-named variable for the missing class", () => {
    const issues = [
      makeIssue({
        message: 'Variable "CL_HOLDER" contains unknown: ZCL_MISSING not found, lookup',
      }),
    ];
    expect(matchHallucinatedClass(issues)[0].message).toContain("ZCL_MISSING");
  });
});

/**
 * The tests above feed hand-written messages, which is exactly how this rule
 * stayed green while never firing in production (#32): abaplint quotes the
 * variable, not the type it could not resolve. These drive the real linter, so
 * a wording change breaks the test instead of silently killing the rule.
 */
describe("matchHallucinatedClass against real abaplint output", () => {
  const cases = [
    { abap: "DATA lo_util TYPE cl_abap_string_utilities.", expect: "CL_ABAP_STRING_UTILITIES" },
    { abap: "DATA lo_ref TYPE REF TO cl_abap_json_helper.", expect: "CL_ABAP_JSON_HELPER" },
    { abap: "DATA lv_x TYPE zif_missing_intf.", expect: "ZIF_MISSING_INTF" },
  ];

  it.each(cases)("names the class in: $abap", async ({ abap, expect: expected }) => {
    const issues = await lintIssuesFor(`REPORT ztest.\n${abap}\nWRITE 'x'.`);
    const matches = matchHallucinatedClass(issues);

    expect(matches.length).toBeGreaterThan(0);
    expect(matches.map((m) => m.message.toUpperCase()).join(" ")).toContain(expected);
  });

  it("stays quiet on ABAP that resolves everything", async () => {
    const issues = await lintIssuesFor("REPORT ztest.\nDATA lv_x TYPE i.\nWRITE lv_x.");
    expect(matchHallucinatedClass(issues)).toEqual([]);
  });
});

async function lintIssuesFor(source: string): Promise<LintIssue[]> {
  const { Registry, MemoryFile, Config } = await import("@abaplint/core");
  const { config } = await import("@abaplint/transpiler");
  const reg = new Registry(new Config(JSON.stringify(config)));
  reg.addFile(new MemoryFile("ztest.prog.abap", source));
  await reg.parseAsync();
  return reg.findIssues().map((i) => ({
    message: i.getMessage(),
    key: i.getKey(),
    startLine: i.getStart().getRow(),
    startCol: i.getStart().getCol(),
    endLine: i.getEnd().getRow(),
    endCol: i.getEnd().getCol(),
    severity: i.getSeverity().toString() === "Error" ? "error" : "info",
  }));
}
