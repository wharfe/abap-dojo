import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Buffer } from "buffer";
(globalThis as unknown as { Buffer: typeof Buffer }).Buffer = Buffer;

import type { WorkerResponse } from "../types/messages";
import structureSources from "./fixtures/structureShapes.sources.json";
import structureExpected from "./fixtures/structureShapes.expected.json";

// The verdict path calls this, and making it throw is the only way to build
// the case Gate2 H3 found: an exception between "the parse succeeded" and
// "the verdict was posted". `vi.mock` is hoisted, so the flag it reads has to
// be hoisted too.
const { failClassify } = vi.hoisted(() => ({ failClassify: { on: false } }));
vi.mock("./syntaxDiagnostics", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./syntaxDiagnostics")>();
  return {
    ...actual,
    classifySyntaxError: (...args: Parameters<typeof actual.classifySyntaxError>) => {
      if (failClassify.on) throw new Error("classifier blew up");
      return actual.classifySyntaxError(...args);
    },
  };
});

// Every repair search the worker starts, with what it had already posted at
// that moment. Recorded here and asserted only after the request finishes:
// the worker swallows whatever a search throws (abaplintWorker.ts `catch`
// around each search), so an assertion thrown from inside one would vanish
// and the test would pass.
type PostedSoFar = { type: string; requestId?: string }[];
const { posted, searchEntries, recordEntry } = vi.hoisted(() => {
  const posted: WorkerResponse[] = [];
  const searchEntries: { search: string; postedBefore: PostedSoFar }[] = [];
  const recordEntry = (search: string) => {
    searchEntries.push({
      search,
      postedBefore: posted.map((m) => ({
        type: m.type,
        requestId: (m as { requestId?: string }).requestId,
      })),
    });
  };
  return { posted, searchEntries, recordEntry };
});
vi.mock("./syntaxRepair", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./syntaxRepair")>();
  return {
    ...actual,
    findSyntaxRepair: (...args: Parameters<typeof actual.findSyntaxRepair>) => {
      recordEntry("findSyntaxRepair");
      return actual.findSyntaxRepair(...args);
    },
    findSilentLoss: (...args: Parameters<typeof actual.findSilentLoss>) => {
      recordEntry("findSilentLoss");
      return actual.findSilentLoss(...args);
    },
  };
});
vi.mock("./statementEndRepair", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./statementEndRepair")>();
  return {
    ...actual,
    findStatementEndRepair: (...args: Parameters<typeof actual.findStatementEndRepair>) => {
      recordEntry("findStatementEndRepair");
      return actual.findStatementEndRepair(...args);
    },
  };
});
vi.mock("./valueAssignRepair", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./valueAssignRepair")>();
  return {
    ...actual,
    findValueAssignRepair: (...args: Parameters<typeof actual.findValueAssignRepair>) => {
      recordEntry("findValueAssignRepair");
      return actual.findValueAssignRepair(...args);
    },
  };
});

await import("./abaplintWorker");

let postSpy: ReturnType<typeof vi.spyOn>;

/** Drive one request through the worker's own onmessage and wait for it. */
async function request(source: string, requestId = "r1"): Promise<WorkerResponse[]> {
  posted.length = 0;
  await (self.onmessage as (e: MessageEvent) => Promise<void>)({
    data: { type: "transpile", source, requestId },
  } as MessageEvent);
  return posted;
}

