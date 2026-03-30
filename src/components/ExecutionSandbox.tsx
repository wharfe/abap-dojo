import { useRef, useCallback, useImperativeHandle, forwardRef } from "react";
import type { SandboxResponse } from "../types/messages";

const EXECUTION_TIMEOUT_MS = 5000;

export interface ExecutionSandboxHandle {
  execute: (js: string) => void;
}

interface ExecutionSandboxProps {
  onOutput: (text: string) => void;
  onError: (message: string) => void;
  onDone: () => void;
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
      if (!iframeRef.current || event.source !== iframeRef.current.contentWindow) {
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
    (js: string) => {
      // Clean up previous execution
      cleanup();

      // Build srcdoc with runtime inlined
      const srcdoc = buildSandboxHtml();

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

function buildSandboxHtml(): string {
  // The sandbox HTML runs inside an iframe with sandbox="allow-scripts"
  // (no allow-same-origin). It cannot access the parent page's DOM,
  // cookies, localStorage, or origin.
  //
  // Runtime injection: @abaplint/runtime must be fully inlined here
  // since the sandboxed iframe has no access to parent resources.
  // This will be refined during Task 8 integration.
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"></head><body>
<script>
// Sandbox execution context for transpiled ABAP-to-JS code.
// iframe sandbox="allow-scripts" only (no allow-same-origin) provides isolation.
window.addEventListener("message", async function(event) {
  if (!event.data || event.data.type !== "execute") return;
  try {
    var AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
    var fn = new AsyncFunction(event.data.js);
    await fn();
    window.parent.postMessage({ type: "done" }, "*");
  } catch (e) {
    window.parent.postMessage({ type: "error", message: e.message || String(e) }, "*");
  }
});
</script></body></html>`;
}
