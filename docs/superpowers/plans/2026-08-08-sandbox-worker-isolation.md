# Sandbox Worker Isolation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ABAP の無限ループがタブ全体を固めるのをやめさせ、実行を止められるようにする（#28）。

**Architecture:** `srcdoc` の sandboxed iframe は残したまま（opaque origin による隔離が脅威モデルの中核）、その中で `blob:` Worker を作って実行をそちらへ移す。iframe は実行役から中継役になる。iframe のメインスレッドが空くので、親のウォッチドッグと Stop ボタンが実際に効くようになる。

**Tech Stack:** React 19 + TypeScript, Vite (rolldown), Vitest + jsdom, Playwright（本タスクで新規導入）, `@abaplint/runtime`（`src/sandbox/runtime-bundle.js` に同梱済み）

## Global Constraints

- **ユーザーの ABAP ソースをブラウザ外へ出さない。** 計測パラメータを足すときは `src/utils/analytics.ts` の per-event allowlist を通す。string を足せるのは「ユーザーが追加できない閉集合への実行時所属テスト」がある場合のみ（CLAUDE.md ルール1）。
- **iframe の `sandbox="allow-scripts"` を維持する。** `allow-same-origin` を足さない。opaque origin を失うと隔離が消える。
- **出力は 1 行 1 メッセージで送らない。** 実測で 5000 件の postMessage が iframe の 20ms タイマーを 1 tick まで飢えさせた。フラッシュ条件は「500 行たまる」か「前回から 50ms 経過」の早い方。
- **`output_lines` は「送った行数」ではなく「実際に produce された行数」。** 表示は 10,000 行で打ち切るので、送信数を数えると暴走ループが全部きっかり 10,001 になる。
- **バッファ上限 1 MB**（現行 `MAX_OUTPUT_BYTES` と同値）、**表示上限 10,000 行**（現行 `MAX_LINES` と同値）。
- コードコメントは英語、ユーザー向け文字列も英語（i18n は後）。2 スペースインデント、named export。
- テストはコロケート（`src/foo.ts` → `src/foo.test.ts`）。ただし `public/` を対象にするテストは `src/` 直下（既存の慣習）。
- 各タスクの完了条件に `npm run lint`、`npm run typecheck`、`npm test` の全 pass を含む。

## 依存関係（重要）

このブランチ `feature/sandbox-worker-isolation` は `feature/transpile-error-diagnostics`（PR #46）の上に積まれている。**PR #46 がマージされたら、この PR の base を `main` に付け替えること。** 親 PR のマージ時にベースブランチが削除されるため、付け替えを先にしないと子 PR が壊れる。

---

## File Structure

| ファイル | 責務 |
|---|---|
| `src/utils/prepareTranspiledJs.ts` **(新規)** | トランスパイラ出力を Worker で実行できる形に整える純関数。正規表現変換をテストの届く場所に置く |
| `src/utils/prepareTranspiledJs.test.ts` **(新規)** | 上記のテスト |
| `src/sandbox/executor.js` **(新規)** | Worker 本体。`?raw` で読み、ランタイムバンドルと連結して blob 化する。実行・出力バッファリング・終端通知 |
| `src/sandbox/supervisor.js` **(新規)** | iframe 内のスクリプト。Worker を作り、親との間を中継し、停止要求で `terminate()` する |
| `src/components/ExecutionSandbox.tsx` **(改修)** | 実行ライフサイクル、`requestId` の所有、ウォッチドッグ。ハンドルに `stop()` を追加 |
| `src/types/messages.ts` **(改修)** | `SandboxResponse` に `stopped` を追加、`output` を行配列に変更 |
| `src/utils/analytics.ts` **(改修)** | `RunOutcome` / `RUN_OUTCOMES` に `stopped` |
| `src/App.tsx` **(改修)** | `handleOutput` が配列を受ける、`handleStopped`、Stop の配線、`output_lines` を終端イベントから取る |
| `src/components/Toolbar.tsx` **(改修)** | 実行中は Run を Stop に切り替える |
| `e2e/sandbox.spec.ts` **(新規)** | 本番ビルドに対する Playwright。フリーズしないこと・停止できること・途中出力が見えること |
| `playwright.config.ts` **(新規)** | `vite preview` を起動して e2e を回す設定 |

---

## Task 1: トランスパイル済み JS の前処理を純関数に切り出す

現在この変換は `ExecutionSandbox.tsx` の 118 行のテンプレート文字列の中にあり、vitest から到達できない。トランスパイラ出力の形に依存する脆い部分なので、まずテストの届く場所へ出す。この時点では呼び出し側を変えないので、挙動は変わらない。

**Files:**
- Create: `src/utils/prepareTranspiledJs.ts`
- Test: `src/utils/prepareTranspiledJs.test.ts`

**Interfaces:**
- Consumes: なし
- Produces: `export function prepareTranspiledJs(js: string): string`

- [ ] **Step 1: Write the failing test**