describe("abaplintWorker — one transpile request, exactly two replies", () => {
  beforeEach(() => {
    failClassify.on = false;
    postSpy = vi
      .spyOn(self, "postMessage")
      .mockImplementation(((m: WorkerResponse) => {
        posted.push(m);
      }) as unknown as typeof self.postMessage);
  });

  afterEach(() => {
    postSpy.mockRestore();
  });

  it("answers a syntax error with the verdict first, then the hint", async () => {
    const messages = await request(`WRITE 'a';`);
    expect(messages).toHaveLength(2);
    expect(messages[0]).toMatchObject({ type: "transpile-error", kind: "syntax" });
    expect(messages[1]).toMatchObject({ type: "syntax-hint", requestId: "r1" });
  });

  it("answers a clean program with the JS first, then the silent-loss result", async () => {
    const messages = await request(`WRITE 'a'.`);
    expect(messages).toHaveLength(2);
    expect(messages[0]).toMatchObject({ type: "transpile-result" });
    expect(messages[1]).toMatchObject({ type: "silent-loss", completed: true });
  });

  // The H3 case. Before the try/finally, this posted nothing at all and the
  // App sat until its 20s watchdog turned a real syntax error into `stalled`.
  it("still sends a verdict and a follow-up when the verdict path throws", async () => {
    failClassify.on = true;
    const messages = await request(`WRITE 'a';`);
    expect(messages).toHaveLength(2);
    expect(messages[0]).toMatchObject({
      type: "transpile-error",
      kind: "transpile",
      requestId: "r1",
    });
    expect(messages[1]).toMatchObject({ type: "silent-loss", completed: false });
  });

  it("echoes the requestId on both replies", async () => {
    const messages = await request(`WRITE 'a'.`, "abc-123");
    expect(messages.map((m) => (m as { requestId?: string }).requestId)).toEqual([
      "abc-123",
      "abc-123",
    ]);
  });
});

