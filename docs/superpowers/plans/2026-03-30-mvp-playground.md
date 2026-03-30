# MVP Playground Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a browser-based ABAP playground where users can write, lint, and execute ABAP code entirely client-side.

**Architecture:** React+Vite app with Monaco Editor. abaplint core+transpiler run in a Web Worker for non-blocking lint and transpile. Transpiled JS executes in a sandboxed iframe (srcdoc, allow-scripts only) with @abaplint/runtime inlined. All communication via typed postMessage channels.

**Tech Stack:** React 19, TypeScript, Vite, Tailwind CSS v4, Monaco Editor, @abaplint/core, @abaplint/transpiler, @abaplint/runtime, pako

**Spec:** `docs/superpowers/specs/2026-03-30-mvp-playground-design.md`

**Security context:** This app transpiles ABAP to JS and executes it. Code execution is isolated inside a sandboxed iframe (`sandbox="allow-scripts"` only, no `allow-same-origin`). The iframe cannot access the parent page's DOM, cookies, localStorage, or origin. This is a deliberate security architecture — the sandbox provides the isolation boundary, and dynamic code execution within it is the intended functionality of the product.

---

## File Structure

```
src/
  types/
    messages.ts           # Worker & Sandbox message type definitions
  workers/
    abaplintWorker.ts     # Web Worker: lint + transpile via abaplint
  components/
    EditorPanel.tsx        # Monaco Editor wrapper with ABAP language + lint markers
    OutputPanel.tsx        # Execution output + lint issues display
    Toolbar.tsx            # Run / Sample / Share buttons
    SampleSelector.tsx     # Sample code preset dropdown
    ExecutionSandbox.tsx   # Sandboxed iframe manager with timeout
  sandbox/
    runner.html            # iframe srcdoc template (runtime + execute logic)
  samples/
    index.ts              # Sample code registry
  utils/
    urlShare.ts           # URL hash encode/decode with pako
    debounce.ts           # debounce utility
  App.tsx                 # Root layout + state
  main.tsx                # Vite entry point
  index.css               # Tailwind directives
public/
  index.html
vite.config.ts
tsconfig.json
```

---

### Task 1: Project Scaffolding

**Files:**
- Create: `package.json`, `vite.config.ts`, `tsconfig.json`, `src/main.tsx`, `src/App.tsx`, `src/index.css`, `index.html`

- [ ] **Step 1: Initialize Vite project**

```bash
cd /home/feathach/dev/abap-dojo
npm create vite@latest . -- --template react-ts
```

Answer `y` if prompted to overwrite existing files (only CLAUDE.md and docs exist).

- [ ] **Step 2: Install dependencies**

```bash
npm install @abaplint/core @abaplint/transpiler @abaplint/runtime @monaco-editor/react monaco-editor pako
npm install -D @types/pako tailwindcss @tailwindcss/vite vitest
```

- [ ] **Step 3: Configure Vite for abaplint CJS packages**

Replace the generated `vite.config.ts` with:

```typescript
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  optimizeDeps: {
    include: [
      "@abaplint/core",
      "@abaplint/transpiler",
      "@abaplint/runtime",
    ],
  },
});
```

- [ ] **Step 4: Configure Tailwind CSS v4**

Replace `src/index.css` with:

```css
@import "tailwindcss";
```

- [ ] **Step 5: Create minimal App shell**

Replace `src/App.tsx` with:

```tsx
function App() {
  return (
    <div className="h-screen flex flex-col bg-gray-900 text-gray-100">
      <header className="flex items-center justify-between px-4 py-2 bg-gray-800 border-b border-gray-700">
        <h1 className="text-lg font-bold tracking-wide">ABAP Dojo</h1>
      </header>
      <main className="flex-1 flex items-center justify-center">
        <p className="text-gray-400">Playground coming soon...</p>
      </main>
    </div>
  );
}

export default App;
```

- [ ] **Step 6: Verify dev server starts**

```bash
npm run dev
```

Expected: Vite dev server starts, browser shows "ABAP Dojo" header with "Playground coming soon..." text. No console errors.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "Scaffold Vite + React + TypeScript + Tailwind project

Install abaplint core/transpiler/runtime, Monaco Editor, pako.
Configure Vite optimizeDeps for CJS abaplint packages."
```

---

### Task 2: Message Types & Utilities

**Files:**
- Create: `src/types/messages.ts`, `src/utils/debounce.ts`, `src/utils/urlShare.ts`
- Test: `src/utils/urlShare.test.ts`, `src/utils/debounce.test.ts`

- [ ] **Step 1: Write URL share tests**

Create `src/utils/urlShare.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { encodeSource, decodeSource } from "./urlShare";

