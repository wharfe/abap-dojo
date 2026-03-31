import { useState, useEffect, useRef, useCallback } from "react";
import { EditorPanel } from "./components/EditorPanel";
import { OutputPanel } from "./components/OutputPanel";
import { Toolbar } from "./components/Toolbar";
import {
  ExecutionSandbox,
  type ExecutionSandboxHandle,
} from "./components/ExecutionSandbox";
import { debounce } from "./utils/debounce";
import { encodeSource, decodeSource } from "./utils/urlShare";
import type { LintIssue, WorkerResponse } from "./types/messages";
import type { Sample } from "./samples";
import AbaplintWorker from "./workers/abaplintWorker?worker";

const DEFAULT_CODE = `REPORT ztest.
WRITE 'Hello, ABAP Dojo!'.`;

function getInitialCode(): string {
  const hash = window.location.hash;
  if (hash.startsWith("#code=")) {
    const decoded = decodeSource(hash.slice(6));
    if (decoded !== null) return decoded;
  }
  return DEFAULT_CODE;
}

// Module-level worker reference and debounced lint function.
// Kept outside the component to satisfy react-hooks/refs (no ref reads during render).
let appWorker: Worker | null = null;

const debouncedLint = debounce((code: string) => {
  appWorker?.postMessage({ type: "lint", source: code });
}, 400);

type OutputTab = "output" | "lint";

function App() {
  const [source, setSource] = useState(getInitialCode);
  const [lintIssues, setLintIssues] = useState<LintIssue[]>([]);
  const [output, setOutput] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [activeTab, setActiveTab] = useState<OutputTab>("output");

  const sandboxRef = useRef<ExecutionSandboxHandle>(null);

  // Initialize worker
  useEffect(() => {
    const worker = new AbaplintWorker();
    appWorker = worker;

    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const data = event.data;
      if (data.type === "lint-result") {
        setLintIssues(data.issues);
      } else if (data.type === "transpile-result") {
        sandboxRef.current?.execute(data.js);
      } else if (data.type === "transpile-error") {
        setError(
          data.line
            ? `Transpile error (L${data.line}): ${data.message}`
            : `Transpile error: ${data.message}`,
        );
        setIsRunning(false);
      }
    };

    return () => {
      worker.terminate();
      appWorker = null;
    };
  }, []);

  const handleChange = useCallback((value: string) => {
    setSource(value);
    debouncedLint(value);
  }, []);

  // Initial lint
  useEffect(() => {
    debouncedLint(source);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Run
  const handleRun = useCallback(() => {
    setOutput([]);
    setError(null);
    setIsRunning(true);
    setActiveTab("output");
    appWorker?.postMessage({ type: "transpile", source });
  }, [source]);

  // Sample selection
  const handleSelectSample = useCallback((sample: Sample) => {
    setSource(sample.code);
    setOutput([]);
    setError(null);
    debouncedLint(sample.code);
  }, []);

  // Share
  const handleShare = useCallback(() => {
    const encoded = encodeSource(source);
    const url = `${window.location.origin}${window.location.pathname}#code=${encoded}`;
    if (url.length > 2000) {
      alert("Warning: URL is very long and may not work in all browsers.");
    }
    window.history.replaceState(null, "", `#code=${encoded}`);
    navigator.clipboard.writeText(url).then(
      () => alert("URL copied to clipboard!"),
      () => alert("URL updated in address bar."),
    );
  }, [source]);

  // Sandbox callbacks
  const handleOutput = useCallback((text: string) => {
    setOutput((prev) => [...prev, text]);
  }, []);

  const handleError = useCallback((message: string) => {
    setError(message);
    setIsRunning(false);
  }, []);

  const handleDone = useCallback(() => {
    setIsRunning(false);
  }, []);

  return (
    <div className="h-screen flex flex-col bg-gray-900 text-gray-100">
      <header className="flex items-center px-4 py-2 bg-gray-800 border-b border-gray-700">
        <h1 className="text-lg font-bold tracking-wide">ABAP Dojo</h1>
      </header>

      <Toolbar
        onRun={handleRun}
        isRunning={isRunning}
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

        {/* Output */}
        <div className="h-1/2 md:h-auto md:w-1/2 min-h-0">
          <OutputPanel
            output={output}
            error={error}
            lintIssues={lintIssues}
            isRunning={isRunning}
            activeTab={activeTab}
            onTabChange={setActiveTab}
          />
        </div>
      </main>

      <ExecutionSandbox
        ref={sandboxRef}
        onOutput={handleOutput}
        onError={handleError}
        onDone={handleDone}
      />
    </div>
  );
}

export default App;
