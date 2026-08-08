import { useRef, useCallback, useImperativeHandle, forwardRef } from "react";
import type { SandboxResponse } from "../types/messages";
import { getRuntimeBundle } from "../utils/runtimeBundle";
import { prepareTranspiledJs } from "../utils/prepareTranspiledJs";
import runtimeBundleUrl from "../sandbox/runtime-bundle.js?url";
import executorSource from "../sandbox/executor.js?raw";
import supervisorSource from "../sandbox/supervisor.js?raw";

/**
 * Deadline for a run, enforced from the parent page.
 *
 * This used to be decorative: the sandbox ran on the parent's main thread, so a
 * CPU-bound loop blocked the timer that was supposed to rescue it (#28). The
 * transpiled JS now runs in a Worker inside the frame, so the frame and the
 * parent both stay free and this timer fires when it should.
 *
 * 15s, not the old 5s: that number was chosen when a long run froze the tab,
 * so cutting things short was the lesser harm. It is not any more, and 5s was
 * killing legitimately slow loops on phones. The user can also stop a run
 * themselves now, which is what makes a longer deadline safe.
 */
const EXECUTION_TIMEOUT_MS = 15000;

/** EXECUTION_TIMEOUT_MS in seconds, for messages shown to the user. Exported
 *  so the number lives in exactly one place — a message that hardcoded it
 *  separately would silently drift the day the timeout value changes. */
export const EXECUTION_TIMEOUT_SECONDS = EXECUTION_TIMEOUT_MS / 1000;

/**
 * Grace period for the frame to answer the watchdog's own "stop" request
 * before it is torn down unconditionally. Only the timeout path in `execute`
 * arms this — a wedged frame that cannot even relay "stopped" would otherwise
 * hang that path forever waiting for one.
 *
 * A user-initiated `stop()` does NOT arm this timer: it relies on the same
 * watchdog (armed once, in `execute`) to eventually rescue a wedged frame
 * instead of starting a second countdown. That means a user's Stop click can
 * take up to the remainder of EXECUTION_TIMEOUT_MS (plus this grace period)
 * to resolve if the frame never answers — slower than this constant's name
 * alone suggests, but it is the existing watchdog doing the rescuing, not a
 * second one.
 */
const STOP_GRACE_MS = 250;

export interface ExecutionSandboxHandle {
  execute: (js: string, requestId: string) => void;
  /**
   * Ask the running program to stop.
   *
   * Returns `true` when the sandbox took responsibility for `requestId` —
   * either it posted the stop request to the frame, or it ended the run
   * itself because no frame exists yet (still fetching the runtime bundle).
   * Returns `false` when `requestId` does not currently own the sandbox — it
   * already ended on its own, it was superseded, or it never reached the
   * sandbox at all (e.g. still in the caller's own transpile round trip).
   * Callers must not infer sandbox ownership any other way (from a timer they
   * also use for something else, for instance): this return value is the only
   * source of truth, and a caller that gets `false` is responsible for ending
   * its own run.
   */
  stop: (requestId: string) => boolean;
}

interface ExecutionSandboxProps {
  onOutput: (lines: string[], requestId: string) => void;
  /**
   * `kind` separates "the ABAP code threw" from "we could not load the runtime
   * to run it at all" — the second is our failure, not the user's, and the two
   * must not be reported as the same thing. `outputLines` is what the run
   * produced before it errored.
   */
  onError: (
    message: string,
    requestId: string,
    kind: "runtime" | "load",
    outputLines: number,
  ) => void;
  /** `outputLines` is what the run produced, before the display cap. */
  onDone: (requestId: string, outputLines: number) => void;
  /** The run exceeded EXECUTION_TIMEOUT_MS — almost always a runaway loop. */
  onTimeout: (requestId: string, outputLines: number) => void;
  /**
   * The run was stopped by explicit request (not a timeout — that is
   * `onTimeout`). Fired when the user presses Stop.
   */
  onStopped: (requestId: string, outputLines: number) => void;
  /**
   * A still-running execution was torn down to make room for a new one.
   *
   * There is one sandbox iframe but two callers (Playground and Validator), and
   * neither is blocked while the other runs. Without this the superseded caller
   * would wait forever for a terminal event that can no longer arrive, leaving
   * its button disabled for the rest of the session.
   */
  onCancel: (requestId: string) => void;
}

export const ExecutionSandbox = forwardRef<
  ExecutionSandboxHandle,
  ExecutionSandboxProps
