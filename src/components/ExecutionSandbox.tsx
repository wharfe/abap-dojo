import { useRef, useCallback, useImperativeHandle, forwardRef } from "react";
import type { SandboxResponse } from "../types/messages";
import { getRuntimeBundle } from "../utils/runtimeBundle";
import runtimeBundleUrl from "../sandbox/runtime-bundle.js?url";

const EXECUTION_TIMEOUT_MS = 5000;

export interface ExecutionSandboxHandle {
  execute: (js: string, requestId: string) => void;
}

interface ExecutionSandboxProps {
  onOutput: (text: string, requestId: string) => void;
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
  onDone: (requestId: string) => void;
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
        onOutput(data.text, data.requestId);
      } else if (data.type === "error") {
        finish();
        onError(data.message, data.requestId, "runtime");
      } else if (data.type === "done") {
        finish();
        onDone(data.requestId);
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
            { type: "execute", js, requestId },
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
  // The sandbox HTML runs inside an iframe with sandbox="allow-scripts"
  // (no allow-same-origin). It cannot access the parent page's DOM,
  // cookies, localStorage, or origin.
  //
  // The @abaplint/runtime is fully inlined. We create an ABAP instance
  // with a custom console that sends WRITE output via postMessage.
  //
  // Transpiled ABAP code calls abap.statements.write(...) which internally
  // calls context.console.add(text). Our custom console forwards each
  // add() call to the parent window.
  //
  // The transpiled JS init scripts contain ES module import statements
  // that we strip since the runtime is provided globally.
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"></head><body>
<script>
// Inline @abaplint/runtime bundle (IIFE -> abaplintRuntime global)
${runtimeBundle}
</script>
<script>
// Sandbox execution context for transpiled ABAP-to-JS code.
// iframe sandbox="allow-scripts" only (no allow-same-origin) provides isolation.

// Custom console that captures WRITE output and sends it to the parent.
// Output is capped at MAX_OUTPUT_BYTES to defend against runaway WRITE loops.
var MAX_OUTPUT_BYTES = 1024 * 1024;
var PostMessageConsole = (function() {
  function PostMessageConsole() {
    this.data = "";
    this.empty = true;
  }
  PostMessageConsole.prototype.clear = function() {
    this.data = "";
  };
  PostMessageConsole.prototype.add = function(text) {
    if (this.data.length >= MAX_OUTPUT_BYTES) return;
    var remaining = MAX_OUTPUT_BYTES - this.data.length;
    if (text.length > remaining) {
      this.data = this.data + text.slice(0, remaining) + "\\n[output truncated]";
    } else {
      this.data = this.data + text;
    }
    this.empty = false;
  };
  PostMessageConsole.prototype.get = function() {
    return this.data;
  };
  PostMessageConsole.prototype.isEmpty = function() {
    return this.empty;
  };
  PostMessageConsole.prototype.getTrimmed = function() {
    return this.data.split("\\n").map(function(a) { return a.trimEnd(); }).join("\\n");
  };
  return PostMessageConsole;
})();

window.addEventListener("message", async function(event) {
  // Only accept the single execute message from our parent.
  if (event.source !== window.parent) return;
  if (!event.data || event.data.type !== "execute") return;
  if (typeof event.data.js !== "string" || typeof event.data.requestId !== "string") return;
  var requestId = event.data.requestId;
  try {
    // Create runtime with custom console for WRITE capture
    var customConsole = new PostMessageConsole();
    var abap = new abaplintRuntime.ABAP({ console: customConsole });

    // Strip ES module import/export statements from transpiled code.
    // The init scripts contain lines like:
    //   import runtime from "@abaplint/runtime";
    //   import "./_top.mjs";
    //   export async function initializeABAP() {
    // We replace imports with nothing and exports with plain declarations.
    var js = event.data.js;
    js = js.replace(/^import\\s+.*$/gm, "");
    js = js.replace(/^export\\s+/gm, "");

    // The @abaplint/runtime internally references globalThis.abap in methods
    // like append, loop, etc. (e.g., abap.builtin.sy.get().tabix.set(...)).
    // We must set globalThis.abap BEFORE the transpiled code runs, and remove
    // the init script's own ABAP() construction to avoid overwriting our
    // custom-console instance.
    js = js.replace(/globalThis\\.abap\\s*=\\s*new\\s+runtime\\.ABAP\\(\\);?/g, "");
    js = "globalThis.abap = abap;\\n" + js;

    // Execute the transpiled code with abap available in scope
    var AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
    var fn = new AsyncFunction("abap", js);
    await fn(abap);

    // After execution, send all captured output. Line count is capped to
    // avoid flooding the parent with postMessages from pathological loops.
    var output = customConsole.get();
    if (output) {
      var lines = output.split("\\n");
      var MAX_LINES = 10000;
      var totalLines = lines.length;
      var emitCount = totalLines > MAX_LINES ? MAX_LINES : totalLines;
      for (var i = 0; i < emitCount; i++) {
        if (lines[i] !== "" || i < emitCount - 1) {
          window.parent.postMessage({ type: "output", text: lines[i], requestId: requestId }, "*");
        }
      }
      if (totalLines > MAX_LINES) {
        window.parent.postMessage({ type: "output", text: "[output truncated: " + (totalLines - MAX_LINES) + " more lines]", requestId: requestId }, "*");
      }
    }

    window.parent.postMessage({ type: "done", requestId: requestId }, "*");
  } catch (e) {
    window.parent.postMessage({ type: "error", message: e.message || String(e), requestId: requestId }, "*");
  }
});
</script></body></html>`;
}
