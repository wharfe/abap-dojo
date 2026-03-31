# AI Validator Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an AI Validator mode to ABAP Dojo that validates LLM-generated ABAP code through progressive multi-stage checks (syntax, lint, LLM pitfalls, transpile, runtime) with a dedicated Validation Report UI.

**Architecture:** Hybrid mode sharing EditorPanel, abaplintWorker, and ExecutionSandbox with Playground. Mode switcher in header tabs. OutputPanel replaced by ValidationReport in Validator mode. LLM Pitfall Detector runs 4 custom rules (string-char confusion, Python loop patterns, dynamic typing, hallucinated classes) via AST pattern matching in the Web Worker, using JSON+TS two-layer rule architecture.

**Tech Stack:** React + TypeScript, @abaplint/core AST API, Web Workers, Vite, Tailwind CSS, Vitest

**Design Spec:** `docs/superpowers/specs/2026-03-31-ai-validator-design.md`

---

### Task 1: Validation Type Definitions

**Files:**
- Create: `src/types/validation.ts`

- [ ] **Step 1: Create validation types file**

```typescript
// src/types/validation.ts
import type { LintIssue } from "./messages";

export type ValidationStage = "syntax" | "lint" | "transpile" | "runtime";

export type StageStatus = "pending" | "running" | "pass" | "warn" | "fail" | "skipped";

export interface StageResult {
  status: StageStatus;
  issues?: LintIssue[];
  pitfalls?: PitfallMatch[];
  js?: string;
  error?: string;
}

export interface ValidationSummary {
  overall: "pass" | "warn" | "fail";
  totalIssues: number;
  stages: Record<ValidationStage, StageStatus>;
}

export interface PitfallRule {
  id: string;
  severity: "error" | "warning" | "info";
  message: string;
  explanation: string;
  suggestion: string;
}

export interface PitfallMatch {
  ruleId: string;
  message: string;
  explanation: string;
  suggestion: string;
  severity: "error" | "warning" | "info";
  startLine: number;
  startCol: number;
  endLine: number;
  endCol: number;
}

export type AppMode = "playground" | "validator";
```

- [ ] **Step 2: Run type check**

Run: `npx tsc --noEmit`
Expected: PASS (no errors)

- [ ] **Step 3: Commit**

```bash
git add src/types/validation.ts
git commit -m "Add validation type definitions for AI Validator mode"
```

---

### Task 2: Extend Worker Message Types

**Files:**
- Modify: `src/types/messages.ts`

- [ ] **Step 1: Add validate message types to WorkerRequest and WorkerResponse**

Replace the entire contents of `src/types/messages.ts` with:

```typescript
// src/types/messages.ts
import type { ValidationStage, StageResult } from "./validation";

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
  | { type: "transpile"; source: string }
  | { type: "validate"; source: string };

export type WorkerResponse =
  | { type: "lint-result"; issues: LintIssue[] }
  | { type: "transpile-result"; js: string }
  | { type: "transpile-error"; message: string; line?: number }
  | { type: "validate-progress"; stage: ValidationStage; status: "running" | "skipped" }
  | { type: "validate-stage-result"; stage: ValidationStage; result: StageResult };

// Sandbox messages — requestId for disambiguating playground vs validation executions
export type SandboxRequest = { type: "execute"; js: string; requestId: string };

export type SandboxResponse =
  | { type: "output"; text: string; requestId: string }
  | { type: "error"; message: string; requestId: string }
  | { type: "done"; requestId: string };
```

- [ ] **Step 2: Run type check**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 3: Update ExecutionSandbox to use requestId**

The SandboxRequest/Response types now include `requestId`. Update `src/components/ExecutionSandbox.tsx`:

1. Change the `execute` method signature to accept `requestId`:

```typescript
export interface ExecutionSandboxHandle {
  execute: (js: string, requestId: string) => void;
}
```

2. In the `execute` callback, pass `requestId` in the postMessage to the iframe:

```typescript
iframe.onload = () => {
  iframe.contentWindow?.postMessage({ type: "execute", js, requestId }, "*");
};
```

3. In the `handleMessage` callback, include `requestId` in all messages forwarded to parent callbacks. Update the callback props to pass `requestId`:

```typescript
interface ExecutionSandboxProps {
  onOutput: (text: string, requestId: string) => void;
  onError: (message: string, requestId: string) => void;
  onDone: (requestId: string) => void;
}
```

And in `handleMessage`:

```typescript
if (data.type === "output") {
  onOutput(data.text, data.requestId);
} else if (data.type === "error") {
  onError(data.message, data.requestId);
} else if (data.type === "done") {
  onDone(data.requestId);
  cleanup();
}
```

4. Update the sandbox HTML (`buildSandboxHtml`) to pass `requestId` through in all postMessage calls:

In the `window.addEventListener("message", ...)` handler, capture `requestId` from `event.data.requestId` and include it in all `window.parent.postMessage` calls:

```javascript
var requestId = event.data.requestId;
// ...
window.parent.postMessage({ type: "output", text: lines[i], requestId: requestId }, "*");
// ...
window.parent.postMessage({ type: "done", requestId: requestId }, "*");
// ...
window.parent.postMessage({ type: "error", message: e.message || String(e), requestId: requestId }, "*");
```

- [ ] **Step 4: Run type check**

Run: `npx tsc --noEmit`
Expected: PASS (App.tsx will have temp errors until Task 12, but ExecutionSandbox itself should type-check)

- [ ] **Step 5: Commit**

```bash
git add src/types/messages.ts src/components/ExecutionSandbox.tsx
git commit -m "Add validate message types and requestId to sandbox protocol"
```

---

### Task 3: Pitfall Rule Definitions

**Files:**
- Create: `src/rules/definitions.ts`

- [ ] **Step 1: Create rule definitions file with all 4 rules**