describe("urlShare", () => {
  it("round-trips simple ABAP code", () => {
    const source = "WRITE 'Hello World'.";
    const encoded = encodeSource(source);
    expect(decodeSource(encoded)).toBe(source);
  });

  it("round-trips multiline code", () => {
    const source = "DATA lv_name TYPE string.\nWRITE lv_name.";
    const encoded = encodeSource(source);
    expect(decodeSource(encoded)).toBe(source);
  });

  it("round-trips empty string", () => {
    expect(decodeSource(encodeSource(""))).toBe("");
  });

  it("returns null for invalid input", () => {
    expect(decodeSource("not-valid-base64%%%")).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/utils/urlShare.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement URL share utility**

Create `src/utils/urlShare.ts`:

```typescript
import pako from "pako";

export function encodeSource(source: string): string {
  const compressed = pako.deflate(new TextEncoder().encode(source));
  let binary = "";
  for (let i = 0; i < compressed.length; i++) {
    binary += String.fromCharCode(compressed[i]);
  }
  return btoa(binary);
}

export function decodeSource(encoded: string): string | null {
  try {
    const binary = atob(encoded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    const decompressed = pako.inflate(bytes);
    return new TextDecoder().decode(decompressed);
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Run URL share tests**

```bash
npx vitest run src/utils/urlShare.test.ts
```

Expected: all 4 tests PASS.

- [ ] **Step 5: Write debounce tests**

Create `src/utils/debounce.test.ts`:

```typescript
import { describe, it, expect, vi } from "vitest";
import { debounce } from "./debounce";

describe("debounce", () => {
  it("delays execution", async () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 50);
    debounced("a");
    expect(fn).not.toHaveBeenCalled();
    await new Promise((r) => setTimeout(r, 60));
    expect(fn).toHaveBeenCalledWith("a");
  });

  it("cancels previous call on rapid fire", async () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 50);
    debounced("a");
    debounced("b");
    debounced("c");
    await new Promise((r) => setTimeout(r, 60));
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith("c");
  });
});
```

- [ ] **Step 6: Implement debounce**

Create `src/utils/debounce.ts`:

```typescript
export function debounce<T extends (...args: never[]) => void>(
  fn: T,
  ms: number,
): (...args: Parameters<T>) => void {
  let timer: ReturnType<typeof setTimeout>;
  return (...args: Parameters<T>) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}
```

- [ ] **Step 7: Run debounce tests**

```bash
npx vitest run src/utils/debounce.test.ts
```

Expected: 2 tests PASS.

- [ ] **Step 8: Create message type definitions**

Create `src/types/messages.ts`:

```typescript
export interface LintIssue {
  message: string;
  key: string;
  startLine: number;
  startCol: number;
  endLine: number;
  endCol: number;
  severity: "error" | "warning" | "info";
}

// Worker messages
export type WorkerRequest =
  | { type: "lint"; source: string }
  | { type: "transpile"; source: string };

export type WorkerResponse =
  | { type: "lint-result"; issues: LintIssue[] }
  | { type: "transpile-result"; js: string }
  | { type: "transpile-error"; message: string; line?: number };

// Sandbox messages
export type SandboxRequest = { type: "execute"; js: string };

export type SandboxResponse =
  | { type: "output"; text: string }
  | { type: "error"; message: string }
  | { type: "done" };
```

- [ ] **Step 9: Verify all tests pass**

```bash
npx vitest run
```

Expected: all tests pass, TypeScript compiles cleanly.

- [ ] **Step 10: Commit**

```bash
git add src/types/ src/utils/
git commit -m "Add message types, URL share, and debounce utilities

Typed discriminated unions for Worker and Sandbox channels.
pako-based URL encoding with deflate compression.
Debounce utility for lint throttling."
```

---

### Task 3: Monaco Editor with ABAP Language

**Files:**
- Create: `src/components/EditorPanel.tsx`

- [ ] **Step 1: Create EditorPanel component**

Create `src/components/EditorPanel.tsx`:

```tsx
import { useRef, useCallback } from "react";
import Editor, { BeforeMount, OnMount } from "@monaco-editor/react";
import type { editor, MarkerSeverity } from "monaco-editor";
import type { LintIssue } from "../types/messages";

