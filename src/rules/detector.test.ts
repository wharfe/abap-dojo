import { describe, it, expect } from "vitest";
import { Registry, MemoryFile, Config } from "@abaplint/core";
import { config as transpilerConfig } from "@abaplint/transpiler";
import type { LintIssue } from "../types/messages";
import { detectPitfalls } from "./detector";

async function parseSource(source: string): Promise<Registry> {
  const reg = new Registry(new Config(JSON.stringify(transpilerConfig)));
  reg.addFile(new MemoryFile("ztest.prog.abap", source));
  await reg.parseAsync();
  return reg;
}

describe("detectPitfalls", () => {
  it("detects string-char confusion", async () => {
    const reg = await parseSource(`REPORT ztest.\nDATA lv_name TYPE string.`);
    const matches = detectPitfalls(reg, []);
    const stringMatches = matches.filter((m) => m.ruleId === "llm-string-char-confusion");
    expect(stringMatches.length).toBe(1);
  });

  it("detects hallucinated classes from lint issues", async () => {
    const reg = await parseSource(`REPORT ztest.`);
    const lintIssues: LintIssue[] = [
      {
        message: 'Unknown type "CL_ABAP_FAKE_CLASS"',
        key: "unknown_types",
        startLine: 2,
        startCol: 1,
        endLine: 2,
        endCol: 30,
        severity: "error",
      },
    ];
    const matches = detectPitfalls(reg, lintIssues);
    const hallucinatedMatches = matches.filter(
      (m) => m.ruleId === "llm-hallucinated-class",
    );
    expect(hallucinatedMatches.length).toBe(1);
  });

  it("returns empty array for clean code", async () => {
    const reg = await parseSource(`REPORT ztest.\nDATA lv_count TYPE i.\nWRITE lv_count.`);
    const matches = detectPitfalls(reg, []);
    expect(matches.length).toBe(0);
  });
});