```typescript
// src/rules/definitions.ts
import type { PitfallRule } from "../types/validation";

export const pitfallRules: PitfallRule[] = [
  {
    id: "llm-string-char-confusion",
    severity: "warning",
    message: "STRING used where CHAR may be expected",
    explanation:
      "LLMs default to STRING like Python's str. In ABAP, CHAR(n) and STRING are fundamentally different — CHAR is fixed-length and stored inline, STRING is variable-length on the heap. Using STRING for short fixed-length fields (names, codes, statuses) wastes memory and can cause type mismatches with DDIC structures.",
    suggestion: "Use a fixed-length type: DATA lv_name TYPE char40.",
  },
  {
    id: "llm-python-loop-pattern",
    severity: "warning",
    message: "Index-based loop pattern detected (SY-TABIX manipulation)",
    explanation:
      "LLMs often write index-based loops influenced by Python's for-in-range or C-style for loops. In ABAP, explicit SY-TABIX manipulation inside LOOP AT is rarely needed and error-prone. LOOP AT ... ASSIGNING is more idiomatic and performant.",
    suggestion: "Use LOOP AT lt_data ASSIGNING FIELD-SYMBOL(<ls>).",
  },
  {
    id: "llm-dynamic-typing",
    severity: "warning",
    message: "Declaration without explicit type",
    explanation:
      "LLMs trained on dynamic languages (Python, JavaScript) sometimes omit explicit types or use overly generic typing. ABAP is strictly typed — every DATA or FIELD-SYMBOLS declaration should specify an explicit TYPE or TYPE REF TO.",
    suggestion: "Add an explicit TYPE: DATA lv_value TYPE string.",
  },
  {
    id: "llm-hallucinated-class",
    severity: "error",
    message: "Possibly hallucinated class or interface name",
    explanation:
      "LLMs sometimes generate plausible-sounding but nonexistent SAP class or interface names. Names starting with CL_, IF_, ZCL_, or ZIF_ that cannot be resolved may be hallucinations.",
    suggestion:
      "Verify the class exists in the SAP system or open-abap documentation.",
  },
];

export function getRuleById(id: string): PitfallRule | undefined {
  return pitfallRules.find((r) => r.id === id);
}
```

- [ ] **Step 2: Run type check**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/rules/definitions.ts
git commit -m "Add LLM pitfall rule definitions (4 initial rules)"
```

---

### Task 4: Pitfall Matchers — stringCharConfusion

**Files:**
- Create: `src/rules/matchers/stringCharConfusion.ts`
- Create: `src/rules/matchers/stringCharConfusion.test.ts`

This matcher detects DATA declarations using TYPE STRING where a fixed-length CHAR type may be more appropriate. It flags STRING usage in local variable DATA declarations (lv_ prefix convention suggests a simple value, not a dynamic string).

- [ ] **Step 1: Write the failing test**

```typescript
// src/rules/matchers/stringCharConfusion.test.ts
import { describe, it, expect } from "vitest";
import { Registry, MemoryFile, Config } from "@abaplint/core";
import { config as transpilerConfig } from "@abaplint/transpiler";
import { matchStringCharConfusion } from "./stringCharConfusion";

async function parseSource(source: string): Promise<Registry> {
  const reg = new Registry(new Config(JSON.stringify(transpilerConfig)));
  reg.addFile(new MemoryFile("ztest.prog.abap", source));
  await reg.parseAsync();
  return reg;
}

