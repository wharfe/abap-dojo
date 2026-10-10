import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Buffer } from "buffer";
(globalThis as unknown as { Buffer: typeof Buffer }).Buffer = Buffer;

import type { WorkerResponse } from "../types/messages";

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
