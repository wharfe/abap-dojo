import { describe, it, expect } from "vitest";
import { repairHint } from "./repairHint";
import { sanitizeParams } from "./analytics";

describe("repairHint for a statement end", () => {
  it("names the row a semicolon is on", () => {
    const hint = repairHint({ kind: "semicolon", line: 2 });
    expect(hint).toContain("not a semicolon");
    expect(hint).toContain("line 2");
  });

  it("drops the row for a semicolon when several were rewritten", () => {
    const hint = repairHint({ kind: "semicolon" });
    expect(hint).toContain("not a semicolon");
    expect(hint).not.toContain("line");
  });

  it("names the row a statement ends on when its period is missing", () => {
    const hint = repairHint({ kind: "missing_period", line: 3 });
    expect(hint).toContain("every ABAP statement ends with a period");
    expect(hint).toContain("line 3");
  });

  it("drops the row for a missing period when several were rewritten", () => {
    const hint = repairHint({ kind: "missing_period" });
    expect(hint).toContain("every ABAP statement ends with a period");
    expect(hint).not.toContain("line");
  });

  it("states the fix rather than offering it as a condition", () => {
    // Unlike the double quote, the search behind these kinds only accepts a
    // rewrite that clears every error it targeted (see statementEndRepair.ts),
    // and nobody writes a semicolon or omits a period on purpose.
    expect(repairHint({ kind: "semicolon", line: 1 })).not.toContain("If you");
    expect(repairHint({ kind: "missing_period", line: 1 })).not.toContain("If you");
  });
});

describe("syntax_repair carries the new kinds", () => {
  it.each(["semicolon", "missing_period"])("keeps %s on a syntax_error", (kind) => {
    expect(
      sanitizeParams("run_result", {
        outcome: "syntax_error",
        duration_ms: 1,
        output_lines: 0,
        syntax_repair: kind,
      }),
    ).toMatchObject({ syntax_repair: kind });
  });
});