describe("matchStringCharConfusion", () => {
  it("detects STRING type in DATA declaration", async () => {
    const reg = await parseSource(`REPORT ztest.\nDATA lv_name TYPE string.`);
    const matches = matchStringCharConfusion(reg);
    expect(matches.length).toBe(1);
    expect(matches[0].ruleId).toBe("llm-string-char-confusion");
    expect(matches[0].startLine).toBeGreaterThan(0);
  });

  it("ignores non-STRING types", async () => {
    const reg = await parseSource(`REPORT ztest.\nDATA lv_name TYPE c LENGTH 40.`);
    const matches = matchStringCharConfusion(reg);
    expect(matches.length).toBe(0);
  });

  it("detects multiple STRING declarations", async () => {
    const reg = await parseSource(
      `REPORT ztest.\nDATA lv_first TYPE string.\nDATA lv_last TYPE string.`,
    );
    const matches = matchStringCharConfusion(reg);
    expect(matches.length).toBe(2);
  });

  it("ignores STRING in table types and complex structures", async () => {
    const reg = await parseSource(
      `REPORT ztest.\nDATA lt_lines TYPE STANDARD TABLE OF string WITH DEFAULT KEY.`,
    );
    const matches = matchStringCharConfusion(reg);
    expect(matches.length).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/rules/matchers/stringCharConfusion.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the matcher implementation**

```typescript
// src/rules/matchers/stringCharConfusion.ts
import { Registry, ABAPObject } from "@abaplint/core";
import type { PitfallMatch } from "../../types/validation";
import { getRuleById } from "../definitions";

export function matchStringCharConfusion(registry: Registry): PitfallMatch[] {
  const rule = getRuleById("llm-string-char-confusion");
  if (!rule) return [];

  const matches: PitfallMatch[] = [];

  for (const obj of registry.getObjects()) {
    if (!ABAPObject.is(obj)) continue;

    for (const file of (obj as ABAPObject).getABAPFiles()) {
      const structure = file.getStructure();
      if (!structure) continue;

      // Walk all tokens looking for DATA ... TYPE STRING pattern
      const statements = structure.findAllStatementNodes();
      for (const stmt of statements) {
        const tokens = stmt.getTokens();
        const tokenStrs = tokens.map((t) => t.getStr().toUpperCase());
        const joined = tokenStrs.join(" ");

        // Match: DATA <name> TYPE STRING .
        // Skip table type declarations (TYPE STANDARD TABLE OF STRING, etc.)
        if (
          tokenStrs[0] === "DATA" &&
          joined.includes("TYPE STRING") &&
          !joined.includes("TABLE")
        ) {
          const firstToken = stmt.getFirstToken();
          const lastToken = stmt.getLastToken();
          matches.push({
            ruleId: rule.id,
            message: rule.message,
            explanation: rule.explanation,
            suggestion: rule.suggestion,
            severity: rule.severity,
            startLine: firstToken.getStart().getRow(),
            startCol: firstToken.getStart().getCol(),
            endLine: lastToken.getEnd().getRow(),
            endCol: lastToken.getEnd().getCol(),
          });
        }
      }
    }
  }

  return matches;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/rules/matchers/stringCharConfusion.test.ts`
Expected: PASS (all 4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/rules/matchers/stringCharConfusion.ts src/rules/matchers/stringCharConfusion.test.ts
git commit -m "Add string-char confusion pitfall matcher with tests"
```

---

### Task 5: Pitfall Matchers — pythonLoopPattern

**Files:**
- Create: `src/rules/matchers/pythonLoopPattern.ts`
- Create: `src/rules/matchers/pythonLoopPattern.test.ts`

This matcher detects LOOP AT patterns where SY-TABIX is read or modified inside the loop body, suggesting an index-based loop style influenced by Python/C.

- [ ] **Step 1: Write the failing test**

```typescript
// src/rules/matchers/pythonLoopPattern.test.ts
import { describe, it, expect } from "vitest";
import { Registry, MemoryFile, Config } from "@abaplint/core";
import { config as transpilerConfig } from "@abaplint/transpiler";
import { matchPythonLoopPattern } from "./pythonLoopPattern";

async function parseSource(source: string): Promise<Registry> {
  const reg = new Registry(new Config(JSON.stringify(transpilerConfig)));
  reg.addFile(new MemoryFile("ztest.prog.abap", source));
  await reg.parseAsync();
  return reg;
}

describe("matchPythonLoopPattern", () => {
  it("detects SY-TABIX usage inside LOOP with INTO", async () => {
    const source = `REPORT ztest.
TYPES: BEGIN OF ty_item,
         name TYPE string,
       END OF ty_item.
DATA lt_items TYPE STANDARD TABLE OF ty_item WITH DEFAULT KEY.
DATA ls_item TYPE ty_item.
DATA lv_idx TYPE i.
LOOP AT lt_items INTO ls_item.
  lv_idx = sy-tabix.
  WRITE lv_idx.
ENDLOOP.`;
    const reg = await parseSource(source);
    const matches = matchPythonLoopPattern(reg);
    expect(matches.length).toBe(1);
    expect(matches[0].ruleId).toBe("llm-python-loop-pattern");
  });

  it("ignores LOOP without SY-TABIX usage", async () => {
    const source = `REPORT ztest.
TYPES: BEGIN OF ty_item,
         name TYPE string,
       END OF ty_item.
DATA lt_items TYPE STANDARD TABLE OF ty_item WITH DEFAULT KEY.
DATA ls_item TYPE ty_item.
LOOP AT lt_items INTO ls_item.
  WRITE ls_item-name.
ENDLOOP.`;
    const reg = await parseSource(source);
    const matches = matchPythonLoopPattern(reg);
    expect(matches.length).toBe(0);
  });

  it("ignores SY-TABIX outside of LOOP", async () => {
    const source = `REPORT ztest.
DATA lv_idx TYPE i.
lv_idx = sy-tabix.`;
    const reg = await parseSource(source);
    const matches = matchPythonLoopPattern(reg);
    expect(matches.length).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/rules/matchers/pythonLoopPattern.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the matcher implementation**

```typescript
// src/rules/matchers/pythonLoopPattern.ts
import { Registry, ABAPObject } from "@abaplint/core";
import type { PitfallMatch } from "../../types/validation";
import { getRuleById } from "../definitions";

export function matchPythonLoopPattern(registry: Registry): PitfallMatch[] {
  const rule = getRuleById("llm-python-loop-pattern");
  if (!rule) return [];

  const matches: PitfallMatch[] = [];

  for (const obj of registry.getObjects()) {
    if (!ABAPObject.is(obj)) continue;

    for (const file of (obj as ABAPObject).getABAPFiles()) {
      const structure = file.getStructure();
      if (!structure) continue;

      // Track when we're inside a LOOP..ENDLOOP block
      // and look for SY-TABIX references within
      const allStatements = structure.findAllStatementNodes();
      let loopDepth = 0;
      let loopStartStmt: (typeof allStatements)[0] | null = null;
      let foundTabix = false;

      for (const stmt of allStatements) {
        const firstToken = stmt.getFirstToken().getStr().toUpperCase();

        if (firstToken === "LOOP") {
          if (loopDepth === 0) {
            loopStartStmt = stmt;
            foundTabix = false;
          }
          loopDepth++;
        } else if (firstToken === "ENDLOOP") {
          loopDepth--;
          if (loopDepth === 0 && foundTabix && loopStartStmt) {
            const start = loopStartStmt.getFirstToken();
            const end = stmt.getLastToken();
            matches.push({
              ruleId: rule.id,
              message: rule.message,
              explanation: rule.explanation,
              suggestion: rule.suggestion,
              severity: rule.severity,
              startLine: start.getStart().getRow(),
              startCol: start.getStart().getCol(),
              endLine: end.getEnd().getRow(),
              endCol: end.getEnd().getCol(),
            });
            loopStartStmt = null;
            foundTabix = false;
          }
        } else if (loopDepth > 0) {
          // Check for SY-TABIX reference in this statement
          const tokens = stmt.getTokens();
          for (const token of tokens) {
            if (token.getStr().toUpperCase() === "SY-TABIX") {
              foundTabix = true;
              break;
            }
          }
        }
      }
    }
  }

  return matches;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/rules/matchers/pythonLoopPattern.test.ts`
Expected: PASS (all 3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/rules/matchers/pythonLoopPattern.ts src/rules/matchers/pythonLoopPattern.test.ts
git commit -m "Add Python loop pattern pitfall matcher with tests"
```

---

### Task 6: Pitfall Matchers — dynamicTyping

**Files:**
- Create: `src/rules/matchers/dynamicTyping.ts`
- Create: `src/rules/matchers/dynamicTyping.test.ts`

This matcher detects FIELD-SYMBOLS or DATA declarations without an explicit TYPE clause.

- [ ] **Step 1: Write the failing test**

```typescript
// src/rules/matchers/dynamicTyping.test.ts
import { describe, it, expect } from "vitest";
import { Registry, MemoryFile, Config } from "@abaplint/core";
import { config as transpilerConfig } from "@abaplint/transpiler";
import { matchDynamicTyping } from "./dynamicTyping";

async function parseSource(source: string): Promise<Registry> {
  const reg = new Registry(new Config(JSON.stringify(transpilerConfig)));
  reg.addFile(new MemoryFile("ztest.prog.abap", source));
  await reg.parseAsync();
  return reg;
}

describe("matchDynamicTyping", () => {
  it("detects DATA without TYPE", async () => {
    const reg = await parseSource(`REPORT ztest.\nDATA lv_value.`);
    const matches = matchDynamicTyping(reg);
    expect(matches.length).toBe(1);
    expect(matches[0].ruleId).toBe("llm-dynamic-typing");
  });

  it("ignores DATA with explicit TYPE", async () => {
    const reg = await parseSource(`REPORT ztest.\nDATA lv_value TYPE i.`);
    const matches = matchDynamicTyping(reg);
    expect(matches.length).toBe(0);
  });

  it("ignores DATA with LIKE", async () => {
    const reg = await parseSource(
      `REPORT ztest.\nDATA lv_a TYPE i.\nDATA lv_b LIKE lv_a.`,
    );
    const matches = matchDynamicTyping(reg);
    expect(matches.length).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/rules/matchers/dynamicTyping.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the matcher implementation**

```typescript
// src/rules/matchers/dynamicTyping.ts
import { Registry, ABAPObject } from "@abaplint/core";
import type { PitfallMatch } from "../../types/validation";
import { getRuleById } from "../definitions";

export function matchDynamicTyping(registry: Registry): PitfallMatch[] {
  const rule = getRuleById("llm-dynamic-typing");
  if (!rule) return [];

  const matches: PitfallMatch[] = [];

  for (const obj of registry.getObjects()) {
    if (!ABAPObject.is(obj)) continue;

    for (const file of (obj as ABAPObject).getABAPFiles()) {
      const structure = file.getStructure();
      if (!structure) continue;

      const allStatements = structure.findAllStatementNodes();
      for (const stmt of allStatements) {
        const tokens = stmt.getTokens();
        const tokenStrs = tokens.map((t) => t.getStr().toUpperCase());

        // DATA declaration without TYPE or LIKE keyword
        if (tokenStrs[0] === "DATA" && tokenStrs.length >= 2) {
          const hasType = tokenStrs.includes("TYPE");
          const hasLike = tokenStrs.includes("LIKE");
          if (!hasType && !hasLike) {
            const firstToken = stmt.getFirstToken();
            const lastToken = stmt.getLastToken();
            matches.push({
              ruleId: rule.id,
              message: rule.message,
              explanation: rule.explanation,
              suggestion: rule.suggestion,
              severity: rule.severity,
              startLine: firstToken.getStart().getRow(),
              startCol: firstToken.getStart().getCol(),
              endLine: lastToken.getEnd().getRow(),
              endCol: lastToken.getEnd().getCol(),
            });
          }
        }
      }
    }
  }

  return matches;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/rules/matchers/dynamicTyping.test.ts`
Expected: PASS (all 3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/rules/matchers/dynamicTyping.ts src/rules/matchers/dynamicTyping.test.ts
git commit -m "Add dynamic typing pitfall matcher with tests"
```

---

### Task 7: Pitfall Matchers — hallucinatedClass

**Files:**
- Create: `src/rules/matchers/hallucinatedClass.ts`
- Create: `src/rules/matchers/hallucinatedClass.test.ts`

This matcher relabels abaplint `unknown_types` issues for identifiers with CL_, IF_, ZCL_, ZIF_ prefixes as LLM hallucinations. It takes the abaplint issue list as input rather than re-parsing the AST.

- [ ] **Step 1: Write the failing test**

```typescript
// src/rules/matchers/hallucinatedClass.test.ts
import { describe, it, expect } from "vitest";
import type { LintIssue } from "../../types/messages";
import { matchHallucinatedClass } from "./hallucinatedClass";

function makeIssue(overrides: Partial<LintIssue>): LintIssue {
  return {
    message: "Unknown type",
    key: "unknown_types",
    startLine: 5,
    startCol: 1,
    endLine: 5,
    endCol: 20,
    severity: "error",
    ...overrides,
  };
}

describe("matchHallucinatedClass", () => {
  it("relabels unknown_types issues with CL_ prefix", () => {
    const issues = [makeIssue({ message: 'Unknown type "CL_ABAP_STRINGUTILS"' })];
    const matches = matchHallucinatedClass(issues);
    expect(matches.length).toBe(1);
    expect(matches[0].ruleId).toBe("llm-hallucinated-class");
    expect(matches[0].severity).toBe("error");
  });

  it("relabels unknown_types issues with IF_ prefix", () => {
    const issues = [makeIssue({ message: 'Unknown type "IF_ABAP_HELPER"' })];
    const matches = matchHallucinatedClass(issues);
    expect(matches.length).toBe(1);
  });

  it("relabels issues with ZCL_ and ZIF_ prefixes", () => {
    const issues = [
      makeIssue({ message: 'Unknown type "ZCL_CUSTOM_UTIL"' }),
      makeIssue({ message: 'Unknown type "ZIF_CUSTOM_INTF"' }),
    ];
    const matches = matchHallucinatedClass(issues);
    expect(matches.length).toBe(2);
  });

  it("ignores unknown_types without class/interface prefix", () => {
    const issues = [makeIssue({ message: 'Unknown type "TY_CUSTOM_STRUCT"' })];
    const matches = matchHallucinatedClass(issues);
    expect(matches.length).toBe(0);
  });

  it("ignores non-unknown_types issues", () => {
    const issues = [makeIssue({ key: "begin_end_names", message: "CL_SOMETHING" })];
    const matches = matchHallucinatedClass(issues);
    expect(matches.length).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/rules/matchers/hallucinatedClass.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the matcher implementation**

```typescript
// src/rules/matchers/hallucinatedClass.ts
import type { LintIssue } from "../../types/messages";
import type { PitfallMatch } from "../../types/validation";
import { getRuleById } from "../definitions";

const CLASS_PREFIXES = ["CL_", "IF_", "ZCL_", "ZIF_"];
const QUOTED_NAME_RE = /"([^"]+)"/;

export function matchHallucinatedClass(lintIssues: LintIssue[]): PitfallMatch[] {
  const rule = getRuleById("llm-hallucinated-class");
  if (!rule) return [];

  const matches: PitfallMatch[] = [];

  for (const issue of lintIssues) {
    if (issue.key !== "unknown_types") continue;

    // Extract the type name from the message (e.g., 'Unknown type "CL_SOMETHING"')
    const nameMatch = QUOTED_NAME_RE.exec(issue.message);
    if (!nameMatch) continue;

    const typeName = nameMatch[1].toUpperCase();
    const hasClassPrefix = CLASS_PREFIXES.some((prefix) => typeName.startsWith(prefix));
    if (!hasClassPrefix) continue;

    matches.push({
      ruleId: rule.id,
      message: `${rule.message}: ${nameMatch[1]}`,
      explanation: rule.explanation,
      suggestion: rule.suggestion,
      severity: rule.severity,
      startLine: issue.startLine,
      startCol: issue.startCol,
      endLine: issue.endLine,
      endCol: issue.endCol,
    });
  }

  return matches;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/rules/matchers/hallucinatedClass.test.ts`
Expected: PASS (all 5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/rules/matchers/hallucinatedClass.ts src/rules/matchers/hallucinatedClass.test.ts
git commit -m "Add hallucinated class pitfall matcher with tests"
```

---

### Task 8: Pitfall Detector Orchestrator

**Files:**
- Create: `src/rules/detector.ts`
- Create: `src/rules/detector.test.ts`

The detector orchestrates all matchers. It takes a Registry and lint issues, runs all matchers, and returns the combined PitfallMatch array.

- [ ] **Step 1: Write the failing test**

```typescript
// src/rules/detector.test.ts
import { describe, it, expect } from "vitest";
import { Registry, MemoryFile, Config } from "@abaplint/core";
import { config as transpilerConfig } from "@abaplint/transpiler";
import type { LintIssue } from "../types/messages";
import { detectPitfalls } from "./detector";

async function parseSource(source: string): Promise<Registry> {
  const reg = new Registry(new Config(JSON.stringify(transpilerConfig)));
  reg.addFile(new MemoryFile("ztest.prog.abap", source));
  await reg.parseAsync();
  return reg;
}

describe("detectPitfalls", () => {
  it("detects string-char confusion", async () => {
    const reg = await parseSource(`REPORT ztest.\nDATA lv_name TYPE string.`);
    const matches = detectPitfalls(reg, []);
    const stringMatches = matches.filter((m) => m.ruleId === "llm-string-char-confusion");
    expect(stringMatches.length).toBe(1);
  });

  it("detects hallucinated classes from lint issues", async () => {
    const reg = await parseSource(`REPORT ztest.`);
    const lintIssues: LintIssue[] = [
      {
        message: 'Unknown type "CL_ABAP_FAKE_CLASS"',
        key: "unknown_types",
        startLine: 2,
        startCol: 1,
        endLine: 2,
        endCol: 30,
        severity: "error",
      },
    ];
    const matches = detectPitfalls(reg, lintIssues);
    const hallucinatedMatches = matches.filter(
      (m) => m.ruleId === "llm-hallucinated-class",
    );
    expect(hallucinatedMatches.length).toBe(1);
  });

  it("returns empty array for clean code", async () => {
    const reg = await parseSource(`REPORT ztest.\nDATA lv_count TYPE i.\nWRITE lv_count.`);
    const matches = detectPitfalls(reg, []);
    expect(matches.length).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/rules/detector.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the detector implementation**

```typescript
// src/rules/detector.ts
import type { Registry } from "@abaplint/core";
import type { LintIssue } from "../types/messages";
import type { PitfallMatch } from "../types/validation";
import { matchStringCharConfusion } from "./matchers/stringCharConfusion";
import { matchPythonLoopPattern } from "./matchers/pythonLoopPattern";
import { matchDynamicTyping } from "./matchers/dynamicTyping";
import { matchHallucinatedClass } from "./matchers/hallucinatedClass";

export function detectPitfalls(
  registry: Registry,
  lintIssues: LintIssue[],
): PitfallMatch[] {
  return [
    ...matchStringCharConfusion(registry),
    ...matchPythonLoopPattern(registry),
    ...matchDynamicTyping(registry),
    ...matchHallucinatedClass(lintIssues),
  ];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/rules/detector.test.ts`
Expected: PASS (all 3 tests)

- [ ] **Step 5: Run all matcher tests together**

Run: `npx vitest run src/rules/`
Expected: PASS (all tests across all matcher files + detector)

- [ ] **Step 6: Commit**

```bash
git add src/rules/detector.ts src/rules/detector.test.ts
git commit -m "Add pitfall detector orchestrator with tests"
```

---

### Task 9: Worker handleValidate

**Files:**
- Modify: `src/workers/abaplintWorker.ts`

Add the `handleValidate` function that runs stages 1-3 (syntax, lint+pitfalls, transpile) with progressive postMessage updates.

- [ ] **Step 1: Add detector import and handleValidate to worker**

Replace the entire contents of `src/workers/abaplintWorker.ts` with:

```typescript
// src/workers/abaplintWorker.ts
import { Registry, MemoryFile, Config, Issue } from "@abaplint/core";
import { Transpiler, config as transpilerConfig } from "@abaplint/transpiler";
import type { WorkerRequest, WorkerResponse, LintIssue } from "../types/messages";
import type { StageResult, ValidationStage } from "../types/validation";
import { detectPitfalls } from "../rules/detector";

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

function postProgress(stage: ValidationStage, status: "running" | "skipped"): void {
  self.postMessage({ type: "validate-progress", stage, status });
}

function postStageResult(stage: ValidationStage, result: StageResult): void {
  self.postMessage({ type: "validate-stage-result", stage, result });
}

async function handleValidate(source: string): Promise<void> {
  const reg = new Registry(abaplintConfig);
  reg.addFile(new MemoryFile("ztest.prog.abap", source));

  // Stage 1: Syntax
  postProgress("syntax", "running");
  await reg.parseAsync();
  const allIssues = reg.findIssues();
  const syntaxErrors = allIssues.filter(
    (i) => i.getSeverity().toString() === "Error",
  );
  const hasSyntaxErrors = syntaxErrors.length > 0;

  postStageResult("syntax", {
    status: hasSyntaxErrors ? "fail" : "pass",
    error: hasSyntaxErrors ? syntaxErrors[0].getMessage() : undefined,
  });

  // Stage 2: Lint + LLM Pitfalls
  postProgress("lint", "running");
  const lintIssues = allIssues.map(issueToLintIssue);
  const pitfalls = detectPitfalls(reg, lintIssues);

  const hasLintWarnings = lintIssues.some((i) => i.severity === "warning");
  const hasLintErrors = lintIssues.some((i) => i.severity === "error");
  const hasPitfallErrors = pitfalls.some((p) => p.severity === "error");

  let lintStatus: StageResult["status"] = "pass";
  if (hasLintErrors || hasPitfallErrors) lintStatus = "fail";
  else if (hasLintWarnings || pitfalls.length > 0) lintStatus = "warn";

  postStageResult("lint", {
    status: lintStatus,
    issues: lintIssues,
    pitfalls,
  });

  // Stage 3: Transpile (skip if syntax errors)
  if (hasSyntaxErrors) {
    postProgress("transpile", "skipped");
    postStageResult("transpile", { status: "skipped" });
    // Also skip runtime
    postProgress("runtime", "skipped");
    postStageResult("runtime", { status: "skipped" });
    return;
  }

  postProgress("transpile", "running");
  try {
    const transpiler = new Transpiler({ ignoreSourceMap: true });
    const output = await transpiler.run(reg);
    const jsChunks = output.objects.map((o) => o.chunk.getCode());
    const js = [
      ...jsChunks,
      output.initializationScript,
      output.initializationScript2,
    ].join("\n");

    postStageResult("transpile", { status: "pass", js });
    // Runtime will be handled by main thread
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    postStageResult("transpile", { status: "fail", error: msg });
    // Skip runtime
    postProgress("runtime", "skipped");
    postStageResult("runtime", { status: "skipped" });
  }
}

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const request = event.data;

  if (request.type === "lint") {
    self.postMessage(await handleLint(request.source));
  } else if (request.type === "transpile") {
    self.postMessage(await handleTranspile(request.source));
  } else if (request.type === "validate") {
    await handleValidate(request.source);
  }
};
```

- [ ] **Step 2: Run type check**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 3: Run lint**

Run: `npm run lint`
Expected: PASS

- [ ] **Step 4: Run all existing tests**

Run: `npx vitest run`
Expected: PASS (all tests including new matcher tests)

- [ ] **Step 5: Commit**

```bash
git add src/workers/abaplintWorker.ts
git commit -m "Add handleValidate to worker with progressive stage execution"
```

---

### Task 10: ModeHeader Component

**Files:**
- Create: `src/components/ModeHeader.tsx`

Header component with ABAP Dojo title and mode tabs.

- [ ] **Step 1: Create the ModeHeader component**

```typescript
// src/components/ModeHeader.tsx
import type { AppMode } from "../types/validation";

interface ModeHeaderProps {
  mode: AppMode;
  onModeChange: (mode: AppMode) => void;
}

const MODES: { id: AppMode; label: string }[] = [
  { id: "playground", label: "Playground" },
  { id: "validator", label: "AI Validator" },
];

export function ModeHeader({ mode, onModeChange }: ModeHeaderProps) {
  return (
    <header className="flex items-center px-4 py-2 bg-gray-800 border-b border-gray-700">
      <h1 className="text-lg font-bold tracking-wide text-gray-100 mr-6">
        ABAP Dojo
      </h1>
      <nav className="flex gap-1">
        {MODES.map((m) => (
          <button
            key={m.id}
            onClick={() => onModeChange(m.id)}
            className={`px-3 py-1 text-sm font-medium rounded transition-colors ${
              mode === m.id
                ? "bg-blue-600 text-white"
                : "text-gray-400 hover:text-gray-200 hover:bg-gray-700"
            }`}
          >
            {m.label}
          </button>
        ))}
      </nav>
    </header>
  );
}
```

- [ ] **Step 2: Run type check**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/components/ModeHeader.tsx
git commit -m "Add ModeHeader component with Playground/AI Validator tabs"
```

---

### Task 11: ValidationReport Component

**Files:**
- Create: `src/components/ValidationReport.tsx`

The accordion-based validation report panel. Shows 5 UI rows (Syntax, Lint, LLM Pitfalls, Transpile, Runtime) with expandable details. LLM Pitfalls get rich explanation+suggestion display.

- [ ] **Step 1: Create the ValidationReport component**

```typescript
// src/components/ValidationReport.tsx
import { useState } from "react";
import type { LintIssue } from "../types/messages";
import type {
  StageStatus,
  StageResult,
  PitfallMatch,
  ValidationStage,
} from "../types/validation";

interface ValidationReportProps {
  stages: Record<ValidationStage, StageResult>;
  isValidating: boolean;
}

function computeSummary(
  stages: Record<ValidationStage, StageResult>,
): { overall: "pass" | "warn" | "fail"; totalIssues: number } {
  let totalIssues = 0;
  let hasError = false;
  let hasWarning = false;

  for (const result of Object.values(stages)) {
    if (result.status === "fail") hasError = true;
    if (result.status === "warn") hasWarning = true;
    totalIssues += (result.issues?.length ?? 0) + (result.pitfalls?.length ?? 0);
    if (result.error) totalIssues++;
  }

  const overall = hasError ? "fail" : hasWarning ? "warn" : "pass";
  return { overall, totalIssues };
}

const STATUS_ICON: Record<StageStatus, string> = {
  pending: "\u2022",
  running: "\u25F7",
  pass: "\u2713",
  warn: "\u26A0",
  fail: "\u2717",
  skipped: "\u2014",
};

const STATUS_COLOR: Record<StageStatus, string> = {
  pending: "text-gray-500",
  running: "text-blue-400 animate-pulse",
  pass: "text-green-400",
  warn: "text-yellow-400",
  fail: "text-red-400",
  skipped: "text-gray-500",
};

function statusLabel(result: StageResult): string {
  if (result.status === "pass") return "OK";
  if (result.status === "fail") return result.error ?? "Failed";
  if (result.status === "warn") {
    const count = (result.issues?.length ?? 0) + (result.pitfalls?.length ?? 0);
    return `${count} issue${count !== 1 ? "s" : ""}`;
  }
  if (result.status === "running") return "Running...";
  if (result.status === "skipped") return "Skipped";
  return "";
}

function StageRow({
  label,
  icon,
  result,
  expandable,
  children,
}: {
  label: string;
  icon: string;
  result: StageResult;
  expandable: boolean;
  children?: React.ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);
  const canExpand =
    expandable && result.status !== "pending" && result.status !== "skipped";

  return (
    <div className="border-b border-gray-800 last:border-b-0">
      <button
        className={`w-full flex items-center gap-3 px-4 py-2.5 text-left ${
          canExpand
            ? "hover:bg-gray-800/50 cursor-pointer"
            : "cursor-default"
        }`}
        onClick={() => canExpand && setExpanded(!expanded)}
        disabled={!canExpand}
      >
        <span className={`text-base ${STATUS_COLOR[result.status]}`}>
          {STATUS_ICON[result.status]}
        </span>
        <span className="text-sm text-gray-200">
          {icon ? `${icon} ` : ""}
          {label}
        </span>
        <span className="flex-1" />
        <span className={`text-xs ${STATUS_COLOR[result.status]}`}>
          {statusLabel(result)}
        </span>
        {canExpand && (
          <span className="text-gray-500 text-xs">
            {expanded ? "\u25BC" : "\u25B6"}
          </span>
        )}
      </button>
      {expanded && children && (
        <div className="px-4 pb-3 pt-1">{children}</div>
      )}
    </div>
  );
}

function LintIssueList({ issues }: { issues: LintIssue[] }) {
  if (issues.length === 0)
    return <p className="text-gray-500 text-xs">No issues.</p>;
  return (
    <ul className="space-y-0.5 font-mono text-xs">
      {issues.map((issue, i) => {
        const color =
          issue.severity === "error"
            ? "text-red-400"
            : issue.severity === "warning"
              ? "text-yellow-400"
              : "text-blue-400";
        const icon =
          issue.severity === "error"
            ? "\u2717"
            : issue.severity === "warning"
              ? "\u26A0"
              : "\u24D8";
        return (
          <li key={i} className={color}>
            {icon} L{issue.startLine}:{issue.startCol} [{issue.key}]{" "}
            {issue.message}
          </li>
        );
      })}
    </ul>
  );
}

function PitfallList({ pitfalls }: { pitfalls: PitfallMatch[] }) {
  if (pitfalls.length === 0)
    return (
      <p className="text-gray-500 text-xs">No pitfalls detected.</p>
    );
  return (
    <div className="space-y-2">
      {pitfalls.map((p, i) => (
        <div
          key={i}
          className="bg-purple-950/40 border-l-2 border-purple-500 rounded-r-md px-3 py-2"
        >
          <div className="font-mono text-xs text-yellow-400">
            {p.severity === "error" ? "\u2717" : "\u26A0"} L{p.startLine}:
            {p.startCol} {p.message}
            <span className="text-purple-400 ml-2 text-[10px]">
              [{p.ruleId}]
            </span>
          </div>
          <div className="text-purple-300 text-xs mt-1.5 leading-relaxed pl-1 border-l border-purple-800 ml-0.5">
            {p.explanation}
          </div>
          <div className="text-green-400 text-xs mt-1.5 flex items-start gap-1">
            <span>{"\uD83D\uDCA1"}</span>
            <code className="bg-green-900/40 px-1.5 py-0.5 rounded text-green-300">
              {p.suggestion}
            </code>
          </div>
        </div>
      ))}
    </div>
  );
}

const SUMMARY_COLOR = {
  pass: "text-green-400",
  warn: "text-yellow-400",
  fail: "text-red-400",
};

const SUMMARY_LABEL = {
  pass: "PASS",
  warn: "WARN",
  fail: "FAIL",
};

export function ValidationReport({
  stages,
  isValidating,
}: ValidationReportProps) {
  const lintResult = stages.lint;
  const pitfalls = lintResult.pitfalls ?? [];
  const lintIssues = lintResult.issues ?? [];

  // Create a virtual result for the pitfalls UI row based on lint stage data
  const pitfallResult: StageResult = {
    status:
      lintResult.status === "pending"
        ? "pending"
        : lintResult.status === "running"
          ? "running"
          : pitfalls.some((p) => p.severity === "error")
            ? "fail"
            : pitfalls.length > 0
              ? "warn"
              : "pass",
    pitfalls,
  };

  // Create a lint-only result (without pitfalls) for the lint UI row
  const lintOnlyResult: StageResult = {
    status:
      lintResult.status === "pending"
        ? "pending"
        : lintResult.status === "running"
          ? "running"
          : lintIssues.some((i) => i.severity === "error")
            ? "fail"
            : lintIssues.some((i) => i.severity === "warning")
              ? "warn"
              : "pass",
    issues: lintIssues,
  };

  const allDone =
    !isValidating &&
    Object.values(stages).every(
      (s) => s.status !== "pending" && s.status !== "running",
    );

  const summary = allDone ? computeSummary(stages) : null;

  return (
    <div className="flex flex-col h-full bg-gray-900">
      <div className="flex-1 overflow-auto">
        {/* No validation run yet */}
        {!isValidating &&
          Object.values(stages).every((s) => s.status === "pending") && (
            <div className="flex items-center justify-center h-full text-gray-500 text-sm">
              Click Validate to check your ABAP code.
            </div>
          )}

        {/* Stage rows */}
        {(!Object.values(stages).every((s) => s.status === "pending") ||
          isValidating) && (
          <div>
            <StageRow
              label="Syntax"
              icon=""
              result={stages.syntax}
              expandable={false}
            />
            <StageRow
              label="Lint"
              icon=""
              result={lintOnlyResult}
              expandable={lintIssues.length > 0}
            >
              <LintIssueList issues={lintIssues} />
            </StageRow>
            <StageRow
              label="LLM Pitfalls"
              icon={"\uD83E\uDD16"}
              result={pitfallResult}
              expandable={pitfalls.length > 0}
            >
              <PitfallList pitfalls={pitfalls} />
            </StageRow>
            <StageRow
              label="Transpile"
              icon=""
              result={stages.transpile}
              expandable={stages.transpile.status === "fail"}
            >
              {stages.transpile.error && (
                <p className="text-red-400 text-xs font-mono">
                  {stages.transpile.error}
                </p>
              )}
            </StageRow>
            <StageRow
              label="Runtime"
              icon=""
              result={stages.runtime}
              expandable={stages.runtime.status === "fail"}
            >
              {stages.runtime.error && (
                <p className="text-red-400 text-xs font-mono">
                  {stages.runtime.error}
                </p>
              )}
            </StageRow>
          </div>
        )}
      </div>

      {/* Summary bar */}
      {summary && (
        <div className="px-4 py-2.5 border-t border-gray-700 flex justify-between items-center bg-gray-800/50">
          <span className="text-gray-500 text-xs uppercase tracking-wider">
            Summary
          </span>
          <span className={`font-bold ${SUMMARY_COLOR[summary.overall]}`}>
            {SUMMARY_LABEL[summary.overall]}
            {summary.totalIssues > 0 &&
              ` \u2014 ${summary.totalIssues} issue${summary.totalIssues !== 1 ? "s" : ""} found`}
          </span>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Run type check**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 3: Run lint**

Run: `npm run lint`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/components/ValidationReport.tsx
git commit -m "Add ValidationReport component with accordion display"
```

---

### Task 12: Integrate Mode Switching and Validation into App

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/components/Toolbar.tsx`

This is the integration task. App.tsx gets mode state, validation state management, the validation execution flow (Worker stages 1-3 + sandbox stage 4 + summary computation). Toolbar gets a Validate button.

- [ ] **Step 1: Update Toolbar to accept mode and validation props**

Replace the entire contents of `src/components/Toolbar.tsx` with:

```typescript
// src/components/Toolbar.tsx
import { SampleSelector } from "./SampleSelector";
import type { Sample } from "../samples";
import type { AppMode } from "../types/validation";

interface ToolbarProps {
  mode: AppMode;
  onRun: () => void;
  onValidate: () => void;
  isRunning: boolean;
  isValidating: boolean;
  onShare: () => void;
  onSelectSample: (sample: Sample) => void;
}

export function Toolbar({
  mode,
  onRun,
  onValidate,
  isRunning,
  isValidating,
  onShare,
  onSelectSample,
}: ToolbarProps) {
  return (
    <div className="flex items-center gap-2 px-4 py-2 bg-gray-800 border-b border-gray-700">
      {mode === "playground" && (
        <button
          onClick={onRun}
          disabled={isRunning}
          className="flex items-center gap-1.5 px-4 py-1.5 bg-green-600 hover:bg-green-500 disabled:bg-gray-600 disabled:cursor-not-allowed text-white text-sm font-medium rounded transition-colors"
        >
          {isRunning ? "Running..." : "\u25B6 Run"}
        </button>
      )}
      {mode === "validator" && (
        <button
          onClick={onValidate}
          disabled={isValidating}
          className="flex items-center gap-1.5 px-4 py-1.5 bg-purple-600 hover:bg-purple-500 disabled:bg-gray-600 disabled:cursor-not-allowed text-white text-sm font-medium rounded transition-colors"
        >
          {isValidating ? "Validating..." : "\uD83D\uDD0D Validate"}
        </button>
      )}
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

- [ ] **Step 2: Rewrite App.tsx with mode switching and validation flow**

Replace the entire contents of `src/App.tsx` with:

```typescript
// src/App.tsx
import { useState, useEffect, useRef, useCallback } from "react";
import { EditorPanel } from "./components/EditorPanel";
import { OutputPanel } from "./components/OutputPanel";
import { ValidationReport } from "./components/ValidationReport";
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
            status: data.status === "running" ? "running" : "skipped",
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

- [ ] **Step 3: Run type check**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 4: Run lint**

Run: `npm run lint`
Expected: PASS

- [ ] **Step 5: Run all tests**

Run: `npx vitest run`
Expected: PASS

- [ ] **Step 6: Run production build**

Run: `npm run build`
Expected: PASS (clean build with no errors)

- [ ] **Step 7: Commit**

```bash
git add src/App.tsx src/components/Toolbar.tsx
git commit -m "Integrate mode switching and validation flow into App"
```

---

### Task 13: URL Routing Test

**Files:**
- Modify: `src/utils/urlShare.test.ts`

Verify URL encoding/decoding handles the new `#mode=validator&code=...` format.

- [ ] **Step 1: Add test for URL encoding with mode parameter**

Append to `src/utils/urlShare.test.ts`:

```typescript
// Add to the existing test file
describe("urlShare with validator mode", () => {
  it("roundtrips code through encode/decode when used in mode=validator hash", () => {
    const code = `REPORT ztest.\nDATA lv_x TYPE string.`;
    const encoded = encodeSource(code);
    // Simulate what parseHash does: URLSearchParams extracts the code param
    const hash = `#mode=validator&code=${encoded}`;
    const params = new URLSearchParams(hash.slice(1));
    const decoded = decodeSource(params.get("code")!);
    expect(decoded).toBe(code);
  });
});
```

- [ ] **Step 2: Run test**

Run: `npx vitest run src/utils/urlShare.test.ts`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/utils/urlShare.test.ts
git commit -m "Add URL share test for validator mode hash format"
```

---

### Task 14: End-to-End Build Verification

**Files:** None (verification only)

- [ ] **Step 1: Run all tests**

Run: `npx vitest run`
Expected: PASS (all tests across matchers, detector, utils)

- [ ] **Step 2: Run lint**

Run: `npm run lint`
Expected: PASS

- [ ] **Step 3: Run type check**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 4: Run production build**

Run: `npm run build`
Expected: PASS with clean output. The dist folder should include the new validation code bundled with the existing app.

- [ ] **Step 5: Start dev server and manually verify**

Run: `npm run dev`

Manual checks:
1. Open `http://localhost:5173` — should load in Playground mode with tabs visible
2. Click "AI Validator" tab — should switch mode, toolbar shows "Validate" button (purple)
3. Paste ABAP code with `DATA lv_name TYPE string.` and click Validate
4. Verify stages appear progressively (Syntax, Lint, LLM Pitfalls, Transpile, Runtime)
5. Verify LLM Pitfalls section shows the string-char confusion with explanation
6. Switch back to Playground — should work normally with Run button
7. Test URL sharing in both modes

- [ ] **Step 6: Final commit if any fixes were needed**

```bash
git add -A
git commit -m "AI Validator mode Phase 2 complete"
```
