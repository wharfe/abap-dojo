import { useRef, useCallback, useImperativeHandle, forwardRef } from "react";
import type { SandboxResponse } from "../types/messages";
import runtimeBundleUrl from "../sandbox/runtime-bundle.js?url";

const EXECUTION_TIMEOUT_MS = 5000;

export interface ExecutionSandboxHandle {
  execute: (js: string) => void;
}

interface ExecutionSandboxProps {
  onOutput: (text: string) => void;
  onError: (message: string) => void;
  onDone: () => void;
}

// Cache for the runtime bundle text (fetched once, reused for all executions)
let runtimeBundleCache: string | null = null;
let runtimeBundlePromise: Promise<string> | null = null;

async function getRuntimeBundle(): Promise<string> {
  if (runtimeBundleCache) return runtimeBundleCache;
  if (!runtimeBundlePromise) {
    runtimeBundlePromise = fetch(runtimeBundleUrl)
      .then((r) => r.text())
      .then((text) => {
        runtimeBundleCache = text;
        return text;
      });
  }
  return runtimeBundlePromise;
}

export const ExecutionSandbox = forwardRef<
  ExecutionSandboxHandle,
  ExecutionSandboxProps
>(function ExecutionSandbox({ onOutput, onError, onDone }, ref) {
  const containerRef = useRef<HTMLDivElement>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  const cleanup = useCallback(() => {
    clearTimeout(timeoutRef.current);
    if (iframeRef.current) {
      iframeRef.current.remove();
      iframeRef.current = null;
    }
  }, []);

  const handleMessage = useCallback(
    (event: MessageEvent<SandboxResponse>) => {
      // Only accept messages from our iframe
      if (
        !iframeRef.current ||
        event.source !== iframeRef.current.contentWindow
      ) {
        return;
      }

      const data = event.data;
      if (data.type === "output") {
        onOutput(data.text);
      } else if (data.type === "error") {
        onError(data.message);
        cleanup();
      } else if (data.type === "done") {
        onDone();
        cleanup();
      }
    },
    [onOutput, onError, onDone, cleanup],
  );

  const execute = useCallback(
    async (js: string) => {
      // Clean up previous execution
      cleanup();

      // Fetch runtime bundle (cached after first load)
      const runtimeBundle = await getRuntimeBundle();

      // Build srcdoc with runtime inlined
      const srcdoc = buildSandboxHtml(runtimeBundle);

      // Create fresh iframe with sandbox isolation
      const iframe = document.createElement("iframe");
      iframe.sandbox.add("allow-scripts");
      iframe.style.display = "none";
      iframe.srcdoc = srcdoc;
      iframeRef.current = iframe;

      // Listen for messages
      window.addEventListener("message", handleMessage);

      // Set timeout for infinite loop protection
      timeoutRef.current = setTimeout(() => {
        onError("Execution timeout (5s)");
        cleanup();
      }, EXECUTION_TIMEOUT_MS);

      // Append iframe and wait for load, then send execute message
      iframe.onload = () => {
        iframe.contentWindow?.postMessage({ type: "execute", js }, "*");
      };

      containerRef.current?.appendChild(iframe);
    },
    [cleanup, handleMessage, onError],
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

// Custom console that captures WRITE output and sends it to the parent
var PostMessageConsole = (function() {
  function PostMessageConsole() {
    this.data = "";
    this.empty = true;
  }
  PostMessageConsole.prototype.clear = function() {
    this.data = "";
  };
  PostMessageConsole.prototype.add = function(text) {
    this.data = this.data + text;
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
  if (!event.data || event.data.type !== "execute") return;
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

    // Remove the line: globalThis.abap = new runtime.ABAP();
    // We already created our own abap instance with the custom console.
    js = js.replace(/globalThis\\.abap\\s*=\\s*new\\s+runtime\\.ABAP\\(\\);?/g, "");

    // Execute the transpiled code with abap available in scope
    var AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
    var fn = new AsyncFunction("abap", js);
    await fn(abap);

    // After execution, send all captured output
    var output = customConsole.get();
    if (output) {
      // Split by newlines and send each line
      var lines = output.split("\\n");
      for (var i = 0; i < lines.length; i++) {
        if (lines[i] !== "" || i < lines.length - 1) {
          window.parent.postMessage({ type: "output", text: lines[i] }, "*");
        }
      }
    }

    window.parent.postMessage({ type: "done" }, "*");
  } catch (e) {
    window.parent.postMessage({ type: "error", message: e.message || String(e) }, "*");
  }
});
</script></body></html>`;
}