>(function ExecutionSandbox(
  { onOutput, onError, onDone, onTimeout, onStopped, onCancel },
  ref,
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const timeoutRef = useRef<number | undefined>(undefined);
  /** Fallback timer for a frame that does not answer a "stop" request. */
  const stopFallbackRef = useRef<number | undefined>(undefined);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  /**
   * Lines this component has handed to `onOutput` for the active run. The
   * supervisor keeps its own count and that one is authoritative; this exists
   * only for the path where the frame is wedged and cannot report at all.
   */
  const relayedLinesRef = useRef(0);

  /**
   * The execution the sandbox currently belongs to, or null when idle. Every
   * path out of a run must clear it, and any async continuation must re-check
   * it before touching the DOM — by the time an await resolves the sandbox may
   * already have been handed to a different caller.
   */
  const activeRequestIdRef = useRef<string | null>(null);

  const handleMessageRef = useRef<((event: MessageEvent) => void) | null>(null);

  const cleanup = useCallback(() => {
    window.clearTimeout(timeoutRef.current);
    window.clearTimeout(stopFallbackRef.current);
    if (handleMessageRef.current) {
      window.removeEventListener("message", handleMessageRef.current);
      handleMessageRef.current = null;
    }
    if (iframeRef.current) {
      iframeRef.current.remove();
      iframeRef.current = null;
    }
  }, []);

  /** Release the sandbox after a terminal event for `requestId`. */
  const finish = useCallback(() => {
    activeRequestIdRef.current = null;
    cleanup();
  }, [cleanup]);

  const handleMessage = useCallback(
    (event: MessageEvent<SandboxResponse>) => {
      // Only accept messages from our iframe
      if (
        !iframeRef.current ||
        event.source !== iframeRef.current.contentWindow
      ) {
        return;
      }
      // Defense-in-depth: sandboxed iframe (allow-scripts only) has opaque "null" origin.
      if (event.origin !== "null") return;

      const data = event.data;
      if (data.type === "output") {
        relayedLinesRef.current += data.lines.length;
        onOutput(data.lines, data.requestId);
      } else if (data.type === "error") {
        finish();
        onError(
          data.message,
          data.requestId,
          data.fatal ? "load" : "runtime",
          data.outputLines ?? relayedLinesRef.current,
        );
      } else if (data.type === "done") {
        finish();
        onDone(data.requestId, data.outputLines);
      } else if (data.type === "stopped") {
        finish();
        if (data.reason === "user") {
          onStopped(data.requestId, data.outputLines);
        } else {
          onTimeout(data.requestId, data.outputLines);
        }
      }
    },
    [onOutput, onError, onDone, onTimeout, onStopped, finish],
  );

  const execute = useCallback(
    async (js: string, requestId: string) => {
      // Tear down whatever was running and tell its owner, so a Playground run
      // and a Validator run can never leave each other waiting on an iframe
      // that no longer exists.
      const superseded = activeRequestIdRef.current;
      cleanup();
      activeRequestIdRef.current = requestId;
      relayedLinesRef.current = 0;
      if (superseded !== null && superseded !== requestId) {
        onCancel(superseded);
      }

      // Arm the watchdog BEFORE awaiting the bundle. A fetch that rejects or
      // never settles is the one case where no iframe is ever created, so a
      // watchdog armed after the await could not fire at all. The cost is that
      // the EXECUTION_TIMEOUT_MS budget covers the fetch too, which only
      // matters on the very first run of a session (the bundle is
      // same-origin and cached after).
      timeoutRef.current = window.setTimeout(() => {
        // Ask the frame to stop first: it knows how many lines went past, and
        // that number is the difference between "timed out, here is what you
        // got" and "timed out, nothing to show". Removing the iframe outright
        // is the fallback, armed in case the frame itself is wedged.
        const frame = iframeRef.current;
        if (frame?.contentWindow) {
          frame.contentWindow.postMessage(
            { type: "stop", requestId, reason: "timeout" },
            "*",
          );
          stopFallbackRef.current = window.setTimeout(() => {
            if (activeRequestIdRef.current !== requestId) return;
            finish();
            // The frame never answered, so its count is unreachable. Fall back
            // to what we relayed ourselves rather than reporting nothing.
            onTimeout(requestId, relayedLinesRef.current);
          }, STOP_GRACE_MS);
          return;
        }
        // No iframe yet (still fetching the runtime bundle) — nothing could
        // have produced output.
        finish();
        onTimeout(requestId, relayedLinesRef.current);
      }, EXECUTION_TIMEOUT_MS);

      let runtimeBundle: string;
      try {
        runtimeBundle = await getRuntimeBundle(runtimeBundleUrl);
      } catch {
        // Superseded or timed out while fetching — that owner has already been
        // told, and this requestId no longer owns the sandbox.
        if (activeRequestIdRef.current !== requestId) return;
        finish();
        onError(
          "Could not load the ABAP runtime. Check your connection and try again.",
          requestId,
          "load",
          0,
        );
        return;
      }
      if (activeRequestIdRef.current !== requestId) return;

      // Anything that throws from here on would otherwise reject a promise that
      // App.tsx does not await, leaving the run with no terminal event at all —
      // the same orphaning this whole lifecycle exists to prevent.
      try {
        // Build srcdoc with runtime inlined
        const srcdoc = buildSandboxHtml(runtimeBundle);

        // Create fresh iframe with sandbox isolation. Set as an attribute
        // rather than via the `sandbox` DOMTokenList, which not every engine
        // reflects.
        const iframe = document.createElement("iframe");
        iframe.setAttribute("sandbox", "allow-scripts");
        iframe.style.display = "none";
        iframe.srcdoc = srcdoc;
        iframeRef.current = iframe;

        // Listen for messages (store ref for cleanup)
        handleMessageRef.current = handleMessage;
        window.addEventListener("message", handleMessage);

        // Append iframe and wait for load, then send execute message
        iframe.onload = () => {
          iframe.contentWindow?.postMessage(
            { type: "execute", js: prepareTranspiledJs(js), requestId },
            "*",
          );
        };

        containerRef.current?.appendChild(iframe);
      } catch (cause) {
        if (activeRequestIdRef.current !== requestId) return;
        finish();
        onError(
          cause instanceof Error ? cause.message : String(cause),
          requestId,
          "load",
          0,
        );
      }
    },
    [cleanup, finish, handleMessage, onError, onTimeout, onCancel],
  );

  /**
   * Ask the frame to stop the run it currently owns. `requestId` guards
   * against a race where the run already ended on its own (or was
   * superseded) by the time the user clicks Stop — in that case
   * `activeRequestIdRef.current` no longer matches, this returns `false`, and
   * the caller (never this component) is responsible for ending its own run.
   * That return value is deliberately the only way a caller learns whether
   * the sandbox owns a given requestId — inferring it from some other signal
   * (e.g. a timer the caller also uses for an unrelated deadline) is exactly
   * the bug this return value replaced.
   *
   * A matching `requestId` does not always mean there is a frame to ask,
   * though: on the very first run of a session (or any run still fetching
   * the bundle) `execute` has armed the watchdog and claimed
   * `activeRequestIdRef` but has not created an iframe yet. Without handling
   * that case here, pressing Stop in that window would do nothing at all
   * until the watchdog eventually rescued the user 15s later — silently
   * inert is worse than a no-op with a reason. There is no frame to answer,
   * so end the run here instead of asking one to, and still return `true`:
   * the sandbox took responsibility for `requestId` either way.
   */
  const stop = useCallback(
    (requestId: string): boolean => {
      if (activeRequestIdRef.current !== requestId) return false;
      const frame = iframeRef.current;
      if (!frame?.contentWindow) {
        finish();
        onStopped(requestId, 0);
        return true;
      }
      frame.contentWindow.postMessage(
        { type: "stop", requestId, reason: "user" },
        "*",
      );
      return true;
    },
    [finish, onStopped],
  );

  useImperativeHandle(ref, () => ({ execute, stop }), [execute, stop]);

  return <div ref={containerRef} className="hidden" />;
});

function buildSandboxHtml(runtimeBundle: string): string {
  // The iframe is sandbox="allow-scripts" with no allow-same-origin, so it has
  // an opaque origin: no access to the parent's DOM, cookies, localStorage.
  // That isolation is why the iframe stays even though it no longer executes
  // anything — a bare Worker would run on our own origin.
  //
  // The executor source is handed to the frame as a string rather than a
  // <script>, because the frame's job is to turn it into a blob: Worker. The
  // runtime bundle is concatenated ahead of it so the worker has
  // `abaplintRuntime` as a global without any import.
  const workerSource = `${runtimeBundle}\n${executorSource}`;
  // JSON.stringify does not escape "</script>", so a runtime bundle that ever
  // contained that substring would close this inline <script> early and leave
  // the frame silently dead (surfacing only as an unexplained timeout). Not
  // live today — checked, the bundle has zero occurrences — but cheap to
  // close off for good.
  const serializedWorkerSource = JSON.stringify(workerSource).replace(
    /</g,
    "\\u003c",
  );
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"></head><body>
<script>self.__executorSource = ${serializedWorkerSource};</script>
<script>${supervisorSource}</script>
</body></html>`;
}
