import { useState, useEffect, useRef, useCallback } from "react";
import { EditorPanel } from "./components/EditorPanel";
import { OutputPanel } from "./components/OutputPanel";
import { ValidationReport } from "./components/ValidationReport";
import { HeroBanner } from "./components/HeroBanner";
import { SharedCodeBanner } from "./components/SharedCodeBanner";
import { AppFooter } from "./components/AppFooter";
import { ModeHeader } from "./components/ModeHeader";
import { Toolbar } from "./components/Toolbar";
import {
  ExecutionSandbox,
  type ExecutionSandboxHandle,
  EXECUTION_TIMEOUT_SECONDS,
} from "./components/ExecutionSandbox";
import { debounce } from "./utils/debounce";
import { encodeSource, decodeSource } from "./utils/urlShare";
import { track, lineCount, type EventMap, type RunOutcome } from "./utils/analytics";
import { scheduleIdle } from "./utils/scheduleIdle";
import { computeSummary } from "./utils/validationSummary";
import type { LintIssue, WorkerResponse } from "./types/messages";
import type {
  TranspileDiagnostics,
  SyntaxDiagnostics,
  SyntaxRepair,
  SilentLoss,
} from "./types/diagnostics";
import { repairHint, silentLossHint } from "./utils/repairHint";
import type { Sample } from "./samples";
import type { AppMode, StageResult, ValidationStage } from "./types/validation";
import AbaplintWorker from "./workers/abaplintWorker?worker";

const DEFAULT_CODE = `REPORT ztest.
WRITE 'Hello, ABAP Dojo!'.`;

/**
 * How long to wait for the abaplint worker before declaring the run stalled.
 *
 * Nothing else can end a run while the worker is thinking: a postMessage that
 * is never answered — the worker died on boot, or Transpiler.run hung — used to
 * leave the Run button disabled for the rest of the session. Generous on
 * purpose, since parsing and transpiling a large report on a slow phone is
 * legitimately slow; this is a deadlock breaker, not a performance budget.
 */
const WORKER_TIMEOUT_MS = 20000;

/**
 * The outcomes that do not wait for the worker's follow-up message.
 *
 * All three end a run nobody is waiting on an explanation for. `stalled` IS
 * the finding that the worker is not answering, so waiting on it would add
 * 20s to nothing. `stopped` is the user's own choice and puts its message in
 * `statusMessage`, not `error` — there is no error on screen for a hint to be
 * appended to. `cancelled` means the other mode took the sandbox away.
 *
 * For every other outcome the user is looking at a verdict, so the follow-up
 * has somewhere to go and the run is measured once, with it. Waiting on these
 * three instead would put every Stop press into the window where closing the
 * tab loses the `run_result` — and `run_click`/`run_result` reconciling 1:1
 * is how an orphaned run is detected at all (Gate2 1 周目 M2).
 */
const ABANDONED_OUTCOMES: ReadonlySet<RunOutcome> = new Set<RunOutcome>([
  "stalled",
  "stopped",
  "cancelled",
]);

function parseHash(): { mode: AppMode; code: string | null } {
  const hash = window.location.hash;
  if (!hash || hash === "#") return { mode: "playground", code: null };

  const params = new URLSearchParams(hash.slice(1));
  const mode = params.get("mode") === "validator" ? "validator" : "playground";
  const codeParam = params.get("code");
  const code = codeParam ? decodeSource(codeParam) : null;
  return { mode, code };
}

function getInitialState(): {
  mode: AppMode;
  code: string;
  /** True only when the URL carried a code parameter that actually decoded. */
  decodedFromUrl: boolean;
} {
  const { mode, code } = parseHash();
  return {
    mode,
    code: code ?? DEFAULT_CODE,
    decodedFromUrl: code !== null,
  };
}

// Module-level worker reference and debounced lint function.
let appWorker: Worker | null = null;

const debouncedLint = debounce((code: string) => {
  appWorker?.postMessage({ type: "lint", source: code });
}, 400);

type OutputTab = "output" | "lint";

const INITIAL_STAGES: Record<ValidationStage, StageResult> = {
  syntax: { status: "pending" },
  lint: { status: "pending" },
  transpile: { status: "pending" },
  runtime: { status: "pending" },
};

