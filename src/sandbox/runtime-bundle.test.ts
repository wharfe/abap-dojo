import { describe, it, expect, vi } from "vitest";
import { Buffer } from "buffer";
// @abaplint/core initialises built-in symbols via Buffer.from(..., "hex"), the
// same reason src/workers/abaplintWorker.ts polyfills it before importing.
(globalThis as unknown as { Buffer: typeof Buffer }).Buffer = Buffer;

import { Registry, MemoryFile, Config } from "@abaplint/core";
import { Transpiler, config as transpilerConfig } from "@abaplint/transpiler";
import { prepareTranspiledJs } from "../utils/prepareTranspiledJs";
// Same `?raw` route executor.test.ts uses; neither the bundle nor executor.js
// is a module, so both are read as text and evaluated with `new Function`.
import bundleSource from "./runtime-bundle.js?raw";
import executorSource from "./executor.js?raw";
// Read as text rather than imported as JSON so this file needs no
// `resolveJsonModule` and no Node types (see src/securityHeaders.test.ts).
import runtimePackageJson from "@abaplint/runtime/package.json?raw";

/**
 * runtime-bundle.js is a committed build artifact, so npm can bump
 * @abaplint/transpiler without the runtime it emits calls into moving with it.
 * That asymmetry is not theoretical: the transpiler learned to emit
 * `abap.statements.skip()` while the bundle in the repo predated the statement,
 * which would have turned a clean transpile_error into a runtime crash.
 *
 * These tests transpile and then execute, so a bundle that has fallen behind
 * the transpiler fails here rather than in the sandbox.
 * Run `node scripts/build-runtime-bundle.mjs` to refresh it.
 *
 * They execute against the REAL `OutputStreamer` from executor.js, not a mock.
 * A mock is worse than no test here: the first version of this file gave its
 * fake console a `get()` method, and the runtime's own `SKIP TO LINE n` calls
 * exactly that — so the mock passed while the sandbox threw
 * `TypeError: this.context.console.get is not a function`. The console contract
 * between the runtime and executor.js is the thing under test; only the real
 * object can hold it.
 */

interface AbapRuntime {
  ABAP: new (options: { console: unknown }) => unknown;
}

interface OutputMessage {
  type: "output";
  lines: string[];
}
type PostedMessage = OutputMessage | { type: string };

interface OutputStreamer {
  finish(): void;
  total: number;
}

function loadRuntime(): AbapRuntime {
  return new Function(
    `${bundleSource}\nreturn abaplintRuntime;`,
  )() as AbapRuntime;
}

/** The production `OutputStreamer`, plus everything it posts out of the worker. */
function makeStreamer(): {
  streamer: OutputStreamer;
  messages: PostedMessage[];
} {
  const messages: PostedMessage[] = [];
  const factory = new Function(
    "self",
    `${executorSource}\nreturn OutputStreamer;`,
  );
  const Ctor = factory({
    postMessage: (m: PostedMessage) => messages.push(m),
  }) as new () => OutputStreamer;
  return { streamer: new Ctor(), messages };
}

async function transpile(source: string): Promise<string> {
  const reg = new Registry(new Config(JSON.stringify(transpilerConfig)));
  reg.addFile(new MemoryFile("ztest.prog.abap", source));
  await reg.parseAsync();
  const errors = reg
    .findIssues()
    .filter((i) => i.getSeverity().toString() === "Error");
  expect(errors.map((e) => e.getMessage())).toEqual([]);

  const output = await new Transpiler({ ignoreSourceMap: true }).run(reg);
  return [
    ...output.objects.map((o) => o.chunk.getCode()),
    output.initializationScript,
    output.initializationScript2,
  ].join("\n");
}

/** Transpile, execute, and return the lines the worker would have displayed. */
async function run(source: string): Promise<string[]> {
  const js = prepareTranspiledJs(await transpile(source));
  const runtime = loadRuntime();

  // The clock is frozen for the whole streamer lifetime, and that is not
  // tidiness — without it these assertions are wall-clock sensitive.
  // `OutputStreamer` stamps `lastFlush` in its constructor and `add()` promotes
  // an unterminated line to a real one once FLUSH_INTERVAL_MS (50ms) has passed
  // since that stamp. A promotion invents a line break the program never wrote,
  // which shifts the line number `SKIP TO LINE n` reads out of `console.get()`.
  // Measured: constructing the streamer before the transpile and the 613 kB
  // bundle eval already crossed 50ms on a slow run, and injecting a 200ms delay
  // here turns both SKIP TO LINE cases red — as a SKIP regression, which is
  // exactly the wrong diagnosis. Freezing time removes the ambiguity instead of
  // narrowing the window: a real sandbox run of a four-statement program takes
  // microseconds, so "no promotion" is also what production does.
  //
  // Note for whoever adds a case here: this mocks setTimeout as well as Date.
  // The runtime's WAIT (statements/wait.js) loops on both — it re-reads
  // Date.now() and awaits setTimeout — so a `WAIT UP TO n SECONDS` case hangs
  // here instead of failing. The symptom is a run that never ends, with no
  // assertion error and no stack, killed by whatever timeout is outermost.
  // Advance the fake timers, or run that case outside this helper.
  vi.useFakeTimers({ now: Date.now(), shouldAdvanceTime: false });
  try {
    const { streamer, messages } = makeStreamer();
    const abap = new runtime.ABAP({ console: streamer });
    const AsyncFunction = Object.getPrototypeOf(
      async function () {},
    ).constructor;
    await new AsyncFunction("abap", js)(abap);
    streamer.finish();
    return messages
      .filter((m): m is OutputMessage => m.type === "output")
      .flatMap((m) => m.lines);
  } finally {
    vi.useRealTimers();
  }
}

describe("runtime-bundle.js keeps up with the transpiler", () => {
  it("was built from the @abaplint/runtime that is installed now", () => {
    const installed = (JSON.parse(runtimePackageJson) as { version: string })
      .version;
    // Not just "looks like a version": a runtime-only bump that forgets
    // `npm run build:runtime` is the exact drift this file exists to catch,
    // and the behavioural cases below can only see it once some statement
    // happens to need a runtime method the stale bundle lacks.
    expect(bundleSource.split("\n", 1)[0]).toBe(
      `// Generated by scripts/build-runtime-bundle.mjs from @abaplint/runtime@${installed}. Do not edit.`,
    );
  });

  it("runs WRITE, the shape every other statement builds on", async () => {
    expect(await run("WRITE 'a'.\nWRITE / 'b'.")).toEqual(["a", "b"]);
  });

  it("runs SKIP, which the transpiler emits as abap.statements.skip()", async () => {
    expect(await run("WRITE 'a'.\nSKIP.\nWRITE 'b'.")).toEqual(["a", "b"]);
  });

  it("runs SKIP n", async () => {
    expect(await run("WRITE 'a'.\nSKIP 2.\nWRITE 'b'.")).toEqual(["a", "", "b"]);
  });

  it("runs SKIP TO LINE n, which asks the console how far it has got", async () => {
    // The only place the runtime calls `console.get()`. Ground truth measured
    // against the runtime's own MemoryConsole: "a" leaves the cursor on line 1,
    // so skipping to line 5 emits four newlines.
    expect(await run("WRITE 'a'.\nSKIP TO LINE 5.\nWRITE 'b'.")).toEqual([
      "a",
      "",
      "",
      "",
      "b",
    ]);
  });

  it("runs SKIP TO LINE n when the cursor is already past n", async () => {
    expect(await run("WRITE 'a'.\nSKIP TO LINE 1.\nWRITE 'b'.")).toEqual(["ab"]);
  });
});
