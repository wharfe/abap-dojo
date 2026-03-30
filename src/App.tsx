import { useState, useEffect, useRef, useCallback } from "react";
import { EditorPanel } from "./components/EditorPanel";
import { debounce } from "./utils/debounce";
import type { LintIssue, WorkerResponse } from "./types/messages";
import AbaplintWorker from "./workers/abaplintWorker?worker";

const DEFAULT_CODE = `REPORT ztest.
WRITE 'Hello, ABAP Dojo!'.`;

function App() {
  const [source, setSource] = useState(DEFAULT_CODE);
  const [lintIssues, setLintIssues] = useState<LintIssue[]>([]);
  const workerRef = useRef<Worker | null>(null);

  useEffect(() => {
    const worker = new AbaplintWorker();
    workerRef.current = worker;

    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const data = event.data;
      if (data.type === "lint-result") {
        setLintIssues(data.issues);
      }
    };

    return () => worker.terminate();
  }, []);

  const requestLint = useCallback(
    debounce((code: string) => {
      workerRef.current?.postMessage({ type: "lint", source: code });
    }, 400),
    [],
  );

  const handleChange = useCallback(
    (value: string) => {
      setSource(value);
      requestLint(value);
    },
    [requestLint],
  );

  // Trigger initial lint
  useEffect(() => {
    requestLint(source);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="h-screen flex flex-col bg-gray-900 text-gray-100">
      <header className="flex items-center justify-between px-4 py-2 bg-gray-800 border-b border-gray-700">
        <h1 className="text-lg font-bold tracking-wide">ABAP Dojo</h1>
      </header>
      <main className="flex-1 min-h-0">
        <EditorPanel
          value={source}
          onChange={handleChange}
          lintIssues={lintIssues}
        />
      </main>
    </div>
  );
}

export default App;