`src/utils/prepareTranspiledJs.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { prepareTranspiledJs } from "./prepareTranspiledJs";

describe("prepareTranspiledJs", () => {
  it("strips the ES module imports the transpiler emits", () => {
    const input = [
      `import runtime from "@abaplint/runtime";`,
      `import "./_top.mjs";`,
      `abap.statements.write("hello");`,
    ].join("\n");
    const out = prepareTranspiledJs(input);
    expect(out).not.toMatch(/^import\s/m);
    expect(out).toContain(`abap.statements.write("hello");`);
  });

  it("turns exported declarations into plain ones", () => {
    const out = prepareTranspiledJs(`export async function initializeABAP() {}`);
    expect(out).toContain("async function initializeABAP() {}");
    expect(out).not.toMatch(/^export\s/m);
  });

  /**
   * The init script builds its own runtime instance. Ours has the console that
   * captures WRITE output, so letting theirs win means the run produces nothing.
   */
  it("removes the init script's own ABAP construction", () => {
    const out = prepareTranspiledJs(`globalThis.abap = new runtime.ABAP();`);
    expect(out).not.toContain("new runtime.ABAP()");
  });

  it("binds globalThis.abap to the instance the caller passes in", () => {
    const out = prepareTranspiledJs(`abap.statements.write("x");`);
    expect(out.startsWith("globalThis.abap = abap;")).toBe(true);
  });

  /**
   * A string literal that merely looks like an import must survive: the ABAP
   * source is embedded in the transpiled output as data, and mangling it would
   * change what the user's program does.
   */
  it("leaves import-like text inside string literals alone", () => {
    const input = `abap.statements.write("import runtime from nowhere");`;
    expect(prepareTranspiledJs(input)).toContain(
      `write("import runtime from nowhere")`,
    );
  });

  it("handles an empty program", () => {
    expect(prepareTranspiledJs("")).toBe("globalThis.abap = abap;\n");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/utils/prepareTranspiledJs.test.ts`
Expected: FAIL — `Failed to resolve import "./prepareTranspiledJs"`

- [ ] **Step 3: Write minimal implementation**

`src/utils/prepareTranspiledJs.ts`:

```ts
/**
 * Reshape the transpiler's output so it can run inside the execution worker.
 *
 * This lived inside a template literal in ExecutionSandbox.tsx, where no test
 * could reach it — and it is the most brittle code in the execution path,
 * because every rule here is a guess about the shape of somebody else's
 * codegen. Moving it out is the point: when @abaplint/transpiler changes its
 * output, this file is where that shows up as a red test rather than as a
 * blank Output panel.
 *
 * Known limit, deliberately kept: the import and export rules are anchored to
 * the start of a line, so they cannot touch a string literal on the right-hand
 * side of an expression, but a transpiler that ever emitted a multi-line
 * template whose inner line began with `import ` would still be mangled. That
 * has not happened; the test suite pins the shapes we have actually seen.
 */
export function prepareTranspiledJs(js: string): string {
  const body = js
    .replace(/^import\s+.*$/gm, "")
    .replace(/^export\s+/gm, "")
    // The init script constructs its own runtime. Ours carries the console that
    // captures WRITE output, so theirs must not overwrite it.
    .replace(/globalThis\.abap\s*=\s*new\s+runtime\.ABAP\(\);?/g, "");

  // @abaplint/runtime reaches for globalThis.abap from inside its own methods
  // (append, loop, sy handling), so it has to be bound before the body runs.
  return `globalThis.abap = abap;\n${body}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/utils/prepareTranspiledJs.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Full verification**

Run: `npm run lint && npm run typecheck && npm test`
Expected: all pass, test count +6

- [ ] **Step 6: Commit**

```bash
git add src/utils/prepareTranspiledJs.ts src/utils/prepareTranspiledJs.test.ts
git commit -m "Put the transpiler-output rewrites where a test can reach them"
```

---

## Task 2: 実行を iframe 内の Worker へ移す

このタスクの成果物は「無限ループでタブが固まらなくなる」こと。出力はまだ従来どおり実行完了後にまとめて送る（ストリーミングは Task 3）。

Playwright の導入をこのタスクに含めるのは、**このバグが vitest では構造的に検出できない**ため。jsdom にスレッドは無く、「固まらないこと」を主張できるのは実ブラウザだけ。

**Files:**
- Create: `src/sandbox/executor.js`, `src/sandbox/supervisor.js`, `playwright.config.ts`, `e2e/sandbox.spec.ts`
- Modify: `src/components/ExecutionSandbox.tsx`（全面改修）, `package.json`（`test:e2e` スクリプトと devDependency）, `.gitignore`（`test-results/`, `playwright-report/`）
- Test: `e2e/sandbox.spec.ts`

**Interfaces:**
- Consumes: `prepareTranspiledJs(js: string): string`（Task 1）、`getRuntimeBundle(url: string): Promise<string>`（既存 `src/utils/runtimeBundle.ts`）
- Produces:
  - `ExecutionSandboxHandle` = `{ execute(js: string, requestId: string): void }`（Task 4 で `stop` が加わる）
  - iframe ↔ Worker のメッセージ契約（下記）

**メッセージ契約（このタスクで確定）**

```
親 → iframe   { type: "execute", js: string, requestId: string }
iframe → Worker { type: "run", js: string }
Worker → iframe { type: "output", lines: string[] }
Worker → iframe { type: "done", outputLines: number }
Worker → iframe { type: "error", message: string }
iframe → 親    上記に requestId を付けて中継
```

- [ ] **Step 1: Playwright を devDependency に入れる**

```bash
npm i -D --no-audit --no-fund @playwright/test@1.59.1
npx playwright install chromium
```

- [ ] **Step 2: Playwright 設定を書く**

`playwright.config.ts`:

```ts
import { defineConfig } from "@playwright/test";

/**
 * e2e runs against the PRODUCTION build, not the dev server. The bug these
 * tests exist for (#28) is about threads and bundling, and the dev server's
 * module graph does not reproduce either.
 *
 * `vite preview` does NOT apply public/_headers, so CSP-dependent behaviour is
 * still only observable on a Cloudflare Pages preview. What these tests can
 * prove is the threading; the CSP side is verified once per change on the Pages
 * preview URL (see CLAUDE.md).
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  fullyParallel: false,
  use: { baseURL: "http://localhost:4173" },
  webServer: {
    command: "npm run build && npm run preview -- --port 4173 --strictPort",
    url: "http://localhost:4173",
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
```