// abaplint pins `Expected ENDIF` to (1,1) wherever the IF is (#72). The user
// is shown the explanation; when the worker can tell which block is open the
// explanation names it and carries its line, otherwise it carries no line.
// Analytics see the raw issue either way.
describe("abaplintWorker — a structure error that abaplint pins to line 1", () => {
  const MISSING_ENDIF = "REPORT z.\nIF 1 = 1.\n  WRITE 'a'.\n";
  // SELECT … INTO TABLE never opens a block, so the stray ENDSELECT matches
  // nothing and the walk finds no open block: the generic text, no line.
  const STRAY_ENDSELECT =
    "CLASS lcl DEFINITION.\n  PUBLIC SECTION.\n    METHODS run.\nENDCLASS.\n" +
    "CLASS lcl IMPLEMENTATION.\n  METHOD run.\n    DATA lt TYPE STANDARD TABLE OF i.\n" +
    "    SELECT * FROM ztab INTO TABLE lt.\n    ENDSELECT.\n  ENDMETHOD.\nENDCLASS.\n";

  beforeEach(() => {
    failClassify.on = false;
    postSpy = vi
      .spyOn(self, "postMessage")
      .mockImplementation(((m: WorkerResponse) => {
        posted.push(m);
      }) as unknown as typeof self.postMessage);
  });

  afterEach(() => {
    postSpy.mockRestore();
  });

  it("names the open IF and its line on Run", async () => {
    const [verdict] = await request(MISSING_ENDIF);
    expect(verdict).toMatchObject({ type: "transpile-error", kind: "syntax" });
    const v = verdict as Extract<WorkerResponse, { type: "transpile-error" }>;
    expect(v.message.startsWith("Expected ENDIF. ")).toBe(true);
    expect(v.message).toContain("abaplint found no ENDIF for the IF on line 2");
    expect(v.line).toBe(2);
    expect(v.syntaxDiagnostics?.key).toBe("structure");
  });

  it("falls back to the generic text and no line when no block can be named", async () => {
    const [verdict] = await request(STRAY_ENDSELECT);
    const v = verdict as Extract<WorkerResponse, { type: "transpile-error" }>;
    expect(v.message.startsWith("Expected ENDMETHOD. ")).toBe(true);
    expect(v.message).toContain("no line is given");
    expect(v).not.toHaveProperty("line");
    expect(v.syntaxDiagnostics?.key).toBe("structure");
  });

  it("marks the open IF's keyword on lint, one character wide", async () => {
    posted.length = 0;
    await (self.onmessage as (e: MessageEvent) => Promise<void>)({
      data: { type: "lint", source: MISSING_ENDIF },
    } as MessageEvent);
    const result = posted.find((m) => m.type === "lint-result") as Extract<
      WorkerResponse,
      { type: "lint-result" }
    >;
    const issue = result.issues.find((i) => i.key === "structure")!;
    expect(issue.message).toContain("the IF on line 2");
    expect(issue.positionUnknown).toBeUndefined();
    expect([issue.startLine, issue.startCol, issue.endLine, issue.endCol]).toEqual([2, 1, 2, 2]);
  });

  it("marks lint as having no position when no block can be named", async () => {
    posted.length = 0;
    await (self.onmessage as (e: MessageEvent) => Promise<void>)({
      data: { type: "lint", source: STRAY_ENDSELECT },
    } as MessageEvent);
    const result = posted.find((m) => m.type === "lint-result") as Extract<
      WorkerResponse,
      { type: "lint-result" }
    >;
    const issue = result.issues.find((i) => i.key === "structure")!;
    expect(issue.positionUnknown).toBe(true);
    expect([issue.startLine, issue.startCol, issue.endLine, issue.endCol]).toEqual([1, 1, 1, 2]);
  });

  // The Validator's syntax row keeps the raw message (it is a narrow status
  // label, Gate2 M-c); its Lint list is where the explanation goes.
  it("explains it in the Validator's lint stage and keeps the syntax label raw", async () => {
    posted.length = 0;
    await (self.onmessage as (e: MessageEvent) => Promise<void>)({
      data: { type: "validate", source: MISSING_ENDIF },
    } as MessageEvent);
    const stage = (name: string) =>
      (
        posted.find(
          (m) => m.type === "validate-stage-result" && m.stage === name,
        ) as Extract<WorkerResponse, { type: "validate-stage-result" }>
      ).result;
    expect(stage("syntax").error).toBe("Expected ENDIF");
    const issue = stage("lint").issues!.find((i) => i.key === "structure")!;
    expect(issue.message).toContain("the IF on line 2");
    expect(issue.positionUnknown).toBeUndefined();
    expect([issue.startLine, issue.endLine, issue.endCol]).toEqual([2, 2, 2]);
  });

  // A missing period on ENDIF puts `structure` first and the parser error that
  // caused it second. The walk names the IF (the ENDIF is an Unknown statement
  // it cannot see), and the one error that can point at line 4 is named too.
  it("names the next error that does have a line", async () => {
    const [verdict] = await request("REPORT z.\nIF 1 = 1.\n WRITE 'a'.\nENDIF");
    const v = verdict as Extract<WorkerResponse, { type: "transpile-error" }>;
    expect(v.message.startsWith("Expected ENDIF. ")).toBe(true);
    expect(v.message).toContain("the IF on line 2");
    expect(v.message).toMatch(/The next error abaplint reports is on line 4: Statement does not exist/);
    expect(v.line).toBe(2);
    expect(v.syntaxDiagnostics?.key).toBe("structure");
  });

  // `Unexpected <X>` is reported at its own line: the text is explained, the
  // line is left exactly where abaplint put it.
  it("explains an Unexpected structure error and keeps its real line", async () => {
    const [verdict] = await request("REPORT z.\nWRITE 'a'.\nENDIF.\n");
    const v = verdict as Extract<WorkerResponse, { type: "transpile-error" }>;
    expect(v.message).toMatch(
      /^Unexpected ENDIF\. ENDIF closes a block opened by IF, but abaplint saw no IF block open/,
    );
    expect(v.message).not.toContain("The next error");
    expect(v.line).toBe(3);
    expect(v.syntaxDiagnostics?.key).toBe("structure");
  });

  // Its commonest cause is an opener that did not parse, reported after it.
  it("names the parser error behind an Unexpected ELSE", async () => {
    const [verdict] = await request(
      "DATA x TYPE i.\nIF x == 1.\n  WRITE 'a'.\nELSE.\n  WRITE 'b'.\nENDIF.\n",
    );
    const v = verdict as Extract<WorkerResponse, { type: "transpile-error" }>;
    expect(v.message.startsWith("Unexpected ELSE. ELSE is only allowed inside IF")).toBe(true);
    expect(v.message).toMatch(/The next error abaplint reports is on line 2: Statement does not exist/);
    expect(v.line).toBe(4);
    expect(v.syntaxDiagnostics?.key).toBe("structure");
  });

  it("explains it in the lint result without moving the marker", async () => {
    posted.length = 0;
    await (self.onmessage as (e: MessageEvent) => Promise<void>)({
      data: { type: "lint", source: "METHOD run.\n  WRITE 'a'.\nENDMETHOD.\n" },
    } as MessageEvent);
    const result = posted.find((m) => m.type === "lint-result") as Extract<
      WorkerResponse,
      { type: "lint-result" }
    >;
    const issue = result.issues.find((i) => i.key === "structure")!;
    expect(issue.message).toContain("METHOD is only allowed inside CLASS … IMPLEMENTATION");
    expect(issue.positionUnknown).toBeUndefined();
    expect([issue.startLine, issue.startCol]).toEqual([1, 1]);
  });
});

