import { vi } from "vitest";
// Same `?raw` route executor.test.ts uses; neither the bundle nor executor.js
// is a module, so both are read as text and evaluated with `new Function`.
import bundleSource from "../sandbox/runtime-bundle.js?raw";
import executorSource from "../sandbox/executor.js?raw";

/**
 * Execute transpiled JS the way the sandbox does - the committed runtime
 * bundle and the REAL `OutputStreamer` from executor.js - and return the lines
 * the Output panel would show. Shared by runtime-bundle.test.ts and
 * topLevelInline.test.ts so neither carries its own copy of the pipeline.
 * `js` must already have been through prepareTranspiledJs.
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

export async function executeJs(js: string): Promise<string[]> {
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