- [ ] **Step 3: package.json にスクリプトを足す**

`scripts` に追加:

```json
"test:e2e": "playwright test"
```

`.gitignore` に追加:

```
test-results/
playwright-report/
```

- [ ] **Step 4: 失敗する e2e テストを書く**

`e2e/sandbox.spec.ts`:

```ts
import { test, expect, type Page } from "@playwright/test";

const EDITOR = ".monaco-editor, textarea";

/** Replace the editor contents with `source`. */
async function typeProgram(page: Page, source: string): Promise<void> {
  await page.waitForSelector(EDITOR, { timeout: 30_000 });
  await page.click(EDITOR);
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.type(source);
}

/**
 * Poll the page with a SHORT per-call timeout. This is the whole trick: a
 * frozen renderer makes `evaluate` hang, and a hang is indistinguishable from
 * slowness unless you bound it. Bounded, the freeze becomes an error we can
 * assert on.
 */
async function stayedResponsive(page: Page, seconds: number): Promise<boolean> {
  for (let i = 0; i < seconds; i++) {
    try {
      await page.evaluate(() => 1 + 1, undefined, { timeout: 1000 });
    } catch {
      return false;
    }
    await page.waitForTimeout(1000);
  }
  return true;
}

test("an endless loop does not freeze the tab", async ({ page }) => {
  await page.goto("/");
  await typeProgram(page, "REPORT ztest.\nDO.\nENDDO.");
  await page.getByRole("button", { name: /Run/i }).click();

  // The watchdog is 5s at this point in the plan; give it room and keep
  // checking that the renderer is still answering the whole time.
  expect(await stayedResponsive(page, 8)).toBe(true);
});

test("an endless loop still produces a terminal result", async ({ page }) => {
  await page.goto("/");
  await typeProgram(page, "REPORT ztest.\nDO.\nENDDO.");
  await page.getByRole("button", { name: /Run/i }).click();

  // The run must end on its own: the Run button becomes usable again.
  await expect(page.getByRole("button", { name: /Run/i })).toBeEnabled({
    timeout: 30_000,
  });
  await expect(page.getByText(/timeout/i)).toBeVisible();
});

test("an ordinary program still runs and prints", async ({ page }) => {
  await page.goto("/");
  await typeProgram(page, "REPORT ztest.\nWRITE 'hello from e2e'.");
  await page.getByRole("button", { name: /Run/i }).click();
  await expect(page.getByText("hello from e2e")).toBeVisible({
    timeout: 30_000,
  });
});
```

- [ ] **Step 5: Run the e2e tests to verify they fail**

Run: `npm run test:e2e`
Expected: 最初の 2 本が FAIL。1 本目は `stayedResponsive` が `false`（レンダラが固まる）、2 本目は Run ボタンが有効に戻らずタイムアウト。3 本目は PASS（現状でも普通のプログラムは動く）。

**これが #28 の再現である。** ここで実際に落ちることを確認してから先へ進むこと。

- [ ] **Step 6: Worker 本体を書く**

`src/sandbox/executor.js`:

```js
// Execution worker. Concatenated with the @abaplint/runtime bundle and turned
// into a blob: Worker by ExecutionSandbox.tsx, so this file must be plain ES5-
// compatible script with no imports — it is never processed as a module.
//
// This is the thread that runs the user's ABAP. It exists so that a runaway
// loop occupies a thread nobody else needs: the iframe that supervises it stays
// responsive and can terminate() this worker, which is precisely what the
// old design could not do (#28).

var MAX_OUTPUT_BYTES = 1024 * 1024;
var MAX_LINES = 10000;

/**
 * Collects WRITE output. `total` is what the program produced; `emitted` is
 * what we sent. They differ once MAX_LINES is hit, and the measurement must
 * report the first — counting sent lines makes every runaway loop read as
 * exactly MAX_LINES + 1.
 */
function OutputCollector() {
  this.data = "";
  this.total = 0;
  this.empty = true;
}
OutputCollector.prototype.clear = function () {
  this.data = "";
};
OutputCollector.prototype.add = function (text) {
  this.empty = false;
  if (this.data.length >= MAX_OUTPUT_BYTES) return;
  var remaining = MAX_OUTPUT_BYTES - this.data.length;
  if (text.length > remaining) {
    this.data = this.data + text.slice(0, remaining) + "\n[output truncated]";
  } else {
    this.data = this.data + text;
  }
};
OutputCollector.prototype.get = function () {
  return this.data;
};
OutputCollector.prototype.isEmpty = function () {
  return this.empty;
};
OutputCollector.prototype.getTrimmed = function () {
  return this.data
    .split("\n")
    .map(function (a) {
      return a.replace(/\s+$/, "");
    })
    .join("\n");
};

self.onmessage = async function (event) {
  var data = event.data;
  if (!data || data.type !== "run" || typeof data.js !== "string") return;

  var collector = new OutputCollector();
  try {
    var abap = new abaplintRuntime.ABAP({ console: collector });
    var AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
    var fn = new AsyncFunction("abap", data.js);
    await fn(abap);

    var text = collector.get();
    var total = 0;
    if (text) {
      var lines = text.split("\n");
      total = lines.length;
      var emit = total > MAX_LINES ? MAX_LINES : total;
      var slice = lines.slice(0, emit);
      if (total > MAX_LINES) {
        slice.push("[output truncated: " + (total - MAX_LINES) + " more lines]");
      }
      self.postMessage({ type: "output", lines: slice });
    }
    self.postMessage({ type: "done", outputLines: total });
  } catch (e) {
    self.postMessage({ type: "error", message: (e && e.message) || String(e) });
  }
};
```