function App() {
  // Lazy initializer: getInitialState() inflates the hash, so it must run once
  // on mount rather than on every render.
  const [initial] = useState(getInitialState);
  const [mode, setMode] = useState<AppMode>(initial.mode);
  const [source, setSource] = useState(initial.code);
  const [lintIssues, setLintIssues] = useState<LintIssue[]>([]);
  const [output, setOutput] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  // Separate from `error`: the user pressing Stop is their own choice, not a
  // failure, and OutputPanel must not paint it red the way it paints `error`.
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [activeTab, setActiveTab] = useState<OutputTab>("output");

  // Validation state
  const [isValidating, setIsValidating] = useState(false);
  const [validationStages, setValidationStages] =
    useState<Record<ValidationStage, StageResult>>(INITIAL_STAGES);

  // Track which requestId belongs to each execution context
  const validationRequestIdRef = useRef<string | null>(null);
  const playgroundRequestIdRef = useRef<string>("");

  // Analytics: measure how long a run/validation took and how much it produced.
  // Counts only — never the code or the output text itself.
  const runStartRef = useRef(0);
  const runOutputCountRef = useRef(0);
  /**
   * The statement a comment ate, for the run in flight (#68).
   *
   * A ref rather than state because `endRun` reads it while reporting, and a
   * ref because the value arrives from the worker on the transpile round trip
   * but is only measured when the run ends — which may be several sandbox
   * messages later. `null` means the search ran and found nothing; `undefined`
   * means it never ran, and the two must stay apart (see analytics.ts).
   */
  const silentLossRef = useRef<SilentLoss | null | undefined>(undefined);
  /**
   * The run whose follow-up message (`syntax-hint` / `silent-loss`) has not
   * arrived yet, or "" when none is outstanding.
   *
   * Deliberately NOT `playgroundRequestIdRef`. That one is cleared by
   * `endRun` so a late `transpile-result` cannot hand stale JS to the sandbox
   * (#50) — and on a syntax error `endRun` runs BEFORE the follow-up arrives,
   * so reusing it would discard every hint. The follow-up messages start no
   * execution, so they are safe to correlate on their own ref.
   */
  const followUpRef = useRef<string>("");
  /** The repair the follow-up reported, for the run in flight. */
  const syntaxRepairRef = useRef<SyntaxRepair | undefined>(undefined);
  /**
   * A `run_result` built but not yet sent, because its follow-up is still
   * outstanding. The user has already been shown the verdict; this is only
   * about measuring the run once, with `syntax_repair` and `silent_loss` on
   * it (spec Q10 — a second event would need a GA4 registration that is not
   * retroactive).
   */
  const pendingResultRef = useRef<EventMap["run_result"] | null>(null);
  /**
   * The 20s backstop for the result above.
   *
   * It and `followUpRef` do NOT have the same lifetime, and that is the
   * point: `followUpRef` says "a follow-up may still arrive and still
   * belongs to the run on screen", while this one says "a result is waiting
   * to be sent". `endRun` can clear the first and arm the second (a run that
   * ended before its follow-up), and `flushPendingResult` clears the second
   * without touching the first (a follow-up that arrived on time). Tying
   * them together would mean either dropping a hint that is still relevant,
   * or sending the same `run_result` twice. Gate2 1 周目 L2.
   */
  const followUpTimerRef = useRef<number | undefined>(undefined);
  /**
   * The source this run was started with.
   *
   * Not `sourceRef`, which tracks the editor: by the time the worker answers,
   * the user may have typed. The hint describes the program that RAN, so that
   * is the version it has to be compared against.
   */
  const runSourceRef = useRef("");
  /**
   * The same finding as the hint the user reads, together with the source it
   * describes.
   *
   * The source is stored WITH it rather than the hint being cleared wherever
   * the editor changes, because clearing at each site is a list that has
   * already been wrong twice: it missed ordinary typing, and it cannot cover
   * the case where a run's reply arrives after the user has edited — the run
   * is still the current one, so its finding is delivered legitimately and is
   * stale on arrival. Deriving visibility from equality is not a list, so
   * there is no site to forget: the hint is shown only while the editor still
   * holds the program it is about.
   */
  const [silentLossHint_, setSilentLossHint] = useState<{
    text: string;
    source: string;
  } | null>(null);
  const silentLossHintText =
    silentLossHint_ !== null && silentLossHint_.source === source
      ? silentLossHint_.text
      : null;
  const [searchState, setSearchState] = useState<"idle" | "pending" | "done">("idle");
  const validateStartRef = useRef(0);
  const validateLineCountRef = useRef(0);
  const wasValidatingRef = useRef(false);

  // The worker boots after an idle callback, by which point `source` may already
  // have changed. This ref carries the current value into that callback without
  // making the boot effect depend on every keystroke. Mirrored from state below
  // rather than written at each setSource, so the two cannot drift apart.
  const sourceRef = useRef(initial.code);

  const sandboxRef = useRef<ExecutionSandboxHandle>(null);

  // Deadlock breakers for the worker round trip — one per mode. Each is armed
  // when its own run/validation is posted and disarmed the moment the worker
  // answers or the sandbox takes over (the sandbox has a watchdog of its own
  // from that point on).
  //
  // Kept as two separate refs rather than one shared ref: a single ref meant
  // an arm and its disarm did not necessarily belong to the same operation.
  // Starting a Playground run, then starting a validation before the run's
  // transpile came back, re-armed the one ref for the validation; the
  // Playground response then disarmed it, leaving the validation's own
  // deadlock breaker silently gone. If the worker later stalled on the
  // validation, `isValidating` never returned to false. See #49.
  const playgroundWatchdogRef = useRef<number | undefined>(undefined);
  const validationWatchdogRef = useRef<number | undefined>(undefined);

  const disarmPlaygroundWatchdog = useCallback(() => {
    window.clearTimeout(playgroundWatchdogRef.current);
    playgroundWatchdogRef.current = undefined;
  }, []);

  const disarmValidationWatchdog = useCallback(() => {
    window.clearTimeout(validationWatchdogRef.current);
    validationWatchdogRef.current = undefined;
  }, []);

  /**
   * Send the `run_result` that was waiting for its follow-up.
   *
   * `syntax_repair` and `silent_loss` are read here rather than captured with
   * the rest, because they are exactly the two the follow-up carries.
   * Everything else — `duration_ms` above all — was fixed when the run ended,
   * so deferring the send does not change what any number means.
   */
  const flushPendingResult = useCallback(() => {
    const pending = pendingResultRef.current;
    if (pending === null) return;
    pendingResultRef.current = null;
    window.clearTimeout(followUpTimerRef.current);
    followUpTimerRef.current = undefined;
    track("run_result", {
      ...pending,
      syntax_repair: syntaxRepairRef.current?.kind,
      silent_loss:
        silentLossRef.current === undefined
          ? undefined
          : (silentLossRef.current?.kind ?? "none"),
    });
  }, []);

  /**
   * End the Playground run, whatever the reason. Every exit path goes through
   * here so that `run_click` and `run_result` reconcile 1:1 — a missing
   * `run_result` means a run got orphaned, not that a user walked away. Since
   * #75 that is nearly rather than structurally true: a run whose result waits
   * on the follow-up search loses it if the tab closes first, which is what
   * `flushPendingResult` on `pagehide` narrows.
   *
   * Declared above the worker handlers on purpose: they list it as a dependency
   * and a deps array is evaluated eagerly, so a later `const` would be in its
   * temporal dead zone on the first render.
   *
   * Clearing `playgroundRequestIdRef.current` here (not just on the explicit
   * Stop path) is what closes #50: without it, a run that ends via the
   * `stalled` watchdog leaves its requestId current, so a `transpile-result`
   * that arrives after the watchdog fired still matches the guards in
   * `attachWorkerHandlers` and hands stale JS to the sandbox to execute,
   * producing a second `run_result` for one `run_click`. By the time any exit
   * path reaches `endRun`, this run's own transpile round trip is already
   * over — the transpile-result/transpile-error handlers either already ran
   * (their guard, evaluated synchronously before this call, does not need the
   * ref afterwards) or never will — so clearing here cannot drop a reply that
   * still deserved to be handled.
   */
  const endRun = useCallback(
    (
      outcome: RunOutcome,
      message?: string,
      outputLines?: number,
      // Only ever supplied on a transpile_error. `message` is the human-facing
      // text and stays here; this is the sanitised half that may be measured.
      diagnostics?: TranspileDiagnostics,
      // The same, for a syntax_error. Kept as its own parameter rather than
      // folded in with the one above so the caller has to say which kind of
      // failure it is holding, and so a value meant for one outcome cannot ride
      // along on the other.
      syntaxDiagnostics?: SyntaxDiagnostics,
    ) => {
      disarmPlaygroundWatchdog();
      playgroundRequestIdRef.current = "";
      if (message !== undefined) {
        // `stopped` is the user's own choice, not a failure — keep it out of
        // the `error` slot OutputPanel renders in red.
        if (outcome === "stopped") {
          setStatusMessage(message);
          setError(null);
        } else {
          setError(message);
          setStatusMessage(null);
        }
      }
      setIsRunning(false);
      const params = {
        outcome,
        duration_ms: Math.round(performance.now() - runStartRef.current),
        // The sandbox reports the true total on success; otherwise all we have
        // is what we received, which the display cap may have truncated.
        output_lines: outputLines ?? runOutputCountRef.current,
        transpile_reason: diagnostics?.reason,
        transpile_node: diagnostics?.node,
        syntax_key: syntaxDiagnostics?.key,
        syntax_error_count: syntaxDiagnostics?.errorCount,
        syntax_statement: syntaxDiagnostics?.statement,
      };
      // Wait for the follow-up so the run is measured once, with whatever the
      // searches found on it — but only for a run whose verdict the user is
      // actually looking at (see ABANDONED_OUTCOMES).
      if (followUpRef.current !== "" && !ABANDONED_OUTCOMES.has(outcome)) {
        pendingResultRef.current = params;
        window.clearTimeout(followUpTimerRef.current);
        followUpTimerRef.current = window.setTimeout(
          flushPendingResult,
          WORKER_TIMEOUT_MS,
        );
        return;
      }
      // Nothing more is coming for this run. Dropping the correlation stops a
      // late follow-up from appending a hint to a message it does not belong
      // to, and `done` has to be said HERE rather than left to that message:
      // a stalled worker may never send one, and this attribute stuck on
      // `pending` is what made the negative e2e tests wait out their own
      // timeout (Gate2 1 周目 H2).
      followUpRef.current = "";
      setSearchState("done");
      // A pending result from an earlier call would be overwritten by the
      // assignment below and vanish. No path reaches that today (the Stop
      // button only exists while `isRunning`, and the sandbox's terminal
      // events cannot arrive before the verdict), but "we looked and could
      // not find one" is a weaker guarantee than the 1:1 deserves — one line
      // makes it structural instead (Gate2 2 周目 L2).
      if (pendingResultRef.current !== null) flushPendingResult();
      pendingResultRef.current = params;
      flushPendingResult();
    },
    [disarmPlaygroundWatchdog, flushPendingResult],
  );

  /**
   * Take the #68 answer off the worker's `silent-loss` follow-up.
   *
   * Called from inside the `followUpRef` guard, never outside it: the answer
   * arrives on its own message now (#67/#75), after `endRun` has already
   * cleared `playgroundRequestIdRef`, so `followUpRef` is the ref that says
   * which run this finding belongs to. A late reply from a superseded run
   * would otherwise write its finding over the run the user is actually
   * watching, which is the correlation bug #42/#50 exist for.
   *
   * `checked` false or absent means the search never ran, and the ref is left
   * `undefined` so the event omits the parameter rather than claiming `none`.
   */
  const recordSilentLoss = useCallback(
    (checked: boolean | undefined, loss: SilentLoss | undefined) => {
      if (checked !== true) return;
      silentLossRef.current = loss ?? null;
      setSilentLossHint(
        loss ? { text: silentLossHint(loss), source: runSourceRef.current } : null,
      );
    },
    [],
  );

  /** End the validation, marking its runtime stage with `result`. */
  const endValidationRuntime = useCallback(
    (result: StageResult) => {
      disarmValidationWatchdog();
      setValidationStages((prev) => ({ ...prev, runtime: result }));
      validationRequestIdRef.current = null;
      setIsValidating(false);
    },
    [disarmValidationWatchdog],
  );

  // Hero visibility: hidden if dismissed, or if URL has code parameter
  const [heroVisible, setHeroVisible] = useState(() => {
    if (localStorage.getItem("hero-dismissed") === "true") return false;
    const hash = window.location.hash;
    if (hash && hash.includes("code=")) return false;
    return true;
  });

  // Shared-code banner: shown when the source was decoded from the URL hash.
  // Session-only (no localStorage) — every shared URL is a fresh threat.
  const [sharedCodeBannerVisible, setSharedCodeBannerVisible] = useState(() => {
    const hash = window.location.hash;
    return Boolean(hash && hash.includes("code="));
  });

  const handleDismissHero = useCallback(() => {
    setHeroVisible(false);
    localStorage.setItem("hero-dismissed", "true");
  }, []);

  const handleDismissSharedCodeBanner = useCallback(() => {
    setSharedCodeBannerVisible(false);
  }, []);

  useEffect(() => {
    sourceRef.current = source;
  }, [source]);

  const attachWorkerHandlers = useCallback((worker: Worker) => {
    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const data = event.data;

      // Playground messages
      if (data.type === "lint-result") {
        setLintIssues(data.issues);
      } else if (data.type === "transpile-result") {
        // A stale response is not just "a Stop happened" — Run A -> Stop
        // (still transpiling) -> Run B can deliver A's transpile-result while
        // B is the current run. Comparing `data.requestId` against the
        // current ref (rather than the old truthy-only check) is what keeps
        // A's JS from executing under B's requestId, and keeps a Stop pressed
        // mid-transpile from letting the eventual late reply start a run
        // nobody asked for. See #42 for widening this correlation to every
        // worker message; lint/lint-result stay untouched on purpose (see the
        // comment on WorkerRequest in types/messages.ts).
        if (
          playgroundRequestIdRef.current &&
          data.requestId === playgroundRequestIdRef.current
        ) {
          // The sandbox owns the deadline from here on. The #68 answer is not
          // here any more — it follows on its own message while this runs.
          disarmPlaygroundWatchdog();
          sandboxRef.current?.execute(data.js, playgroundRequestIdRef.current);
        }
      } else if (data.type === "transpile-error") {
        // Same requestId guard as transpile-result: a Stop pressed during the
        // round trip already ended the run with its own run_result, and a
        // stale transpile-error from an abandoned run must not terminate — or
        // end — a run started after it.
        if (
          playgroundRequestIdRef.current &&
          data.requestId === playgroundRequestIdRef.current
        ) {
          const isSyntax = data.kind === "syntax";
          const label = isSyntax ? "Syntax error" : "Transpile error";
          const head = data.line
            ? `${label} (L${data.line}): ${data.message}`
            : `${label}: ${data.message}`;
          // The hint is NOT here. abaplint names neither the quote nor the
          // argument it swallowed, so this text alone cannot be acted on by
          // someone who does not already know ABAP comment syntax — but the
          // search that says what to change takes seconds on a heavy paste,
          // and waiting for it here is what made a real syntax error arrive
          // after the watchdog (#75). Show the error now; the `syntax-hint`
          // handler below appends the explanation when it lands.
          endRun(
            isSyntax ? "syntax_error" : "transpile_error",
            head,
            undefined,
            // "set on no other outcome" is the documented invariant, so enforce
            // it here rather than trusting the worker to keep omitting it: both
            // fields are optional on a union member that covers both kinds, and
            // the strip runs in both directions so neither outcome can pick up
            // the other's measurements.
            isSyntax ? undefined : data.diagnostics,
            isSyntax ? data.syntaxDiagnostics : undefined,
          );
        }
      } else if (data.type === "syntax-hint") {
        // Guarded on followUpRef, not playgroundRequestIdRef: endRun already
        // cleared the latter (see the note on followUpRef).
        if (followUpRef.current && data.requestId === followUpRef.current) {
          followUpRef.current = "";
          syntaxRepairRef.current = data.repair;
          const repair = data.repair;
          if (repair !== undefined) {
            // Appended to the error this run put on screen. `null` means no
            // error is showing — the user pressed Stop, or a new run cleared
            // it — so there is nothing this hint belongs to.
            setError((prev) =>
              prev === null ? prev : `${prev}\n\n${repairHint(repair)}`,
            );
          }
          setSearchState("done");
          flushPendingResult();
        }
      } else if (data.type === "silent-loss") {
        if (followUpRef.current && data.requestId === followUpRef.current) {
          followUpRef.current = "";
          recordSilentLoss(data.completed, data.loss);
          setSearchState("done");
          flushPendingResult();
        }
      }

      // Validation messages
      if (data.type === "validate-progress") {
        setValidationStages((prev) => ({
          ...prev,
          [data.stage]: {
            ...prev[data.stage],
            status: data.status,
          },
        }));
      } else if (data.type === "validate-stage-result") {
        setValidationStages((prev) => ({
          ...prev,
          [data.stage]: data.result,
        }));

        // If transpile stage succeeded with JS, trigger runtime check
        if (
          data.stage === "transpile" &&
          data.result.status === "pass" &&
          data.result.js
        ) {
          // The sandbox owns the deadline from here on.
          disarmValidationWatchdog();
          const reqId = crypto.randomUUID();
          validationRequestIdRef.current = reqId;
          setValidationStages((prev) => ({
            ...prev,
            runtime: { status: "running" },
          }));
          sandboxRef.current?.execute(data.result.js, reqId);
        }

        // If transpile or runtime was skipped/failed, validation is done
        if (
          data.stage === "transpile" &&
          (data.result.status === "fail" || data.result.status === "skipped")
        ) {
          disarmValidationWatchdog();
          setIsValidating(false);
        }
        if (data.stage === "runtime" && data.result.status === "skipped") {
          disarmValidationWatchdog();
          setIsValidating(false);
        }
      }
    };
  }, [
    disarmPlaygroundWatchdog,
    disarmValidationWatchdog,
    endRun,
    flushPendingResult,
    recordSilentLoss,
  ]);

  // Boot the abaplint worker once the browser is idle. Creating it during mount
  // meant parsing 1.8 MB of JavaScript before the page could respond to input,
  // and nothing needs the worker until the first lint result appears.
  useEffect(() => {
    let worker: Worker | null = null;

    const cancel = scheduleIdle(() => {
      worker = new AbaplintWorker();
      appWorker = worker;
      attachWorkerHandlers(worker);
      // Lint whatever is on screen now: the mount-time lint had no worker to
      // post to, so without this the first result would wait for a keystroke.
      debouncedLint(sourceRef.current);
    });

    return () => {
      cancel();
      worker?.terminate();
      if (appWorker === worker) appWorker = null;
      window.clearTimeout(followUpTimerRef.current);
    };
  }, [attachWorkerHandlers]);

  // Sandbox callbacks — requestId disambiguates playground vs validation.
  //
  // `validationRequestIdRef.current` is `null` whenever no validation is in
  // flight. A message that somehow arrives with `requestId: null` (the
  // supervisor used to produce exactly this when a "stop" raced an
  // "execute" — see supervisor.js) must never match — `null === null` would
  // silently route a Playground event into the Validator's handlers. Gating
  // on `validationRequestIdRef.current !== null` first, rather than trusting
  // `requestId` alone, is what keeps that structurally impossible regardless
  // of what a future message shape does.
  const isValidationRequest = useCallback(
    (requestId: string) =>
      validationRequestIdRef.current !== null &&
      requestId === validationRequestIdRef.current,
    [],
  );

  const handleOutput = useCallback((lines: string[], requestId: string) => {
    if (isValidationRequest(requestId)) {
      // Validation only cares whether the runtime stage succeeded, not what it
      // printed.
      return;
    }
    runOutputCountRef.current += lines.length;
    setOutput((prev) => [...prev, ...lines]);
  }, [isValidationRequest]);

  const handleError = useCallback(
    (
      message: string,
      requestId: string,
      kind: "runtime" | "load",
      outputLines: number,
    ) => {
      if (isValidationRequest(requestId)) {
        endValidationRuntime({ status: "fail", error: message });
        return;
      }
      endRun(kind === "load" ? "load_error" : "runtime_error", message, outputLines);
    },
    [endRun, endValidationRuntime, isValidationRequest],
  );

  const handleTimeout = useCallback(
    (requestId: string, outputLines: number) => {
      const message = `Execution stopped after ${EXECUTION_TIMEOUT_SECONDS}s — this usually means an endless loop.`;
      if (isValidationRequest(requestId)) {
        endValidationRuntime({ status: "fail", error: message });
        return;
      }
      endRun("timeout", message, outputLines);
    },
    [endRun, endValidationRuntime, isValidationRequest],
  );

  /**
   * The run was stopped by explicit request (the Stop button), not the
   * watchdog and not the other mode taking the sandbox away — `stopped` is
   * its own outcome precisely so it does not get folded into `cancelled`.
   */
  const handleStopped = useCallback(
    (requestId: string, outputLines: number) => {
      const message = "Execution stopped.";
      if (isValidationRequest(requestId)) {
        endValidationRuntime({ status: "fail", error: message });
        return;
      }
      endRun("stopped", message, outputLines);
    },
    [endRun, endValidationRuntime, isValidationRequest],
  );

  /**
   * The sandbox was handed to the other mode while this execution was still
   * running. Nothing is wrong with the user's code — just say so and unlock the
   * button, rather than leaving it disabled waiting on an iframe that is gone.
   */
  const handleCancel = useCallback(
    (requestId: string) => {
      const message = "Execution cancelled — another run started.";
      if (isValidationRequest(requestId)) {
        endValidationRuntime({ status: "fail", error: message });
        return;
      }
      endRun("cancelled", message);
    },
    [endRun, endValidationRuntime, isValidationRequest],
  );

  const handleDone = useCallback(
    (requestId: string, outputLines: number) => {
      if (isValidationRequest(requestId)) {
        endValidationRuntime({ status: "pass" });
        return;
      }
      endRun("success", undefined, outputLines);
    },
    [endRun, endValidationRuntime, isValidationRequest],
  );

  const handleChange = useCallback((value: string) => {
    setSource(value);
    debouncedLint(value);
  }, []);

  // The initial lint is kicked off by the worker-boot effect instead, since
  // posting before the worker exists would drop the message.

  // Report once when the page loaded with code in the URL that actually decoded.
  //
  // This deliberately does NOT claim to count shared-link arrivals. handleShare
  // and handleModeChange both write "#code=..." into the URL, so any later
  // reload of the user's own tab looks identical to opening someone else's
  // link. Requiring a successful decode is the part we can be honest about;
  // naming it after the URL rather than after sharing is the rest.
  useEffect(() => {
    if (initial.decodedFromUrl) {
      track("url_code_open", { line_count: lineCount(initial.code), mode });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Validation finishes at several different points (transpile fail, runtime
  // skip, runtime pass/fail). Rather than instrumenting each of them, watch the
  // isValidating -> false transition.
  //
  // `wasValidatingRef` is the only thing keeping this to one event per run: the
  // worker delivers stage results as separate postMessages, so this effect can
  // and does re-run afterwards, and on the syntax-error and transpile-fail
  // paths it fires while the trailing `runtime` stage is still "pending".
  // That is currently harmless — a pending stage counts as neither fail nor
  // warn in computeSummary, and the stage that decides the verdict is always
  // already in — but it is a real coupling to the worker's message order. If a
  // future exit path only reveals fail/warn in its LAST message, the outcome
  // sent here will be wrong while the UI (which gates on allDone) stays right.
  useEffect(() => {
    if (wasValidatingRef.current && !isValidating) {
      const summary = computeSummary(validationStages);
      track("validate_result", {
        outcome: summary.overall,
        duration_ms: Math.round(performance.now() - validateStartRef.current),
        lint_issues: summary.lintIssues,
        pitfalls: summary.pitfalls,
        line_count: validateLineCountRef.current,
      });
    }
    wasValidatingRef.current = isValidating;
  }, [isValidating, validationStages]);

  // A `run_result` waiting for its follow-up is lost if the tab goes away,
  // and on a heavy paste that wait is seconds. Before this change the event
  // went out in the same flush as the verdict, so the 1:1 with `run_click`
  // held by construction; deferring it opens a window, and a gap between the
  // two is exactly what CLAUDE.md tells the reader to interpret as an
  // orphaned run. `pagehide` is the last event that fires reliably on a tab
  // close or navigation (including into the bfcache, where `unload` does
  // not), and gtag sends over sendBeacon, so a flush here still arrives.
  // Gate2 2 周目 M2.
  useEffect(() => {
    window.addEventListener("pagehide", flushPendingResult);
    return () => window.removeEventListener("pagehide", flushPendingResult);
  }, [flushPendingResult]);

  // Run (Playground mode)
  const handleRun = useCallback(() => {
    setOutput([]);
    setError(null);
    setStatusMessage(null);
    setIsRunning(true);
    setActiveTab("output");
    const requestId = crypto.randomUUID();
    playgroundRequestIdRef.current = requestId;
    runStartRef.current = performance.now();
    runOutputCountRef.current = 0;
    runSourceRef.current = source;
    // The previous run's follow-up is not coming in time to matter now. Send
    // its result as it stands rather than dropping it: run_click and
    // run_result reconcile 1:1, and a gap there means an orphaned run.
    flushPendingResult();
    silentLossRef.current = undefined;
    syntaxRepairRef.current = undefined;
    followUpRef.current = requestId;
    setSearchState("pending");
    setSilentLossHint(null);
    track("run_click", { line_count: lineCount(source) });
    appWorker?.postMessage({ type: "transpile", source, requestId });
    // Nothing else can end the run until the worker replies (or the sandbox
    // takes over), so guarantee an exit even if it never does.
    disarmPlaygroundWatchdog();
    playgroundWatchdogRef.current = window.setTimeout(() => {
      endRun("stalled", "The ABAP engine stopped responding. Try running again.");
    }, WORKER_TIMEOUT_MS);
  }, [source, endRun, disarmPlaygroundWatchdog, flushPendingResult]);

  // Stop (Playground mode). Always ask the sandbox first and trust its
  // answer — `stop()` returns whether IT is the one responsible for
  // `playgroundRequestIdRef.current` (it owns the run, or it just ended one
  // that had no frame yet). That return value is the only source of truth.
  // Only fall back to ending the run here when the sandbox reports it does
  // not own this requestId at all — the still-in-transpile case.
  // Clearing `playgroundRequestIdRef.current` is what stops the transpile
  // result (or error) that is still in flight from starting — or re-ending —
  // a run nobody wants anymore; see the requestId guards in
  // attachWorkerHandlers. `disarmPlaygroundWatchdog()` here is Playground's
  // own watchdog only (see #49) — it can no longer strip a concurrent
  // validation's deadline breaker the way the old shared `workerWatchdogRef`
  // could.
  const handleStopClick = useCallback(() => {
    const sandboxOwnsIt = sandboxRef.current?.stop(playgroundRequestIdRef.current);
    if (sandboxOwnsIt) return;
    disarmPlaygroundWatchdog();
    playgroundRequestIdRef.current = "";
    endRun("stopped", "Execution stopped.", 0);
  }, [disarmPlaygroundWatchdog, endRun]);

  // Validate (Validator mode)
  const handleValidate = useCallback(() => {
    validationRequestIdRef.current = null;
    setIsValidating(true);
    validateStartRef.current = performance.now();
    validateLineCountRef.current = lineCount(source);
    track("validate_click", { line_count: validateLineCountRef.current });
    setValidationStages({
      syntax: { status: "pending" },
      lint: { status: "pending" },
      transpile: { status: "pending" },
      runtime: { status: "pending" },
    });
    appWorker?.postMessage({ type: "validate", source });
    disarmValidationWatchdog();
    validationWatchdogRef.current = window.setTimeout(() => {
      endValidationRuntime({
        status: "fail",
        error: "The ABAP engine stopped responding. Try validating again.",
      });
    }, WORKER_TIMEOUT_MS);
  }, [source, endValidationRuntime, disarmValidationWatchdog]);

  // Mode change
  const handleModeChange = useCallback(
    (newMode: AppMode) => {
      // The header buttons are always clickable, including the active one.
      // Without this guard a same-mode click would report a switch that never
      // happened and inflate the denominator of "users who tried the other mode".
      if (newMode === mode) return;
      setMode(newMode);
      // The next run in this mode starts from `idle`, not from whatever the
      // last one left behind. Only `handleRun` sets `pending`, so a stale
      // `done` sitting here would let a test (or a reader) take the previous
      // run's answer for this one. Gate2 1 周目 L1.
      setSearchState("idle");
      track("mode_switch", { to_mode: newMode });
      const encoded = encodeSource(source);
      if (newMode === "playground") {
        window.history.replaceState(null, "", `#code=${encoded}`);
      } else {
        window.history.replaceState(
          null,
          "",
          `#mode=${newMode}&code=${encoded}`,
        );
      }
    },
    [source, mode],
  );

  // Sample selection
  const handleSelectSample = useCallback((sample: Sample) => {
    track("sample_select", { sample_id: sample.id });
    setSource(sample.code);
    setOutput([]);
    setError(null);
    debouncedLint(sample.code);
  }, []);

  // Share
  const handleShare = useCallback(() => {
    // Warn once per browser before encoding source into the URL.
    const acknowledged =
      localStorage.getItem("share-warning-acknowledged") === "true";
    if (!acknowledged) {
      const proceed = window.confirm(
        "Your source code will be encoded into the URL and copied to your clipboard.\n\n" +
          "Don't share URLs that contain secrets, API keys, or anything sensitive — " +
          "the URL will end up in browser history and anywhere the link is pasted.",
      );
      if (!proceed) return;
      localStorage.setItem("share-warning-acknowledged", "true");
    }

    const encoded = encodeSource(source);
    const modeParam = mode === "validator" ? `mode=${mode}&` : "";
    const url = `${window.location.origin}${window.location.pathname}#${modeParam}code=${encoded}`;
    if (url.length > 2000) {
      alert("Warning: URL is very long and may not work in all browsers.");
    }
    track("share_click", {
      url_length: url.length,
      line_count: lineCount(source),
    });
    const hash = `#${modeParam}code=${encoded}`;
    window.history.replaceState(null, "", hash);
    navigator.clipboard.writeText(url).then(
      () => alert("URL copied to clipboard!"),
      () => alert("URL updated in address bar."),
    );
  }, [source, mode]);

  return (
    <div className="h-screen flex flex-col bg-gray-900 text-gray-100">
      <ModeHeader mode={mode} onModeChange={handleModeChange} />
      <HeroBanner visible={heroVisible} onDismiss={handleDismissHero} />
      <SharedCodeBanner
        visible={sharedCodeBannerVisible}
        onDismiss={handleDismissSharedCodeBanner}
      />
      <Toolbar
        mode={mode}
        onRun={handleRun}
        onStop={handleStopClick}
        onValidate={handleValidate}
        isRunning={isRunning}
        isValidating={isValidating}
        onShare={handleShare}
        onSelectSample={handleSelectSample}
      />

      <main className="flex-1 min-h-0 flex flex-col md:flex-row">
        {/* Editor */}
        <div className="h-1/2 md:h-auto md:w-1/2 min-h-0 border-b md:border-b-0 md:border-r border-gray-700">
          <EditorPanel
            value={source}
            onChange={handleChange}
            lintIssues={lintIssues}
          />
        </div>

        {/* Output / Validation */}
        <div className="h-1/2 md:h-auto md:w-1/2 min-h-0">
          {mode === "playground" ? (
            <OutputPanel
              searchState={searchState}
              silentLossHint={silentLossHintText}
              output={output}
              error={error}
              statusMessage={statusMessage}
              lintIssues={lintIssues}
              isRunning={isRunning}
              activeTab={activeTab}
              onTabChange={setActiveTab}
            />
          ) : (
            <ValidationReport
              stages={validationStages}
              isValidating={isValidating}
            />
          )}
        </div>
      </main>

      <AppFooter />

      <ExecutionSandbox
        ref={sandboxRef}
        onOutput={handleOutput}
        onError={handleError}
        onDone={handleDone}
        onTimeout={handleTimeout}
        onStopped={handleStopped}
        onCancel={handleCancel}
      />
    </div>
  );
}

export default App;
