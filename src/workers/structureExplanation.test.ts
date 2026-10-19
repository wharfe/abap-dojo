import { describe, it, expect } from "vitest";
import { Buffer } from "buffer";
(globalThis as unknown as { Buffer: typeof Buffer }).Buffer = Buffer;

import { Registry, MemoryFile, Config, Issue, ABAPObject } from "@abaplint/core";
import { config as transpilerConfig } from "@abaplint/transpiler";
import { explainStructure, explainStructureIssue } from "./structureExplanation";
import { findOpenBlock } from "./openBlock";

const abaplintConfig = new Config(JSON.stringify(transpilerConfig));

async function errorsOf(source: string): Promise<Issue[]> {
  const reg = new Registry(abaplintConfig);
  reg.addFile(new MemoryFile("ztest.prog.abap", source));
  await reg.parseAsync();
  return reg
    .findIssues()
    .filter((i) => i.getSeverity().toString() === "Error");
}

function explain(issue: Issue): string | null {
  return explainStructureIssue(
    issue.getKey(),
    issue.getMessage(),
    issue.getStart().getRow(),
    issue.getStart().getCol(),
  );
}

async function findingOf(source: string) {
  const reg = new Registry(abaplintConfig);
  reg.addFile(new MemoryFile("ztest.prog.abap", source));
  await reg.parseAsync();
  return findOpenBlock((reg.getFirstObject() as ABAPObject).getABAPFiles()[0].getStatements());
}

describe("explainStructureIssue against the real parser, without a finding", () => {
  // Each of these is reported by abaplint at (1,1) whatever line the mistake
  // is on, which is the whole reason the explanation exists. With no finding
  // from the walk the text is the generic one and names no line.
  const pinnedToLineOne: Array<[string, string, string]> = [
    ["a missing ENDIF", "REPORT z.\nIF 1 = 1.\n  WRITE 'a'.\n", "Expected ENDIF"],
    [
      // The closer abaplint names is the OUTER block's (Gate2 C1), which is
      // why the explanation never names the block that is open.
      "a missing ENDIF inside a METHOD",
      "CLASS lcl DEFINITION.\n PUBLIC SECTION.\n METHODS m.\nENDCLASS.\n" +
        "CLASS lcl IMPLEMENTATION.\n METHOD m.\n  IF 1 = 1.\n   WRITE 'a'.\n ENDMETHOD.\nENDCLASS.\n",
      "Expected ENDMETHOD",
    ],
    ["a FORM inside an IF", "REPORT z.\nIF 1 = 1.\nFORM f.\nENDFORM.\nENDIF.\n", "Expected ENDIF"],
    [
      // Gate2 L-a: the comment swallows ENDDO, so nothing is unclosed in the
      // source the user wrote — the statement ran on past its line.
      "a double quote that comments out ENDDO",
      "REPORT z.\nDO 2 TIMES.\n  WRITE \"hi\".\nENDDO.\n",
      "Expected ENDDO",
    ],
  ];

  for (const [name, source, head] of pinnedToLineOne) {
    it(`explains ${name}`, async () => {
      const first = (await errorsOf(source))[0];
      expect(first.getKey()).toBe("structure");
      expect([first.getStart().getRow(), first.getStart().getCol()]).toEqual([1, 1]);
      const text = explain(first);
      expect(text).not.toBeNull();
      expect(text!.startsWith(`${head}. `)).toBe(true);
      expect(text).toContain("no line is given");
    });
  }

  // Gate2 H1: the structure issue comes first even when the real mistake is a
  // missing period, which is why the text tells the user to fix the rest first.
  it("comes first ahead of the parser error that caused it", async () => {
    const errors = await errorsOf("REPORT z.\nIF 1 = 1.\n WRITE 'a'.\nENDIF");
    expect(errors.map((e) => e.getKey())).toEqual(["structure", "parser_error"]);
    expect(explain(errors[0])).toContain("fix those first");
  });

  // These are real line numbers and must be left exactly as abaplint said.
  const leftAlone: Array<[string, string]> = [
    ["a stray ENDIF", "REPORT z.\nWRITE 'a'.\nENDIF.\n"],
    ["a WHEN outside CASE", "REPORT z.\nWHEN 1.\n  WRITE 'a'.\n"],
    ["a stray ENDIF on line one", "ENDIF.\n"],
    ["a parser error", "REPORT z.\nWRITE 'a'\n"],
  ];

  for (const [name, source] of leftAlone) {
    it(`leaves ${name} alone`, async () => {
      const errors = await errorsOf(source);
      expect(errors.length).toBeGreaterThan(0);
      for (const e of errors) expect(explain(e)).toBeNull();
    });
  }
});

describe("explainStructure with the walk's finding", () => {
  it("names the open block and carries its position", async () => {
    const source = "REPORT z.\nIF 1 = 1.\n  WRITE 'a'.\n";
    const first = (await errorsOf(source))[0];
    const finding = await findingOf(source);
    expect(finding).not.toBeNull();
    const out = explainStructure("structure", first.getMessage(), 1, 1, finding);
    expect(out).toEqual({
      text: expect.stringContaining("Expected ENDIF. abaplint found no ENDIF for the IF on line 2"),
      at: { row: 2, col: 1 },
    });
    expect(out!.text).not.toContain("no line is given");
  });

  it("keeps the generic text and no position when the walk found nothing", async () => {
    const out = explainStructure("structure", "Expected ENDIF", 1, 1, null);
    expect(out).toEqual({ text: expect.stringContaining("no line is given") });
  });

  it("does not name a block under Unexpected code structure", async () => {
    const finding = await findingOf("REPORT z.\nIF 1 = 1.\n  WRITE 'a'.\n");
    const out = explainStructure("structure", "Unexpected code structure", 1, 1, finding);
    expect(out).toEqual({ text: expect.stringContaining("no line is given") });
  });

  it("still does nothing for a real position, finding or not", async () => {
    const finding = await findingOf("REPORT z.\nIF 1 = 1.\n  WRITE 'a'.\n");
    expect(explainStructure("structure", "Expected ENDIF", 3, 1, finding)).toBeNull();
  });
});

describe("explainStructureIssue on shapes the parser did not produce in probes", () => {
  // `_combi.js:136` can emit this, but ~80 probe shapes never reached it
  // (Gate2 L2), so it is pinned on a synthetic input.
  it("explains Unexpected code structure at (1,1)", () => {
    const text = explainStructureIssue("structure", "Unexpected code structure", 1, 1);
    expect(text).not.toBeNull();
    expect(text!.startsWith("Unexpected code structure. ")).toBe(true);
  });

  it("leaves an empty description alone", () => {
    expect(explainStructureIssue("structure", "", 1, 1)).toBeNull();
  });

  it("stops explaining if abaplint ever reports a real position", () => {
    expect(explainStructureIssue("structure", "Expected ENDIF", 3, 1)).toBeNull();
    expect(explainStructureIssue("structure", "Expected ENDIF", 1, 5)).toBeNull();
  });

  it("only touches the structure key", () => {
    expect(explainStructureIssue("check_syntax", "Expected ENDIF", 1, 1)).toBeNull();
  });

  it("does not take a statement name with anything but letters", () => {
    expect(explainStructureIssue("structure", "Expected ENDIF x", 1, 1)).toBeNull();
    expect(explainStructureIssue("structure", "Expected endif", 1, 1)).toBeNull();
  });
});