- [ ] **Step 7: iframe 側の監督スクリプトを書く**

`src/sandbox/supervisor.js`:

```js
// Runs inside the sandbox="allow-scripts" iframe (opaque origin, no DOM access
// to the parent). It executes nothing itself: it builds the worker that does,
// and relays messages in both directions.
//
// Keeping this thread empty is the entire fix for #28. The iframe shares the
// parent's main thread, so anything CPU-bound here freezes the whole tab.

(function () {
  var worker = null;
  var requestId = null;

  function toParent(message) {
    message.requestId = requestId;
    window.parent.postMessage(message, "*");
  }

  function disposeWorker() {
    if (worker === null) return;
    worker.terminate();
    worker = null;
  }

  window.addEventListener("message", function (event) {
    // Only our parent may drive this frame.
    if (event.source !== window.parent) return;
    var data = event.data;
    if (!data) return;

    if (data.type === "stop") {
      disposeWorker();
      toParent({ type: "stopped", outputLines: 0 });
      return;
    }

    if (data.type !== "execute") return;
    if (typeof data.js !== "string" || typeof data.requestId !== "string") return;

    requestId = data.requestId;
    try {
      var blob = new Blob([self.__executorSource], { type: "text/javascript" });
      worker = new Worker(URL.createObjectURL(blob));
      worker.onmessage = function (m) {
        var payload = m.data;
        if (payload.type === "done" || payload.type === "error") {
          disposeWorker();
        }
        toParent(payload);
      };
      worker.onerror = function (err) {
        disposeWorker();
        toParent({
          type: "error",
          message: (err && err.message) || "Execution worker failed",
        });
      };
      worker.postMessage({ type: "run", js: data.js });
    } catch (err) {
      disposeWorker();
      toParent({
        type: "error",
        message: (err && err.message) || String(err),
        fatal: true,
      });
    }
  });
})();
```

- [ ] **Step 8: メッセージ型を更新する**

`src/types/messages.ts` の `SandboxResponse` を差し替え:

```ts
export type SandboxResponse =
  /** A flush of WRITE output. Batched, never one message per line: 5000 single
   *  postMessages starved the iframe's own timers down to a single tick. */
  | { type: "output"; lines: string[]; requestId: string }
  | { type: "error"; message: string; requestId: string; fatal?: boolean }
  /**
   * `outputLines` is the number of lines the run actually produced, which is
   * not the number of lines we sent: display stops at MAX_LINES and a runaway
   * loop would otherwise report exactly MAX_LINES + 1 every time.
   */
  | { type: "done"; requestId: string; outputLines: number };
```

- [ ] **Step 9: ExecutionSandbox を Worker 構成に書き換える**

`src/components/ExecutionSandbox.tsx` で、以下を変更する。

`buildSandboxHtml` を差し替え（`?raw` で読んだ 2 本のスクリプトを埋める）:

```tsx
import executorSource from "../sandbox/executor.js?raw";
import supervisorSource from "../sandbox/supervisor.js?raw";
```

```tsx
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
<script>self.__executorSource = ${JSON.stringify(workerSource)};<\/script>
<script>${supervisorSource}<\/script>
</body></html>`;
}
```

`handleMessage` の `output` 分岐を配列に合わせる:

```tsx
      if (data.type === "output") {
        onOutput(data.lines, data.requestId);
      } else if (data.type === "error") {
        finish();
        onError(data.message, data.requestId, data.fatal ? "load" : "runtime");
      } else if (data.type === "done") {
        finish();
        onDone(data.requestId, data.outputLines);
      }
```

`execute` の中で JS を前処理してから送る:

```tsx
import { prepareTranspiledJs } from "../utils/prepareTranspiledJs";
```

```tsx
        iframe.onload = () => {
          iframe.contentWindow?.postMessage(
            { type: "execute", js: prepareTranspiledJs(js), requestId },
            "*",
          );
        };
```

props の型を更新:

```tsx
  onOutput: (lines: string[], requestId: string) => void;
```

`EXECUTION_TIMEOUT_MS` のコメントから「KNOWN LIMIT (#28)」の段落を消し、実際に効くようになったことを書く:

```tsx
/**
 * Deadline for a run, enforced from the parent page.
 *
 * This used to be decorative: the sandbox ran on the parent's main thread, so a
 * CPU-bound loop blocked the timer that was supposed to rescue it (#28). The
 * transpiled JS now runs in a Worker inside the frame, so the frame and the
 * parent both stay free and this timer fires when it should.
 */
```

- [ ] **Step 10: App.tsx の `handleOutput` を配列に合わせる**

`src/App.tsx`:

```tsx
  const handleOutput = useCallback((lines: string[], requestId: string) => {
    if (requestId === validationRequestIdRef.current) {
      // Validation only cares whether the runtime stage succeeded, not what it
      // printed.
      return;
    }
    runOutputCountRef.current += lines.length;
    setOutput((prev) => [...prev, ...lines]);
  }, []);
