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
 */
const EXECUTION_TIMEOUT_MS = 5000;

export interface ExecutionSandboxHandle {
  execute: (js: string, requestId: string) => void;
}

interface ExecutionSandboxProps {
  onOutput: (lines: string[], requestId: string) => void;
  /**
   * `kind` separates "the ABAP code threw" from "we could not load the runtime
   * to run it at all" — the second is our failure, not the user's, and the two
   * must not be reported as the same thing.
   */
  onError: (
    message: string,
    requestId: string,
    kind: "runtime" | "load",
  ) => void;
  /** `outputLines` is what the run produced, before the display cap. */
  onDone: (requestId: string, outputLines: number) => void;
  /** The run exceeded EXECUTION_TIMEOUT_MS — almost always a runaway loop. */
  onTimeout: (requestId: string) => void;
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
  { onOutput, onError, onDone, onTimeout, onCancel },
  ref,
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const timeoutRef = useRef<number | undefined>(undefined);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

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
        onOutput(data.lines, data.requestId);
      } else if (data.type === "error") {
        finish();
        onError(data.message, data.requestId, data.fatal ? "load" : "runtime");
      } else if (data.type === "done") {
        finish();
        onDone(data.requestId, data.outputLines);
      }
    },
    [onOutput, onError, onDone, finish],
  );

  const execute = useCallback(
    async (js: string, requestId: string) => {
      // Tear down whatever was running and tell its owner, so a Playground run
      // and a Validator run can never leave each other waiting on an iframe
      // that no longer exists.
      const superseded = activeRequestIdRef.current;
      cleanup();
      activeRequestIdRef.current = requestId;
      if (superseded !== null && superseded !== requestId) {
        onCancel(superseded);
      }

      // Arm the watchdog BEFORE awaiting the bundle. A fetch that rejects or
      // never settles is the one case where no iframe is ever created, so a
      // watchdog armed after the await could not fire at all. The cost is that
      // the 5s budget covers the fetch too, which only matters on the very
      // first run of a session (the bundle is same-origin and cached after).
      timeoutRef.current = window.setTimeout(() => {
        finish();
        onTimeout(requestId);
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
        );
      }
    },
    [cleanup, finish, handleMessage, onError, onTimeout, onCancel],
  );

  useImperativeHandle(ref, () => ({ execute }), [execute]);

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
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"></head><body>
<script>self.__executorSource = ${JSON.stringify(workerSource)};</script>
<script>${supervisorSource}</script>
</body></html>`;
}
