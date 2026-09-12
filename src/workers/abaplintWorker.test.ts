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

await import("./abaplintWorker");

const posted: WorkerResponse[] = [];
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