```

- [ ] **Step 11: unit テストを通す**

Run: `npm run lint && npm run typecheck && npm test`
Expected: all pass。既存テストで `onOutput` の呼ばれ方に依存しているものがあれば配列に直す。

- [ ] **Step 12: e2e で #28 が直ったことを確認する**

Run: `npm run test:e2e`
Expected: 3 本すべて PASS。特に 1 本目 `stayedResponsive` が `true` を返すこと — これが本タスクの成果物そのもの。

- [ ] **Step 13: Commit**

```bash
git add -A
git commit -m "Run the transpiled ABAP on a thread nobody else needs (#28)"
```

---

## Task 3: 出力をバッチでストリーミングし、真の行数を報告する

Task 2 の時点では出力は実行完了後にまとめて送られる。したがって 5 秒で殺された実行は依然として何も表示しない。ここでそれを直す。#41 も同時に閉じる。

**Files:**
- Modify: `src/sandbox/executor.js`, `src/sandbox/supervisor.js`, `src/types/messages.ts`, `src/components/ExecutionSandbox.tsx`, `src/App.tsx`
- Test: `e2e/sandbox.spec.ts`（追記）

**Interfaces:**
- Consumes: Task 2 のメッセージ契約
- Produces:
  - `Worker → iframe { type: "stopped", outputLines: number }`（強制終了時に監督が合成する）
  - `ExecutionSandboxProps.onStopped: (requestId: string, outputLines: number) => void`

- [ ] **Step 1: 失敗する e2e テストを書く**

`e2e/sandbox.spec.ts` に追記:

```ts
test("output written before a timeout is still shown", async ({ page }) => {
  await page.goto("/");
  await typeProgram(page, "REPORT ztest.\nDO.\nWRITE 'tick'.\nENDDO.");
  await page.getByRole("button", { name: /Run/i }).click();

  // The loop never ends, so this text can only appear if output is flushed
  // while the program is still running.
  await expect(page.getByText("tick").first()).toBeVisible({ timeout: 10_000 });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx playwright test -g "output written before a timeout"`
Expected: FAIL — 出力は実行完了後にしか送られないので `tick` は現れない。

- [ ] **Step 3: executor をフラッシュ方式にする**

`src/sandbox/executor.js` の `OutputCollector` と `onmessage` を差し替える:

```js
var MAX_OUTPUT_BYTES = 1024 * 1024;
var MAX_LINES = 10000;
var FLUSH_LINES = 500;
var FLUSH_INTERVAL_MS = 50;

/**
 * Buffers WRITE output and flushes it in batches.
 *
 * Not one message per line, deliberately: 5000 individual postMessages starved
 * the supervising frame's own 20ms timer down to a single tick, which would
 * have re-created a weaker version of the freeze this whole change removes.
 *
 * `total` is what the program produced; `emitted` is what we sent. They part
 * ways at MAX_LINES, and the measurement reports `total` — counting sent lines
 * makes every runaway loop read as exactly MAX_LINES + 1.
 */
function OutputStreamer() {
  this.pending = [];
  this.partial = "";
  this.total = 0;
  this.emitted = 0;
  this.bytes = 0;
  this.empty = true;
  this.truncated = false;
  this.lastFlush = Date.now();
}
OutputStreamer.prototype.clear = function () {
  this.partial = "";
  // MemoryConsole treats clear() as "nothing has been written", and isEmpty()
  // is what WRITE ... NEW-LINE consults to decide whether to prepend a newline.
  // The old PostMessageConsole forgot this; do not copy that.
  this.empty = true;
};
OutputStreamer.prototype.add = function (text) {
  this.empty = false;
  if (this.bytes >= MAX_OUTPUT_BYTES) return;
  this.bytes += text.length;
  var combined = this.partial + text;
  var pieces = combined.split("\n");
  // The last piece has no newline yet; hold it until one arrives.
  this.partial = pieces.pop();
  for (var i = 0; i < pieces.length; i++) this.push(pieces[i]);
  if (this.pending.length >= FLUSH_LINES) this.flush();
  else if (Date.now() - this.lastFlush >= FLUSH_INTERVAL_MS) this.flush();
};
OutputStreamer.prototype.push = function (line) {
  this.total++;
  if (this.emitted >= MAX_LINES) {
    if (!this.truncated) {
      this.truncated = true;
      this.pending.push("[output truncated]");
    }
    return;
  }
  this.emitted++;
  this.pending.push(line.replace(/\s+$/, ""));
};
OutputStreamer.prototype.flush = function () {
  this.lastFlush = Date.now();
  if (this.pending.length === 0) return;
  self.postMessage({ type: "output", lines: this.pending });
  this.pending = [];
};
/** Emit any line that never got its trailing newline, then flush. */
OutputStreamer.prototype.finish = function () {
  if (this.partial !== "") {
    this.push(this.partial);
    this.partial = "";
  }
  this.flush();
};
OutputStreamer.prototype.get = function () {
  return this.partial;
};
OutputStreamer.prototype.isEmpty = function () {
  return this.empty;
};
OutputStreamer.prototype.getTrimmed = function () {
  return this.partial;
};

self.onmessage = async function (event) {
  var data = event.data;
  if (!data || data.type !== "run" || typeof data.js !== "string") return;

  var streamer = new OutputStreamer();
  try {
    var abap = new abaplintRuntime.ABAP({ console: streamer });
    var AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
    var fn = new AsyncFunction("abap", data.js);
    await fn(abap);
    streamer.finish();
    self.postMessage({ type: "done", outputLines: streamer.total });
  } catch (e) {
    streamer.finish();
    self.postMessage({
      type: "error",
      message: (e && e.message) || String(e),
      outputLines: streamer.total,
    });
  }
};
```

- [ ] **Step 4: 監督が行数を数え、停止時にそれを報告する**

`terminate()` された Worker は何も返せないので、**監督側が流れていった行数を数えておく**。これがないと停止時の `output_lines` が 0 のままになり、#41 が半分しか直らない。

`src/sandbox/supervisor.js` を差し替え:

```js
(function () {
  var worker = null;
  var requestId = null;
  // The worker cannot report anything once it is terminated, so the count of
  // what it managed to emit has to live out here.
  var linesRelayed = 0;

  function toParent(message) {
    message.requestId = requestId;
    window.parent.postMessage(message, "*");
  }

  function disposeWorker() {
    if (worker === null) return;
    worker.terminate();
    worker = null;
  }

  window.addEventListener("message", function (event) {
    if (event.source !== window.parent) return;
    var data = event.data;
    if (!data) return;

    if (data.type === "stop") {
      disposeWorker();
      toParent({ type: "stopped", outputLines: linesRelayed });
      return;
    }

    if (data.type !== "execute") return;
    if (typeof data.js !== "string" || typeof data.requestId !== "string") return;

    requestId = data.requestId;
    linesRelayed = 0;
    try {
      var blob = new Blob([self.__executorSource], { type: "text/javascript" });
      worker = new Worker(URL.createObjectURL(blob));
      worker.onmessage = function (m) {
        var payload = m.data;
        if (payload.type === "output") {
          linesRelayed += payload.lines.length;
        } else if (payload.type === "done" || payload.type === "error") {
          disposeWorker();
        }
        toParent(payload);
      };
      worker.onerror = function (err) {
        disposeWorker();
        toParent({
          type: "error",
          message: (err && err.message) || "Execution worker failed",
          outputLines: linesRelayed,
        });
      };
      worker.postMessage({ type: "run", js: data.js });
    } catch (err) {
      disposeWorker();
      toParent({
        type: "error",
        message: (err && err.message) || String(err),
        fatal: true,
        outputLines: 0,
      });
    }
  });
})();
```

- [ ] **Step 5: `stopped` を型と配線に足す**

`src/types/messages.ts`:

```ts
  | { type: "error"; message: string; requestId: string; fatal?: boolean; outputLines?: number }
  | { type: "done"; requestId: string; outputLines: number }
  /**
   * The worker was terminated from outside — the watchdog fired, or the user
   * pressed Stop. `outputLines` is what the supervisor saw go past before it
   * pulled the plug; the worker itself cannot report anything at this point.
   */
  | { type: "stopped"; requestId: string; outputLines: number };
```

`src/components/ExecutionSandbox.tsx` の props に追加:

```tsx
  /** The run was terminated from outside — watchdog or user. */
  onStopped: (requestId: string, outputLines: number) => void;
```

`handleMessage` に分岐を追加し、`error` でも行数を渡す:

```tsx
      } else if (data.type === "stopped") {
        finish();
        onStopped(data.requestId, data.outputLines);
      }
```

`handleMessage` の deps に `onStopped` を足すこと。

- [ ] **Step 6: ウォッチドッグを「殺す前に頼む」形にする**

親が iframe を消すだけだと、それまでの行数が失われる。先に停止を頼み、返事が来なければ従来どおり消す。

`ExecutionSandbox.tsx` の watchdog:

```tsx
      timeoutRef.current = window.setTimeout(() => {
        // Ask the frame to stop first: it knows how many lines went past, and
        // that number is the difference between "timed out, here is what you
        // got" and "timed out, nothing to show". Removing the iframe outright
        // is the fallback, armed in case the frame itself is wedged.
        const frame = iframeRef.current;
        if (frame?.contentWindow) {
          frame.contentWindow.postMessage({ type: "stop", requestId }, "*");
          stopFallbackRef.current = window.setTimeout(() => {
            if (activeRequestIdRef.current !== requestId) return;
            finish();
            onTimeout(requestId, runOutputSeenRef.current);
          }, 250);
          return;
        }
        finish();
        onTimeout(requestId, 0);
      }, EXECUTION_TIMEOUT_MS);
```

`stopFallbackRef` を `useRef<number | undefined>(undefined)` で宣言し、`cleanup` で `window.clearTimeout(stopFallbackRef.current)` すること。`onTimeout` の型を `(requestId: string, outputLines: number) => void` に変える。`stopped` を受け取ったときは、ウォッチドッグ由来なら `onTimeout` へ、ユーザー由来なら `onStopped` へ振り分ける（Task 4 で Stop ボタンが入るまでは全て `onTimeout`）。

実装を単純に保つため、監督への停止要求に理由を持たせる:

```
親 → iframe { type: "stop", requestId, reason: "timeout" | "user" }
iframe → 親 { type: "stopped", requestId, outputLines, reason }
```

`supervisor.js` の `stop` 分岐で `data.reason` をそのまま返すこと。

- [ ] **Step 7: App.tsx を新しい終端イベントに合わせる**

```tsx
  const handleTimeout = useCallback(
    (requestId: string, outputLines: number) => {
      const message = `Execution stopped after ${EXECUTION_TIMEOUT_SECONDS}s — this usually means an endless loop.`;
      if (requestId === validationRequestIdRef.current) {
        endValidationRuntime({ status: "fail", error: message });
        return;
      }
      endRun("timeout", message, outputLines);
    },
    [endRun, endValidationRuntime],
  );
```

`handleError` も同様に `outputLines` を受け取って `endRun` へ渡す。これで #41（`runtime_error` / `timeout` の `output_lines` が必ず 0）が閉じる。

- [ ] **Step 8: e2e を通す**

Run: `npm run test:e2e`
Expected: 4 本すべて PASS。`tick` が表示されること。

- [ ] **Step 9: Full verification**

Run: `npm run lint && npm run typecheck && npm test && npm run test:e2e`

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "Flush output while the program is still running, and count what it made (#41)"
```

---

## Task 4: Stop ボタンと `stopped` outcome、ウォッチドッグ 15 秒

**Files:**
- Modify: `src/utils/analytics.ts`, `src/utils/analytics.test.ts`, `src/components/Toolbar.tsx`, `src/components/ExecutionSandbox.tsx`, `src/App.tsx`, `CLAUDE.md`
- Test: `src/utils/analytics.test.ts`, `e2e/sandbox.spec.ts`

**Interfaces:**
- Consumes: `ExecutionSandboxHandle`（Task 2）、`stopped` メッセージ（Task 3）
- Produces: `ExecutionSandboxHandle` = `{ execute(js, requestId): void; stop(requestId): void }`

- [ ] **Step 1: 失敗する unit テストを書く**

`src/utils/analytics.test.ts` の「全 exit path が allowlist を通る」テストに `stopped` を足す。加えて:

```ts
  it("accepts the stopped outcome", () => {
    expect(
      sanitizeParams("run_result", {
        outcome: "stopped",
        duration_ms: 900,
        output_lines: 42,
      }),
    ).toEqual({ outcome: "stopped", duration_ms: 900, output_lines: 42 });
  });
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/utils/analytics.test.ts`
Expected: FAIL — `stopped` は `RUN_OUTCOMES` に無いので値が落ちる。

- [ ] **Step 3: `stopped` を outcome に足す**

`src/utils/analytics.ts` の `RunOutcome` と `RUN_OUTCOMES` に `"stopped"` を追加し、doc コメントに 1 行:

```
 * - `stopped`     the user pressed Stop — their choice, not a failure and not
 *                 the watchdog. Kept apart from `cancelled`, which means the
 *                 other mode took the sandbox away.
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/utils/analytics.test.ts`
Expected: PASS

- [ ] **Step 5: ハンドルに `stop` を足す**

`src/components/ExecutionSandbox.tsx`:

```tsx
export interface ExecutionSandboxHandle {
  execute: (js: string, requestId: string) => void;
  /** Ask the running program to stop. No-op if `requestId` no longer owns the sandbox. */
  stop: (requestId: string) => void;
}
```

```tsx
  const stop = useCallback((requestId: string) => {
    if (activeRequestIdRef.current !== requestId) return;
    const frame = iframeRef.current;
    if (!frame?.contentWindow) return;
    frame.contentWindow.postMessage({ type: "stop", requestId, reason: "user" }, "*");
  }, []);

  useImperativeHandle(ref, () => ({ execute, stop }), [execute, stop]);
```

`stopped` の受信で `reason` を見て振り分ける:

```tsx
      } else if (data.type === "stopped") {
        finish();
        if (data.reason === "user") onStopped(data.requestId, data.outputLines);
        else onTimeout(data.requestId, data.outputLines);
      }
```

- [ ] **Step 6: ウォッチドッグを 15 秒にする**

```tsx
/**
 * Deadline for a run. 15s, not the old 5s: that number was chosen when a long
 * run froze the tab, so cutting things short was the lesser harm. It is not
 * any more, and 5s was killing legitimately slow loops on phones. The user can
 * also stop a run themselves now, which is what makes a longer deadline safe.
 */
const EXECUTION_TIMEOUT_MS = 15000;
const EXECUTION_TIMEOUT_SECONDS = EXECUTION_TIMEOUT_MS / 1000;
```

`EXECUTION_TIMEOUT_SECONDS` を export して App.tsx のメッセージで使うこと（数字を 2 箇所に書かない）。

- [ ] **Step 7: Toolbar に Stop を出す**

`src/components/Toolbar.tsx` の props に `onStop: () => void;` を足し、Run ボタンを差し替える:

```tsx
      {mode === "playground" && (
        <button
          onClick={isRunning ? onStop : onRun}
          className={`flex items-center gap-1.5 px-4 py-1.5 text-white text-sm font-medium rounded transition-colors ${
            isRunning
              ? "bg-red-600 hover:bg-red-500"
              : "bg-green-600 hover:bg-green-500"
          }`}
        >
          {isRunning ? "■ Stop" : "▶ Run"}
        </button>
      )}
```

`disabled` を外すのが要点 — 実行中こそ押せなければならない。

- [ ] **Step 8: App.tsx を配線する**

```tsx
  const handleStopClick = useCallback(() => {
    sandboxRef.current?.stop(playgroundRequestIdRef.current);
  }, []);

  const handleStopped = useCallback(
    (requestId: string, outputLines: number) => {
      const message = "Execution stopped.";
      if (requestId === validationRequestIdRef.current) {
        endValidationRuntime({ status: "fail", error: message });
        return;
      }
      endRun("stopped", message, outputLines);
    },
    [endRun, endValidationRuntime],
  );
```

`<Toolbar onStop={handleStopClick} ... />` と `<ExecutionSandbox onStopped={handleStopped} ... />` を渡す。

- [ ] **Step 9: e2e テストを追記する**

```ts
test("the user can stop an endless loop immediately", async ({ page }) => {
  await page.goto("/");
  await typeProgram(page, "REPORT ztest.\nDO.\nWRITE 'tick'.\nENDDO.");
  await page.getByRole("button", { name: /Run/i }).click();

  const stop = page.getByRole("button", { name: /Stop/i });
  await expect(stop).toBeVisible({ timeout: 10_000 });
  await stop.click();

  // Back to Run well before the 15s watchdog would have done it anyway.
  await expect(page.getByRole("button", { name: /Run/i })).toBeVisible({
    timeout: 5_000,
  });
  await expect(page.getByText("tick").first()).toBeVisible();
});
```

Task 2 の「終端結果が出る」テストは 15 秒ウォッチドッグに合わせて待ち時間を伸ばすこと。

- [ ] **Step 10: CLAUDE.md を更新する**

- outcome 表に `stopped` を追加：`the user pressed Stop`
- 「`run_result` reports one of eight outcomes」→ **nine**
- 「**Do not read a low `timeout` count as ...**」の段落を書き換える。srcdoc がメインスレッドを共有する話は**もう当てはまらない**。代わりに「#28 以前のデータには `timeout` がほぼ無く、それは実際に起きていなかったからではなくページが死んでいたから。修正前後のデータを比較しないこと」と書く。日付を入れる。
- `output_lines` の段落に、異常終了時も実数が入るようになったことを追記（#41）。

- [ ] **Step 11: Full verification**

Run: `npm run lint && npm run typecheck && npm test && npm run test:e2e`
Expected: all pass（e2e 5 本）

- [ ] **Step 12: Commit**

```bash
git add -A
git commit -m "Let the user stop a run, and give the watchdog room now that it works"
```

---

## Task 5: 仕上げ — Cloudflare Pages プレビューでの CSP 確認と issue クローズ

`vite preview` は `public/_headers` を適用しない。blob Worker が本番 CSP を通ることは実測済みだが、**この実装が通ることは別途 1 回確認する必要がある**。

**Files:**
- Modify: `CLAUDE.md`（Known Gotchas に 1 項目）

- [ ] **Step 1: PR を出し、Cloudflare Pages プレビュー URL を得る**

- [ ] **Step 2: プレビュー URL で手動確認**

- `REPORT ztest. DO. WRITE 'tick'. ENDDO.` を Run
- 出力が流れ始めること、ページが応答し続けること
- Stop で止まること
- **DevTools の Console に CSP 違反が出ていないこと**（`worker-src` / `script-src`）

- [ ] **Step 3: モバイル実機で 15 秒が妥当か確認**

重いが正当なループ（例: `DO 2000000 TIMES. ENDDO.`）が完走するか。しないなら値を見直す。

- [ ] **Step 4: Known Gotchas に追記**

```markdown
- The execution sandbox is an iframe **and** a Worker. The iframe
  (`sandbox="allow-scripts"`, opaque origin) is the isolation; the `blob:`
  Worker inside it is what keeps a runaway loop off the shared main thread.
  Removing either one breaks a different thing. `worker-src 'self' blob:` in
  `public/_headers` is what lets the second exist, and `vite preview` does not
  apply it — verify Worker creation on a Pages preview, not locally.
```

- [ ] **Step 5: issue をクローズする**

```bash
gh issue close 28 --comment "PR #<n> で修正。iframe 内 Worker への分離、Stop ボタン、ウォッチドッグ 15s。Playwright で「無限ループでページが応答し続ける」ことを常設テスト化した。"
gh issue close 41 --comment "PR #<n> で解消。出力を実行中にフラッシュし、監督側が行数を数えるようになったので、timeout / runtime_error でも output_lines が実数になる。"
```

- [ ] **Step 6: Gate3**

```bash
timeout 3600 claude -p "/goal /code-gate を実行し critical 0 を達成する。5回で打ち切り" --permission-mode acceptEdits
```

続けて異族レビュー（abundant モードなので codex 先頭）:

```bash
claude-external-review --tool codex --context CLAUDE.md \
  --intent "..." --perspective "..."
```

---

## Self-Review

**Spec coverage**

| 仕様の項目 | 対応タスク |
|---|---|
| iframe 内 Worker への分離 | Task 2 |
| `src/sandbox/executor.js` | Task 2 / 3 |
| JS 前処理を純関数へ | Task 1 |
| 出力バッチ（500 行 / 50ms） | Task 3 |
| Stop ボタン | Task 4 |
| ウォッチドッグ 15s | Task 4 |
| `stopped` outcome とその波及先 | Task 4 |
| `output_lines` の真値維持 | Task 3（executor の `total`）+ Task 3 Step 4（監督の `linesRelayed`） |
| バッファ 1 MB / 表示 10,000 行 | Task 3 |
| Playwright 常設化 | Task 2（導入）/ 3 / 4（追記） |
| CSP をプレビューで確認 | Task 5 |
| モバイル実機確認 | Task 5 |
| #41 クローズ | Task 5 |

仕様の `supervisor.js` は File Structure に無かったが、iframe 側の責務を実ファイルに出す必要があるので追加した（仕様の「iframe は中継役になる」の実装）。

**console インターフェースの契約（調査済み・実装時の制約）**

`OutputStreamer` は `@abaplint/runtime` の console インターフェースを満たす必要がある
（`clear` / `add` / `get` / `isEmpty` / `getTrimmed`）。ストリーミング化すると
`get` / `getTrimmed` の意味が「全出力」から「未フラッシュの残り」に変わるので、
ランタイムがそれらに依存していないかを先に確認した。**依存していない。**

- 実行中にランタイムが呼ぶのは **`add()` と `isEmpty()` だけ**
  （`src/sandbox/runtime-bundle.js:10207-10253`、`WriteStatement.write`）。
- `isEmpty()` は `WRITE ... NEW-LINE` で改行を前置するかの判定に使われる。
  **これは正しく実装すること** — 壊すと出力の改行が崩れる。
- `get()` / `getTrimmed()` / `clear()` は実行中に呼ばれない。証拠として、同梱の
  `StandardOutConsole`（正規の実装）は `get()` が空文字を返し `getTrimmed()` は
  **例外を投げる**。それで production が成り立っている以上、実行経路には無い。

したがって `OutputStreamer` の `get()` / `getTrimmed()` が未フラッシュ分しか返さなくても
安全。`isEmpty()` だけは `MemoryConsole` の意味論（何も書かれていなければ true、
`clear()` で true に戻る）に合わせること。既存の `PostMessageConsole` は `clear()` で
`empty` を戻し忘れているので、そこは踏襲しない。