const ABAP_MONARCH_TOKENIZER = {
  defaultToken: "",
  ignoreCase: true,
  tokenizer: {
    root: [
      [/^\*.*$/, "comment"],
      [/".*$/, "comment"],
      [/'[^']*'/, "string"],
      [/`[^`]*`/, "string"],
      [
        /\b(REPORT|WRITE|DATA|TYPES|CONSTANTS|FIELD-SYMBOLS|IF|ELSE|ELSEIF|ENDIF|DO|ENDDO|WHILE|ENDWHILE|LOOP|ENDLOOP|AT|ENDAT|CASE|WHEN|ENDCASE|CLASS|ENDCLASS|METHOD|ENDMETHOD|FORM|ENDFORM|PERFORM|FUNCTION|ENDFUNCTION|MODULE|ENDMODULE|TRY|CATCH|ENDTRY|RAISE|SELECT|ENDSELECT|INSERT|UPDATE|DELETE|MODIFY|APPEND|READ|TABLE|INTO|FROM|WHERE|AND|OR|NOT|IS|INITIAL|BOUND|ASSIGNED|MOVE|CLEAR|FREE|SORT|DESCRIBE|CALL|RETURN|EXPORTING|IMPORTING|CHANGING|RECEIVING|EXCEPTIONS|CREATE|OBJECT|NEW|VALUE|REF|CONV|COND|SWITCH|CORRESPONDING|REDUCE|FILTER|FOR|IN|THEN|LET|BASE|LINES|OF|TYPE|LIKE|STANDARD|SORTED|HASHED|ASSIGNING|REFERENCE|CONCATENATE|CONDENSE|TRANSLATE|SHIFT|REPLACE|FIND|SPLIT|OVERLAY|SEARCH|STRLEN|SUBSTRING|TO|UPPER|LOWER|USING|KEY|WITH|INDEX|TRANSPORTING|NO|FIELDS|ABAP_TRUE|ABAP_FALSE|SY|SYST|ME|SUPER)\b/,
        "keyword",
      ],
      [/\b(STRING|INT4|INT8|CHAR|NUMC|DATS|TIMS|DEC|FLOAT|XSTRING|I|C|N|D|T|F|P|X)\b/, "type"],
      [/\b\d+\b/, "number"],
      [/[{}()[\]]/, "delimiter.bracket"],
      [/[.,;:]/, "delimiter"],
      [/[-+*/=<>&]/, "operator"],
    ],
  },
};

interface EditorPanelProps {
  value: string;
  onChange: (value: string) => void;
  lintIssues: LintIssue[];
}

export function EditorPanel({ value, onChange, lintIssues }: EditorPanelProps) {
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<typeof import("monaco-editor") | null>(null);

  const handleBeforeMount: BeforeMount = (monaco) => {
    monaco.languages.register({ id: "abap" });
    monaco.languages.setMonarchTokensProvider(
      "abap",
      ABAP_MONARCH_TOKENIZER as never,
    );
  };

  const handleMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;
  };

  const handleChange = useCallback(
    (val: string | undefined) => {
      onChange(val ?? "");
    },
    [onChange],
  );

  // Update lint markers when issues change
  const monaco = monacoRef.current;
  const editorInstance = editorRef.current;
  if (monaco && editorInstance) {
    const model = editorInstance.getModel();
    if (model) {
      const severityMap: Record<string, MarkerSeverity> = {
        error: monaco.MarkerSeverity.Error,
        warning: monaco.MarkerSeverity.Warning,
        info: monaco.MarkerSeverity.Info,
      };
      monaco.editor.setModelMarkers(
        model,
        "abaplint",
        lintIssues.map((issue) => ({
          startLineNumber: issue.startLine,
          startColumn: issue.startCol,
          endLineNumber: issue.endLine,
          endColumn: issue.endCol,
          message: `[${issue.key}] ${issue.message}`,
          severity: severityMap[issue.severity] ?? monaco.MarkerSeverity.Info,
        })),
      );
    }
  }

  return (
    <Editor
      height="100%"
      language="abap"
      theme="vs-dark"
      value={value}
      beforeMount={handleBeforeMount}
      onMount={handleMount}
      onChange={handleChange}
      options={{
        minimap: { enabled: false },
        fontSize: 14,
        lineNumbers: "on",
        scrollBeyondLastLine: false,
        automaticLayout: true,
        wordWrap: "on",
        tabSize: 2,
      }}
    />
  );
}
```

- [ ] **Step 2: Wire EditorPanel into App**

Replace `src/App.tsx` with:

```tsx
import { useState } from "react";
import { EditorPanel } from "./components/EditorPanel";

const DEFAULT_CODE = `REPORT ztest.
WRITE 'Hello, ABAP Dojo!'.`;

function App() {
  const [source, setSource] = useState(DEFAULT_CODE);

  return (
    <div className="h-screen flex flex-col bg-gray-900 text-gray-100">
      <header className="flex items-center justify-between px-4 py-2 bg-gray-800 border-b border-gray-700">
        <h1 className="text-lg font-bold tracking-wide">ABAP Dojo</h1>
      </header>
      <main className="flex-1 min-h-0">
        <EditorPanel value={source} onChange={setSource} lintIssues={[]} />
      </main>
    </div>
  );
}

export default App;
```

- [ ] **Step 3: Verify Monaco Editor renders**

```bash
npm run dev
```

Expected: Browser shows ABAP Dojo header with Monaco Editor below. ABAP keywords are syntax-highlighted. Typing works.

- [ ] **Step 4: Commit**

```bash
git add src/components/EditorPanel.tsx src/App.tsx
git commit -m "Add Monaco Editor with ABAP syntax highlighting

Monarch tokenizer for ABAP keywords, types, strings, comments.
EditorPanel component with lint marker support."
```

---

### Task 4: abaplint Web Worker

**Files:**
- Create: `src/workers/abaplintWorker.ts`

- [ ] **Step 1: Create the Web Worker**

Create `src/workers/abaplintWorker.ts`:

```typescript
import { Registry, MemoryFile, Config, Issue } from "@abaplint/core";
import { Transpiler, config as transpilerConfig } from "@abaplint/transpiler";
import type { WorkerRequest, WorkerResponse, LintIssue } from "../types/messages";

const abaplintConfig = new Config(JSON.stringify(transpilerConfig));

function mapSeverity(s: string): LintIssue["severity"] {
  if (s === "Error") return "error";
  if (s === "Warning") return "warning";
  return "info";
}

function issueToLintIssue(issue: Issue): LintIssue {
  const start = issue.getStart();
  const end = issue.getEnd();
  return {
    message: issue.getMessage(),
    key: issue.getKey(),
    startLine: start.getRow(),
    startCol: start.getCol(),
    endLine: end.getRow(),
    endCol: end.getCol(),
    severity: mapSeverity(issue.getSeverity().toString()),
  };
}

async function handleLint(source: string): Promise<WorkerResponse> {
  const reg = new Registry(abaplintConfig);
  reg.addFile(new MemoryFile("ztest.prog.abap", source));
  await reg.parseAsync();
  const issues = reg.findIssues().map(issueToLintIssue);
  return { type: "lint-result", issues };
}

async function handleTranspile(source: string): Promise<WorkerResponse> {
  try {
    const reg = new Registry(abaplintConfig);
    reg.addFile(new MemoryFile("ztest.prog.abap", source));
    await reg.parseAsync();

    // Check for parser errors first
    const issues = reg.findIssues();
    const errors = issues.filter((i) => i.getSeverity().toString() === "Error");
    if (errors.length > 0) {
      const first = errors[0];
      return {
        type: "transpile-error",
        message: first.getMessage(),
        line: first.getStart().getRow(),
      };
    }

    const transpiler = new Transpiler({ ignoreSourceMap: true });
    const output = await transpiler.run(reg);

    // Combine all transpiled chunks into a single JS string
    const jsChunks = output.objects.map((o) => o.chunk.getCode());
    const js = [
      ...jsChunks,
      output.initializationScript,
      output.initializationScript2,
    ].join("\n");

    return { type: "transpile-result", js };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { type: "transpile-error", message: msg };
  }
}

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const request = event.data;
  let response: WorkerResponse;

  if (request.type === "lint") {
    response = await handleLint(request.source);
  } else if (request.type === "transpile") {
    response = await handleTranspile(request.source);
  } else {
    return;
  }

  self.postMessage(response);
};
```

- [ ] **Step 2: Verify worker compiles and config import works**

```bash
npx tsc --noEmit
```

Expected: no type errors.

**Important:** The `config` export from `@abaplint/transpiler` may not exist in all versions. If `import { config as transpilerConfig }` fails at compile time or runtime:
- **Fallback:** Replace with `Config.getDefault(Version.OpenABAP)` from `@abaplint/core`
- Add `Version` to the import: `import { Registry, MemoryFile, Config, Issue, Version } from "@abaplint/core"`
- Replace `const abaplintConfig = new Config(JSON.stringify(transpilerConfig))` with `const abaplintConfig = Config.getDefault(Version.OpenABAP)`

- [ ] **Step 3: Manual smoke test — start dev server and verify Worker initializes**

```bash
npm run dev
```

Open browser DevTools console. The Worker should load without errors. If there are import errors in the Worker, check:
- Vite `worker.format` config may need adjustment
- CJS imports may need `optimizeDeps` for worker bundles

- [ ] **Step 4: Commit**

```bash
git add src/workers/abaplintWorker.ts
git commit -m "Add abaplint Web Worker for lint and transpile

Uses @abaplint/transpiler recommended config.
Handles lint and transpile requests via postMessage.
ignoreSourceMap to avoid WASM issues in browser."
```

---

### Task 5: Lint Integration (Editor <-> Worker)

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Integrate Worker with debounced linting in App**

Replace `src/App.tsx` with:

```tsx
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
```

- [ ] **Step 2: Verify lint integration works**

```bash
npm run dev
```

Expected: Type some invalid ABAP in the editor. After ~400ms pause, red/yellow squiggles appear under problematic code. Hover shows lint message.

- [ ] **Step 3: Commit**

```bash
git add src/App.tsx
git commit -m "Integrate real-time linting via Web Worker

400ms debounce on editor changes.
Lint issues displayed as Monaco markers."
```

---

### Task 6: Execution Sandbox (iframe)

**Files:**
- Create: `src/components/ExecutionSandbox.tsx`

- [ ] **Step 1: Create ExecutionSandbox component**

Create `src/components/ExecutionSandbox.tsx`:

```tsx
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
  // This will be refined during Task 8 integration based on actual
  // transpiler output inspection.
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"></head><body>
<script>
// Sandbox execution context for transpiled ABAP-to-JS code.
// This iframe is sandboxed (allow-scripts only) and cannot access
// the parent page. Runtime will be injected here during integration.
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
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no type errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/ExecutionSandbox.tsx
git commit -m "Add execution sandbox with iframe isolation and timeout

Sandboxed iframe (allow-scripts only, no allow-same-origin).
postMessage-based communication for execute/output/error/done.
5s timeout with iframe termination for infinite loop protection.
Runtime injection placeholder for Task 8."
```

---

### Task 7: Output Panel

**Files:**
- Create: `src/components/OutputPanel.tsx`

- [ ] **Step 1: Create OutputPanel component**

Create `src/components/OutputPanel.tsx`:

```tsx
import type { LintIssue } from "../types/messages";

type Tab = "output" | "lint";

interface OutputPanelProps {
  output: string[];
  error: string | null;
  lintIssues: LintIssue[];
  isRunning: boolean;
  activeTab: Tab;
  onTabChange: (tab: Tab) => void;
}

const SEVERITY_STYLES: Record<string, string> = {
  error: "text-red-400",
  warning: "text-yellow-400",
  info: "text-blue-400",
};

const SEVERITY_ICONS: Record<string, string> = {
  error: "\u2717",
  warning: "\u26A0",
  info: "\u24D8",
};

export function OutputPanel({
  output,
  error,
  lintIssues,
  isRunning,
  activeTab,
  onTabChange,
}: OutputPanelProps) {
  return (
    <div className="flex flex-col h-full bg-gray-900">
      {/* Tab bar */}
      <div className="flex border-b border-gray-700">
        <button
          className={`px-4 py-2 text-sm font-medium ${
            activeTab === "output"
              ? "text-white border-b-2 border-blue-500"
              : "text-gray-400 hover:text-gray-200"
          }`}
          onClick={() => onTabChange("output")}
        >
          Output
        </button>
        <button
          className={`px-4 py-2 text-sm font-medium ${
            activeTab === "lint"
              ? "text-white border-b-2 border-blue-500"
              : "text-gray-400 hover:text-gray-200"
          }`}
          onClick={() => onTabChange("lint")}
        >
          Lint ({lintIssues.length})
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-4 font-mono text-sm">
        {activeTab === "output" && (
          <>
            {isRunning && (
              <p className="text-gray-400">Running...</p>
            )}
            {error && (
              <p className="text-red-400 whitespace-pre-wrap">{error}</p>
            )}
            {output.map((line, i) => (
              <p key={i} className="text-green-300 whitespace-pre-wrap">
                {line}
              </p>
            ))}
            {!isRunning && !error && output.length === 0 && (
              <p className="text-gray-500">
                Click Run to execute your ABAP code.
              </p>
            )}
          </>
        )}

        {activeTab === "lint" && (
          <>
            {lintIssues.length === 0 ? (
              <p className="text-gray-500">No issues found.</p>
            ) : (
              <ul className="space-y-1">
                {lintIssues.map((issue, i) => (
                  <li key={i} className={SEVERITY_STYLES[issue.severity]}>
                    {SEVERITY_ICONS[issue.severity]} L{issue.startLine}:{issue.startCol}{" "}
                    [{issue.key}] {issue.message}
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no type errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/OutputPanel.tsx
git commit -m "Add OutputPanel with output and lint tabs

Displays execution output, errors, and lint issues.
Tab-based UI with severity icons and coloring."
```

---

### Task 8: App Layout + Toolbar + Full Integration

**Files:**
- Create: `src/components/Toolbar.tsx`
- Modify: `src/App.tsx`, `src/components/ExecutionSandbox.tsx`

- [ ] **Step 1: Create Toolbar component**

Create `src/components/Toolbar.tsx`:

```tsx
interface ToolbarProps {
  onRun: () => void;
  isRunning: boolean;
  onShare: () => void;
}

export function Toolbar({ onRun, isRunning, onShare }: ToolbarProps) {
  return (
    <div className="flex items-center gap-2 px-4 py-2 bg-gray-800 border-b border-gray-700">
      <button
        onClick={onRun}
        disabled={isRunning}
        className="flex items-center gap-1.5 px-4 py-1.5 bg-green-600 hover:bg-green-500 disabled:bg-gray-600 disabled:cursor-not-allowed text-white text-sm font-medium rounded transition-colors"
      >
        {isRunning ? "Running..." : "\u25B6 Run"}
      </button>
      <button
        onClick={onShare}
        className="flex items-center gap-1.5 px-4 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-200 text-sm font-medium rounded transition-colors"
      >
        Share
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Wire everything together in App**

Replace `src/App.tsx` with the full integrated version:

```tsx
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

type OutputTab = "output" | "lint";

function App() {
  const [source, setSource] = useState(getInitialCode);
  const [lintIssues, setLintIssues] = useState<LintIssue[]>([]);
  const [output, setOutput] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [activeTab, setActiveTab] = useState<OutputTab>("output");

  const workerRef = useRef<Worker | null>(null);
  const sandboxRef = useRef<ExecutionSandboxHandle>(null);

  // Initialize worker
  useEffect(() => {
    const worker = new AbaplintWorker();
    workerRef.current = worker;

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

    return () => worker.terminate();
  }, []);

  // Debounced lint
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

  // Initial lint
  useEffect(() => {
    requestLint(source);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Run
  const handleRun = useCallback(() => {
    setOutput([]);
    setError(null);
    setIsRunning(true);
    setActiveTab("output");
    workerRef.current?.postMessage({ type: "transpile", source });
  }, [source]);

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
      />

      <main className="flex-1 min-h-0 flex">
        {/* Editor */}
        <div className="w-1/2 min-h-0 border-r border-gray-700">
          <EditorPanel
            value={source}
            onChange={handleChange}
            lintIssues={lintIssues}
          />
        </div>

        {/* Output */}
        <div className="w-1/2 min-h-0">
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
```

- [ ] **Step 3: Verify full app compiles and renders**

```bash
npm run dev
```

Expected: Split-pane layout with editor on left, output on right. Toolbar with Run and Share buttons. Lint markers appear after typing.

- [ ] **Step 4: Inspect transpiler output to understand runtime dependencies**

This is the most critical investigation step. Run the transpiler and examine what the output JS expects:

1. Open browser DevTools, add `console.log(data.js)` temporarily in `App.tsx`'s `transpile-result` handler
2. Click Run with `REPORT ztest.\nWRITE 'Hello'.`
3. Inspect the generated JS and answer these questions:
   - What globals does it reference? (e.g., `abap.statements.write()`, `require("@abaplint/runtime")`)
   - How is WRITE translated? (likely `abap.statements.write()` or similar)
   - Does it use `require()` or assume globals?

- [ ] **Step 5: Bundle @abaplint/runtime for iframe injection**

Try these approaches in order (stop at the first one that works):

**Approach 1 (try first):** esbuild one-liner
```bash
npx esbuild node_modules/@abaplint/runtime/src/index.ts --bundle --format=iife --global-name=abaplintRuntime --outfile=src/sandbox/runtime-bundle.js
```
If this fails (e.g., TypeScript source not in node_modules, or missing deps), try:
```bash
npx esbuild node_modules/@abaplint/runtime/build/src/index.js --bundle --format=iife --global-name=abaplintRuntime --outfile=src/sandbox/runtime-bundle.js
```

**Approach 2:** Vite lib mode — create `vite.config.sandbox.ts` to build runtime as a standalone IIFE bundle.

**Approach 3 (last resort):** Inspect what the transpiled JS actually `require()`s from runtime and manually extract only the needed functions into `src/sandbox/runtime-bundle.js`.

Import the bundle as a raw string:
```typescript
import runtimeBundle from "../sandbox/runtime-bundle.js?raw";
```

- [ ] **Step 6: Hook up WRITE output capture in sandbox**

The transpiler converts WRITE to a runtime function call (likely `abap.statements.write()`). The runtime's `MemoryConsole` captures this output. In the sandbox, we need to:

1. Read the runtime's write function implementation to understand how output is buffered
2. Monkey-patch or configure the console to send output via postMessage

Update `buildSandboxHtml()` in `ExecutionSandbox.tsx`. The pattern will look something like:

```typescript
import runtimeBundle from "../sandbox/runtime-bundle.js?raw";

function buildSandboxHtml(): string {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"></head><body>
<script>${runtimeBundle}</script>
<script>
// Execution context for transpiled ABAP-to-JS within sandboxed iframe.
// iframe sandbox="allow-scripts" (no allow-same-origin) provides isolation.
window.addEventListener("message", async function(event) {
  if (!event.data || event.data.type !== "execute") return;
  try {
    // Initialize runtime with custom console that captures WRITE output.
    // The exact setup depends on how the transpiled JS references the runtime.
    // MemoryConsole.get() retrieves accumulated WRITE output.
    var AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
    var fn = new AsyncFunction(event.data.js);
    await fn();

    // After execution, retrieve WRITE output from the runtime console
    // and send it to the parent via postMessage.
    // Exact API: inspect step 4 output to determine how to access the console.
    window.parent.postMessage({ type: "done" }, "*");
  } catch (e) {
    window.parent.postMessage({ type: "error", message: e.message || String(e) }, "*");
  }
});
</script></body></html>`;
}
```

**Key investigation items for this step:**
- How the transpiled JS references `abap` (global? parameter? require?)
- Where `MemoryConsole` or equivalent is instantiated
- Whether `console.add()` is the write sink and can be overridden to call `postMessage`

This step is exploratory — adapt based on actual transpiler output from Step 4.

- [ ] **Step 5: Test end-to-end execution**

```bash
npm run dev
```

Type `REPORT ztest.` + newline + `WRITE 'Hello'.` and click Run.

Expected: "Hello" appears in the Output panel. If runtime errors occur, debug by inspecting the transpiled JS output in DevTools.

- [ ] **Step 6: Commit**

```bash
git add src/components/Toolbar.tsx src/components/ExecutionSandbox.tsx src/App.tsx
git commit -m "Full app integration: toolbar, split layout, run pipeline

Editor + lint + transpile + sandbox execution pipeline.
URL hash sharing with pako compression.
Split-pane layout with output/lint tabs."
```

---

### Task 9: Sample Code Library

**Files:**
- Create: `src/samples/index.ts`, `src/components/SampleSelector.tsx`
- Modify: `src/App.tsx`, `src/components/Toolbar.tsx`

- [ ] **Step 1: Create sample code definitions**

Create `src/samples/index.ts`:

```typescript
export interface Sample {
  id: string;
  title: string;
  description: string;
  code: string;
}

export const samples: Sample[] = [
  {
    id: "hello-world",
    title: "Hello World",
    description: "Basic WRITE statement",
    code: `REPORT ztest_hello.

WRITE 'Hello, ABAP Dojo!'.
WRITE / 'Welcome to the playground.'.
`,
  },
  {
    id: "variables-conditions",
    title: "Variables & Conditions",
    description: "DATA declarations, IF/CASE",
    code: `REPORT ztest_cond.

DATA lv_score TYPE i VALUE 85.
DATA lv_grade TYPE c LENGTH 1.

IF lv_score >= 90.
  lv_grade = 'A'.
ELSEIF lv_score >= 80.
  lv_grade = 'B'.
ELSEIF lv_score >= 70.
  lv_grade = 'C'.
ELSE.
  lv_grade = 'F'.
ENDIF.

WRITE: 'Score:', lv_score.
WRITE: / 'Grade:', lv_grade.

CASE lv_grade.
  WHEN 'A'.
    WRITE / 'Excellent!'.
  WHEN 'B'.
    WRITE / 'Good job!'.
  WHEN OTHERS.
    WRITE / 'Keep trying!'.
ENDCASE.
`,
  },
  {
    id: "internal-tables",
    title: "Internal Tables",
    description: "LOOP AT, APPEND, READ TABLE",
    code: `REPORT ztest_itab.

TYPES: BEGIN OF ty_person,
         name TYPE string,
         age  TYPE i,
       END OF ty_person.

DATA lt_people TYPE STANDARD TABLE OF ty_person WITH DEFAULT KEY.
DATA ls_person TYPE ty_person.

ls_person-name = 'Alice'.
ls_person-age = 30.
APPEND ls_person TO lt_people.

ls_person-name = 'Bob'.
ls_person-age = 25.
APPEND ls_person TO lt_people.

ls_person-name = 'Charlie'.
ls_person-age = 35.
APPEND ls_person TO lt_people.

LOOP AT lt_people INTO ls_person.
  WRITE: / ls_person-name, ls_person-age.
ENDLOOP.

WRITE: / 'Total:', LINES( lt_people ), 'people'.
`,
  },
  {
    id: "string-processing",
    title: "String Processing",
    description: "CONCATENATE, && operator",
    code: `REPORT ztest_string.

DATA lv_first TYPE string VALUE 'Hello'.
DATA lv_last  TYPE string VALUE 'World'.
DATA lv_result TYPE string.

* Concatenation with &&
lv_result = lv_first && ' ' && lv_last.
WRITE lv_result.

* CONCATENATE statement
CONCATENATE lv_first lv_last INTO lv_result SEPARATED BY ', '.
WRITE / lv_result.

* String length
WRITE: / 'Length:', STRLEN( lv_result ).

* Case conversion
TRANSLATE lv_result TO UPPER CASE.
WRITE: / 'Upper:', lv_result.

TRANSLATE lv_result TO LOWER CASE.
WRITE: / 'Lower:', lv_result.
`,
  },
  {
    id: "oo-basics",
    title: "OO Basics",
    description: "CLASS definition, methods",
    code: `REPORT ztest_oo.

CLASS lcl_calculator DEFINITION.
  PUBLIC SECTION.
    METHODS add
      IMPORTING iv_a TYPE i
                iv_b TYPE i
      RETURNING VALUE(rv_result) TYPE i.
    METHODS multiply
      IMPORTING iv_a TYPE i
                iv_b TYPE i
      RETURNING VALUE(rv_result) TYPE i.
ENDCLASS.

CLASS lcl_calculator IMPLEMENTATION.
  METHOD add.
    rv_result = iv_a + iv_b.
  ENDMETHOD.
  METHOD multiply.
    rv_result = iv_a * iv_b.
  ENDMETHOD.
ENDCLASS.

DATA lo_calc TYPE REF TO lcl_calculator.

CREATE OBJECT lo_calc.

DATA lv_sum TYPE i.
DATA lv_product TYPE i.

lv_sum = lo_calc->add( iv_a = 10 iv_b = 20 ).
lv_product = lo_calc->multiply( iv_a = 5 iv_b = 6 ).

WRITE: 'Sum:', lv_sum.
WRITE: / 'Product:', lv_product.
`,
  },
  {
    id: "modern-syntax",
    title: "Modern Syntax",
    description: "Inline declarations, VALUE, NEW",
    code: `REPORT ztest_modern.

* Note: modern syntax features require ABAP 7.40+
* The transpiler may apply downport rules automatically.

CLASS lcl_calculator DEFINITION.
  PUBLIC SECTION.
    METHODS double
      IMPORTING iv_val TYPE i
      RETURNING VALUE(rv_result) TYPE i.
ENDCLASS.

CLASS lcl_calculator IMPLEMENTATION.
  METHOD double.
    rv_result = iv_val * 2.
  ENDMETHOD.
ENDCLASS.

DATA lo_calc TYPE REF TO lcl_calculator.

CREATE OBJECT lo_calc.

DATA lv_result TYPE i.
lv_result = lo_calc->double( 21 ).
WRITE: 'Double of 21:', lv_result.
`,
  },
];
```

- [ ] **Step 2: Create SampleSelector component**

Create `src/components/SampleSelector.tsx`:

```tsx
import { samples, type Sample } from "../samples";

interface SampleSelectorProps {
  onSelect: (sample: Sample) => void;
}

export function SampleSelector({ onSelect }: SampleSelectorProps) {
  return (
    <select
      className="px-3 py-1.5 bg-gray-700 text-gray-200 text-sm rounded border border-gray-600 focus:outline-none focus:border-blue-500"
      defaultValue=""
      onChange={(e) => {
        const sample = samples.find((s) => s.id === e.target.value);
        if (sample) {
          onSelect(sample);
          e.target.value = "";
        }
      }}
    >
      <option value="" disabled>
        Samples...
      </option>
      {samples.map((s) => (
        <option key={s.id} value={s.id}>
          {s.title}
        </option>
      ))}
    </select>
  );
}
```

- [ ] **Step 3: Update Toolbar to include SampleSelector**

Replace `src/components/Toolbar.tsx` with:

```tsx
import { SampleSelector } from "./SampleSelector";
import type { Sample } from "../samples";

interface ToolbarProps {
  onRun: () => void;
  isRunning: boolean;
  onShare: () => void;
  onSelectSample: (sample: Sample) => void;
}

export function Toolbar({ onRun, isRunning, onShare, onSelectSample }: ToolbarProps) {
  return (
    <div className="flex items-center gap-2 px-4 py-2 bg-gray-800 border-b border-gray-700">
      <button
        onClick={onRun}
        disabled={isRunning}
        className="flex items-center gap-1.5 px-4 py-1.5 bg-green-600 hover:bg-green-500 disabled:bg-gray-600 disabled:cursor-not-allowed text-white text-sm font-medium rounded transition-colors"
      >
        {isRunning ? "Running..." : "\u25B6 Run"}
      </button>
      <SampleSelector onSelect={onSelectSample} />
      <div className="flex-1" />
      <button
        onClick={onShare}
        className="flex items-center gap-1.5 px-4 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-200 text-sm font-medium rounded transition-colors"
      >
        Share
      </button>
    </div>
  );
}
```

- [ ] **Step 4: Wire sample selection into App**

In `src/App.tsx`, add the following:

Add import at the top:
```tsx
import type { Sample } from "./samples";
```

Add handler inside the App component:
```tsx
  const handleSelectSample = useCallback((sample: Sample) => {
    setSource(sample.code);
    setOutput([]);
    setError(null);
    requestLint(sample.code);
  }, [requestLint]);
```

Update Toolbar JSX to pass the new prop:
```tsx
      <Toolbar
        onRun={handleRun}
        isRunning={isRunning}
        onShare={handleShare}
        onSelectSample={handleSelectSample}
      />
```

- [ ] **Step 5: Verify samples load correctly**

```bash
npm run dev
```

Expected: Sample dropdown in toolbar. Selecting a sample loads its code into the editor and triggers lint.

- [ ] **Step 6: Commit**

```bash
git add src/samples/ src/components/SampleSelector.tsx src/components/Toolbar.tsx src/App.tsx
git commit -m "Add sample code library with 6 ABAP presets

Hello World, variables, internal tables, strings, OO basics, modern syntax.
Dropdown selector in toolbar loads samples into editor."
```

---

### Task 10: URL Hash Sharing Polish

**Files:**
- Modify: `src/App.tsx` (already wired in Task 8)

- [ ] **Step 1: Verify URL sharing works end-to-end**

```bash
npm run dev
```

1. Type some code in the editor
2. Click "Share" button
3. Check that the URL hash updates
4. Copy the URL, open in a new tab
5. Verify the code loads from the URL hash

Expected: Code round-trips through URL hash correctly.

- [ ] **Step 2: Commit (if any fixes needed)**

```bash
git add src/App.tsx
git commit -m "Polish URL sharing with clipboard feedback"
```

---

### Task 11: Responsive Design & Final Build

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Make layout responsive**

In `src/App.tsx`, update the `<main>` section to stack vertically on small screens:

```tsx
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
```

- [ ] **Step 2: Verify responsive layout**

```bash
npm run dev
```

Test at various viewport widths. Expected:
- Desktop (>768px): side-by-side editor and output
- Mobile (<768px): editor on top, output below (50/50 vertical split)

- [ ] **Step 3: Run production build**

```bash
npm run build
```

Expected: Build succeeds with no errors.

- [ ] **Step 4: Run all tests**

```bash
npx vitest run
```

Expected: All tests pass.

- [ ] **Step 5: Commit and push**

```bash
git add -A
git commit -m "Responsive layout and production build verification

Stack editor/output vertically on mobile, side-by-side on desktop."
git push
```

---

## Risk Areas

### Task 4: transpiler config import

The `config` export from `@abaplint/transpiler` may not exist in all versions. Fallback: `Config.getDefault(Version.OpenABAP)` from `@abaplint/core`. Task 4 includes a manual smoke test step to catch this early.

### Task 8: runtime injection + WRITE output capture (highest risk)

This is the mountain of the project. Three sub-problems:

1. **CJS import issues in Worker** — Vite may need worker-specific config. If `import` fails in the worker, try `importScripts` or configure Vite's `worker.format`.
2. **Runtime bundling for srcdoc** — The `@abaplint/runtime` needs to be available inside the sandboxed iframe which can't access parent resources. Approach priority with rationale:
   - **Try first:** `npx esbuild` one-liner to bundle runtime as IIFE → `?raw` import (fastest, least config)
   - **If esbuild fails:** Vite lib mode with separate config for runtime bundle
   - **Last resort:** Manually extract only the runtime functions the transpiled JS actually calls
3. **WRITE → postMessage bridge** — The transpiler converts WRITE to a runtime function (likely `abap.statements.write()` → `MemoryConsole.add()`). To get output from the sandbox, we need to either:
   - Configure the runtime's Console implementation to call `window.parent.postMessage`
   - Monkey-patch the write function after runtime initialization
   - Read `MemoryConsole.get()` after execution completes and send in one batch

   Task 8 Steps 4-6 guide this investigation explicitly.
4. **Transpiler output format** — The generated JS may use `require()` or assume globals. Inspect actual output and adjust the sandbox execution accordingly.

### Testing Strategy

- **Unit tests** (Vitest): URL encoding, debounce, sample data structure
- **Manual testing**: lint markers, transpile+execute pipeline, timeout, responsive layout
- **Browser DevTools**: inspect Worker messages, iframe postMessage, console errors

### Definition of Done

- User can type ABAP in Monaco with syntax highlighting
- Lint issues appear as inline markers after 400ms pause
- Run button transpiles and executes, output appears in Output panel
- Errors (transpile/runtime/timeout) display clearly
- 6 sample presets load correctly
- URL sharing works (encode -> copy -> paste -> decode)
- Layout works on desktop and mobile
- All unit tests pass
- Production build succeeds
