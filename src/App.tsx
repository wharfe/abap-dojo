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
} from "./components/ExecutionSandbox";
import { debounce } from "./utils/debounce";
import { encodeSource, decodeSource } from "./utils/urlShare";
import type { LintIssue, WorkerResponse } from "./types/messages";
import type { Sample } from "./samples";
import type { AppMode, StageResult, ValidationStage } from "./types/validation";
import AbaplintWorker from "./workers/abaplintWorker?worker";

const DEFAULT_CODE = `REPORT ztest.
WRITE 'Hello, ABAP Dojo!'.`;

function parseHash(): { mode: AppMode; code: string | null } {
  const hash = window.location.hash;
  if (!hash || hash === "#") return { mode: "playground", code: null };

  const params = new URLSearchParams(hash.slice(1));
  const mode = params.get("mode") === "validator" ? "validator" : "playground";
  const codeParam = params.get("code");
  const code = codeParam ? decodeSource(codeParam) : null;
  return { mode, code };
}

function getInitialState(): { mode: AppMode; code: string } {
  const { mode, code } = parseHash();
  return { mode, code: code ?? DEFAULT_CODE };
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
  const initial = getInitialState();
  const [mode, setMode] = useState<AppMode>(initial.mode);
  const [source, setSource] = useState(initial.code);
  const [lintIssues, setLintIssues] = useState<LintIssue[]>([]);
  const [output, setOutput] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [activeTab, setActiveTab] = useState<OutputTab>("output");

  // Validation state
  const [isValidating, setIsValidating] = useState(false);
  const [validationStages, setValidationStages] =
    useState<Record<ValidationStage, StageResult>>(INITIAL_STAGES);

  // Track which requestId belongs to each execution context
  const validationRequestIdRef = useRef<string | null>(null);
  const playgroundRequestIdRef = useRef<string>("");

  const sandboxRef = useRef<ExecutionSandboxHandle>(null);

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

  // Initialize worker
  useEffect(() => {
    const worker = new AbaplintWorker();
    appWorker = worker;

    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const data = event.data;

      // Playground messages
      if (data.type === "lint-result") {
        setLintIssues(data.issues);
      } else if (data.type === "transpile-result") {
        sandboxRef.current?.execute(data.js, playgroundRequestIdRef.current);
      } else if (data.type === "transpile-error") {
        setError(
          data.line
            ? `Transpile error (L${data.line}): ${data.message}`
            : `Transpile error: ${data.message}`,
        );
        setIsRunning(false);
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
          setIsValidating(false);
        }
        if (data.stage === "runtime" && data.result.status === "skipped") {
          setIsValidating(false);
        }
      }
    };

    return () => {
      worker.terminate();
      appWorker = null;
    };
  }, []);

  // Sandbox callbacks — requestId disambiguates playground vs validation
  const handleOutput = useCallback((text: string, requestId: string) => {
    if (requestId === validationRequestIdRef.current) {
      // Validation runtime output — we only care about success/failure, not output
      return;
    }
    setOutput((prev) => [...prev, text]);
  }, []);

  const handleError = useCallback((message: string, requestId: string) => {
    if (requestId === validationRequestIdRef.current) {
      setValidationStages((prev) => ({
        ...prev,
        runtime: { status: "fail", error: message },
      }));
      validationRequestIdRef.current = null;
      setIsValidating(false);
      return;
    }
    setError(message);
    setIsRunning(false);
  }, []);

  const handleDone = useCallback((requestId: string) => {
    if (requestId === validationRequestIdRef.current) {
      setValidationStages((prev) => ({
        ...prev,
        runtime: { status: "pass" },
      }));
      validationRequestIdRef.current = null;
      setIsValidating(false);
      return;
    }
    setIsRunning(false);
  }, []);

  const handleChange = useCallback((value: string) => {
    setSource(value);
    debouncedLint(value);
  }, []);

  // Initial lint
  useEffect(() => {
    debouncedLint(source);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Run (Playground mode)
  const handleRun = useCallback(() => {
    setOutput([]);
    setError(null);
    setIsRunning(true);
    setActiveTab("output");
    playgroundRequestIdRef.current = crypto.randomUUID();
    appWorker?.postMessage({ type: "transpile", source });
  }, [source]);

  // Validate (Validator mode)
  const handleValidate = useCallback(() => {
    validationRequestIdRef.current = null;
    setIsValidating(true);
    setValidationStages({
      syntax: { status: "pending" },
      lint: { status: "pending" },
      transpile: { status: "pending" },
      runtime: { status: "pending" },
    });
    appWorker?.postMessage({ type: "validate", source });
  }, [source]);

  // Mode change
  const handleModeChange = useCallback(
    (newMode: AppMode) => {
      setMode(newMode);
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
    [source],
  );

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
    const modeParam = mode === "validator" ? `mode=${mode}&` : "";
    const url = `${window.location.origin}${window.location.pathname}#${modeParam}code=${encoded}`;
    if (url.length > 2000) {
      alert("Warning: URL is very long and may not work in all browsers.");
    }
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
              output={output}
              error={error}
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
      />
    </div>
  );
}

export default App;