// What analytics receive must not move when the explanation does (#72). For
// every structure shape recorded on main before the open-block walk existed,
// the verdict's `syntaxDiagnostics` must equal the fixture, and the lint
// result must list the raw issues in the raw order (the structure issue may
// move to the opener's line, which is why positions are not compared here).
describe("abaplintWorker — structure shapes: what analytics see is unchanged", () => {
  beforeEach(() => {
    failClassify.on = false;
    postSpy = vi
      .spyOn(self, "postMessage")
      .mockImplementation(((m: WorkerResponse) => {
        posted.push(m);
      }) as unknown as typeof self.postMessage);
  });

  afterEach(() => {
    postSpy.mockRestore();
  });

  for (const [name, source] of Object.entries(structureSources as Record<string, string>)) {
    const expected = (structureExpected as Record<string, { keys: string[]; syntaxDiagnostics: unknown }>)[
      name
    ];
    it(name, async () => {
      const [verdict] = await request(source);
      expect(verdict).toMatchObject({ type: "transpile-error", kind: "syntax" });
      const v = verdict as Extract<WorkerResponse, { type: "transpile-error" }>;
      expect(v.syntaxDiagnostics).toEqual(expected.syntaxDiagnostics);

      posted.length = 0;
      await (self.onmessage as (e: MessageEvent) => Promise<void>)({
        data: { type: "lint", source },
      } as MessageEvent);
      const result = posted.find((m) => m.type === "lint-result") as Extract<
        WorkerResponse,
        { type: "lint-result" }
      >;
      const rawKeys = expected.keys.map((k) => k.replace(/@.*$/, ""));
      expect(result.issues.slice(0, rawKeys.length).map((i) => i.key)).toEqual(rawKeys);
    });
  }
});

// The order of the two replies above does not prove the verdict went out
// first: a worker that ran the searches BEFORE posting the verdict, then
// posted verdict and hint back to back, sends the same two messages in the
// same order (PR #83 Gate2 M4). What #75 promises is about time — the user
// sees the error while the search is still running — so look at what had
// been posted at the moment each search started.
describe("abaplintWorker — every search starts after this request's verdict is out (#75)", () => {
  beforeEach(() => {
    failClassify.on = false;
    searchEntries.length = 0;
    postSpy = vi
      .spyOn(self, "postMessage")
      .mockImplementation(((m: WorkerResponse) => {
        posted.push(m);
      }) as unknown as typeof self.postMessage);
  });

  afterEach(() => {
    postSpy.mockRestore();
  });

  // A `=` initialiser is the one shape that walks all three repair searches:
  // the first two find nothing, the declaration search finds it (#85).
  it("starts every repair search only once the syntax verdict is posted", async () => {
    await request(`DATA lv TYPE i = 1.`, "r1");
    expect(searchEntries.map((e) => e.search)).toEqual([
      "findSyntaxRepair",
      "findStatementEndRepair",
      "findValueAssignRepair",
    ]);
    for (const entry of searchEntries) {
      expect(entry.postedBefore).toEqual([{ type: "transpile-error", requestId: "r1" }]);
    }
  });

  it("starts the silent-loss search only once the transpiled JS is posted", async () => {
    await request(`WRITE 'a'.`, "r2");
    expect(searchEntries.map((e) => e.search)).toEqual(["findSilentLoss"]);
    expect(searchEntries[0].postedBefore).toEqual([
      { type: "transpile-result", requestId: "r2" },
    ]);
  });
});
