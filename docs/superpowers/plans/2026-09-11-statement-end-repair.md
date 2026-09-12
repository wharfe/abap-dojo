# ピリオド抜け・行末セミコロンのヒント 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Run が構文エラーで失敗したとき、ピリオド抜けと行末セミコロンについて「何を直せば通るか」を 1 行で出し、GA4 の `syntax_repair` に `missing_period` / `semicolon` を送る。あわせて #75（再パース探索が重い貼り付けでワーカーを塞ぎ、本物の構文エラーが `stalled` に化けうる）を直す。

**Architecture:** 2 つの独立した変更を 1 つの PR に入れる。(1) #69 の方式（書き換えた版を abaplint に再パースさせ、判定が良くなった書き換えだけ採る）を新ファイル `src/workers/statementEndRepair.ts` に足し、二重引用符の `findSyntaxRepair` が何も見つけなかったときだけ試す。(2) **ワーカーの返信を 2 通に割る** — 判定（`transpile-result` / `transpile-error`）を先に送り、探索の結果（`syntax-hint` / `silent-loss`）を同じ `requestId` で後から送る。これで 20 秒のウォッチドッグの窓に入るのは元のパースだけになり、探索がどれだけ遅くても `outcome` が嘘にならない。成功側の `silent_loss` も同じ形にする（探索をトランスパイルの後ろへ移すので、成功する Run は実行開始がむしろ早くなる）。

**Tech Stack:** TypeScript, `@abaplint/core`, `@abaplint/transpiler`（config）, React, Vitest, Playwright

**Spec:** `docs/superpowers/specs/2026-09-11-statement-end-repair-design.md`

## Global Constraints

- **送るのは列挙値だけ。** `line` は画面表示専用で GA4 に送らない。ユーザーのソースは一切送らない
- **GA4 のパラメータもイベントも増やさない**（仕様 Q10）。`run_result` は今までどおり 1 通
- **1 回の `transpile` 要求に対して、ワーカーは必ず 2 通返す**（仕様 Q8・不変条件 5）。判定 → 追いかけ。探索が空振りでも、探索が走らなくても、追いかけの 1 通は必ず送る
- **`duration_ms` は `endRun` が呼ばれた時点で確定させる**（仕様 不変条件 7）。送信を遅らせても数字の意味を変えない
- **`run_click` と `run_result` は 1:1 のまま**（仕様 不変条件 6）。送るのが遅れるだけで落とさない
- **見捨てられた Run（`stalled` / `stopped` / `cancelled`）は追いかけを待たずその場で送る**（仕様 不変条件 8）
- 探索は Run のときだけ。`handleLint` には一切入れない
- 16 kB 超のソースはどの探索もしない（`MAX_SOURCE_CHARS`。64 kB から下げる）。種類ごとに行候補は最大 10（`MAX_CANDIDATES`）+ まとめ候補 1。加えて探索開始から `SEARCH_BUDGET_MS`（3 秒）を過ぎたら新しい再パースを始めない
- 試す順: 二重引用符（既存）→ `semicolon` → `missing_period`
- ヒント文言は固定文。行番号以外にユーザー由来の値を入れない。**Tailwind のユーティリティ名になる英単語を裸で書かない**（#44。`src/index.css` に `source(none)` が無く v4 がディスク上の全ファイルを走査するため、コメントの英単語 1 つが本番 CSS になる）
- コードのコメントは英語、ユーザー向け文字列は英語。2 スペース、名前付き export
- **Validator モード（`handleValidate`）は触らない**（仕様 プロトコル節）
- 計画中の `/tmp/...` は書きやすさのための既定。セッションのスクラッチパッドがあるならそちらへ置き換えてよい
  （どちらでもよいが、**repo の中には置かない** — Tailwind v4 がディスクを走査するため）

## File Structure

| ファイル | 役割 | Task |
|---|---|---|
| `src/types/diagnostics.ts` | 列挙値 `SYNTAX_REPAIRS` に 2 値追加 | 1 |
| `src/utils/repairHint.ts` | ヒント文言 2 種追加 | 1 |
| `src/utils/repairHint.test.ts` | 新規・文言のテスト | 1 |
| `src/workers/searchLimits.ts` | 新規・`MAX_CANDIDATES` / `MAX_SOURCE_CHARS`（import を持たない） | 2 |
| `src/workers/syntaxRepair.ts` | 定数 2 つを再 export、`MAX_SOURCE_CHARS` を 16 kB へ、`errorIssues` を切り出し | 2 |
| `src/workers/statementEndRepair.ts` | 新規・ピリオド抜け／セミコロンの候補生成と探索 | 2 |
| `src/workers/statementEndRepair.test.ts` | 新規 | 2 |
| `src/workers/searchSizeCap.test.ts` | 新規・大きさの上限だけを見るテスト | 2 |
| `src/workers/searchDeadline.ts` | 新規・Run ごとに共有する 3 秒の打ち切り | 3 |
| `src/workers/searchDeadline.test.ts` | 新規 | 3 |
| `src/types/messages.ts` | `syntax-hint` / `silent-loss` を追加、`repair` / `silentLoss*` を判定メッセージから降ろす | 4 |
| `src/workers/abaplintWorker.ts` | 判定を先に post し、探索の後で追いかけを post する | 4 |
| `src/workers/abaplintWorker.test.ts` | 新規・1 要求につき必ず 2 通（判定の経路が投げても） | 4 |
| `src/App.tsx` | 判定で表示、追いかけで `run_result`。`data-search` の状態 | 5 |
| `src/App.test.tsx` | 既存 1 件を新プロトコルへ、追いかけの状態機械の新規 5 件 | 5 |
| `src/components/OutputPanel.tsx` | `data-search` 属性 | 5 |
| `e2e/helpers.ts` | `waitForSearchDone` を足し、`waitForRunToEnd` の説明を直す | 6 |
| `e2e/syntaxHint.spec.ts` | 新規 4 件 + 既存の否定 2 件を直す | 6 |
| `e2e/silentLoss.spec.ts` | 既存 2 件を直す | 6 |
| `CLAUDE.md` / `src/utils/analytics.ts` | 文書 | 7 |

**Task 3（旧計画の Task 2b）と Task 4・5 が新しい。** 旧計画の Gate2 記録は旧番号（Task 3 = 配線、Task 4 = 文書）で書かれているので、記録を読むときは末尾の対応表を見ること。

---

### Task 1: 列挙値とヒント文言

**Files:**
- Modify: `src/types/diagnostics.ts:142`（`SYNTAX_REPAIRS`）とその直前のコメント、`SyntaxRepair.line` のコメント
- Modify: `src/utils/repairHint.ts`（`repairHint` の switch）
- Create: `src/utils/repairHint.test.ts`

**Interfaces:**
- Produces: `SyntaxRepairKind = "double_quote" | "semicolon" | "missing_period"`、`repairHint({ kind, line? }): string`

- [ ] **Step 0: CSS の基準を取る（どのファイルも触る前に）**

Tailwind v4 はディスク上のファイルを走査するので、未追跡の新ファイルがあると `git stash` では基準にならない（CLAUDE.md Known Gotchas）。着手前のツリーで取る。

Tailwind v4 は `docs/superpowers/*.md` も走査する。この計画は新しいコードの文字列を一字一句含むので、計画を置いたまま基準を取ると、コードが増やすクラスが基準に先に入り、比較が何も検出しない（Gate2 3 周目 M-A。レビュー役が `mt-8` など 5 ルールで実測）。基準も最終（Task 7 Step 5）も `docs/superpowers` を一時的に外してビルドする。

```bash
if [ -e /tmp/sp-hold/superpowers ]; then echo "HOLD_EXISTS"; exit 1; fi
mkdir -p /tmp/sp-hold && mv docs/superpowers /tmp/sp-hold/ && trap 'mv /tmp/sp-hold/superpowers docs/' EXIT INT TERM HUP
npm run build >/dev/null 2>&1; echo "BUILD=$?"
cp dist/assets/index-*.css /tmp/before.css && ls -l /tmp/before.css
```
  Expected: `BUILD=0`。続けて別の呼び出しで `git status --short docs/` が何も出さない（`docs/superpowers` が戻っている）

- [ ] **Step 1: 失敗するテストを書く** — `src/utils/repairHint.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { repairHint } from "./repairHint";
import { sanitizeParams } from "./analytics";

describe("repairHint for a statement end", () => {
  it("names the row a semicolon is on", () => {
    const hint = repairHint({ kind: "semicolon", line: 2 });
    expect(hint).toContain("not a semicolon");
    expect(hint).toContain("line 2");
  });

  it("drops the row for a semicolon when several were rewritten", () => {
    const hint = repairHint({ kind: "semicolon" });
    expect(hint).toContain("not a semicolon");
    expect(hint).not.toContain("line");
  });

  it("names the row a statement ends on when its period is missing", () => {
    const hint = repairHint({ kind: "missing_period", line: 3 });
    expect(hint).toContain("every ABAP statement ends with a period");
    expect(hint).toContain("line 3");
  });

  it("drops the row for a missing period when several were rewritten", () => {
    const hint = repairHint({ kind: "missing_period" });
    expect(hint).toContain("every ABAP statement ends with a period");
    expect(hint).not.toContain("line");
  });

  it("states the fix rather than offering it as a condition", () => {
    // Unlike the double quote, the search behind these kinds only accepts a
    // rewrite that clears every error it targeted (see statementEndRepair.ts),
    // and nobody writes a semicolon or omits a period on purpose.
    expect(repairHint({ kind: "semicolon", line: 1 })).not.toContain("If you");
    expect(repairHint({ kind: "missing_period", line: 1 })).not.toContain("If you");
  });
});

describe("syntax_repair carries the new kinds", () => {
  it.each(["semicolon", "missing_period"])("keeps %s on a syntax_error", (kind) => {
    expect(
      sanitizeParams("run_result", {
        outcome: "syntax_error",
        duration_ms: 1,
        output_lines: 0,
        syntax_repair: kind,
      }),
    ).toMatchObject({ syntax_repair: kind });
  });
});
```

- [ ] **Step 2: 赤を確認** — Run: `npm test -- src/utils/repairHint.test.ts`
  Expected: FAIL（`repairHint` が `undefined` を返す／`syntax_repair` が落とされる）。typecheck も `kind: "semicolon"` で落ちる

- [ ] **Step 3: 列挙値を足す** — `src/types/diagnostics.ts:142`

```ts
export const SYNTAX_REPAIRS = ["double_quote", "semicolon", "missing_period"] as const;
```

直前のコメント末尾（`misused quote from ... WRITE |He said "hi"|.` の段落の後、`*/` の前）に追記:

```ts
 *
 * `semicolon` and `missing_period` (#67) are the other two shapes the `WRITE`
 * bucket turned out to hold. They are found by src/workers/statementEndRepair.ts
 * under a stricter rule than `double_quote`, because appending a period makes
 * almost any line look like a finished statement: a rewrite is kept only if it
 * clears every error it targeted, not merely if the count went down.
```

同じファイルの `SyntaxRepair.line` のコメントは二重引用符の話（1 行に複数のペア）だけで書かれていて、新しい 2 種について偽になる（Gate2 3 周目 L-b）。`* comment. The hint drops the row rather than point somewhere never wrong.` の行の直後（`*/` の前）に追記:

```ts
   *
   * The same holds for `semicolon` and `missing_period`: their
   * rewrite-everything candidate can end several statements at once, and the
   * score does not say which of those edits mattered.
```

- [ ] **Step 4: ヒント文言を足す** — `src/utils/repairHint.ts` の `repairHint` の switch に 2 ケース追加（`double_quote` の case の後）

```ts
    case "semicolon":
      return repair.line === undefined
        ? `Hint: ABAP ends a statement with a period, not a semicolon.`
        : `Hint: ABAP ends a statement with a period, not a semicolon — ` +
            `change the one on line ${repair.line}.`;
    case "missing_period":
      return repair.line === undefined
        ? `Hint: every ABAP statement ends with a period, and some here have none.`
        : `Hint: every ABAP statement ends with a period, and the one ending ` +
            `on line ${repair.line} has none.`;
```

ファイル冒頭のコメントの `mean a comment reads "if you meant that as literal data" and moves on.` の行の直後（空の ` *` 行と `Kept apart from App.tsx` の段落の前）に追記する。節の末尾は Tailwind の段落なので、そこに置くと「That argument」が Tailwind の話を指して読める（Gate2 2 周目 L-4）:

```ts
 *
 * That argument is about the double quote. `semicolon` and `missing_period`
 * are stated flatly: their search keeps a rewrite only when it clears every
 * error it targeted, and neither mistake is something anyone does on purpose,
 * so a conditional would only make a near-certain fix harder to read.
```

- [ ] **Step 5: 緑を確認** — Run: `npm test -- src/utils/repairHint.test.ts src/workers/syntaxRepair.test.ts && npm run typecheck`
  Expected: PASS（既存 `syntaxRepair.test.ts` も無修正で緑）

- [ ] **Step 6: Commit**

```bash
git add src/types/diagnostics.ts src/utils/repairHint.ts src/utils/repairHint.test.ts
git commit -m "ピリオド抜けとセミコロンのヒント文言と列挙値を足す (#67)"
```

---

### Task 2: 候補生成と探索（`statementEndRepair.ts`）

**Files:**
- Create: `src/workers/searchLimits.ts`（`MAX_CANDIDATES` / `MAX_SOURCE_CHARS` の本体。**import を 1 つも持たないこと** — e2e から読むため）
- Modify: `src/workers/syntaxRepair.ts:69-98`（上の 2 定数を `searchLimits.ts` から import して再 export に、`MAX_SOURCE_CHARS` を `16 * 1024` に、両定数のコメントを実測に合わせて書き直す。`errorIssues` を足して `countErrors` をそれで数える。`RepairCandidate.line` のコメントを直す。他は変えない）
- Create: `src/workers/searchSizeCap.test.ts`
- Create: `src/workers/statementEndRepair.ts`
- Create: `src/workers/statementEndRepair.test.ts`

**Interfaces:**
- Consumes: `MAX_CANDIDATES`, `MAX_SOURCE_CHARS`, `RepairCandidate`, `errorIssues`, `doubleQuoteCandidates`, `findSilentLoss`（`syntaxRepair.ts`）、`SyntaxRepair`（Task 1）
- Produces:
  - `interface ErrorSpan { start: number; end: number }`
  - `errorSpanOf(issue: Issue): ErrorSpan`
  - `interface StatementEndCandidate extends RepairCandidate { targets: number[] }`
  - `statementEndCandidates(kind: "semicolon" | "missing_period", source: string, spans: readonly ErrorSpan[]): StatementEndCandidate[]`
  - `errorRowCounter(config: Config, filename: string): (candidate: string) => Promise<number[]>`
  - `findStatementEndRepair(source: string, spans: readonly ErrorSpan[], errorRowsIn: (c: string) => Promise<number[]>): Promise<SyntaxRepair | undefined>`
  - `errorIssues(issues: readonly Issue[]): Issue[]`（`syntaxRepair.ts` から export）

**既存 `src/workers/syntaxRepair.test.ts` について。** アサーションは 1 つも変えない（16 kB 以下で二重引用符の結果が変わらないことの証拠）。既存の大きさのテスト 2 件（`:132-133` と `:575-576`）は 64 kB 超の入力なので、16 kB 化の後も上限で弾かれて緑のまま。**例外はコメント 1 行だけ** — `:546` の `The worker sets \`silentLossChecked\` before calling this` は Task 4 で消える変数名を指すので、Task 4 Step 6 で直す。旧計画の「1 文字も変えない」はここだけ緩める。

- [ ] **Step 1: 失敗するテストを書く** — `src/workers/statementEndRepair.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { Buffer } from "buffer";
(globalThis as unknown as { Buffer: typeof Buffer }).Buffer = Buffer;

import { Config, Registry, MemoryFile } from "@abaplint/core";
import { config as transpilerConfig } from "@abaplint/transpiler";
import {
  errorRowCounter,
  errorSpanOf,
  findStatementEndRepair,
  statementEndCandidates,
} from "./statementEndRepair";
import { errorIssues } from "./syntaxRepair";

/** The worker's own configuration — see the note in syntaxRepair.test.ts. */
const config = new Config(JSON.stringify(transpilerConfig));
const errorRowsIn = errorRowCounter(config, "ztest.prog.abap");

/** Search the way the worker does: take the spans from one parse, then look. */
async function repairOf(source: string) {
  const registry = new Registry(config);
  registry.addFile(new MemoryFile("ztest.prog.abap", source));
  await registry.parseAsync();
  const spans = errorIssues(registry.findIssues()).map(errorSpanOf);
  return findStatementEndRepair(source, spans, errorRowsIn);
}

describe("statementEndCandidates", () => {
  it("appends a period to the row an error ends on, keeping CRLF", () => {
    const source = `REPORT z.\r\nWRITE: 'a',\r\n  'b'\r\n`;
    expect(
      statementEndCandidates("missing_period", source, [{ start: 2, end: 3 }])[0],
    ).toEqual({
      line: 3,
      source: `REPORT z.\r\nWRITE: 'a',\r\n  'b'.\r\n`,
      targets: [2, 3],
    });
  });

  it("replaces a trailing semicolon, keeping CRLF", () => {
    expect(
      statementEndCandidates("semicolon", `REPORT z.\r\nWRITE 'a';\r\n`, [
        { start: 2, end: 2 },
      ]),
    ).toEqual([{ line: 2, source: `REPORT z.\r\nWRITE 'a'.\r\n`, targets: [2] }]);
  });

  it("does not touch a row that already ends a statement or continues a chain", () => {
    const spans = [{ start: 2, end: 3 }];
    expect(
      statementEndCandidates("missing_period", `REPORT z.\nWRITE: 'a',\nWRITE 'b'.`, spans),
    ).toEqual([]);
  });

  it("adds a rewrite-everything candidate, last and with no line, only for several rows", () => {
    const candidates = statementEndCandidates(
      "missing_period",
      `REPORT z.\nWRITE 'a'\nWRITE 'b'`,
      [{ start: 2, end: 3 }],
    );
    expect(candidates.at(-1)).toEqual({
      source: `REPORT z.\nWRITE 'a'.\nWRITE 'b'.`,
      targets: [2, 3],
    });
    expect(
      statementEndCandidates("missing_period", `REPORT z.\nWRITE 'a'`, [
        { start: 2, end: 2 },
      ]).every((c) => c.line !== undefined),
    ).toBe(true);
  });

  it("stops at the budget", () => {
    const source = Array.from({ length: 30 }, (_, i) => `WRITE ${i};`).join("\n");
    const spans = Array.from({ length: 30 }, (_, i) => ({ start: i + 1, end: i + 1 }));
    // 10 single-row candidates plus the one that rewrites everything.
    expect(statementEndCandidates("semicolon", source, spans)).toHaveLength(11);
  });

  it("narrows the rewrite-everything candidate to the errors it rewrote", () => {
    // An unrelated error elsewhere survives any rewrite, so making it a target
    // would reject a real repair (Gate2 M1).
    const candidates = statementEndCandidates(
      "missing_period",
      `REPORT z.\nWRITE 'a'\nWRITE 'b'\nWRITE 'c'.\nWRTE 'd'.`,
      [
        { start: 2, end: 3 },
        { start: 5, end: 5 },
      ],
    );
    expect(candidates.at(-1)).toEqual({
      source: `REPORT z.\nWRITE 'a'.\nWRITE 'b'.\nWRITE 'c'.\nWRTE 'd'.`,
      targets: [2, 3],
    });
  });

  it("does not search a source too large to search cheaply", () => {
    const source = `WRITE 'a';\n`.repeat(1500);
    expect(source.length).toBeGreaterThan(16 * 1024);
    expect(statementEndCandidates("semicolon", source, [{ start: 1, end: 1 }])).toEqual([]);
  });
});

describe("findStatementEndRepair search", () => {
  it("reports nothing when there was no error", async () => {
    const never = () => Promise.reject(new Error("must not re-parse"));
    expect(await findStatementEndRepair(`WRITE 'a';`, [], never)).toBeUndefined();
  });

  it("rejects a rewrite that lowers the count but leaves an error where it aimed", async () => {
    // Pasted JavaScript: `console.log('a')` is two errors on one row, and a
    // period turns it into one. A plain count would call that a repair.
    const onePerRow = () => Promise.resolve([1]);
    expect(
      await findStatementEndRepair(
        `console.log('a')`,
        [
          { start: 1, end: 1 },
          { start: 1, end: 1 },
        ],
        onePerRow,
      ),
    ).toBeUndefined();
  });

  it("tries the semicolon before the period", async () => {
    const clean = () => Promise.resolve([]);
    expect(
      await findStatementEndRepair(`WRITE 'a';`, [{ start: 1, end: 1 }], clean),
    ).toEqual({ kind: "semicolon", line: 1 });
  });

  it("reports nothing rather than letting a re-parse throw escape", async () => {
    const throws = () => Promise.reject(new Error("parser blew up"));
    await expect(
      findStatementEndRepair(`WRITE 'a';`, [{ start: 1, end: 1 }], throws),
    ).resolves.toBeUndefined();
  });
});

/**
 * abaplint is the judge. Every row here was checked against the real parser
 * (2026-09-11). Most of the quiet ones would stay quiet under a plain count
 * too: only the two `console.log` rows depend on the stricter acceptance rule,
 * and the last test below is a real repair that rule gives up. The spec
 * records that trade.
 */
describe("findStatementEndRepair against the real parser", () => {
  it.each([
    ["on the last line", `REPORT z.\nWRITE 'hello'`, 2],
    ["before another statement", `REPORT z.\nWRITE 'a'\nWRITE 'b'.`, 2],
    ["inside IF", `REPORT z.\nIF 1 = 1.\n  WRITE 'a'\nENDIF.`, 3],
    ["at the end of a chain over two rows", `REPORT z.\nWRITE: 'a',\n       'b'`, 3],
    [
      "at the end of a call over two rows",
      `REPORT z.\nDATA lv TYPE string.\nlv = to_upper(\n  'a' )`,
      4,
    ],
    ["in CRLF", `REPORT z.\r\nWRITE 'hello'\r\nWRITE 'b'.`, 2],
    ["with no REPORT line", `WRITE 'hello'`, 1],
  ])("finds a missing period %s", async (_, source, line) => {
    expect(await repairOf(source)).toEqual({ kind: "missing_period", line });
  });

  it("finds consecutive missing periods, naming no row", async () => {
    // abaplint reports these as ONE error, so no one-row edit lowers the count.
    expect(await repairOf(`REPORT z.\nWRITE 'a'\nWRITE 'b'`)).toEqual({
      kind: "missing_period",
    });
    expect(await repairOf(`REPORT z.\nWRITE 'a'\nWRITE 'b'\nWRITE 'c'`)).toEqual({
      kind: "missing_period",
    });
  });

  it("finds a semicolon", async () => {
    expect(await repairOf(`REPORT z.\nWRITE 'a';`)).toEqual({ kind: "semicolon", line: 2 });
    expect(await repairOf(`REPORT z.\r\nWRITE 'a';\r\nWRITE 'b'.`)).toEqual({
      kind: "semicolon",
      line: 2,
    });
  });

  it("finds semicolons on consecutive rows, naming no row", async () => {
    expect(await repairOf(`REPORT z.\nWRITE 'a';\nWRITE 'b';`)).toEqual({
      kind: "semicolon",
    });
  });

  it("finds consecutive missing periods beside an unrelated error", async () => {
    // Gate2 M1: silent while the rewrite-everything candidate targeted row 5.
    expect(
      await repairOf(`REPORT z.\nWRITE 'a'\nWRITE 'b'\nWRITE 'c'.\nWRTE 'd'.`),
    ).toEqual({ kind: "missing_period" });
  });

  it.each([
    ["a misspelt keyword", `REPORT z.\nWRTE 'a'.`],
    ["pasted JavaScript", `REPORT z.\nconsole.log('a')`],
    ["pasted JavaScript with a semicolon", `REPORT z.\nconsole.log('a');`],
    ["a JavaScript declaration", `REPORT z.\nconst x = 5;`],
    ["two lines of JavaScript", `REPORT z.\nlet x = 1\nconsole.log(x)`],
    ["pasted Python", `REPORT z.\nprint('a')`],
    ["a missing period beside a misspelt keyword", `REPORT z.\nWRITE 'a'\nWRTE 'b'.`],
    ["a type we do not carry", `REPORT z.\nDATA lt TYPE string_table.`],
    ["a program that parses", `REPORT z.\nWRITE 'a'.`],
  ])("keeps quiet on %s", async (_, source) => {
    expect(await repairOf(source)).toBeUndefined();
  });

  it("cannot reach a missing period hidden behind an end-of-line comment", async () => {
    // The appended period lands inside the comment. Pinned so the limit stays a
    // decision rather than a surprise.
    expect(await repairOf(`REPORT z.\nWRITE 'a' " note`)).toBeUndefined();
  });

  it("cannot reach semicolons abaplint merges into one error with a misspelt keyword", async () => {
    // abaplint reports rows 2-4 as ONE error, so the misspelt row is a target
    // of every rewrite and its surviving error rejects each of them. Pinned:
    // this is the real repair the stricter rule costs.
    expect(await repairOf(`REPORT z.\nWRITE 'a';\nWRITE 'b';\nWRTE 'd'.`)).toBeUndefined();
  });
});
```

同じ Step で `src/workers/searchSizeCap.test.ts` も作る（`statementEndRepair.ts` を import しないので、実装前に「期待値で赤」になることを確かめられる — Gate2 2 周目 L-8）:

```ts
import { describe, it, expect } from "vitest";
import { Buffer } from "buffer";
(globalThis as unknown as { Buffer: typeof Buffer }).Buffer = Buffer;

import { doubleQuoteCandidates, findSilentLoss } from "./syntaxRepair";

/**
 * #75: every search shares one size cap, lowered from 64 kB. The work of one
 * parse grows far faster than the source — `WRITE 'value#';` on every row
 * took 116 ms at 16 kB and 1,431 ms at 64 kB in Node (2026-09-11) — so at
 * 64 kB the double-quote search alone took 12.8 s in Firefox.
 *
 * Since the worker now answers with the verdict BEFORE searching (#67 plan
 * Task 4), a slow search no longer turns a real `syntax_error` into
 * `stalled`. What the cap now bounds is how long this worker is unavailable
 * to `lint`, which runs on every keystroke and cannot interleave: abaplint's
 * `parseAsync` does not yield (0 macrotasks during a 1,502 ms parse,
 * measured 2026-09-12).
 */
describe("the size cap every search shares", () => {
  const under = `WRITE "a".\n`.repeat(1489);
  const over = `WRITE "a".\n`.repeat(1490);

  it("sits at 16 kB", () => {
    expect(under.length).toBeLessThanOrEqual(16 * 1024);
    expect(over.length).toBeGreaterThan(16 * 1024);
    expect(doubleQuoteCandidates(under)).not.toEqual([]);
    expect(doubleQuoteCandidates(over)).toEqual([]);
  });

  it("stops the silent-loss search too, and reports that it did not look", async () => {
    let parses = 0;
    const counting = () => {
      parses++;
      return Promise.resolve({ errors: 0, real: 1 });
    };
    await expect(
      findSilentLoss(over, { errors: 0, real: 1 }, counting),
    ).resolves.toEqual({ completed: false });
    expect(parses).toBe(0);
  });
});
```

- [ ] **Step 2: 赤を確認** — Run: `npm test -- src/workers/statementEndRepair.test.ts src/workers/searchSizeCap.test.ts > /tmp/red.log 2>&1; echo "EXIT=$?"; grep -E "FAIL|✓|×|AssertionError|Failed to resolve" /tmp/red.log`
  Expected: `EXIT` が非 0。`statementEndRepair.test.ts` は `Failed to resolve import "./statementEndRepair"` で FAIL。**`searchSizeCap.test.ts` は 2 件とも AssertionError で FAIL**（`doubleQuoteCandidates(over)` が空でない／`completed: true`）。こちらが import やビルドの失敗で赤になっていないことを出力で確かめる — 大きさの上限を「正しい理由で赤」にする確認はここだけ

- [ ] **Step 3: 定数を export し、大きさの上限を 16 kB に下げる** — `src/workers/syntaxRepair.ts`

(i) 80〜85 行あたり。旧:

```ts
 * The cap bounds the worst case (a program with a quote on every line) at
 * eleven parses of a Playground-sized program. A file whose only misused
 * quote is below the tenth quoted line gets no hint, which is the right way
 * to fail: silence, not a wrong guess.
 */
const MAX_CANDIDATES = 10;
```

新:

```ts
 * The cap bounds each search at eleven parses: ten candidates plus the one
 * that rewrites everything. On the failure path the statement-end search
 * (statementEndRepair.ts, #67) reuses it for two more kinds, so a failing Run
 * re-parses at most 33 times after the original. A file whose only misused
 * quote is below the tenth quoted line gets no hint, which is the right way
 * to fail: silence, not a wrong guess.
 */
export const MAX_CANDIDATES = 10;
```

(ii) `/**` から `const MAX_SOURCE_CHARS = 64 * 1024;` までをまるごと置き換える。**本体は新しいファイル
`src/workers/searchLimits.ts` へ移し、`syntaxRepair.ts` からは再 export する。**

理由は 1 つだけ: **e2e からも同じ値を読めるようにするため**。Task 6 の重いペーストのテストは上限ちょうどの
入力を使うので、上限が動いたらそのテストは何も確かめなくなる（Gate2 1 周目 M3）。ところが
`syntaxRepair.ts` を Playwright の spec から import すると `@abaplint/core`（2.7 MB）が Node 側に載る。
**import が要らないだけの定数ファイルなら、両方から安全に読める。**

`src/workers/searchLimits.ts`（新規。**import を 1 つも持たないこと** — それがこのファイルの存在理由）:

```ts
// The two caps that bound every re-parse search. They live in a file with no
// imports because e2e/syntaxHint.spec.ts reads MAX_SOURCE_CHARS too, and
// importing syntaxRepair.ts from a Playwright spec would pull @abaplint/core
// (2.7 MB) into the test runner. Their rationale is on the re-exports in
// syntaxRepair.ts, next to the code that obeys them.
export const MAX_CANDIDATES = 10;
export const MAX_SOURCE_CHARS = 16 * 1024;
```

`syntaxRepair.ts` 側は (i) の `export const MAX_CANDIDATES = 10;` と (ii) の
`export const MAX_SOURCE_CHARS = ...;` を宣言ではなく再 export にする（JSDoc はここに残す — 読む人は
こちらに来る）:

```ts
import { MAX_CANDIDATES, MAX_SOURCE_CHARS } from "./searchLimits";
export { MAX_CANDIDATES, MAX_SOURCE_CHARS };
```

置き換える JSDoc の本文:

```ts
/**
 * Above this many characters, do not search at all.
 *
 * What this bounds is how long this worker is unavailable to `lint`, which
 * fires on every keystroke. It cannot interleave with a search: abaplint's
 * `parseAsync` does not yield to the event loop (0 macrotasks during a
 * 1,502 ms parse, Node, 2026-09-12), so every re-parse blocks the thread
 * outright.
 *
 * It no longer bounds anything about correctness. The worker posts the
 * verdict BEFORE searching (abaplintWorker.ts, #67/#75), so a slow search
 * delays a hint and never turns a real `syntax_error` into `stalled`.
 *
 * The candidate cap bounds the number of parses but not the work, and the
 * work of one parse does not grow in proportion to the source. A paste whose
 * quotes or semicolons swallow every period is one statement the length of
 * the file: measured 2026-09-11 (Node), one parse of `WRITE 'value#';` on
 * every row took 116 ms at 16 kB and 1,431 ms at 64 kB — four times the text,
 * about twelve times the work, and worse for other shapes. At the old 64 kB
 * cap the double-quote search alone took 12.8 s in Firefox. 16 kB is roughly
 * 400 lines; a longer paste gets no hint and no `silent_loss`.
 *
 * The cap does not bound the time on its own — at 16 kB one parse still
 * ranges from 24 ms to 1.5 s by shape — which is why searchDeadline.ts adds
 * a shared 3 s budget on top.
 */
```

（値そのものは `searchLimits.ts` にあるので、この JSDoc は上の `export { ... }` に付ける。）

(iii) `countErrors` の直前に `errorIssues` を足し、`countErrors` の中身をそれで数える。旧:

```ts
export function countErrors(issues: readonly Issue[]): number {
  return issues.filter((issue) => issue.getSeverity().toString() === "Error")
    .length;
}
```

新:

```ts
export function countErrors(issues: readonly Issue[]): number {
  return errorIssues(issues).length;
}

/**
 * The Error-severity issues themselves — the one definition of "an error"
 * every search uses. statementEndRepair.ts needs their rows as well as their
 * number, and a second filter written there would be two definitions that
 * can drift (#63).
 */
export function errorIssues(issues: readonly Issue[]): Issue[] {
  return issues.filter((issue) => issue.getSeverity().toString() === "Error");
}
```

(iv) `RepairCandidate.line` のコメント（二重引用符の話だけで、新しい 2 種について偽になる — Gate2 3 周目 L-b）。旧:

```ts
   * 1-based row the edit was made on, or `undefined` for the candidate that
   * rewrites everything — always undefined there, even when it happened to
   * touch one row, because that row can hold several pairs and the score
   * attributes the improvement to none of them in particular.
```

新:

```ts
   * 1-based row the edit was made on, or `undefined` for the candidate that
   * rewrites everything — always undefined there, even when it happened to
   * touch one row, because the score attributes the improvement to none of
   * its edits in particular: for the double quote a row can hold several
   * pairs, and for the statement-end kinds (statementEndRepair.ts) the
   * candidate can end several statements at once.
```

- [ ] **Step 4: 実装する** — `src/workers/statementEndRepair.ts`

```ts
/**
 * Find the statement end a failing parse was missing (#67).
 *
 * The sibling of `findSyntaxRepair` in syntaxRepair.ts, for the two shapes the
 * `WRITE` bucket held besides the double quote: a statement with no period,
 * and one ended with a semicolon. Same method — propose an edit, hand the
 * edited source back to abaplint, keep it only if abaplint's verdict improved
 * — with two differences, both measured on 2026-09-11.
 *
 * ## Candidates come from the error's own rows
 *
 * A period could go on any line, so unlike the double quote there is nothing
 * in the text to anchor a candidate to. abaplint's error span is the anchor.
 * The period goes on the row the error ENDS on: for a statement over several
 * rows (`WRITE: 'a',` / `'b'`) the error starts on the first row, and a period
 * there splits the statement and scores 1 -> 2.
 *
 * ## The acceptance rule is stricter than the double quote's
 *
 * Appending a period makes almost any line look like a finished statement.
 * `console.log('a')` is two errors on one row and a period turns it into one,
 * so "the count went down" would tell someone who pasted JavaScript that they
 * forgot a period. A candidate is kept only if the count went down AND no
 * error is left starting on a row it targeted. The double quote keeps its own
 * rule: its data has been flowing since 2026-09-08, and changing what it
 * reports would break the comparison across that date.
 */
import { Registry, MemoryFile, type Config, type Issue } from "@abaplint/core";
import type { SyntaxRepair } from "../types/diagnostics";
import {
  MAX_CANDIDATES,
  MAX_SOURCE_CHARS,
  errorIssues,
  type RepairCandidate,
} from "./syntaxRepair";

/** The 1-based rows an Error-severity issue covers. */
export interface ErrorSpan {
  start: number;
  end: number;
}

export function errorSpanOf(issue: Issue): ErrorSpan {
  return { start: issue.getStart().getRow(), end: issue.getEnd().getRow() };
}

type StatementEndKind = "semicolon" | "missing_period";

/** Tried in this order; see the spec for why the period comes last. */
const KINDS: readonly StatementEndKind[] = ["semicolon", "missing_period"];

/**
 * Trailing whitespace is kept, not trimmed: the source is split on `\n`, so
 * under CRLF every line ends in `\r`, and dropping it would change the
 * candidate in a way the user never wrote.
 */
const TRAILING_SEMICOLON = /;(\s*)$/;
const TRAILING_WHITESPACE = /(\s*)$/;
/** A row that already ends a statement, or continues a chain onto the next. */
const TERMINATED = /[.,:]\s*$/;
const BLANK = /^\s*$/;

export interface StatementEndCandidate extends RepairCandidate {
  /** Rows of the original errors this candidate is meant to clear. */
  targets: number[];
}

function rowsOf(spans: readonly ErrorSpan[]): number[] {
  const rows = new Set<number>();
  for (const span of spans) {
    for (let row = span.start; row <= span.end; row++) rows.add(row);
  }
  return [...rows].sort((a, b) => a - b);
}

export function statementEndCandidates(
  kind: StatementEndKind,
  source: string,
  spans: readonly ErrorSpan[],
): StatementEndCandidate[] {
  if (source.length > MAX_SOURCE_CHARS) return [];

  const lines = source.split("\n");
  const eligible = (row: number): boolean => {
    if (row < 1 || row > lines.length) return false;
    const line = lines[row - 1];
    return kind === "semicolon"
      ? TRAILING_SEMICOLON.test(line)
      : !BLANK.test(line) && !TERMINATED.test(line);
  };
  const edit = (line: string): string =>
    kind === "semicolon"
      ? line.replace(TRAILING_SEMICOLON, ".$1")
      : line.replace(TRAILING_WHITESPACE, ".$1");

  // A semicolon can sit on any row of the span; a missing period belongs on
  // the row the span ends on.
  const singleRows =
    kind === "semicolon"
      ? rowsOf(spans)
      : [...new Set(spans.map((span) => span.end))].sort((a, b) => a - b);

  const candidates: StatementEndCandidate[] = [];
  for (const row of singleRows) {
    if (candidates.length >= MAX_CANDIDATES) break;
    if (!eligible(row)) continue;
    const edited = [...lines];
    edited[row - 1] = edit(lines[row - 1]);
    candidates.push({
      line: row,
      source: edited.join("\n"),
      targets: rowsOf(spans.filter((span) => span.start <= row && row <= span.end)),
    });
  }

  // One more with every eligible row rewritten, for the same reason the double
  // quote has one: abaplint reports consecutive broken statements as a single
  // error, so no one-row edit lowers the count. It names no row, because the
  // score cannot say which of its edits mattered.
  const every = rowsOf(spans).filter(eligible);
  if (every.length > 1) {
    const edited = [...lines];
    for (const row of every) edited[row - 1] = edit(lines[row - 1]);
    // Only the errors a rewritten row belongs to are targets. An unrelated
    // error elsewhere survives any rewrite, so targeting it would reject a
    // real repair.
    const touched = spans.filter((span) =>
      every.some((row) => span.start <= row && row <= span.end),
    );
    candidates.push({ source: edited.join("\n"), targets: rowsOf(touched) });
  }

  return candidates;
}

/**
 * The start rows of a candidate's Error-severity issues — one entry per
 * issue, so its length is the same count `countErrors` takes.
 */
export function errorRowCounter(
  config: Config,
  filename: string,
): (candidate: string) => Promise<number[]> {
  return async (candidate) => {
    const registry = new Registry(config);
    registry.addFile(new MemoryFile(filename, candidate));
    await registry.parseAsync();
    return errorIssues(registry.findIssues()).map((issue) =>
      issue.getStart().getRow(),
    );
  };
}

export async function findStatementEndRepair(
  source: string,
  spans: readonly ErrorSpan[],
  errorRowsIn: (candidate: string) => Promise<number[]>,
): Promise<SyntaxRepair | undefined> {
  if (spans.length === 0) return undefined;

  for (const kind of KINDS) {
    for (const candidate of statementEndCandidates(kind, source, spans)) {
      // A candidate is source this module mangled on purpose, so it reaches
      // the parser in shapes the user's own text never would. A throw here
      // means "no hint" — and since searchDeadline.ts enforces its budget by
      // throwing, this is also how a search that ran out of time ends.
      let after: number[];
      try {
        after = await errorRowsIn(candidate.source);
      } catch {
        return undefined;
      }
      const cleared = !after.some((row) => candidate.targets.includes(row));
      if (after.length < spans.length && cleared) {
        return candidate.line === undefined
          ? { kind }
          : { kind, line: candidate.line };
      }
    }
  }

  return undefined;
}
```

- [ ] **Step 5: 緑を確認** — Run: `npm test -- src/workers/statementEndRepair.test.ts src/workers/searchSizeCap.test.ts src/workers/syntaxRepair.test.ts && npm run typecheck && npm run lint`
  Expected: PASS。`git diff --stat src/workers/syntaxRepair.test.ts` が空

- [ ] **Step 6: Commit**

```bash
git add src/workers/searchLimits.ts src/workers/syntaxRepair.ts src/workers/statementEndRepair.ts src/workers/statementEndRepair.test.ts src/workers/searchSizeCap.test.ts
git commit -m "ピリオド抜けとセミコロンを再パースで探し、探索の大きさの上限を 16 kB に下げる (#67, #75)"
```

---

### Task 3: 探索全体の時間の打ち切り（`searchDeadline.ts`）

仕様 Q7。大きさの上限だけでは、16 kB の `foo(1);` の形で探索が Node 4.9〜6.5 秒、`foo(1, "x");` で 7.8 秒、`x⏎` × 8,192 では候補 1 回が 4.6〜5.8 秒かかる。**守るのは `lint` が止まる時間であって `outcome` の正しさではない**（Task 4 でその保証が構造に移る）ので、超えても人へ戻さない。

**Files:**
- Create: `src/workers/searchDeadline.ts`
- Create: `src/workers/searchDeadline.test.ts`

**Interfaces:**
- Consumes: `findSyntaxRepair`, `findSilentLoss`（`syntaxRepair.ts`）、`findStatementEndRepair`（Task 2）
- Produces: `SEARCH_BUDGET_MS = 3000`、`class SearchDeadlineExceeded extends Error`、`withDeadline<T>(reparse: (c: string) => Promise<T>, deadline: number, now?: () => number): (c: string) => Promise<T>`、`bounded<T>(reparse, now?): (deadline: number) => (c: string) => Promise<T>`

**`bounded` は Gate2 1 周目 M1 への答え。** 指摘は「3 か所のうちどれで `withDeadline` を外しても単体も e2e も全緑」
＝期限の配線に検証が 1 つも無い、というもの。テストを足して見張るのではなく、**外すとコンパイルが通らない形**にする。
`bounded` は「期限を渡して初めて再パース関数になる」ものを返すので、ワーカーが持つ 3 つの定数は
`(deadline) => reparse` 型になり、期限を渡し忘れたものを探索に渡すと型が合わない。**包み忘れは型エラーになる。**

- [ ] **Step 1: 失敗するテストを書く** — `src/workers/searchDeadline.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { Buffer } from "buffer";
(globalThis as unknown as { Buffer: typeof Buffer }).Buffer = Buffer;

import {
  bounded,
  SEARCH_BUDGET_MS,
  SearchDeadlineExceeded,
  withDeadline,
} from "./searchDeadline";
import { findSilentLoss, findSyntaxRepair } from "./syntaxRepair";
import { findStatementEndRepair } from "./statementEndRepair";

/** A clock the test moves by hand. */
function fakeClock() {
  let t = 0;
  return {
    now: () => t,
    advance: (ms: number) => {
      t += ms;
    },
  };
}

describe("withDeadline", () => {
  it("allows three seconds", () => {
    expect(SEARCH_BUDGET_MS).toBe(3000);
  });

  it("starts a re-parse before the deadline", async () => {
    const clock = fakeClock();
    const reparse = withDeadline(() => Promise.resolve(7), 100, clock.now);
    await expect(reparse("x")).resolves.toBe(7);
  });

  it("hands out a re-parse only once a deadline is named", async () => {
    const clock = fakeClock();
    let calls = 0;
    const build = bounded(() => {
      calls++;
      return Promise.resolve(7);
    }, clock.now);
    // `build` itself is not a re-parse — it takes the deadline and returns one.
    const reparse = build(100);
    await expect(reparse("x")).resolves.toBe(7);
    clock.advance(100);
    await expect(reparse("x")).rejects.toBeInstanceOf(SearchDeadlineExceeded);
    expect(calls).toBe(1);
  });

  it("refuses to start one at or after the deadline, without calling through", async () => {
    const clock = fakeClock();
    let calls = 0;
    const reparse = withDeadline(
      () => {
        calls++;
        return Promise.resolve(7);
      },
      100,
      clock.now,
    );
    clock.advance(100);
    await expect(reparse("x")).rejects.toBeInstanceOf(SearchDeadlineExceeded);
    expect(calls).toBe(0);
  });
});

/**
 * The deadline works by throwing, and every search already turns a throwing
 * re-parse into "no answer". These pin that contract for each search: if one
 * of them ever stops swallowing the throw, the throw would escape into
 * abaplintWorker.ts after the verdict was already posted, and the follow-up
 * message the App is waiting for would never be sent.
 */
describe("a search that runs out of time", () => {
  /** Each re-parse costs 60 ms of fake time against a 100 ms budget: two start, the third is refused. */
  function slow<T>(value: T) {
    const clock = fakeClock();
    let calls = 0;
    const reparse = withDeadline(
      () => {
        calls++;
        clock.advance(60);
        return Promise.resolve(value);
      },
      100,
      clock.now,
    );
    return { reparse, calls: () => calls };
  }

  it("leaves the double-quote search with no hint", async () => {
    const source = Array.from({ length: 5 }, (_, i) => `WRITE "a${i}".`).join("\n");
    // The count never drops, so nothing but the deadline ends the search.
    const { reparse, calls } = slow(99);
    await expect(findSyntaxRepair(source, 99, reparse)).resolves.toBeUndefined();
    expect(calls()).toBe(2);
  });

  it("reports the silent-loss search as not completed", async () => {
    const source = Array.from({ length: 5 }, (_, i) => `WRITE: "a${i}".`).join("\n");
    const { reparse, calls } = slow({ errors: 0, real: 1 });
    await expect(
      findSilentLoss(source, { errors: 0, real: 1 }, reparse),
    ).resolves.toEqual({ completed: false });
    expect(calls()).toBe(2);
  });

  it("leaves the statement-end search with no hint", async () => {
    const source = Array.from({ length: 5 }, (_, i) => `WRITE ${i};`).join("\n");
    const spans = Array.from({ length: 5 }, (_, i) => ({ start: i + 1, end: i + 1 }));
    // Every re-parse still reports an error on every row, so nothing is accepted.
    const { reparse, calls } = slow([1, 2, 3, 4, 5]);
    await expect(findStatementEndRepair(source, spans, reparse)).resolves.toBeUndefined();
    expect(calls()).toBe(2);
  });
});
```

- [ ] **Step 2: 赤を確認** — Run: `npm test -- src/workers/searchDeadline.test.ts`
  Expected: FAIL（`Failed to resolve import "./searchDeadline"`）

- [ ] **Step 3: 実装する** — `src/workers/searchDeadline.ts`

```ts
/**
 * One time limit for every re-parse search in a Run (#75).
 *
 * ## What it protects, and what it does not
 *
 * It does NOT protect the syntax verdict. The worker posts that before any
 * search starts (abaplintWorker.ts), so a search that overruns delays a hint
 * and cannot turn a real `syntax_error` into `stalled`. An earlier design put
 * the search in front of the verdict, and then no cap could be made to
 * guarantee enough — which is why the message was split instead.
 *
 * What it protects is `lint`. abaplint's `parseAsync` does not yield to the
 * event loop — 0 macrotasks during a 1,502 ms parse (Node, 2026-09-12) — so
 * while a search runs, every `lint` queued behind it by the user's typing is
 * frozen, and the editor's underlines stop updating.
 *
 * ## It bounds, it does not guarantee
 *
 * The size cap (MAX_SOURCE_CHARS, in searchLimits.ts) bounds how large a
 * source the searches look at, but not how long one parse of it takes: at
 * 16 kB that ranges from 24 ms to 1.5 s by shape alone (Node, 2026-09-11).
 * This deadline cannot stop a parse already running, only refuse to start the
 * next one, so the worst case is the budget plus one parse — about 10 s for
 * the heaviest 16 kB shape measured (`x` on 8,192 rows: 1.5 s original,
 * 5.8 s for one candidate). That is a real cost paid in editor
 * responsiveness, and it is the reason this file exists rather than nothing.
 *
 * The deadline is enforced by throwing from the wrapped re-parse, because
 * every search already treats a throwing re-parse as "no answer" —
 * `findSyntaxRepair` and `findStatementEndRepair` return undefined,
 * `findSilentLoss` reports `completed: false`. None of them needs to know the
 * deadline exists; searchDeadline.test.ts pins that for each.
 *
 * The price: for a paste heavy enough to reach it, whether a hint appears
 * depends on how fast the device is. An ordinary paste (about 20 lines per
 * Run) finishes its searches far below it.
 */

export const SEARCH_BUDGET_MS = 3000;

export class SearchDeadlineExceeded extends Error {
  constructor() {
    super("re-parse search deadline passed");
    this.name = "SearchDeadlineExceeded";
  }
}

/** `reparse`, refusing to start once `now()` has reached `deadline`. */
export function withDeadline<T>(
  reparse: (candidate: string) => Promise<T>,
  deadline: number,
  now: () => number = () => performance.now(),
): (candidate: string) => Promise<T> {
  return (candidate) =>
    now() >= deadline
      ? Promise.reject(new SearchDeadlineExceeded())
      : reparse(candidate);
}

/**
 * The same, as the only way to obtain a re-parse function at all.
 *
 * A caller holding one of these cannot hand it to a search without naming a
 * deadline first — the types do not line up — so a forgotten wrapper is a
 * compile error rather than a search that quietly runs forever. That matters
 * because nothing else can see the omission: the searches behave identically
 * with and without a deadline until an input heavy enough to reach it turns
 * up, and no test in this repo uses one (they pass their own fake re-parse).
 *
 * Wrap the raw counter where it is created (abaplintWorker.ts does this on
 * the same line), so the unbounded form is never in scope at a call site.
 */
export function bounded<T>(
  reparse: (candidate: string) => Promise<T>,
  now: () => number = () => performance.now(),
): (deadline: number) => (candidate: string) => Promise<T> {
  return (deadline) => withDeadline(reparse, deadline, now);
}
```

- [ ] **Step 4: 緑を確認** — Run: `npm test -- src/workers/searchDeadline.test.ts src/workers/statementEndRepair.test.ts src/workers/syntaxRepair.test.ts && npm run typecheck && npm run lint`
  Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/workers/searchDeadline.ts src/workers/searchDeadline.test.ts
git commit -m "再パースの探索に Run ごとの 3 秒の打ち切りを足す (#75)"
```

---

### Task 4: ワーカーのプロトコルを 2 通に割る

仕様 Q8 / Q9。**この Task が #75 を直す本体。** ここまでの Task は探索を足しただけで、探索はまだ判定の前にいる。

**Files:**
- Modify: `src/types/messages.ts`（`WorkerResponse` に 2 つ追加、`repair` / `silentLoss` / `silentLossChecked` を判定メッセージから降ろす）
- Modify: `src/workers/abaplintWorker.ts`（`handleTranspile` を `void` にして自分で post する）
- Modify: `src/workers/syntaxRepair.test.ts:546`（消える変数名を指すコメント 1 行だけ）
- Create: `src/workers/abaplintWorker.test.ts`（「必ず 2 通」の単体テスト。Gate2 1 周目 H3）

**Interfaces:**
- Consumes: `errorRowCounter`, `errorSpanOf`, `findStatementEndRepair`（Task 2）、`errorIssues`（Task 2）、`bounded`, `SEARCH_BUDGET_MS`（Task 3。`withDeadline` は直接使わない — 3 定数を `bounded` で包むので、期限を渡し忘れた形は型が合わない）
- Produces:
  - `{ type: "syntax-hint"; requestId: string; repair?: SyntaxRepair }`
  - `{ type: "silent-loss"; requestId: string; completed: boolean; loss?: SilentLoss }`

- [ ] **Step 1: メッセージ型を変える** — `src/types/messages.ts`

`transpile-result` から `silentLoss` / `silentLossChecked` を削る。旧:

```ts
  | {
      type: "transpile-result";
      js: string;
      requestId: string;
      silentLoss?: SilentLoss;
      silentLossChecked?: boolean;
    }
```

新:

```ts
  | { type: "transpile-result"; js: string; requestId: string }
```

`transpile-error` から `repair` / `silentLoss` / `silentLossChecked` を削る。旧（`repair?: SyntaxRepair;` の直前のコメントごと、`silentLossChecked?: boolean;` まで）:

```ts
      /**
       * Accompanies `kind: "syntax"` only, and only when a one-line edit made
       * abaplint stop complaining — see src/workers/syntaxRepair.ts. Unlike
       * the two fields above it is not purely a measurement: `kind` is the
       * half that may be counted, `line` is there so the browser can say which
       * row to look at. Neither carries source.
       */
      repair?: SyntaxRepair;
      /**
       * Accompanies `kind: "transpile"` only — a statement the user wrote that
       * abaplint parsed away without complaint (#68). It rides on this message
       * as well as on `transpile-result` because the search runs BEFORE
       * transpilation, so a run whose transpiler threw has an answer too.
       *
       * `silentLossChecked` is separate from `silentLoss` and is not
       * redundant: absent means the search never ran (the parse itself threw,
       * or the syntax branch above returned first), while `true` with no
       * `silentLoss` means it ran and found nothing. Analytics needs those
       * apart or `silent_loss` has no denominator.
       */
      silentLoss?: SilentLoss;
      silentLossChecked?: boolean;
    }
```

新（3 つのフィールドをまるごと削り、閉じ括弧だけ残す）:

```ts
    }
  /**
   * The searches, which run AFTER the verdict above has been posted (#67/#75).
   *
   * Splitting them off is what keeps a slow search from corrupting an
   * outcome. Both searches re-parse the whole source up to 11 times each, and
   * one parse of a 16 kB paste ranges from 24 ms to 1.5 s by shape — so while
   * they shared a message with the verdict, a heavy paste pushed the verdict
   * past App.tsx's 20s watchdog and a real `syntax_error` was shown and
   * counted as `stalled` (#75). Now the verdict leaves the worker first
   * (measured 2026-09-12: it reaches the parent 2.5 ms after the request,
   * while the worker stays busy for another 1,699 ms), and these follow.
   *
   * **Exactly one of these is sent for every `transpile` request**, whichever
   * branch the verdict took, and it is sent even when the search found
   * nothing or never ran. App.tsx holds `run_result` until it arrives, so a
   * missing one costs a 20s delay before the event is sent without its
   * `syntax_repair` / `silent_loss`.
   *
   * `syntax-hint` follows `transpile-error` with `kind: "syntax"`.
   * `silent-loss` follows every other exit — `transpile-result`, a transpiler
   * throw, and a parse that threw before any search could run.
   *
   * `completed` carries what `silentLossChecked` used to: `false` means the
   * search never finished, so App must omit `silent_loss` rather than report
   * `none`. Without it, "we looked and found nothing" and "we never looked"
   * would both arrive as an absent `loss` and the denominator would be wrong.
   */
  | { type: "syntax-hint"; requestId: string; repair?: SyntaxRepair }
  | {
      type: "silent-loss";
      requestId: string;
      completed: boolean;
      loss?: SilentLoss;
    }
```

- [ ] **Step 2: 赤を確認（型で）** — Run: `npm run typecheck 2>&1 | head -30; echo "EXIT=$?"`
  Expected: 非 0。`abaplintWorker.ts` と `App.tsx` が、無くなったプロパティを参照して落ちる（`silentLoss`・`silentLossChecked`・`repair`）。**この Step の赤はこの計画で唯一「実装前に配線の穴が型で見える」地点**なので、落ちたファイルと行を控えてから進む

- [ ] **Step 2b: ワーカーに「必ず 2 通」の単体テストを足す** — Create: `src/workers/abaplintWorker.test.ts`

Gate2 1 周目 H3 への赤→緑。**判定の経路が投げたら 0 通になる**という穴は e2e では作れない（abaplint に
投げさせる入力が要る）が、ここでは依存を 1 つ差し替えるだけで作れる。Vitest の environment は `jsdom`
（`vite.config.ts:34`）なので `self` があり、ワーカー本体は `self.onmessage = ...` を代入するだけの
モジュールとして import できる。`self.postMessage` を spy に置き換えて、受け取った順に数える。

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Buffer } from "buffer";
(globalThis as unknown as { Buffer: typeof Buffer }).Buffer = Buffer;

import type { WorkerResponse } from "../types/messages";

// The verdict path calls this, and making it throw is the only way to build
// the case Gate2 H3 found: an exception between "the parse succeeded" and
// "the verdict was posted". `vi.mock` is hoisted, so the flag it reads has to
// be hoisted too.
const { failClassify } = vi.hoisted(() => ({ failClassify: { on: false } }));
vi.mock("./syntaxDiagnostics", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./syntaxDiagnostics")>();
  return {
    ...actual,
    classifySyntaxError: (...args: Parameters<typeof actual.classifySyntaxError>) => {
      if (failClassify.on) throw new Error("classifier blew up");
      return actual.classifySyntaxError(...args);
    },
  };
});

await import("./abaplintWorker");

const posted: WorkerResponse[] = [];
let postSpy: ReturnType<typeof vi.spyOn>;

/** Drive one request through the worker's own onmessage and wait for it. */
async function request(source: string, requestId = "r1"): Promise<WorkerResponse[]> {
  posted.length = 0;
  await (self.onmessage as (e: MessageEvent) => Promise<void>)({
    data: { type: "transpile", source, requestId },
  } as MessageEvent);
  return posted;
}

describe("abaplintWorker — one transpile request, exactly two replies", () => {
  beforeEach(() => {
    failClassify.on = false;
    postSpy = vi
      .spyOn(self, "postMessage")
      .mockImplementation(((m: WorkerResponse) => {
        posted.push(m);
      }) as unknown as typeof self.postMessage);
  });

  afterEach(() => {
    postSpy.mockRestore();
  });

  it("answers a syntax error with the verdict first, then the hint", async () => {
    const messages = await request(`WRITE 'a';`);
    expect(messages).toHaveLength(2);
    expect(messages[0]).toMatchObject({ type: "transpile-error", kind: "syntax" });
    expect(messages[1]).toMatchObject({ type: "syntax-hint", requestId: "r1" });
  });

  it("answers a clean program with the JS first, then the silent-loss result", async () => {
    const messages = await request(`WRITE 'a'.`);
    expect(messages).toHaveLength(2);
    expect(messages[0]).toMatchObject({ type: "transpile-result" });
    expect(messages[1]).toMatchObject({ type: "silent-loss", completed: true });
  });

  // The H3 case. Before the try/finally, this posted nothing at all and the
  // App sat until its 20s watchdog turned a real syntax error into `stalled`.
  it("still sends a verdict and a follow-up when the verdict path throws", async () => {
    failClassify.on = true;
    const messages = await request(`WRITE 'a';`);
    expect(messages).toHaveLength(2);
    expect(messages[0]).toMatchObject({
      type: "transpile-error",
      kind: "transpile",
      requestId: "r1",
    });
    expect(messages[1]).toMatchObject({ type: "silent-loss", completed: false });
  });

  it("echoes the requestId on both replies", async () => {
    const messages = await request(`WRITE 'a'.`, "abc-123");
    expect(messages.map((m) => (m as { requestId?: string }).requestId)).toEqual([
      "abc-123",
      "abc-123",
    ]);
  });
});
```

**注意 3 つ。** ①`self.onmessage` は `async` なので `await` して初めて 2 通目まで揃う。await せずに数えると
1 通目しか見えない。②`vi.spyOn(self, "postMessage")` は jsdom の `window.postMessage`（引数の数が違う）を
置き換えるので、`mockImplementation` を必ず付ける（素の spy だと本物が呼ばれて投げる）。
③このテストは実 abaplint を回すので 1 ケース数百 ms かかる。入力は最小に保つ。

- [ ] **Step 2c: 赤を確認してから緑にする** — Run: `./node_modules/.bin/vitest run src/workers/abaplintWorker.test.ts > /tmp/wt.txt 2>&1; tail -30 /tmp/wt.txt`
  Expected: **この時点では 4 件とも FAIL**（ワーカーはまだ 1 通しか返さず、3 件目は例外がそのまま外へ出る）。
  Step 3 を当てたあとに同じコマンドで 4 件とも PASS。**この順序を守ること** — Step 3 を先に書いてしまうと
  この Task でいちばん確かめたい「0 通になる穴」に赤を一度も見ないまま緑だけを見ることになる。

  **Step 3 を当てても 3 件目（`still sends a verdict and a follow-up when the verdict path throws`）が
  赤なら、直すのはテストではなく実装。** この計画の 1 つ前の版はまさにそれで赤になった:
  判定を送った印を `postVerdict(...)` を**呼ぶ前の行**で立てていたため、引数の中の `classifySyntaxError` が
  投げると外側 catch の「まだ判定を送っていない」判定が false になり、判定 0 通・追いかけ 1 通で
  終わっていた（Gate2 2 周目 C1、実測）。**印を立てるのは `postVerdict` の中だけ**にすること。

  なお `sent` を `let verdict` に「戻す」のも不可。TypeScript が narrowing を `"none"` のまま持つので
  `finally` の比較が **TS2367** で落ち、`tsc -b` ごと止まる（Gate2 3 周目 C1、実測）。
  （`npx` はガードフックに拒否される。vitest は `console.log` を出さないのでファイルに落とす — HANDOFF の注意）

- [ ] **Step 3: ワーカーを書き換える** — `src/workers/abaplintWorker.ts`

import に追加（`} from "./syntaxRepair";` の直後）:

```ts
import {
  errorRowCounter,
  errorSpanOf,
  findStatementEndRepair,
} from "./statementEndRepair";
import { bounded, SEARCH_BUDGET_MS } from "./searchDeadline";
```

既存の `} from "./syntaxRepair";` の import 一覧に `errorIssues` を足す。

`errorsIn` / `scoreIn`（34〜35 行目）を `bounded` で包み、3 つ目を足す。旧:

```ts
const errorsIn = errorCounter(abaplintConfig, SOURCE_FILENAME);
const scoreIn = statementScorer(abaplintConfig, SOURCE_FILENAME);
```

新:

```ts
// Wrapped where they are created, so the unbounded form is never in scope at
// a call site and a forgotten deadline cannot compile (Gate2 1 周目 M1).
// Each is now `(deadline) => reparse`, not a re-parse.
const errorsIn = bounded(errorCounter(abaplintConfig, SOURCE_FILENAME));
const scoreIn = bounded(statementScorer(abaplintConfig, SOURCE_FILENAME));
const errorRowsIn = bounded(errorRowCounter(abaplintConfig, SOURCE_FILENAME));
```

`function isError`（57〜59 行）を削除する（唯一の呼び出しは 90 行で、`errorIssues` に置き換わる。エラーの定義を 1 か所に揃える — Gate2 3 周目 L-a）。削除前に `grep -n isError src/workers/abaplintWorker.ts` が 57 と 90 だけを出すことを確かめる。

`handleTranspile`（73〜166 行）をまるごと次で置き換える:

```ts
/**
 * Answer a Run, in two messages.
 *
 * The verdict goes out as soon as it is known; the searches run afterwards
 * and their answer follows on its own message. That ordering is the whole
 * point (#75): a search over a heavy paste can occupy this worker for
 * seconds, and while it sat in front of the reply, App.tsx's 20s watchdog
 * fired first and a real `syntax_error` was shown and counted as `stalled`.
 *
 * Returns void rather than a response: there are two messages now, and having
 * this function post them itself keeps "exactly one follow-up, always" in one
 * place instead of spread across the caller's branches.
 *
 * ## Why the whole body is inside one try/finally
 *
 * The invariant App.tsx waits on is that a follow-up is sent NO MATTER WHAT.
 * Wrapping only the parts known to be risky is what broke it once already:
 * `new Registry(...)`, `first.getMessage()` and `classifySyntaxError(...)` sit
 * on the verdict path, and a throw from any of them left the request with
 * zero messages — the App then showed a real syntax error as `stalled` 20s
 * later, which is the exact failure this change exists to remove (Gate2 1
 * 周目 H3). So the rule here is structural, not a list of risky calls: every
 * exit runs `finally`, and `finally` sends a follow-up if nothing else did.
 *
 * `sent.verdict` records which one is owed, so the follow-up still pairs with
 * the message the App received (`syntax-hint` after a syntax verdict,
 * `silent-loss` after everything else). App.tsx treats the two the same, but
 * a mismatched pair would make the protocol unreadable in a trace.
 *
 * ## Build the verdict message AS AN ARGUMENT, never in a step of its own
 *
 * `sent.verdict` answers "what has already gone out", and the `catch` below
 * reads it as "was a verdict sent at all". The calls that can throw —
 * `classifySyntaxError`, `first.getMessage()`, `classifyTranspileError` — all
 * sit INSIDE the object literal passed to `postVerdict`, so they are
 * evaluated before the call is entered: a throw from one of them leaves
 * `sent.verdict` at `"none"`, the catch sees no verdict was sent and sends
 * one. That is the whole mechanism. Assigning the flag on a line of its own
 * before the call is what breaks it, and it broke it once: with the flag set
 * first, the catch decided a verdict had gone out and sent none, leaving
 * verdict 0 通・追いかけ 1 通 and the App stalling for 20s — the exact failure
 * this change exists to remove (Gate2 2 周目 C1, reproduced in review).
 *
 * `sent` is an object rather than a `let` for a TypeScript reason, not a
 * style one: a `let` assigned only inside the `postVerdict` closure stays
 * narrowed to `"none"` in the enclosing scope, and `finally`'s
 * `verdict === "syntax"` is then rejected as TS2367 — which stops
 * `tsc -b`, and with it `npm run build` and every e2e run (Gate2 3 周目 C1,
 * measured). A property is re-widened across a call, so the comparison holds.
 */
async function handleTranspile(source: string, requestId: string): Promise<void> {
  // A property, not a `let` — see the TypeScript note above.
  const sent: { verdict: "none" | "syntax" | "other" } = { verdict: "none" };
  let followUpSent = false;
  /** Post the verdict and record it. Never record it at a call site. */
  const postVerdict = (kind: "syntax" | "other", message: WorkerResponse) => {
    self.postMessage(message);
    sent.verdict = kind;
  };
  // Unlike postVerdict, the flag goes up BEFORE the post — deliberately. Its
  // job is "never send two", so a throw must not leave the door open for a
  // second attempt; postVerdict's job is "did one get out", which needs the
  // opposite order. Both are about the same throw, read from opposite ends.
  const postFollowUp = (message: WorkerResponse) => {
    if (followUpSent) return;
    followUpSent = true;
    self.postMessage(message);
  };

  try {
    const reg = new Registry(abaplintConfig);
    // `readonly`, not `Issue[]`: findIssues returns `readonly Issue[]`
    // (abaplint.d.ts:4197). The current code infers it; annotating it by hand
    // is what makes the mismatch visible (TS4104). Gate2 C1.
    let issues: readonly Issue[];
    try {
      reg.addFile(new MemoryFile(SOURCE_FILENAME, source));
      await reg.parseAsync();
      issues = reg.findIssues();
    } catch (e) {
      // The parse itself threw, so there is no verdict and nothing to search.
      const msg = e instanceof Error ? e.message : String(e);
      postVerdict("other", {
        type: "transpile-error",
        kind: "transpile",
        message: msg,
        diagnostics: classifyTranspileError(msg),
        requestId,
      });
      return;
    }

    const errors = errorIssues(issues);
    if (errors.length > 0) {
      const first = errors[0];
      postVerdict("syntax", {
        type: "transpile-error",
        kind: "syntax",
        message: first.getMessage(),
        line: first.getStart().getRow(),
        // The message above is what the user reads and it embeds their source;
        // this is the half we are allowed to count. `first` is deliberately the
        // same issue in both, so the metric can be checked against the screen.
        syntaxDiagnostics: classifySyntaxError(
          first.getKey(),
          errors.length,
          first.getMessage(),
        ),
        requestId,
      });

      // The verdict is out. Everything below only decides whether a hint
      // follows it, and costs at most 33 re-parses — 11 per kind, none above
      // MAX_SOURCE_CHARS, none started once SEARCH_BUDGET_MS has passed. Never
      // on `lint`, which fires on every keystroke. Not scoped to the
      // parse-failure keys: any Error-severity outcome gets the search, which is
      // a superset of what can ever match and one fewer rule to keep in step
      // with abaplint.
      //
      // The double quote is tried first and unchanged; the statement-end search
      // (#67) only runs when it found nothing, so what `double_quote` reports
      // cannot move except where the deadline cuts a search short.
      let repair: SyntaxRepair | undefined;
      try {
        const deadline = performance.now() + SEARCH_BUDGET_MS;
        repair =
          (await findSyntaxRepair(source, countErrors(issues), errorsIn(deadline))) ??
          (await findStatementEndRepair(
            source,
            errors.map(errorSpanOf),
            errorRowsIn(deadline),
          ));
      } catch {
        repair = undefined;
      }
      postFollowUp({ type: "syntax-hint", requestId, repair });
      return;
    }

    // No error, so the hint search has nothing to improve on. Transpile and
    // answer FIRST — the sandbox can start executing while we look — then run
    // the other search: a chained statement whose operand a comment ate, which
    // parses, transpiles and runs while printing less than the user wrote
    // (#68). It used to run before transpiling so its answer existed on both
    // exits; running it after both exits below gives the same coverage and
    // stops every successful Run from waiting on it.
    try {
      const transpiler = new Transpiler({ ignoreSourceMap: true });
      const output = await transpiler.run(reg);

      // Combine all transpiled chunks into a single JS string
      const jsChunks = output.objects.map((o) => o.chunk.getCode());
      const js = [
        ...jsChunks,
        output.initializationScript,
        output.initializationScript2,
      ].join("\n");

      postVerdict("other", { type: "transpile-result", js, requestId });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      postVerdict("other", {
        type: "transpile-error",
        kind: "transpile",
        message: msg,
        diagnostics: classifyTranspileError(msg),
        requestId,
      });
    }

    let search: SilentLossSearch = { completed: false };
    try {
      search = await findSilentLoss(
        source,
        { errors: 0, real: countRealStatements(reg) },
        scoreIn(performance.now() + SEARCH_BUDGET_MS),
      );
    } catch {
      search = { completed: false };
    }
    // Only a search that ran to the end may be reported as having run. A search
    // that gave up leaves `loss` unset with `completed: false`, so the event
    // omits `silent_loss` rather than claiming `none` for a look that never
    // finished.
    postFollowUp({
      type: "silent-loss",
      requestId,
      completed: search.completed,
      loss: search.completed ? search.loss : undefined,
    });
  } catch (e) {
    // Reached only from the verdict path — every search above swallows its
    // own failures. If no verdict went out, send one: a `transpile_error` is
    // both true (we could not produce JS) and the outcome this code produced
    // before the message was split, so the `transpile_error`/`stalled` pair
    // CLAUDE.md calls load-bearing keeps its meaning.
    if (sent.verdict === "none") {
      const msg = e instanceof Error ? e.message : String(e);
      let diagnostics: TranspileDiagnostics | undefined;
      try {
        diagnostics = classifyTranspileError(msg);
      } catch {
        // The classifier is the other thing on this path that can throw, and
        // the field is optional — report the failure without its diagnosis
        // rather than losing the verdict to a second throw.
        diagnostics = undefined;
      }
      postVerdict("other", {
        type: "transpile-error",
        kind: "transpile",
        message: msg,
        diagnostics,
        requestId,
      });
    }
  } finally {
    // The one place "exactly one follow-up" is enforced. A no-op on every
    // path that already sent one.
    postFollowUp(
      sent.verdict === "syntax"
        ? { type: "syntax-hint", requestId }
        : { type: "silent-loss", requestId, completed: false },
    );
  }
}
```

`TranspileDiagnostics` は `../types/diagnostics` から型として import する（`classifyTranspileError` の戻り値型。
既存の import 行に足す。すでにあるなら足さない — `grep -n TranspileDiagnostics src/workers/abaplintWorker.ts` で確かめる）。

import を直す。旧（23 行）:

```ts
import type { SilentLoss } from "../types/diagnostics";
```

新:

```ts
import type { SyntaxRepair } from "../types/diagnostics";
import type { SilentLossSearch } from "./syntaxRepair";
```

`SilentLoss` は落とす。新しい `handleTranspile` はこの型の値を自分で持たず、`search.loss` として
`SilentLossSearch` 経由で扱うだけなので、残すと ESLint の未使用 import になる。
`SilentLossSearch` は `syntaxRepair.ts:348` で `export type` されている。

呼び出し側（245〜255 行）。旧:

```ts
  } else if (request.type === "transpile") {
    self.postMessage(await handleTranspile(request.source, request.requestId));
  } else if (request.type === "validate") {
```

新:

```ts
  } else if (request.type === "transpile") {
    // Posts its own two messages — see the note on handleTranspile.
    await handleTranspile(request.source, request.requestId);
  } else if (request.type === "validate") {
```

- [ ] **Step 4: 既存テストのコメント 1 行を直す** — `src/workers/syntaxRepair.test.ts:546`

旧:

```ts
    // The worker sets `silentLossChecked` before calling this, so a search
```

新:

```ts
    // The worker reports this search's `completed` flag verbatim, so a search
```

これが `syntaxRepair.test.ts` で変える唯一の場所。アサーションは 1 つも触らない。

- [ ] **Step 5: 緑を確認** — Run: `npm test -- src/workers/ src/utils/ && npm run typecheck 2>&1 | tail -5; npm run lint`
  Expected: Vitest PASS。**`npm run typecheck` は `App.tsx` でまだ落ちる**（`data.repair` / `data.silentLossChecked` を読んでいる）— それは Task 5 で直す。落ちているのが `App.tsx` だけであることを出力で確かめる

- [ ] **Step 6: Commit**

```bash
if ! git diff src/workers/abaplintWorker.ts | grep -q 'type: "syntax-hint"'; then echo "WIRING_MISSING"; exit 1; fi
git add src/types/messages.ts src/workers/abaplintWorker.ts src/workers/abaplintWorker.test.ts src/workers/syntaxRepair.test.ts
git commit -m "ワーカーの返信を判定と探索結果の 2 通に割る (#75, #67)"
```

（この commit だけでは `tsc -b` が通らない。Task 5 と続けて実施すること）

---

### Task 5: App の配線（判定で表示、追いかけで計測）

仕様「親側」節。

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/components/OutputPanel.tsx`
- Modify: `src/App.test.tsx`（既存 1 件を新プロトコルへ。新規 5 件。Gate2 1 周目 C2 / H1）

**Interfaces:**
- Consumes: `syntax-hint` / `silent-loss`（Task 4）、`repairHint`（Task 1）
- Produces: `OutputPanelProps.searchState: "idle" | "pending" | "done"`、DOM 属性 `data-search`

- [ ] **Step 1: `OutputPanel` に状態を足す** — `src/components/OutputPanel.tsx`

`silentLossHint: string | null;` の直後に prop を足す:

```ts
  /**
   * Whether the searches that explain a failure have answered for the run on
   * screen (#67/#75).
   *
   * The worker replies twice now — the verdict, then whatever the re-parse
   * searches found — so "there is no hint" is not decided at the moment the
   * error appears. Nothing renders differently for `pending` today; it is
   * here because the difference is real state, and because a test that
   * asserts a hint is ABSENT has no other way to know it waited long enough.
   * That gap is #70: a negative assertion that runs before the last moment
   * the element could appear passes against a build without the fix.
   *
   * `done` means "nothing more is coming for this run", NOT "the follow-up
   * arrived". A run that ends `stalled` is exactly the case where the worker
   * may never answer at all, and reading it the other way left this stuck on
   * `pending` for good — the negative tests above then waited out their own
   * timeout instead of asserting anything (Gate2 1 周目 H2). The cost of the
   * wider meaning: `done` alone no longer proves a search ran, so a test that
   * waits for it must also assert the verdict it expected is on screen.
   */
  searchState: "idle" | "pending" | "done";
```

引数リスト（`silentLossHint,` の後）に `searchState,` を足し、最外の `div` に属性を足す。旧:

```tsx
    <div className="flex flex-col h-full bg-gray-900">
```

新:

```tsx
    <div className="flex flex-col h-full bg-gray-900" data-search={searchState}>
```

- [ ] **Step 2: App の refs と `endRun` を書き換える** — `src/App.tsx`

`silentLossRef` の宣言の直後に 3 つ足す:

```ts
  /**
   * The run whose follow-up message (`syntax-hint` / `silent-loss`) has not
   * arrived yet, or "" when none is outstanding.
   *
   * Deliberately NOT `playgroundRequestIdRef`. That one is cleared by
   * `endRun` so a late `transpile-result` cannot hand stale JS to the sandbox
   * (#50) — and on a syntax error `endRun` runs BEFORE the follow-up arrives,
   * so reusing it would discard every hint. The follow-up messages start no
   * execution, so they are safe to correlate on their own ref.
   */
  const followUpRef = useRef<string>("");
  /** The repair the follow-up reported, for the run in flight. */
  const syntaxRepairRef = useRef<SyntaxRepair | undefined>(undefined);
  /**
   * A `run_result` built but not yet sent, because its follow-up is still
   * outstanding. The user has already been shown the verdict; this is only
   * about measuring the run once, with `syntax_repair` and `silent_loss` on
   * it (spec Q10 — a second event would need a GA4 registration that is not
   * retroactive).
   */
  const pendingResultRef = useRef<EventMap["run_result"] | null>(null);
  /**
   * The 20s backstop for the result above.
   *
   * It and `followUpRef` do NOT have the same lifetime, and that is the
   * point: `followUpRef` says "a follow-up may still arrive and still
   * belongs to the run on screen", while this one says "a result is waiting
   * to be sent". `endRun` can clear the first and arm the second (a run that
   * ended before its follow-up), and `flushPendingResult` clears the second
   * without touching the first (a follow-up that arrived on time). Tying
   * them together would mean either dropping a hint that is still relevant,
   * or sending the same `run_result` twice. Gate2 1 周目 L2.
   */
  const followUpTimerRef = useRef<number | undefined>(undefined);
```

`WORKER_TIMEOUT_MS`（44 行）の直後に、追いかけを待たない outcome を置く:

```ts
/**
 * The outcomes that do not wait for the worker's follow-up message.
 *
 * All three end a run nobody is waiting on an explanation for. `stalled` IS
 * the finding that the worker is not answering, so waiting on it would add
 * 20s to nothing. `stopped` is the user's own choice and puts its message in
 * `statusMessage`, not `error` — there is no error on screen for a hint to be
 * appended to. `cancelled` means the other mode took the sandbox away.
 *
 * For every other outcome the user is looking at a verdict, so the follow-up
 * has somewhere to go and the run is measured once, with it. Waiting on these
 * three instead would put every Stop press into the window where closing the
 * tab loses the `run_result` — and `run_click`/`run_result` reconciling 1:1
 * is how an orphaned run is detected at all (Gate2 1 周目 M2).
 */
const ABANDONED_OUTCOMES: ReadonlySet<RunOutcome> = new Set<RunOutcome>([
  "stalled",
  "stopped",
  "cancelled",
]);
```

`track` の署名は `track<K extends EventName>(name: K, params: EventMap[K])`（`src/utils/analytics.ts:464`）
なので、溜める値の型は `EventMap["run_result"]` そのもの。既存の import 行を広げる。旧:

```ts
import { track, lineCount, type RunOutcome } from "./utils/analytics";
```

新:

```ts
import { track, lineCount, type EventMap, type RunOutcome } from "./utils/analytics";
```

`endRun` の直前に、溜まった結果を送る関数を足す:

```ts
  /**
   * Send the `run_result` that was waiting for its follow-up.
   *
   * `syntax_repair` and `silent_loss` are read here rather than captured with
   * the rest, because they are exactly the two the follow-up carries.
   * Everything else — `duration_ms` above all — was fixed when the run ended,
   * so deferring the send does not change what any number means.
   */
  const flushPendingResult = useCallback(() => {
    const pending = pendingResultRef.current;
    if (pending === null) return;
    pendingResultRef.current = null;
    window.clearTimeout(followUpTimerRef.current);
    followUpTimerRef.current = undefined;
    track("run_result", {
      ...pending,
      syntax_repair: syntaxRepairRef.current?.kind,
      silent_loss:
        silentLossRef.current === undefined
          ? undefined
          : (silentLossRef.current?.kind ?? "none"),
    });
  }, []);
```

`endRun` の最後の `track("run_result", {...})` の呼び出しを置き換える。旧:

```ts
      setIsRunning(false);
      track("run_result", {
        outcome,
        duration_ms: Math.round(performance.now() - runStartRef.current),
```

（`silent_loss:` のブロックの閉じ括弧 `});` まで）新:

```ts
      setIsRunning(false);
      const params = {
        outcome,
        duration_ms: Math.round(performance.now() - runStartRef.current),
        // The sandbox reports the true total on success; otherwise all we have
        // is what we received, which the display cap may have truncated.
        output_lines: outputLines ?? runOutputCountRef.current,
        transpile_reason: diagnostics?.reason,
        transpile_node: diagnostics?.node,
        syntax_key: syntaxDiagnostics?.key,
        syntax_error_count: syntaxDiagnostics?.errorCount,
        syntax_statement: syntaxDiagnostics?.statement,
      };
      // Wait for the follow-up so the run is measured once, with whatever the
      // searches found on it — but only for a run whose verdict the user is
      // actually looking at (see ABANDONED_OUTCOMES).
      if (followUpRef.current !== "" && !ABANDONED_OUTCOMES.has(outcome)) {
        pendingResultRef.current = params;
        window.clearTimeout(followUpTimerRef.current);
        followUpTimerRef.current = window.setTimeout(
          flushPendingResult,
          WORKER_TIMEOUT_MS,
        );
        return;
      }
      // Nothing more is coming for this run. Dropping the correlation stops a
      // late follow-up from appending a hint to a message it does not belong
      // to, and `done` has to be said HERE rather than left to that message:
      // a stalled worker may never send one, and this attribute stuck on
      // `pending` is what made the negative e2e tests wait out their own
      // timeout (Gate2 1 周目 H2).
      followUpRef.current = "";
      setSearchState("done");
      // A pending result from an earlier call would be overwritten by the
      // assignment below and vanish. No path reaches that today (the Stop
      // button only exists while `isRunning`, and the sandbox's terminal
      // events cannot arrive before the verdict), but "we looked and could
      // not find one" is a weaker guarantee than the 1:1 deserves — one line
      // makes it structural instead (Gate2 2 周目 L2).
      if (pendingResultRef.current !== null) flushPendingResult();
      pendingResultRef.current = params;
      flushPendingResult();
    },
    [disarmPlaygroundWatchdog, flushPendingResult],
  );
```

`endRun` の引数リストから最後の `syntaxRepair?: SyntaxRepair,` とその直前のコメント **2 行**（`src/App.tsx:225-227`）を削る（判定メッセージがもう `repair` を運ばないため）。

- [ ] **Step 3: メッセージのハンドラを書き換える** — `src/App.tsx` の `attachWorkerHandlers`

`transpile-result` の分岐から `recordSilentLoss(...)` の行を削る。旧:

```ts
          recordSilentLoss(data.silentLossChecked, data.silentLoss);
          // The sandbox owns the deadline from here on.
          disarmPlaygroundWatchdog();
```

新:

```ts
          // The sandbox owns the deadline from here on. The #68 answer is not
          // here any more — it follows on its own message while this runs.
          disarmPlaygroundWatchdog();
```

`transpile-error` の分岐を書き換える。旧（`recordSilentLoss` の行から `endRun(...)` の閉じ括弧まで）:

```ts
          recordSilentLoss(data.silentLossChecked, data.silentLoss);
          const isSyntax = data.kind === "syntax";
          const label = isSyntax ? "Syntax error" : "Transpile error";
          const repair = isSyntax ? data.repair : undefined;
          const head = data.line
            ? `${label} (L${data.line}): ${data.message}`
            : `${label}: ${data.message}`;
          endRun(
            isSyntax ? "syntax_error" : "transpile_error",
            // abaplint names neither the quote nor the argument it swallowed,
            // so the message above cannot be acted on by someone who does not
            // already know ABAP comment syntax. Say what to change and where.
            repair ? `${head}\n\n${repairHint(repair)}` : head,
            undefined,
            // "set on no other outcome" is the documented invariant, so enforce
            // it here rather than trusting the worker to keep omitting it: both
            // fields are optional on a union member that covers both kinds, and
            // the strip runs in both directions so neither outcome can pick up
            // the other's measurements.
            isSyntax ? undefined : data.diagnostics,
            isSyntax ? data.syntaxDiagnostics : undefined,
            repair,
          );
```

新:

```ts
          const isSyntax = data.kind === "syntax";
          const label = isSyntax ? "Syntax error" : "Transpile error";
          const head = data.line
            ? `${label} (L${data.line}): ${data.message}`
            : `${label}: ${data.message}`;
          // The hint is NOT here. abaplint names neither the quote nor the
          // argument it swallowed, so this text alone cannot be acted on by
          // someone who does not already know ABAP comment syntax — but the
          // search that says what to change takes seconds on a heavy paste,
          // and waiting for it here is what made a real syntax error arrive
          // after the watchdog (#75). Show the error now; the `syntax-hint`
          // handler below appends the explanation when it lands.
          endRun(
            isSyntax ? "syntax_error" : "transpile_error",
            head,
            undefined,
            // "set on no other outcome" is the documented invariant, so enforce
            // it here rather than trusting the worker to keep omitting it: both
            // fields are optional on a union member that covers both kinds, and
            // the strip runs in both directions so neither outcome can pick up
            // the other's measurements.
            isSyntax ? undefined : data.diagnostics,
            isSyntax ? data.syntaxDiagnostics : undefined,
          );
```

`transpile-error` の分岐の閉じ括弧の直後（`}` のあと、`// Validation messages` の前）に 2 つの分岐を足す:

```ts
      } else if (data.type === "syntax-hint") {
        // Guarded on followUpRef, not playgroundRequestIdRef: endRun already
        // cleared the latter (see the note on followUpRef).
        if (followUpRef.current && data.requestId === followUpRef.current) {
          followUpRef.current = "";
          syntaxRepairRef.current = data.repair;
          const repair = data.repair;
          if (repair !== undefined) {
            // Appended to the error this run put on screen. `null` means no
            // error is showing — the user pressed Stop, or a new run cleared
            // it — so there is nothing this hint belongs to.
            setError((prev) =>
              prev === null ? prev : `${prev}\n\n${repairHint(repair)}`,
            );
          }
          setSearchState("done");
          flushPendingResult();
        }
      } else if (data.type === "silent-loss") {
        if (followUpRef.current && data.requestId === followUpRef.current) {
          followUpRef.current = "";
          recordSilentLoss(data.completed, data.loss);
          setSearchState("done");
          flushPendingResult();
        }
      }
```

`attachWorkerHandlers` の deps に `flushPendingResult` を足す。

- [ ] **Step 4: `handleRun` と表示の状態** — `src/App.tsx`

`searchState` の state を `silentLossHint_` の宣言の直後（`src/App.tsx:146` の塊の後、
`endRun` の 212 行より前）に足す。**`endRun` が読むので宣言はそれより前でなければならない。**

```ts
  const [searchState, setSearchState] = useState<"idle" | "pending" | "done">("idle");
```

`handleModeChange` の `setMode(newMode);` の直後に 1 行足す:

```ts
      // The next run in this mode starts from `idle`, not from whatever the
      // last one left behind. Only `handleRun` sets `pending`, so a stale
      // `done` sitting here would let a test (or a reader) take the previous
      // run's answer for this one. Gate2 1 周目 L1.
      setSearchState("idle");
```

**`handleRun` の側も、Stop の側も、追加の手当てが要らない** — React はクリックのような discrete event の
中の setState を同じフラッシュで反映するので、`await page.click(Run)` が返った時点で `data-search` は
すでに `pending`。前の Run の `done` を読む隙間は無い。Stop で終わった Run のあと `done` が残るのは
「もう何も来ない」の意味どおりで正しく、次の Run が必ず `pending` で始まる以上それを `idle` に戻す必要は無い
（Gate2 2 周目 L1）。`handleModeChange` だけ別なのは、**Validator 側には `handleRun` が無い**から —
モードをまたいだ `done` を消せるのはここだけ。

`handleRun` の中、`silentLossRef.current = undefined;` の行の前後を書き換える。旧:

```ts
    runSourceRef.current = source;
    silentLossRef.current = undefined;
    setSilentLossHint(null);
```

新:

```ts
    runSourceRef.current = source;
    // The previous run's follow-up is not coming in time to matter now. Send
    // its result as it stands rather than dropping it: run_click and
    // run_result reconcile 1:1, and a gap there means an orphaned run.
    flushPendingResult();
    silentLossRef.current = undefined;
    syntaxRepairRef.current = undefined;
    followUpRef.current = requestId;
    setSearchState("pending");
    setSilentLossHint(null);
```

`handleRun` の deps に `flushPendingResult` を足す。

`OutputPanel` に prop を渡す。旧:

```tsx
            <OutputPanel
              silentLossHint={silentLossHintText}
```

新:

```tsx
            <OutputPanel
              searchState={searchState}
              silentLossHint={silentLossHintText}
```

溜めた結果をタブが消える前に送る `useEffect` を足す（`handleRun` の直前でよい）:

```ts
  // A `run_result` waiting for its follow-up is lost if the tab goes away,
  // and on a heavy paste that wait is seconds. Before this change the event
  // went out in the same flush as the verdict, so the 1:1 with `run_click`
  // held by construction; deferring it opens a window, and a gap between the
  // two is exactly what CLAUDE.md tells the reader to interpret as an
  // orphaned run. `pagehide` is the last event that fires reliably on a tab
  // close or navigation (including into the bfcache, where `unload` does
  // not), and gtag sends over sendBeacon, so a flush here still arrives.
  // Gate2 2 周目 M2.
  useEffect(() => {
    window.addEventListener("pagehide", flushPendingResult);
    return () => window.removeEventListener("pagehide", flushPendingResult);
  }, [flushPendingResult]);
```

`flushPendingResult` は `useCallback(..., [])` なので参照が変わらず、この購読は毎レンダーで張り直されない。
unmount 時は listener を外してから（React の cleanup 順）なので、下のワーカー停止の cleanup と二重に送ることも無い
（`flushPendingResult` は `pendingResultRef` を先に `null` にするので、仮に 2 回呼ばれても 1 回しか送らない）。

ワーカーを止める `useEffect` の cleanup に、タイマーの後始末を足す。旧:

```ts
    return () => {
      cancel();
      worker?.terminate();
      if (appWorker === worker) appWorker = null;
    };
```

新:

```ts
    return () => {
      cancel();
      worker?.terminate();
      if (appWorker === worker) appWorker = null;
      window.clearTimeout(followUpTimerRef.current);
    };
```

- [ ] **Step 4b: 既存の `src/App.test.tsx` を新しいプロトコルに合わせる** — Gate2 1 周目 C2

**まず事実を確かめる。** レビューは「この変更で 4 件落ちる」と報告した（`App.test.tsx:150 / 216 / 397 / 503`）。
根は 1 つ — FakeWorker が追いかけの 1 通を送らないので `endRun` が結果を溜めたまま返り、`run_result` が 0 件になる。
**ただしその 4 件のうち 3 件は `stopped` の Run で、この計画が `ABANDONED_OUTCOMES` を入れたことで待たなくなった**
（Gate2 M2 への手当てと同じ 1 行）。残る 1 件だけが本当に直す対象:

| 行 | outcome | この計画での扱い |
|---|---|---|
| 150 | `stopped`（トランスパイル中の Stop） | 待たない → **無修正で緑のはず** |
| 216 | `stopped` | 同上 |
| 397 | `stopped` | 同上 |
| 503 | `success`（`onDone`） | **待つ → テストが追いかけを送る必要がある** |

「はず」は証拠ではない。**Step 4c で実際に走らせて確かめる**（3 件が緑であることも含めて）。もし
`stopped` の 3 件が落ちるなら、`ABANDONED_OUTCOMES` の配線が入っていない。

`App.test.tsx` の `lastTranspileRequestId` の直後に、追いかけを送るヘルパーを足す:

```ts
/**
 * Deliver the worker's second reply — the one the real abaplintWorker.ts
 * always sends after its verdict (#67/#75). Nothing in App.tsx sends
 * `run_result` for a run that ended on a verdict until this arrives, so a
 * test that ends a run and then counts events has to play this side of the
 * protocol or it is asserting against a half-finished round trip.
 */
function deliverFollowUp(
  worker: InstanceType<typeof FakeWorker>,
  message: { type: "syntax-hint" | "silent-loss" } & Record<string, unknown>,
) {
  act(() => {
    worker.onmessage?.({ data: message } as MessageEvent);
  });
}
```

503 の `onDone` の直後（`expect(...run_result...).toHaveLength(1)` の前）に 1 行入れる:

```ts
    act(() => {
      sandboxProps!.onDone(playgroundRequestId, 1);
    });
    // The worker's follow-up for this run — App holds `run_result` until it
    // lands (or 20s pass), so without it the count below is 0.
    deliverFollowUp(worker, {
      type: "silent-loss",
      requestId: playgroundRequestId,
      completed: true,
    });
    expect(
      trackMock.mock.calls.filter(([name]) => name === "run_result"),
    ).toHaveLength(1);
```

- [ ] **Step 4c: 4 件の現状を実測する** — Run:

```bash
./node_modules/.bin/vitest run src/App.test.tsx > /tmp/app-test.txt 2>&1
echo "EXIT=$?"; tail -40 /tmp/app-test.txt
```

Expected: 全件 PASS。落ちた場合は**行番号ごとに上の表と突き合わせる** — `stopped` の 3 件が落ちたなら
原因は `ABANDONED_OUTCOMES` 側で、テストを直して合わせにいってはいけない。

- [ ] **Step 4d: 追いかけの状態機械に単体テストを足す** — Gate2 1 周目 H1

いちばん分岐の多いのが Task 5 の App で、そこに赤→緑の証拠がほとんど無い、という指摘。FakeWorker の
`onmessage` を直接叩けるので、e2e に持っていく必要は無い。`App.test.tsx` の末尾に足す:

```ts
describe("App — the worker's follow-up message (#67/#75)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    workerInstances.length = 0;
    executeMock.mockClear();
    stopMock.mockReset();
    trackMock.mockClear();
    sandboxProps = null;
    window.location.hash = "";
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  /**
   * The OutputPanel's `data-search`. Read with getAttribute, not jest-dom's
   * `toHaveAttribute`: `@testing-library/jest-dom` is a dependency but is
   * imported nowhere and `vite.config.ts` declares no `setupFiles`, so its
   * matchers are not registered in this suite.
   */
  function searchStateOf(view: ReturnType<typeof render>): string | null | undefined {
    return view.container.querySelector("[data-search]")?.getAttribute("data-search");
  }

  /** Render, boot the fake worker, press Run, and hand back the run in flight. */
  function startRun() {
    const view = render(<App />);
    act(() => {
      vi.advanceTimersByTime(200);
    });
    const worker = workerInstances[0];
    fireEvent.click(screen.getByRole("button", { name: /Run/i }));
    return { view, worker, requestId: lastTranspileRequestId(worker) };
  }

  /** The verdict half of a syntax failure, as the worker now sends it. */
  function deliverSyntaxVerdict(
    worker: InstanceType<typeof FakeWorker>,
    requestId: string,
  ) {
    act(() => {
      worker.onmessage?.({
        data: {
          type: "transpile-error",
          kind: "syntax",
          message: "Statement does not exist",
          line: 3,
          requestId,
        },
      } as MessageEvent);
    });
  }

  const repair = { kind: "missing_period" as const, line: 3 };

  // The verdict is shown immediately and the hint is appended when it lands.
  // This is the whole of 手段 A from the user's side: the two used to arrive
  // together, and a slow search delayed both past the watchdog (#75).
  it("shows the error at once and appends the hint when the follow-up lands", () => {
    const { view, worker, requestId } = startRun();
    deliverSyntaxVerdict(worker, requestId);

    // Already on screen, with no hint yet.
    expect(view.container.textContent).toContain("Statement does not exist");
    expect(view.container.textContent).not.toContain(repairHint(repair));
    // ...and nothing has been measured yet: the follow-up is what completes it.
    expect(
      trackMock.mock.calls.filter(([name]) => name === "run_result"),
    ).toHaveLength(0);
    expect(searchStateOf(view)).toBe("pending");

    deliverFollowUp(worker, { type: "syntax-hint", requestId, repair });

    expect(view.container.textContent).toContain(repairHint(repair));
    expect(searchStateOf(view)).toBe("done");
    const calls = trackMock.mock.calls.filter(([name]) => name === "run_result");
    expect(calls).toHaveLength(1);
    expect(calls[0][1]).toMatchObject({
      outcome: "syntax_error",
      syntax_repair: "missing_period",
    });
  });

  // The follow-up never comes. The run must still be measured — once — just
  // without the parameters that message carries. 不変条件 6.
  it("sends run_result without the search parameters if no follow-up arrives", () => {
    const { worker, requestId } = startRun();
    deliverSyntaxVerdict(worker, requestId);

    act(() => {
      vi.advanceTimersByTime(20000);
    });

    const calls = trackMock.mock.calls.filter(([name]) => name === "run_result");
    expect(calls).toHaveLength(1);
    expect(calls[0][1]).toMatchObject({ outcome: "syntax_error" });
    expect(calls[0][1]).not.toHaveProperty("syntax_repair", "missing_period");
    // A follow-up that turns up afterwards must not produce a second event.
    deliverFollowUp(worker, { type: "syntax-hint", requestId, repair });
    expect(
      trackMock.mock.calls.filter(([name]) => name === "run_result"),
    ).toHaveLength(1);
  });

  // A's answer must not be attached to B — the same correlation bug as
  // #42/#50, one message later.
  it("does not attach run A's follow-up to run B", () => {
    const { view, worker, requestId: requestIdA } = startRun();
    deliverSyntaxVerdict(worker, requestIdA);
    trackMock.mockClear();

    // B starts. A's result was still pending, so it is flushed as it stands.
    fireEvent.click(screen.getByRole("button", { name: /Run/i }));
    const requestIdB = lastTranspileRequestId(worker);
    expect(requestIdB).not.toBe(requestIdA);
    expect(
      trackMock.mock.calls.filter(([name]) => name === "run_result"),
    ).toHaveLength(1);
    trackMock.mockClear();

    // A's follow-up finally lands.
    deliverFollowUp(worker, { type: "syntax-hint", requestId: requestIdA, repair });

    // Nothing for B: no event, no hint on screen, and B is still waiting.
    expect(
      trackMock.mock.calls.filter(([name]) => name === "run_result"),
    ).toHaveLength(0);
    expect(view.container.textContent).not.toContain(repairHint(repair));
    expect(searchStateOf(view)).toBe("pending");
  });

  // 不変条件 8. `stalled` is the finding that the worker is not answering, so
  // waiting for one more message from it would only widen the window in which
  // the tab can close and the event be lost.
  it("does not wait for a follow-up when the run ends `stalled`", () => {
    const { view, worker, requestId } = startRun();

    act(() => {
      vi.advanceTimersByTime(20000);
    });

    const calls = trackMock.mock.calls.filter(([name]) => name === "run_result");
    expect(calls).toHaveLength(1);
    expect(calls[0][1]).toMatchObject({ outcome: "stalled" });
    // And `data-search` reaches `done` here rather than waiting on a message
    // that may never come — an e2e negative assertion hangs otherwise
    // (Gate2 1 周目 H2).
    expect(searchStateOf(view)).toBe("done");

    // The worker recovers and answers late: no hint is appended to the
    // "engine stopped responding" message, and no second event.
    deliverFollowUp(worker, { type: "syntax-hint", requestId, repair });
    expect(view.container.textContent).not.toContain(repairHint(repair));
    expect(
      trackMock.mock.calls.filter(([name]) => name === "run_result"),
    ).toHaveLength(1);
  });

  // The tab was closed while a result was waiting. The event is lost by
  // design (不変条件 6 names this as the one loss); what must not happen is a
  // timer firing into an unmounted tree.
  it("drops the waiting result when the component unmounts", () => {
    const { view, worker, requestId } = startRun();
    deliverSyntaxVerdict(worker, requestId);
    trackMock.mockClear();

    view.unmount();
    act(() => {
      vi.advanceTimersByTime(20000);
    });

    expect(
      trackMock.mock.calls.filter(([name]) => name === "run_result"),
    ).toHaveLength(0);
  });
});
```

`repairHint` を import する（`import { repairHint } from "./utils/repairHint";`）。**モックしない** —
文言そのものは Task 1 の `repairHint.test.ts` が持っているので、ここは「画面に出たか」だけを見る。
**jest-dom のマッチャは使えない**（`package.json:38` に依存はあるが import している場所が無く、
`vite.config.ts` に `setupFiles` も無い。2026-09-12 確認）。上の `searchStateOf` のように
`getAttribute` で読む。

- [ ] **Step 4e: 新しい 5 件が本当に配線を見ていることを変異で確かめる**

Step 4d の 5 件は実装のあとに書くので、赤を一度も見ていない。**赤の代わりに変異で取る**（単体なので数秒。
e2e の変異確認と違ってポートもビルドも要らない）。2 つとも「型は通るが配線が外れる」形にすること。
変異は `sed` ではなく Python で入れ、**当てる前に対象がちょうど 1 回であることを確かめて止める**。

```bash
if grep -q '// MUTANT' src/App.tsx; then echo "ALREADY_MUTATED"; exit 1; fi
BAK=$(mktemp /tmp/app.XXXXXX.bak); cp src/App.tsx "$BAK"
trap 'cp "$BAK" src/App.tsx' EXIT INT TERM HUP

# (1) 追いかけが届いても溜めた結果を送らない
python3 -c "
import sys
p='src/App.tsx'; s=open(p).read()
old='          syntaxRepairRef.current = data.repair;'
if s.count(old)!=1: sys.exit('wiring not found (1)')
open(p,'w').write(s.replace(old,'          syntaxRepairRef.current = undefined; // MUTANT'))
" || exit 1
./node_modules/.bin/vitest run src/App.test.tsx > /tmp/mut-app1.txt 2>&1; echo "MUT1_EXIT=$?"
grep -E 'Tests ' /tmp/mut-app1.txt
cp "$BAK" src/App.tsx

# (2) stalled でも追いかけを待つ（不変条件 8 を外す）
python3 -c "
import sys
p='src/App.tsx'; s=open(p).read()
old='!ABANDONED_OUTCOMES.has(outcome)'
if s.count(old)!=1: sys.exit('wiring not found (2)')
open(p,'w').write(s.replace(old,'true /* MUTANT */'))
" || exit 1
./node_modules/.bin/vitest run src/App.test.tsx > /tmp/mut-app2.txt 2>&1; echo "MUT2_EXIT=$?"
grep -E 'Tests ' /tmp/mut-app2.txt
cp "$BAK" src/App.tsx && git diff --stat src/App.tsx
```
  Expected: `MUT1_EXIT` も `MUT2_EXIT` も非 0。(1) は Step 4d の 1 件目（`syntax_repair` が `run_result` に
  乗らなくなる）、(2) は `stalled` の 1 件と **`stopped` の既存 3 件**が落ちる
  — 後者は `ABANDONED_OUTCOMES` が既存スイートに効いていることの裏取りでもある。
  復元後の `git diff --stat src/App.tsx` に `// MUTANT` が残っていないこと

- [ ] **Step 5: 型と lint を通す** — Run: `npm run typecheck; echo "TYPECHECK=$?"; npm run lint; echo "LINT=$?"; npm test; echo "VITEST=$?"`
  Expected: すべて 0。`react-hooks/exhaustive-deps` が出たら deps を足して直す（ref を deps に入れないこと）

- [ ] **Step 6: Commit**

```bash
if grep -q 'data\.silentLossChecked\|data\.repair' src/App.tsx; then echo "OLD_FIELDS_LEFT"; exit 1; fi
if ! grep -q 'followUpRef' src/App.tsx; then echo "WIRING_MISSING"; exit 1; fi
git add src/App.tsx src/App.test.tsx src/components/OutputPanel.tsx
git commit -m "判定で表示し、探索の結果が届いてから run_result を送る (#75, #67)"
```

---

### Task 6: e2e

**Files:**
- Modify: `e2e/helpers.ts`（`waitForSearchDone` を足し、`waitForRunToEnd` の説明を直す）
- Modify: `e2e/syntaxHint.spec.ts`（新規 4 件 + 既存の否定 2 件）
- Modify: `e2e/silentLoss.spec.ts`（既存 2 件）

**この Task の e2e を走らせる前に毎回**（Gate2 2 周目 H-1 / M-3）:

- `ss -ltn | grep ':4173 '` が何も出さないこと。出たら止める。`playwright.config.ts` の `webServer` は `reuseExistingServer: false` なので、ふさがっていると起動に失敗する
- Bash ツールの `timeout` を **600000** にするか `run_in_background` で走らせる。既定の 120 秒では、ビルド込みの e2e が途中で切られる

- [ ] **Step 1: ヘルパーを足す** — `e2e/helpers.ts`

末尾に追加:

```ts
/**
 * Wait until the searches that explain a failure have answered for this run.
 *
 * The worker replies twice (#67/#75): the verdict, then whatever the
 * re-parse searches found. So an error being visible no longer means "and
 * there is no hint" — the hint may still be seconds away. Any assertion that
 * a hint is ABSENT has to come after this, or it is #70 again: a negative
 * that runs before the last moment the element could appear passes against a
 * build with no fix in it at all.
 *
 * `done` also covers "App stopped waiting" — a run that ends `stalled`,
 * `stopped` or `cancelled` reaches it without any search having answered. So
 * this wait orders a negative assertion; it does not establish that the run
 * did what the test is about. Assert the expected verdict as well.
 */
export async function waitForSearchDone(page: Page): Promise<void> {
  await expect(page.locator('[data-search="done"]')).toHaveCount(1, {
    timeout: 30_000,
  });
}

/** The number in the Lint tab's label. */
export async function lintCount(page: Page): Promise<number> {
  const label =
    (await page.getByRole("button", { name: /^Lint \(\d+\)$/ }).textContent()) ?? "";
  return Number(/\((\d+)\)/.exec(label)?.[1] ?? NaN);
}

/**
 * Wait until the lint the user's own typing queued has come back.
 *
 * One worker, one thread. `typeProgram` inserts the whole program in a single
 * input event, which schedules a lint (debounced 400 ms, src/App.tsx), and the
 * worker's boot also lints whatever is in the editor by then. A Run pressed
 * while one of those is parsing does not race it — it QUEUES behind it, and
 * the verdict then costs two heavy parses instead of one. For a paste at the
 * size cap that is the difference between answering and reaching App.tsx's
 * 20s watchdog, so a test about a heavy paste fails for a reason that has
 * nothing to do with what it is testing.
 *
 * The Lint tab's own count is the signal: it can only change once a
 * `lint-result` came back from the worker, which means the thread is free. A
 * fixed sleep would be a guess about a parse that costs 24 ms or 1.5 s
 * depending on shape.
 *
 * Takes the count from BEFORE the program was typed and waits for it to
 * change, rather than waiting for "not zero". Not-zero happens to work today
 * (the default program lints clean) but it is a wait that silently stops
 * waiting the day the default program gains one issue — and a guard that
 * disappears without going red is worse than no guard (Gate2 3 周目 M6).
 *
 * The timeout stays under `playwright.config.ts`'s per-test `timeout: 60_000`
 * so that running out of patience here fails as this wait, not as an opaque
 * test timeout.
 */
export async function waitForLintToSettle(page: Page, previous: number): Promise<void> {
  await expect.poll(() => lintCount(page), { timeout: 30_000 }).not.toBe(previous);
}
```

`clickRun` の JSDoc の該当段落を直す。旧:

```ts
 * A positive wait before a negative assertion is NOT enough on its own; the
 * thing waited for has to come after the last moment the unwanted element
 * could still appear. #70 was exactly that gap: the silent-loss hint arrives
 * with the transpile result, while the run is still executing, and the
 * placeholder is hidden during a run no matter what — so `toHaveCount(0)` on
 * the placeholder passed against a build that did not contain the fix, 5 runs
 * out of 12. Use `waitForRunToEnd` when the negative is about the end state.
```

新:

```ts
 * A positive wait before a negative assertion is NOT enough on its own; the
 * thing waited for has to come after the last moment the unwanted element
 * could still appear. #70 was exactly that gap: the placeholder is hidden
 * during a run no matter what, so `toHaveCount(0)` on it passed against a
 * build that did not contain the fix, 5 runs out of 12. Use
 * `waitForRunToEnd` when the negative is about the end state — and
 * `waitForSearchDone` when it is about a hint, which since #67/#75 arrives on
 * a later message than the result and can land after the run has ended.
```

- [ ] **Step 2: 失敗する e2e を書く** — `e2e/syntaxHint.spec.ts`

import 行を 2 つにする:

```ts
import {
  typeProgram,
  clickRun,
  lintCount,
  waitForLintToSettle,
  waitForSearchDone,
} from "./helpers";
import { MAX_SOURCE_CHARS } from "../src/workers/searchLimits";
```

ファイル冒頭のコメント（`e2e/syntaxHint.spec.ts:5-11`）を直す。**2 か所ある** — メッセージの説明と、
「`App.tsx` には単体テストが無い（#17）」という**事実誤認**。#17 は 2026-08-04 時点では真だったが、
`src/App.test.tsx`（615 行）はその後に作られており、`run_click`/`run_result` の 1:1 を守っている
唯一のスイートでもある（Gate2 1 周目 C2）。旧:

```ts
 * The hint is produced in the abaplint worker, travels on the
 * `transpile-error` message, and is rendered by OutputPanel. Nothing in the
 * Vitest suite crosses that boundary: `syntaxRepair.test.ts` proves the search
 * and abaplint's judgement, and stops at the module. App.tsx's worker wiring
 * has no unit tests at all (#17), so a hint that is computed correctly and
 * then dropped on the way to the screen would look green everywhere except
 * here.
```

新:

```ts
 * The hint is produced in the abaplint worker, travels on its own
 * `syntax-hint` message — which arrives AFTER the `transpile-error` that
 * failed the run (#67/#75) — and is rendered by OutputPanel. Nothing in the
 * Vitest suite crosses that boundary: `syntaxRepair.test.ts` and
 * `statementEndRepair.test.ts` prove the searches and abaplint's judgement,
 * and stop at the module; `App.test.tsx` drives a fake worker, so it proves
 * App's half of the protocol but never that the real worker sends what App
 * waits for. A hint that is computed correctly and then dropped on the way to
 * the screen would look green everywhere except here.
```

既存の否定テスト 2 件を直す。1 件目、旧:

```ts
  await expect(page.getByText(/^a$/m)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(HINT)).toHaveCount(0);
});
```

新:

```ts
  await expect(page.getByText(/^a$/m)).toBeVisible({ timeout: 30_000 });
  // Output appears when execution starts; the silent-loss search answers on a
  // later message and can land after that. Without this wait the negative is
  // decided before the hint could have appeared (#70).
  await waitForSearchDone(page);
  await expect(page.getByText(HINT)).toHaveCount(0);
});
```

2 件目（`a syntax error we cannot explain gets no invented hint`）、旧:

```ts
  await expect(page.getByText(/Syntax error/i)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(HINT)).toHaveCount(0);
});
```

新:

```ts
  await expect(page.getByText(/Syntax error/i)).toBeVisible({ timeout: 30_000 });
  await waitForSearchDone(page);
  await expect(page.getByText(HINT)).toHaveCount(0);
});
```

末尾に 3 件追加:

```ts
const PERIOD_HINT = /every ABAP statement ends with a period/i;
const SEMICOLON_HINT = /not a semicolon/i;

test("a missing period is explained, on the row the statement ends on", async ({
  page,
}) => {
  await page.goto("/");
  await typeProgram(page, `REPORT ztest.\nWRITE: 'a',\n       'b'`);
  await clickRun(page);

  await expect(page.getByText(PERIOD_HINT)).toContainText("line 3", {
    timeout: 30_000,
  });
});

test("a semicolon used to end a statement is explained", async ({ page }) => {
  await page.goto("/");
  await typeProgram(page, `REPORT ztest.\nWRITE 'a';`);
  await clickRun(page);

  await expect(page.getByText(SEMICOLON_HINT)).toContainText("line 2", {
    timeout: 30_000,
  });
});

test("pasted JavaScript is not told it forgot a period", async ({ page }) => {
  await page.goto("/");
  await typeProgram(page, `REPORT ztest.\nconsole.log('a')`);
  await clickRun(page);

  // Assert the verdict we expect BEFORE waiting, and keep it asserted: since
  // #75 `data-search="done"` also means "we stopped waiting", which a
  // `stalled` run reaches immediately. Without this line a build that stalls
  // on everything would satisfy the two negatives below and report success
  // for the opposite of what they claim (Gate2 1 周目 H2).
  await expect(page.getByText(/Syntax error/i)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/stopped responding/i)).toHaveCount(0);
  // The hint is a separate message now, so the error being on screen proves
  // nothing about its absence. Wait for the searches to answer first (#70).
  await waitForSearchDone(page);
  await expect(page.getByText(PERIOD_HINT)).toHaveCount(0);
  await expect(page.getByText(SEMICOLON_HINT)).toHaveCount(0);
});

test("the verdict does not wait for the search on a heavy paste", async ({
  page,
}) => {
  // #75: a 16 kB paste whose whole file is one statement takes abaplint
  // seconds per parse, and the search re-parses it up to 33 times. While that
  // sat in front of the reply, App.tsx's 20s watchdog fired first and this
  // real syntax error was shown as "The ABAP engine stopped responding".
  //
  // The size is the point of the test and it sits ON the boundary: one more
  // character and the search is skipped, so the run gets fast for a reason
  // that has nothing to do with the fix and this test silently stops testing
  // anything (Gate2 1 周目 M3). The real constant is imported rather than
  // retyped — a literal here would make the assertion arithmetic, true
  // whatever the app does (Gate2 2 周目 M1). searchLimits.ts has no imports
  // of its own precisely so this line does not drag abaplint into the runner.
  const source = `x\n`.repeat(MAX_SOURCE_CHARS / 2);
  expect(source.length).toBe(MAX_SOURCE_CHARS);

  await page.goto("/");
  const lintBefore = await lintCount(page);
  await typeProgram(page, source);
  // Let the keystroke-driven lint finish before pressing Run. The worker is
  // one thread: if the boot-time lint of this same 16 kB source is still
  // parsing, the Run queues behind it and the verdict costs two heavy parses
  // instead of one — enough to reach the 20s watchdog and fail this test for
  // a reason the change cannot fix (Gate2 2 周目 H1). Task 7's measurement
  // script waits for the same reason.
  await waitForLintToSettle(page, lintBefore);
  await clickRun(page);

  await expect(page.getByText(/Syntax error/i)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/stopped responding/i)).toHaveCount(0);
});
```

- [ ] **Step 3: `silentLoss.spec.ts` の 2 件を直す**

import 行に `waitForSearchDone` を足す。

`a partly eaten chain still prints what survived, and says so`、旧:

```ts
  await expect(page.getByText(/^a$/m)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(HINT)).toBeVisible();
```

新:

```ts
  await expect(page.getByText(/^a$/m)).toBeVisible({ timeout: 30_000 });
  // The hint follows on its own message now, so it can land after the output
  // it annotates. Give it the same budget as the run.
  await expect(page.getByText(HINT)).toBeVisible({ timeout: 30_000 });
```

`a correct program that prints nothing gets no hint`、旧:

```ts
  await expect(page.getByText(PLACEHOLDER)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(HINT)).toHaveCount(0);
});
```

新:

```ts
  await expect(page.getByText(PLACEHOLDER)).toBeVisible({ timeout: 30_000 });
  // The placeholder appears when the run ends, and since #67/#75 the
  // silent-loss search answers on a later message than the transpile result —
  // so the run can be over before the hint could have appeared. This is the
  // same gap as #70, one message further along.
  await waitForSearchDone(page);
  await expect(page.getByText(HINT)).toHaveCount(0);
});
```

`the hint does not outlive the program it describes` のコメント（`e2e/silentLoss.spec.ts:87`）も
同じ事実誤認を含む。旧:

```ts
  // warning instead of an invitation to run. Found by review; there was no
  // test for it because App.tsx's wiring has none at all (#17).
```

新:

```ts
  // warning instead of an invitation to run. Found by review; it belongs here
  // rather than in App.test.tsx because the sample dropdown, the placeholder
  // and the hint are three real components' rendering, not App's wiring.
```

同じファイル冒頭のコメント、旧:

```ts
 * message from the #69 one (`transpile-result`, not `transpile-error`), a
```

新:

```ts
 * message from the #69 one (`silent-loss` after `transpile-result`, not
 * `syntax-hint` after `transpile-error`), a
```

`a chained WRITE whose only operand was eaten is explained` の 40〜42 行のコメント、旧:

```ts
  // The hint is not the end of the run — it arrives with the transpile result,
  // and the placeholder is hidden while running regardless — so wait for the
  // run to end first, or this passes without the fix (#70: 5 of 12 runs).
```

新:

```ts
  // The hint is not the end of the run — it arrives on its own message, which
  // since #67/#75 can be after the run ended — and the placeholder is hidden
  // while running regardless. The wait for the hint above is what orders this;
  // without it this passes with no fix at all (#70: 5 of 12 runs).
```

- [ ] **Step 4: 緑を確認（繰り返し）** — Run: `./node_modules/.bin/playwright test e2e/syntaxHint.spec.ts e2e/silentLoss.spec.ts --project=chromium --project=firefox --repeat-each=5`
  Expected: 全件 PASS（WebKit は両ファイル先頭で skip）。Bash の `timeout` は 600000

- [ ] **Step 5: 配線を外すと赤になることを確認（#70 の教訓）**

変異は**型が通る形**にすること。`tsc -b` が落ちると `webServer` が起動せず、e2e は「期待値が外れた」ではなく「サーバーが起動しない」で赤になる — それは何も確かめていない赤で、#70 と同じ形の偽の証拠になる。

**変異させたファイルを残さない**（Gate2 2 周目 H-1、3 周目 H-A）:

- この Step は **`run_in_background` で 1 回だけ**走らせ、**完了通知が来るまで** `abaplintWorker.ts` に触る作業も、この Step の再実行も、Step 6 もしない。Bash ツールは timeout で処理を殺さず裏へ回すので、「打ち切られた」と思って次へ進むと、裏で走っている変異版と並ぶ
- バックアップは `mktemp` で毎回別の名前にし、取る前に「現ファイルに変異が無い」ことを確かめて止める
- 復元は `trap` でも行う。最後の砦は Step 6 の確認

```bash
if ss -ltn | grep -q ':4173 '; then echo "PORT_4173_BUSY"; exit 1; fi
if grep -q 'slice(0, 0)' src/workers/abaplintWorker.ts; then echo "ALREADY_MUTATED"; exit 1; fi
BAK=$(mktemp /tmp/worker.XXXXXX.bak)
cp src/workers/abaplintWorker.ts "$BAK"
trap 'cp "$BAK" src/workers/abaplintWorker.ts' EXIT INT TERM HUP
python3 - <<'PY' || exit 1
import sys
p = 'src/workers/abaplintWorker.ts'
s = open(p).read()
old = 'errors.map(errorSpanOf),'
if s.count(old) != 1:
    sys.exit('wiring not found')
open(p, 'w').write(s.replace(old, 'errors.map(errorSpanOf).slice(0, 0),'))
PY
./node_modules/.bin/playwright test e2e/syntaxHint.spec.ts --project=chromium --reporter=list --grep "missing period|semicolon used" --repeat-each=5 > /tmp/mutant.log 2>&1; echo "MUTANT_EXIT=$?"
sed 's/\x1b\[[0-9;]*m//g' /tmp/mutant.log | grep -c '✘'
sed 's/\x1b\[[0-9;]*m//g' /tmp/mutant.log | grep -c '✓'
sed 's/\x1b\[[0-9;]*m//g' /tmp/mutant.log | grep -E '^\s+[0-9]+ (failed|passed)'
grep -cE 'was not able to start|error TS|Timed out waiting .* from config\.webServer|exited early' /tmp/mutant.log
cp "$BAK" src/workers/abaplintWorker.ts && git diff --stat src/workers/abaplintWorker.ts
```
  Expected: `MUTANT_EXIT` が非 0、**`✘` の行が 10 件・`✓` の行が 0 件**、集計行が `10 failed` だけ、**webServer の失敗行が 0 件**（`was not able to start` / `error TS` に加え、起動待ちが尽きた `Timed out waiting … from config.webServer` と早期終了 `exited early` も数える — ビルドが 180 秒を超えた回はこれが出る。Gate2 3 周目 M7）。復元後の `git diff --stat src/workers/abaplintWorker.ts` は**空**（Task 4 は commit 済みなので、正しく復元できていれば差分は出ない）。成功行も数える grep だと「変異が効かず全件成功」も 10 件になり区別できない（Gate2 H2）

- [ ] **Step 6: 追いかけメッセージの配線漏れも変異で確かめる**（Gate2 新周回 M2: 検査が 1 か所だけだった）

`run_in_background` で、Step 5 の完了通知を受け取ってから走らせる。今度は成功側を外す:

```bash
if ss -ltn | grep -q ':4173 '; then echo "PORT_4173_BUSY"; exit 1; fi
if grep -q 'completed: false, // MUTANT' src/workers/abaplintWorker.ts; then echo "ALREADY_MUTATED"; exit 1; fi
BAK=$(mktemp /tmp/worker.XXXXXX.bak)
cp src/workers/abaplintWorker.ts "$BAK"
trap 'cp "$BAK" src/workers/abaplintWorker.ts' EXIT INT TERM HUP
python3 - <<'PY' || exit 1
import sys
p = 'src/workers/abaplintWorker.ts'
s = open(p).read()
old = 'completed: search.completed,'  # 字下げを含めない（Task 4 のコードは 6 スペース）
if s.count(old) != 1:
    sys.exit('wiring not found')
open(p, 'w').write(s.replace(old, '    completed: false, // MUTANT\n'))
PY
./node_modules/.bin/playwright test e2e/silentLoss.spec.ts --project=chromium --reporter=list --repeat-each=5 > /tmp/mutant2.log 2>&1; echo "MUTANT_EXIT=$?"
sed 's/\x1b\[[0-9;]*m//g' /tmp/mutant2.log | grep -c '✘'
sed 's/\x1b\[[0-9;]*m//g' /tmp/mutant2.log | grep -c '✓'
grep -cE 'was not able to start|error TS|Timed out waiting .* from config\.webServer|exited early' /tmp/mutant2.log
cp "$BAK" src/workers/abaplintWorker.ts && git diff --stat src/workers/abaplintWorker.ts
```
  Expected: `MUTANT_EXIT` が非 0、`✘` が 1 件以上（ヒントを見るテストが落ちる）、webServer の失敗行が 0 件

- [ ] **Step 7: Commit**

```bash
# Step 5 / 6 を裏で走らせたなら、その完了通知を受け取ってからこの Step を始める
if grep -q 'slice(0, 0)\|// MUTANT' src/workers/abaplintWorker.ts; then echo "MUTANT_LEFT"; exit 1; fi
git add e2e/helpers.ts e2e/syntaxHint.spec.ts e2e/silentLoss.spec.ts
if git diff --cached | grep -q 'slice(0, 0)\|// MUTANT'; then echo "MUTANT_STAGED"; git reset -q; exit 1; fi
git commit -m "判定とヒントが別々に届くことを e2e で固定し、既存の否定テストを直す (#67, #75, #70)"
```

---

### Task 7: 文書・測定・全体検証

**Files:**
- Modify: `CLAUDE.md`（`### syntax_repair says what to change` 節ほか）
- Modify: `src/utils/analytics.ts`（`syntax_repair` と `silent_loss` のコメント）

- [ ] **Step 1: CLAUDE.md を更新**（6 か所。どれも「旧」と完全一致する範囲だけを置き換える。旧の文が行をまたぐので、1 文だけ当てると前後が重複する — Gate2 L2。行番号は編集前のもので、(a) を当てると後ろがずれるので、旧の文面で探す）

(a) 旧:

```md
one-line edit would have made the parse succeed. It is an enum with one member
today, `double_quote`, so unlike the three parameters above it needs no
membership test — nothing the user writes can reach the wire through it.
```

新:

```md
one-line edit would have made the parse succeed. It is an enum —
`double_quote`, `semicolon`, `missing_period` — so unlike the three parameters
above it needs no membership test: nothing the user writes can reach the wire
through it.

**The two statement-end kinds (#67) use a stricter acceptance rule than
`double_quote`, and the difference is load-bearing.** Appending a period makes
almost any line look like a finished statement: `console.log('a')` is two
errors on one row and a period turns it into one, so "the count went down"
would tell someone who pasted JavaScript that they forgot a period. They are
kept only if the count went down **and** no error is left starting on a row
of an error they rewrote (`src/workers/statementEndRepair.ts`). The rule has a
price, and it is measured: over 58 probe inputs it stopped two wrong hints
(both pasted `console.log`), and a later probe found a real repair it gives
up — consecutive semicolons that abaplint merges into a single error with a
misspelt keyword on the next row, pinned in `statementEndRepair.test.ts`.
`double_quote` keeps the plain count, because its data has been flowing since
2026-09-08 and changing what it reports would break the comparison across that
date. The same strictness is why their hints state the fix flatly while
`double_quote`'s stays conditional. The search order is `double_quote` →
`semicolon` → `missing_period`, first hit wins. Known limit: a missing period
hidden behind an end-of-line comment (`WRITE 'a' " note`) is out of reach —
the appended period lands in the comment.
```

(b) 旧:

```md
The search costs a bounded number of extra parses, and only on the Run path
after a failure — never on `lint`, which fires on every keystroke. It is
skipped entirely above 64 kB of source: the candidate cap bounds the parses
but not the work, and the 20s watchdog ends the *display* without interrupting
this worker, so an unbounded search would outlive the run it belonged to.
```

新:

```md
**The search no longer sits between the user and the answer.** Since #75 the
worker replies to a Run twice: the verdict first (`transpile-error` /
`transpile-result`), then whatever the searches found, on a `syntax-hint` or
`silent-loss` message carrying the same `requestId`. Before that split, a
heavy paste could push the verdict past the 20s watchdog in `App.tsx` and a
real `syntax_error` was shown and counted as `stalled`. Measured 2026-09-12:
the verdict reaches the parent 2.5 ms after the request while the worker stays
busy for another 1,699 ms. `App.tsx` holds `run_result` until the follow-up
lands, so the event is still one event with `syntax_repair` on it. Three
outcomes do not wait, because nobody is looking at a verdict they could
explain: `stalled` (the worker is by definition not answering), `stopped` (the
user gave up, and their message is not in the error slot at all) and
`cancelled` (the other mode took the sandbox). Those are sent at once, as
before.

Two consequences for reading the numbers. A `run_result` for a failing Run is
now sent up to 20s after the run ended, so a closed tab can lose it — rare,
and `pagehide` flushes what it can, but the 1:1 with `run_click` is no longer
true by construction. And a hint can be SHOWN without being counted: if the
follow-up arrives after that 20s backstop, the hint is still appended to the
error on screen while `syntax_repair` is already gone with the event. Both
only happen where a search ran long, so `syntax_repair` under-reports heavy
pastes specifically — not at random.

The search costs a bounded number of extra parses — at most 33 across the
three kinds — and only on the Run path, never on `lint`, which fires on every
keystroke. It is skipped entirely above 16 kB of source (`MAX_SOURCE_CHARS`;
64 kB until #75). What the caps now protect is `lint`, not the outcome:
abaplint's `parseAsync` does not yield to the event loop (0 macrotasks during
a 1,502 ms parse, measured 2026-09-12), so every keystroke's lint is frozen
while a search runs. The candidate cap bounds the parses but not the work, and
the work of one parse grows far faster than the source: `WRITE 'value#';` on
every row took 116 ms to parse at 16 kB and 1,431 ms at 64 kB (Node,
2026-09-11), and `x` on every row took 1.5 s at 16 kB and 19 s at 32 kB. So
every search in a Run also shares a 3 s deadline
(`src/workers/searchDeadline.ts`): once it has passed no new re-parse starts.
Neither cap is a guarantee — the deadline cannot stop a parse already running,
so the worst freeze measured is about 10 s — and since #75 neither needs to
be: overrunning costs a hint and some editor latency, not a wrong `outcome`.
A paste over 16 kB — roughly 400 lines — gets no hint at all.
```

(c) `compare it against \`syntax_statement = WRITE\` over the same period.` の直後に追記:

```md
Since #67 the three kinds split the `WRITE` bucket three ways, so compare
their sum against `syntax_statement = WRITE`, not `double_quote` alone. A line
with two of the mistakes at once (`WRITE "hello";`) gets no hint from any
kind, so the sum undercounts what that bucket holds. One more caveat from
#75: the 3 s deadline can cut a search short on a heavy paste, so
`double_quote`'s own rate has a small discontinuity at that release too.
```

(d) `a source over 64 kB,` を次で置き換える:

```md
a source over 16 kB (64 kB until #75, so absence rises slightly across that release), a search cut off by the 3 s search deadline,
```

(e) 旧（**文の頭から**取ること。`succeeds or throws.` 以降だけを置き換えると、直前に残る
「before transpilation」と新しい「after both」が同じ 1 文の中で矛盾する — Gate2 3 周目 H2）:

```md
The search runs on the Run path only, after a parse that produced no errors and
before transpilation — so the answer exists whether the transpiler then
succeeds or throws. It costs the same bounded number of extra parses as its
sibling (10 candidates, skipped above 64 kB), but unlike its sibling it runs on
```

新:

```md
The search runs on the Run path only, and only after a parse that produced no
errors — but since #75 it runs AFTER transpilation and after the reply that
carries the JS, on its own `silent-loss` message, so a successful Run starts
executing before the search rather than after it. The answer still exists
whether the transpiler succeeded or threw, because both exits are ahead of it.
One consequence to know when reading the numbers: a Stop pressed in the
seconds between the program starting and that message arriving now ends the
run without waiting, so those runs report no `silent_loss` where they used to
report one. It searches the same candidates as the double-quote repair (10
plus one that rewrites every pair, skipped above 16 kB), but unlike that
search it runs on
```

(f) `silent_loss` の absence の原因を挙げている箇所に、**原因を 1 つ足す**。

経緯を残す。ここは 2 度ひっくり返っている。①初稿は「トランスパイル中の Stop はもう absence の原因では
なくなる」（待たせるので値が付く）と書いた → ②`ABANDONED_OUTCOMES` で待たなくなったので撤回した →
③**実は逆向きの変化が 1 つ増えている**（Gate2 3 周目 H5）。**現行コードでは探索がトランスパイルの
「前」にあるので、実行が始まった時点で答えはもう埋まっており、実行中の Stop には `silent_loss` が付く。**
変更後は探索が実行と並走するので、**その窓（最大 3 秒 + パース 1 回）で Stop を押すと値が付かない。**
暴走ループを止める Stop は実行開始の直後に寄るので、無視できる形ではない。

旧（**この折り返しのまま**。同じ文の `a source over 64 kB,` は (d) が別に触るので、ここは重ならない範囲だけ取る）:

```md
or a Stop pressed before transpiling). So
```

新（先頭の 3 スペースはリスト項目のインデント。元の段落に合わせる）:

```md
or a Stop pressed before transpiling), a Stop
   pressed in the first seconds of execution — since #75 the search runs
   alongside the program instead of before it, and a stopped run does not wait
   for its answer — and a search whose answer arrived after the 20 s backstop
   had already sent the event. So
```

**当てる前に `grep -c "or a Stop pressed before transpiling). So" CLAUDE.md` が 1 であることを確かめる**
（`CLAUDE.md:733` にも似た文があるので、`). So` まで含めた形で探すこと）。

- [ ] **Step 2: analytics.ts のコメントを更新** — 旧:

```ts
     * the parse succeed, when one did. An enum with a single member today
     * (`double_quote`), so unlike the three parameters above it needs no
```

新:

```ts
     * the parse succeed, when one did. An enum (`double_quote`, `semicolon`,
     * `missing_period`), so unlike the three parameters above it needs no
```

- [ ] **Step 3: 判定までの時間を測る**（コミットしない。Node と 3 ブラウザ）

**測るのは「Run から判定の表示まで」。** 探索は判定の後ろにいるので合否に効かない。合格線は仕様のとおり「同じ入力の元のパース 1 回をそのブラウザで測り、その 2 倍」。超えるなら遅いのは元のパースで、それは #76 — **上限の値を自分で変えずに止めてユーザーに報告する**。

Node — `npx vitest` はフック G2 が拒否するので `./node_modules/.bin/vitest` を使う。この repo の vitest は `console.log` を出さないので結果はファイルに書く:

```bash
# The temp file breaks `tsc -b` (TS2307 on node:fs) while it exists, so remove it however this ends.
trap 'rm -f src/workers/perf.tmp.test.ts' EXIT INT TERM HUP
cat > src/workers/perf.tmp.test.ts <<'TS'
import { it } from "vitest";
import { writeFileSync } from "node:fs";
import { Buffer } from "buffer";
(globalThis as unknown as { Buffer: typeof Buffer }).Buffer = Buffer;
import { Config, Registry, MemoryFile } from "@abaplint/core";
import { config as transpilerConfig } from "@abaplint/transpiler";
import type { Issue } from "@abaplint/core";
import { errorCounter, countErrors, errorIssues, findSyntaxRepair, MAX_SOURCE_CHARS } from "./syntaxRepair";
import { errorRowCounter, errorSpanOf, findStatementEndRepair } from "./statementEndRepair";
import { SEARCH_BUDGET_MS, withDeadline } from "./searchDeadline";

it("verdict and search at the size cap", async () => {
  const config = new Config(JSON.stringify(transpilerConfig));
  const file = "ztest.prog.abap";
  const shapes: Record<string, string> = {
    dq: `lv = |a#| && 'b' "c";\n`,
    semi: `WRITE 'value#';\n`,
    period: `WRITE 'a'\n`,
    js: `console.log("x");\n`,
    foo1: `foo(1);\n`,
    foo1x: `foo(1, "x");\n`,
    // The shape that broke the old design: one statement, 8,192 rows.
    x: `x\n`,
  };
  const rows: string[] = [];
  for (const [name, line] of Object.entries(shapes)) {
    const source = line.repeat(Math.floor(MAX_SOURCE_CHARS / line.length));
    // Best of two, so JIT warm-up on the first shape cannot inflate verdict_ms.
    let parseMs = Infinity;
    let issues: Issue[] = [];
    for (let i = 0; i < 2; i++) {
      const t0 = performance.now();
      const reg = new Registry(config);
      reg.addFile(new MemoryFile(file, source));
      await reg.parseAsync();
      issues = reg.findIssues();
      parseMs = Math.min(parseMs, performance.now() - t0);
    }
    const errors = errorIssues(issues);
    const count = errorCounter(config, file);
    const rowsIn = errorRowCounter(config, file);
    // Three runs, median: one input measured 4.9-6.5 s across runs (Gate2 round 3).
    const runs: { ms: number; parses: number; repair: unknown }[] = [];
    for (let r = 0; r < 3; r++) {
      let parses = 0;
      const t1 = performance.now();
      const deadline = t1 + SEARCH_BUDGET_MS;
      const repair =
        (await findSyntaxRepair(
          source,
          countErrors(issues),
          withDeadline((c) => (parses++, count(c)), deadline),
        )) ??
        (await findStatementEndRepair(
          source,
          errors.map(errorSpanOf),
          withDeadline((c) => (parses++, rowsIn(c)), deadline),
        ));
      runs.push({ ms: performance.now() - t1, parses, repair });
    }
    runs.sort((a, b) => a.ms - b.ms);
    const mid = runs[1];
    rows.push(
      `${name} chars=${source.length} errors=${errors.length} verdict_ms=${parseMs.toFixed(0)} ` +
        `search_parses=${mid.parses} lint_frozen_ms=${(parseMs + mid.ms).toFixed(0)} ` +
        `repair=${JSON.stringify(mid.repair)}`,
    );
  }
  writeFileSync("/tmp/perf.txt", rows.join("\n") + "\n");
}, 600_000);
TS
./node_modules/.bin/vitest run src/workers/perf.tmp.test.ts > /tmp/perf.log 2>&1; echo "PERF_EXIT=$?"
cat /tmp/perf.txt; rm src/workers/perf.tmp.test.ts; git status --short src/workers
```
  Expected: `PERF_EXIT=0`。`verdict_ms` が判定までの時間、`lint_frozen_ms` が探索中に lint が止まる時間。**どちらも合否にせず、PR 本文に表で書く**

ブラウザ — 本番ビルドで Run を押してからエラー表示までを 3 エンジンで測る:

```bash
cat > /tmp/browser-perf.mjs <<'JS'
import { chromium, firefox, webkit } from "/home/feathach/dev/abap-dojo/node_modules/playwright/index.mjs";
import pako from "/home/feathach/dev/abap-dojo/node_modules/pako/dist/pako.esm.mjs";
const CAP = 16 * 1024;
const encode = (s) => Buffer.from(pako.deflate(new TextEncoder().encode(s)))
  .toString("base64").replace(/\+/g, "-").replace(/\//g, "_");
const fill = (line) => line.repeat(Math.floor(CAP / line.length));
const SOURCES = {
  dq: fill(`lv = |a#| && 'b' "c";\n`),
  semi: fill(`WRITE 'value#';\n`),
  js: fill(`console.log("x");\n`),
  foo1x: fill(`foo(1, "x");\n`),
  x: fill(`x\n`),
};
const URL = "http://localhost:4173/";
for (let i = 0; i < 60; i++) {
  try { await fetch(URL); break; } catch { await new Promise((r) => setTimeout(r, 1000)); }
}
const out = [];
for (const [name, engine] of Object.entries({ chromium, firefox, webkit })) {
  const browser = await engine.launch();
  for (const [label, source] of Object.entries(SOURCES)) {
    const page = await browser.newPage();
    try {
      await page.goto(`${URL}#code=${encode(source)}`);
      const run = page.getByRole("button", { name: /Run/i });
      await run.waitFor({ timeout: 30_000 });
      // Wait for the boot-time lint of this same 16 kB source to come back
      // before starting the clock. The worker is one thread, so a Run pressed
      // while it parses QUEUES behind it and verdictMs would include a whole
      // extra heavy parse — the very thing this measurement is about. The
      // Lint tab's count can only move once a lint-result arrived, so it is
      // the signal; a fixed sleep would be a guess about a parse that ranges
      // from 24 ms to 1.5 s by shape (Gate2 3 周目 H4). Every shape here
      // fails to parse, so the count does reach a non-zero value.
      await page.getByRole("button", { name: /Lint \([1-9]/ }).waitFor({ timeout: 60_000 });
      const t0 = Date.now();
      await run.click();
      const end = page.getByText(/Syntax error|stopped responding/i).first();
      await end.waitFor({ timeout: 60_000 });
      const verdictMs = Date.now() - t0;
      const text = (await end.textContent()) ?? "";
      // How much later the search answered — the hint, not the verdict.
      await page.locator('[data-search="done"]').waitFor({ timeout: 60_000 });
      out.push({
        name, label, chars: source.length, verdictMs,
        searchDoneMs: Date.now() - t0,
        stalled: /stopped responding/i.test(text),
      });
    } catch (e) {
      out.push({ name, label, error: String(e).slice(0, 160) });
    }
    await page.close();
  }
  await browser.close();
}
console.log(JSON.stringify(out));
JS
if ss -ltn | grep -q ':4173 '; then echo "PORT_4173_BUSY"; exit 1; fi
npm run build > /tmp/build.log 2>&1; echo "BUILD=$?"
./node_modules/.bin/vite preview --port 4173 --strictPort > /tmp/preview.log 2>&1 &
echo $! > /tmp/preview.pid
node /tmp/browser-perf.mjs > /tmp/browser-perf.json 2>&1; echo "BROWSER_EXIT=$?"
cat /tmp/browser-perf.json
grep -c 'already in use' /tmp/preview.log
kill "$(cat /tmp/preview.pid)"; echo "KILL=$?"
```
  Bash の `timeout` は 600000。
  Expected: `BUILD=0`・`BROWSER_EXIT=0`・`already in use` が 0 件・`KILL=0`（測ったのが自分で立てた preview であることの確認。スクリプトは例外を握りつぶして `error` に書くので `BROWSER_EXIT=0` だけでは証拠にならない）。**`stalled` が 15 件すべて `false`、`error` が 0 件** — ここだけが合否。`verdictMs` と `searchDoneMs` は PR 本文に書く

- [ ] **Step 3b: 成功側が速くなったことを測る**（仕様「実装後に測って PR に書く」の 3 つ目）

成功側は探索がトランスパイルの後ろへ移ったぶん、実行の開始が早くなるはず。直接は観測できないので
**「Run を押してから最初の出力行が出るまで」**で測る。二重引用符のペアを多く含む**成功する**プログラムを使う
（探索が長いほど差が出る。ペアはすべてコメント内なので書き換えても件数が動かず、探索は最後まで走る）。

```bash
cat > /tmp/success-perf.mjs <<'JS'
import { chromium } from "/home/feathach/dev/abap-dojo/node_modules/playwright/index.mjs";
import pako from "/home/feathach/dev/abap-dojo/node_modules/pako/dist/pako.esm.mjs";
const encode = (s) => Buffer.from(pako.deflate(new TextEncoder().encode(s)))
  .toString("base64").replace(/\+/g, "-").replace(/\//g, "_");
// Correct ABAP: every pair is inside a comment, so the search finds nothing
// and runs every candidate — the worst case for a run that succeeds.
const source = `REPORT ztest.\n` + `* a note about "x" and "y"\n`.repeat(400) + `WRITE 'done'.\n`;
const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto(`${process.env.BASE_URL}/#code=${encode(source)}`);
const run = page.getByRole("button", { name: /Run/i });
await run.waitFor({ timeout: 30_000 });
// No lint-count signal here: this program is correct ABAP, so the count stays
// at 0 and nothing observable changes when the lint returns. 400 comment
// lines parse in milliseconds, so a short fixed wait is honest here — unlike
// Step 3, where the source is at the size cap.
await page.waitForTimeout(3_000);
const t0 = Date.now();
await run.click();
await page.getByTestId("output-line").first().waitFor({ timeout: 60_000 });
const firstOutputMs = Date.now() - t0;
// `data-search` does not exist in the "before" build — this Step is the one
// place the script runs against a tree without this change in it — so the
// second number is optional (Gate2 3 周目 H3). Without this guard the
// "before" run waits 60 s and then throws, printing nothing at all, and the
// comparison the Step exists for cannot be made.
let searchDoneMs = null;
try {
  await page.locator('[data-search="done"]').waitFor({ timeout: 20_000 });
  searchDoneMs = Date.now() - t0;
} catch {
  searchDoneMs = null;
}
console.log(JSON.stringify({ chars: source.length, firstOutputMs, searchDoneMs }));
await browser.close();
JS
```
  この計画を当てる**前**と**後**で 1 回ずつ走らせる。**前は `git stash` ではなく別の worktree で作る**:

```bash
BASE=$(git merge-base HEAD origin/main)
git worktree add /tmp/abap-before "$BASE"
ln -s "$PWD/node_modules" /tmp/abap-before/node_modules
# `npm run build` ではなく vite build だけを呼ぶ。`build` は `tsc -b` を含み、
# tsconfig の tsBuildInfoFile が ./node_modules/.tmp/ を指しているため、
# symlink で共有した node_modules に「別ツリーのパスで記録した buildinfo」を
# 書き込んでしまう。以後この repo 側の typecheck / build が誤った増分判断をする
# （Gate2 3 周目 M10）。測るのは実行時の速さなので型検査は要らない。
( cd /tmp/abap-before && ./node_modules/.bin/vite build )
```

  **前後は同じポートで順に測る。** それぞれ自分の `dist` を配ってから走らせ、終わったら必ず落とす:

```bash
run_one() {   # $1 = 測るディレクトリ, $2 = ラベル
  if ss -ltn | grep -q ':4173 '; then echo "PORT_4173_BUSY"; return 1; fi
  ( cd "$1" && ./node_modules/.bin/vite preview --port 4173 --strictPort > /tmp/preview-$2.log 2>&1 & echo $! > /tmp/preview-$2.pid )
  for i in $(seq 60); do curl -sf http://localhost:4173/ > /dev/null && break; sleep 1; done
  BASE_URL=http://localhost:4173 node /tmp/success-perf.mjs > /tmp/success-$2.json 2>&1; echo "$2_EXIT=$?"
  cat /tmp/success-$2.json
  grep -c 'already in use' /tmp/preview-$2.log
  kill "$(cat /tmp/preview-$2.pid)"; echo "$2_KILL=$?"
}
run_one /tmp/abap-before before
run_one "$PWD" after
git worktree remove /tmp/abap-before
```

  `git stash` を使わない理由は 2 つ。この時点の作業ツリーには Task 1〜6 のコミット済み差分と未コミットの
  測定用スクリプトが混ざっていて「戻した先」が曖昧になること、そして Tailwind v4 が
  **ディスク上の非 ignore ファイルを走査する**ので stash の残し方でビルド結果が変わること（CLAUDE.md）。
  worktree なら前の状態がそれ自身のディレクトリとして存在する。

  Expected: `before_EXIT` / `after_EXIT` がどちらも 0、`already in use` が 0 件。
  **`before` の `searchDoneMs` は `null`**（属性がまだ無い）、`after` は数値。
  `firstOutputMs` は後のほうが小さい。合否にはせず PR 本文に 2 つの数字を書く。Bash の `timeout` は 600000

- [ ] **Step 4: `x⏎` 32 kB が #76 のままであることを確かめる**（線引きの証拠）

```bash
node -e '
const {Buffer:B}=require("buffer");globalThis.Buffer=B;
(async()=>{
 const core=require("@abaplint/core"), tp=require("@abaplint/transpiler");
 const cfg=new core.Config(JSON.stringify(tp.config));
 for (const kb of [16,32]) {
   const src="x\n".repeat(kb*512);
   const t=performance.now();
   const r=new core.Registry(cfg); r.addFile(new core.MemoryFile("z.prog.abap",src));
   await r.parseAsync(); r.findIssues();
   console.log(kb+" kB original parse: "+Math.round(performance.now()-t)+" ms");
 }
})()'
```
  Bash の `timeout` は 600000（32 kB は 20 秒前後かかる）。
  Expected: 16 kB が 1.5 秒前後、32 kB が **19 秒前後**。この 32 kB の数字が **#76 を別 PR に残した線引きの証拠**になる — この PR は探索を判定の後ろへ動かすだけで、元のパースそのものには一切効かない。両方の数字を PR 本文に書き、#76 に「A の出荷後も再現する」とコメントする

- [ ] **Step 5: 全体検証**

```bash
npm run lint; echo "LINT=$?"
npm run typecheck; echo "TYPECHECK=$?"
npm test; echo "VITEST=$?"
if [ -e /tmp/sp-hold/superpowers ]; then echo "HOLD_EXISTS"; exit 1; fi
mkdir -p /tmp/sp-hold && mv docs/superpowers /tmp/sp-hold/ && trap 'mv /tmp/sp-hold/superpowers docs/' EXIT INT TERM HUP
npm run build >/dev/null 2>&1; echo "BUILD=$?"
diff <(tr "}" "\n" < /tmp/before.css) <(tr "}" "\n" < dist/assets/index-*.css); echo "CSS_DIFF=$? (0 = no new rules)"
ls -l dist/assets/index-*.js
git diff --stat origin/main -- src/workers/syntaxRepair.test.ts
```
  Expected: LINT / TYPECHECK / VITEST / BUILD / CSS_DIFF すべて 0（`/tmp/before.css` は Task 1 Step 0 で取ったもの。セッションをまたいだら取り直す）。`index-*.js` は約 350 kB のまま。`syntaxRepair.test.ts` の diff は **コメント 1 行だけ**（Task 4 Step 4。アサーションの差分はゼロ）

- [ ] **Step 6: Commit**

```bash
git add CLAUDE.md src/utils/analytics.ts
git commit -m "syntax_repair の文書に statement-end の 2 種・判定とヒントの分離・16 kB の上限を書く (#67, #75)"
```

### PR 本文に入れるもの

- **#75 を閉じる**（判定が探索を待たなくなった、が #75 の要求そのもの）
- **#67 を閉じるかは `gh` を打つ前に skill `github-issues` を読んで決める**。#67 は「`WRITE` バケツの 3 形」全体の issue で、二重引用符は #69 で済んでいる
- **#76 は閉じない。** Step 4 の 32 kB の数字を添えて「A の出荷後も再現する」とコメントする
- 表 3 つ: Node の `verdict_ms` / `lint_frozen_ms`、ブラウザ 15 件の `verdictMs` / `searchDoneMs` / `stalled`、`x⏎` の 16 kB と 32 kB
- **正直に書くこと**: 探索中は lint が止まり、16 kB の重い形で最悪およそ 10 秒になる。上限は縮めるが保証しない

---

## Task 番号の対応（旧計画 → この計画）

末尾の Gate2 記録は旧番号で書かれている。読むときはこの表で読み替える。

| 旧 | この計画 | 備考 |
|---|---|---|
| Task 1 | Task 1 | 変更なし |
| Task 2 | Task 2 | 変更なし |
| Task 2b | **Task 3** | 内容は同じ。コメントだけ「守るものが変わった」に書き換え |
| Task 3（配線と e2e） | **Task 4 / 5 / 6 に分割** | 手段 A でワーカー・App・e2e が別々の検証を持つようになったため |
| Task 4（文書・測定） | **Task 7** | 測定の合否が「探索の所要時間」から「判定までの時間と `stalled` の不在」に変わった |
| — | **Task 6 Step 6**（新規） | Gate2 新周回 M2「配線漏れ検査が 1 か所だけ」への手当て |

---

## Gate2 記録（手段 A より前。2026-09-11）

以下は**判定と探索を 1 通で返していた頃**の計画に対するレビュー記録。手段を替えたので、
「探索が遅いと `outcome` が壊れる」を根に持つ指摘（1 周目 H1・3 周目 H-B・新周回 H1）は
**前提ごと無効**になった。実測値そのものは今も有効で、上限を残す根拠（lint が止まる時間）として使っている。
残りの指摘は上の Task に引き継いである。

### 1 周目 — critical 0 / high 2 / medium 4 / low 4

fresh サブエージェント（general-purpose）。計画のコードを一時ファイルに写して実 abaplint で動かし、単体テスト 30 件はそのまま緑。
誤ヒント・ソース送信・`syntax_error`/`transpile_error` の分離破壊は、58 入力で見つからなかった。

- **H1** 64 kB 入力で探索が合計約 16.8 秒。`lv = |a#| && 'b' "c";` の繰り返しで二重引用符 11 回 8,466 ms + 新探索 13 回 7,739 ms。
  `WRITE 'value#';` の繰り返しで新探索 9,334 ms。20 秒のウォッチドッグが先に `stalled` を出し、後から届く結果は捨てられる。
  仕様の 413 ms は 300 行の値で最悪ケースではない → **手段 A で前提が消えた。** 実測は `MAX_SOURCE_CHARS` のコメントに残す
- **H2** 変異確認の grep が成功行も数えるので、期待値 10 が「変異が効かず全件成功」と一致する → **Task 6 Step 5**（`✘` と `✓` を別々に数える）
- **M1** まとめ候補の targets が全エラーの行なので、無関係なエラーが 1 つあると連続ピリオド抜けが黙る → **Task 2**（targets を書き換えた行を含むスパンに絞る）
- **M2** 厳しい判定が実際に効いているのは 58 入力中 2 件だけ → **仕様「厳しい判定の損得」節**
- **M3** `npx vitest` はフック G2 が拒否する。この repo の vitest は `console.log` を出さない → **Task 7 Step 3**
- **M4** 変更後に偽になる記述が計画の対象外にある（`syntaxRepair.ts` のコメント、`CLAUDE.md`、`abaplintWorker.ts`）→ **Task 2 / 7**
- L1 連続ピリオド抜けに複数行の文が混ざると見逃す ／ L2 CLAUDE.md 置換文が重複する ／ L3 `return;` → semicolon ／ L4 CSS 比較の限界
  → L2 のみ対応（旧/新を行単位で示す）。L1・L3・L4 は**対応しない**（届かない形であって誤ヒントではない）

1 周目のあとユーザーが決めたこと: 大きさの上限を 64 kB → 16 kB（仕様 Q6）。
実測（Node、1 回のパース、2 回のうち速い方）は仕様の表に転記済み。
ブラウザ（本番ビルド、`lv = |a#| && 'b' "c";`、Run → エラー表示）: 16 kB で Chromium 862 / Firefox 942 / WebKit 864 ms、
64 kB で 3,883 / 12,756 / 10,600 ms。`stalled` 0。

### 2 周目 — critical 0 / high 1 / medium 3 / low 8

約 85 入力を実パーサで試して誤ヒント 0 件（件数だけの判定なら誤ヒントになる入力を厳しい判定がさらに 3 件止めた）。
計画のテスト 35 件・既存 `syntaxRepair.test.ts` 72 件が 16 kB 化の後も緑。`tsc -b` と ESLint を通過。

| 指摘 | 内容 | この計画での扱い |
|---|---|---|
| **H-1** | 変異確認が既定 120 秒で切られると復元が走らず、変異入りのワーカーがコミットされうる（型もビルドも通り、本番でヒントが一切出ない） | Task 6 冒頭の前提、Step 5 の `trap` と timeout、Step 7 の確認 |
| M-1 | 116 ms / 2,642 ms は別の形の数字の組 | 同じ形に統一（仕様・Task 2） |
| M-2 | ブラウザ測定が 33 回使い切る形（`js`）を含まない。JIT の立ち上がりで水増し | Task 7 Step 3（2 回のうち速い方、`js` 形、`x` 形を追加） |
| M-3 | ポート 4173 がふさがっていると e2e が起動せず、測定は他人のサーバを測る | Task 6 冒頭、Step 5・6、Task 7 Step 3 |
| L-2 | `WRITE "hello";` はどの種類にも入らない | Task 7 Step 1 (c) |
| L-3 | 定数の置き換え範囲が曖昧 | Task 2 Step 3 を旧/新の行単位に |
| L-4 | `repairHint.ts` の追記位置 | Task 1 Step 4 |
| L-5 | エラーの判定が 3 か所目になる | `errorIssues` を export して共有（Task 2） |
| L-6 | Node 測定の一時ファイルが残ると `tsc -b` が落ちる | Task 7 Step 3 の `trap rm` |
| L-7 | e2e 冒頭のコメント、HANDOFF の 64 kB | Task 6 Step 2 |
| L-8 | 大きさの上限テストが正しい理由で赤になるのを確かめていない | `searchSizeCap.test.ts` に分離（Task 2 Step 2） |
| L-1 | `WRITE 'a'.;` に「セミコロンをピリオドに」と言う | **対応しない**: 従うと `WRITE 'a'..` になりパースは通る |

### 3 周目 — critical 0 / high 2 / medium 1 / low 3（周回上限。high が残り人へ戻した）

206 入力を実パーサで試し、ヒントが出た 94 件に誤ヒント 0 件。Task 1〜4 を計画どおりに当てて `npm test` 459 件緑・`tsc -b` 0・ESLint 0。

- **H-A（手順）** 変異確認の後の `grep -c` は表示するだけで止まらない。Bash ツールは timeout で処理を殺さず裏へ回すので、
  裏の Step と並んで再実行が走ると変異入りのコミット・バックアップの上書きが起きうる → **Task 6 Step 5 / 7**
- **H-B（時間の保証）** 16 kB でも Node で 5 秒を超える形がある: `foo(1);` で探索 4.9 / 5.4 / 6.5 秒、`foo(1, "x");` で 7.8 秒。
  「同じ根が 2 回目」→ **手段 A で前提が消えた。** 実測は `searchDeadline.ts` のコメントに残す
- M-A Tailwind v4 は `docs/superpowers/*.md` も走査するので、計画に写したコードの文字列が基準 CSS に先に入る → **Task 1 Step 0 / Task 7 Step 5**
- L-a ワーカーの `isError` が `errorIssues` と別定義のまま → **Task 4 Step 3**（`isError` を削除）
- L-b `SyntaxRepair.line` と `RepairCandidate.line` のコメントが二重引用符の話だけ → **Task 1 Step 3 / Task 2 Step 3 (iv)**
- L-c `;` だけのプログラム → semicolon line 1 など。**対応しない**（事実として正しい）

### 新しい周回の 1 周目 — critical 0 / high 1 / medium 3 / low 3（同じ根が 3 回目。仕様へ戻した）

Task 1・2・2b・3 Step 3 を計画どおりに当てて `npm test` 465 件緑・`tsc -b` 0・ESLint 0。各 Step の赤も記載どおり。
173 入力で新しい種類の誤ヒント 0 件。打ち切りが誤ヒントを生む余地は無い（順序固定・最初に見つかったもので止まる・期限共有）。

- **H1（実測）1 回のパースが期限より長い形が 16 kB 以内にある。** `x⏎` や `<⏎` × 8,192 行は、元のパース 1.5〜1.75 秒、
  最終行にピリオドを足した候補 1 回が 4.0〜4.3 秒（`<⏎` は 8.6 秒）。打ち切りは「次のパースを始めない」しかできない
  → **手段 A で前提が消えた。** この形は Task 6 Step 2 の e2e と Task 7 Step 3 の測定に入れてある
- **M1** ブラウザ測定は Run の前に 8 秒待つので、貼ってすぐ押したとき先に処理される lint（上限なし）を測っていない
  → **一部だけ手当て**。Task 7 Step 3 で `lint_frozen_ms` を測るようにしたが、「貼ってすぐ押す」経路そのものは #76 の領域
- **M2** 配線漏れ検査が `errorRowsIn` だけ。`errorsIn` や成功側 `scoreIn` の包み忘れはどの検証も緑のまま → **Task 6 Step 6（新規）**
- **M3** 仕様の不変条件 1（16 kB 以下で `double_quote` は変わらない）が打ち切りと矛盾 → **仕様 不変条件 1 を書き換え**（「打ち切りに達しない入力では」）
- L1 Task 2b Step 2 の赤は import 失敗だけ（変異 6 通りで 5 通りは捕まる）→ **Task 3 Step 2 にそのまま残る既知の弱さ**
- L2 行番号のずれ → この計画は文面で当てる書き方に統一したので解消
- L3 `break;` / `continue;` → semicolon など。**対応しない**（事実として正しい）

**同じ根（上限で時間を抑えきれない）が 3 回。** 周回の規則により実装ではなく仕様へ戻り、
「目的由来か手段由来か」を問い直して手段を替えた（仕様「手段を替えた理由」節）。
**この計画で Gate2 を新しい周回（1 周目から）でやり直す。**

---

## Gate2 記録（手段 A 後・1 周目・2026-09-12）— critical 2 / high 3 / medium 4 / low 2

fresh サブエージェント（general-purpose、opus）。計画の Task 1〜5 を scratch tree に実際に当てて
`tsc -b` / ESLint / vitest を実行。**3 周つぶした根（上限で時間を保証できない）の再提起は 0 件** —
手段を替えた判断はレビュー側でも支持された。

### critical

- **C1 計画のワーカーコードがコンパイルできない。** `let issues: Issue[];` が TS4104。
  `findIssues()` は `readonly Issue[]` を返す（`abaplint.d.ts:4197`）。現行コードは推論に任せているので
  問題が無く、**計画が明示的な注釈を足したことで初めて壊れる**。Task 4 Step 5・Task 5 Step 5・
  Task 7 Step 5 の受け入れコマンドを全部止める
  → **修正済み**（`readonly Issue[]` に変更。`abaplint.d.ts:4197` を自分でも確認）
- **C2 `src/App.test.tsx`（615 行）が存在し、この変更で 4 件落ちる。計画は一度も言及していない。**
  4 件とも根は 1 つで、FakeWorker が追いかけの 1 通を送らないため `run_result` が 0 件になる。
  重いのは古いテストがあることではなく、**落ちた 4 件が不変条件 6（`run_click`/`run_result` 1:1）を
  ピン留めしている唯一のスイート**であること。
  → **未修正。仕様 239 行の「`App.tsx` には単体テストが無い（#17）ので e2e が唯一の証拠」は事実誤認**
  （自分でも確認: `wc -l src/App.test.tsx` = 615、`grep -c runResultCalls` = 18）。
  仕様と Task 6 の位置づけごと直す必要がある

### high（すべて未修正）

- **H1** 上の事実誤認のせいで、最も分岐の多い Task 5（App の状態機械）に赤→緑の証拠がほぼ無い。
  `App.test.tsx` の FakeWorker は `onmessage` を直接叩けるので、「追いかけが来ないまま 20 秒」
  「A の追いかけが B に付かない」「unmount 後にタイマーが発火しない」「`stalled` は待たない」は
  数行で単体テストにできる
- **H2 `stalled` の後、`data-search` が `pending` のまま二度と `done` にならない。**
  `endRun` が `followUpRef` を空にしてから即送信するので、後から届く追いかけが捨てられ
  `setSearchState("done")` に到達しない。`waitForSearchDone` は 30 秒待って落ちる。
  踏むのは元のパースが 20 秒を超える入力 — **Task 6 Step 2 の `x⏎` × 8,192 がまさに狙っている形**
- **H3 判定メッセージの組み立てが try の外に出た。** `new Registry(...)`・`first.getMessage()`・
  `classifySyntaxError(...)` がどの try にも入っていない。ここが投げると `handleTranspile` が reject し、
  **判定も追いかけも 0 通**になって App は 20 秒後に `stalled`。現行コードは全部 try の中にあり
  `transpile_error` になる。CLAUDE.md が load-bearing と呼ぶ `transpile_error`/`stalled` の対が壊れ、
  不変条件 5（必ず 2 通）もこの経路では 0 通

### medium（すべて未修正）

- **M1 `withDeadline` の包み忘れを検出する検証が 1 つも無い。** 3 か所のうちどれを外しても単体も e2e も全緑。
  新周回 M2 への手当て（Task 6 Step 6）は検査を 1 か所増やしただけで、**Q7 の本体である期限の配線は依然無検証**
- **M2 トランスパイル中に Stop を押した Run の `run_result` が最大 20 秒遅れる**ことが、計画にも仕様にも無い。
  不変条件 6 の「落ちうるのはタブを閉じた Run だけ」の母数が「Stop を押した全 Run」に広がった
- **M3 e2e の重い入力が上限ちょうど**（`x\n`.repeat(8192)` = 16,384 = `MAX_SOURCE_CHARS`）。
  1 文字増えれば探索が走らず、テストが何も確かめなくなる。境界であることを固定するアサーションが無い
- **M4** Global Constraints の「仕様 不変条件 10」は**不変条件 8** の誤り → **修正済み**

### low（未修正）

- **L1** `searchState` がモード切替でも Stop でも `idle` に戻らず、`done` が次の Run まで残る。
  2 回 Run するテストを足した瞬間に `waitForSearchDone` が前の Run の `done` を読む（#70 と同じ形）
- **L2** `flushPendingResult` は `followUpTimerRef` を消すが `followUpRef` を消さない。
  今は二重送信にならないが、2 つの ref の寿命が揃っていない理由がどこにも書かれていない

### 正しいと確認されたこと

- **exact-match 27 箇所すべてが現ファイルにちょうど 1 回**（CLAUDE.md (a)〜(f)、`analytics.ts`、
  `repairHint.ts`、`diagnostics.ts:142`、`syntaxRepair.test.ts:546`）。2 周目 L2 の対策は効いている
- Task 1〜3 を当てて計画のテスト 4 ファイル **48 件全緑**。実パーサ 23 ケースは記載どおり
- abaplint のエラースパンは前提どおり（`WRITE: 'a',⏎'b'` → `{2,3}`、`console.log('a')` → 同一行 2 件、
  `semi+misspelt` → 2〜4 行が 1 件）。`errorSpanOf` + 「終わりの行」方式は正しい
- `searchSizeCap.test.ts` は **AssertionError で赤**（import 失敗ではない）。2 周目 L-8 の手当ては機能
- 既存 `syntaxRepair.test.ts` は 16 kB 化後も無修正で緑、アサーション差分ゼロ
- 「必ず 2 通」は**探索まわりでは成立**。破れるのは H3 の経路だけ
- 計画が挙げた「無効になる既存 e2e 4 件」の見立ては正しく、触っていない e2e に #70 型の欠陥は無い
- Task 7 の測定は**合否が未測定の数値に乗っている箇所は無い**

### 確認できなかったこと

e2e は 1 件も実行していない（ビルド込みで長時間・ポート占有のため）。Task 6 Step 4〜6 の実効性と
**H2 の顕在化**は机上判断のみ。Task 7 の測定スクリプトと Tailwind CSS 差分も未実行。

### 次の周回の前にやること

1. **仕様 239 行を直す**（`App.test.tsx` は存在する）→ **対応済み（2026-09-12）**。Task 6 の
   「e2e が唯一の証拠」を撤回し、**Task 5 に単体テストの Step を足す**（H1 / C2）→ **対応済み（2026-09-12）**。
   落ちる 4 件（`App.test.tsx:150 / 216 / 397 / 503`）を直す Step も要る
   — FakeWorker が追いかけの 1 通を送らないので `run_result` が 0 件になる。
   **同じ陳腐化がコード側に 2 か所ある**: `e2e/silentLoss.spec.ts:87`（`App.tsx's wiring has none at all (#17)`）と
   `e2e/syntaxHint.spec.ts:9`（`has no unit tests at all (#17)`）。どちらも Task 6 で触るファイルなので、
   同じ Step で直す
2. H2・H3 を直す（どちらも状態遷移・例外経路の穴で、実装前に計画で閉じられる）→ **対応済み（2026-09-12）**
3. M1〜M3、L1〜L2 を計画に反映 → **対応済み（2026-09-12）**
4. **2 周目**を fresh サブエージェントで回す（周回上限 3、いま 1 周目を消化）

**→ 1〜3 の全件を次節「Gate2 1 周目への対応」に反映済み。**

### Gate2 1 周目への対応（2026-09-12）

9 件すべてを計画に反映した。**根っこは 2 つ** — ①追いかけを「待つ Run」と「待たない Run」の線が細すぎた、
②「必ず 2 通」を約束していたのに、それを守る仕組みがコードの形になっていなかった。

| 指摘 | どう閉じたか | どこで確かめるか |
|---|---|---|
| **C2 / H1** `App.test.tsx` を計画が無視していた | Task 5 に Step 4b〜4d を追加。落ちるのは**実は 1 件**（`success` の 503）で、残り 3 件は `stopped` — M2 の手当てで待たなくなるので無修正で緑。追いかけの状態機械に新規 5 件 | Step 4c で実測（表と突き合わせる）。Step 4d の 5 件 |
| **H3** 判定の組み立てが try の外 | Task 4 Step 3 で `handleTranspile` 全体を 1 つの `try`/`finally` に入れ、`finally` が追いかけを 1 通必ず送る。`verdict` 変数で対を保つ | Step 4b の新テスト（`classifySyntaxError` を投げさせて 2 通来ることを見る）。**これは e2e では作れない** |
| **H2** `stalled` 後に `data-search` が `pending` のまま | `done` の意味を「もう何も来ない」に変え、`endRun` の待たない経路で `setSearchState("done")`。`followUpRef` もそこで空にするので、遅れて来た追いかけが無関係なメッセージにヒントを継ぎ足すこともできない | Step 4d の `stalled` のテスト。e2e は `done` を待つ否定テストに「期待する判定」の主張を足した |
| **M1** `withDeadline` の包み忘れが検出されない | 検証を足すのではなく**型で落とす**。`bounded()` を足し、ワーカーの 3 定数は `(deadline) => reparse` になった。期限を渡し忘れたものは探索に渡せない | `tsc -b`。`searchDeadline.test.ts` に 1 件追加 |
| **M2** Stop 中の Run の `run_result` が最大 20 秒遅れる | `ABANDONED_OUTCOMES = {stalled, stopped, cancelled}` を足し、**判定を見ている人がいる Run だけ待つ**。仕様の不変条件 8 を 3 つに広げ、不変条件 9（Stop で `silent_loss` が付くようになる）を撤回。Task 7 (f) の CLAUDE.md 差分も取り下げ | Step 4c（`stopped` の 3 件が無修正で緑）。Step 4d |
| **M3** e2e の重い入力が上限ちょうど | 上限を定数にして `expect(source.length).toBe(MAX_SOURCE_CHARS)` を足した。**境界であることを意図として固定する**（1 文字増えれば探索が走らず、テストが何も確かめなくなることを明示） | e2e 自身 |
| **L1** `searchState` が `idle` に戻らない | `handleModeChange` で `idle` に戻す。`handleRun` 側は discrete event の同一フラッシュで `pending` になるので隙間が無い、という理由を書いた | Step 4d（Run B が `pending` のままであることを見る） |
| **L2** 2 つの ref の寿命が揃っていない理由が無い | `followUpTimerRef` の JSDoc に「揃えないのが意図」と書いた（揃えるとヒントを落とすか、同じ `run_result` を 2 回送る） | レビュー |
| C1 / M4 | 1 周目で修正済み | — |

**仕様側の変更**: 不変条件 6（待つのは判定が出た Run だけ）・8（3 つに拡大）・9（撤回）、Q13（`done` の意味）、
e2e の証明項目 3（`done` を待つ否定テストは判定も主張する）、受け入れコマンドの `npx playwright` →
`./node_modules/.bin/playwright`（`npx` はフック G2 に拒まれうる）。

## Gate2 記録（手段 A 後・2 周目・2026-09-12）— critical 1 / high 1 / medium 4 / low 5

fresh サブエージェント（general-purpose、opus）。**今回は scratch worktree に Task 1・4・5 を実際に当てて
vitest / tsc を走らせている**（元 repo は無変更）。3 周つぶした根の再提起は 0 件。

### critical

- **C1 「必ず 2 通」が H3 の経路でそのまま破れていた。** `verdict = "syntax"` を `self.postMessage` の
  **前**で立てていたので、引数の中の `classifySyntaxError(...)` が投げると外側 catch の
  `if (verdict === "none")` が false になり、**判定 0 通・追いかけ 1 通**。1 周目 H3 が直そうとした失敗
  そのものが残っていた。実測（scratch tree）: Step 2b の 3 件目が `Tests 1 failed | 3 passed` で赤のまま
  → **修正済み**。`postVerdict(kind, message)` を足し、「引数を評価 → post → 記録」の順序を固定した
  （5 か所すべて）。レビュアーの実測では同じ入れ替えで 4 件とも緑

### high

- **H1 重いペーストの e2e が lint と同じスレッドを奪い合う。** `typeProgram` の直後に `clickRun` すると、
  ワーカーの boot 時 lint（同じ 16 kB）がまだ走っていた場合に Run がその後ろに**並ぶ**。判定が
  「重い lint 1 回＋重い parse 1 回」になり、20 秒に触れて `stopped responding` が出る
  — **手段 A が効いていても赤になる**。計画自身が Task 7 の測定で 8 秒待っていたのに、本体の e2e に
  同じ手当てが無かった → **修正済み**。`waitForLintToSettle`（Lint タブの件数が 1 以上になるのを待つ =
  `lint-result` が返ってスレッドが空いた証拠）を足し、固定の sleep は使わない

### medium（すべて修正済み）

- **M1 1 周目 M3 への手当てが算術恒真だった。** `"x\n".repeat(8192).length === 16384` は常に真で、
  アプリの `MAX_SOURCE_CHARS` を一切参照していない。コメントの「a change to the cap fails here」も偽
  → `src/workers/searchLimits.ts`（**import を 1 つも持たない**）を作り、`syntaxRepair.ts` は再 export、
  e2e は実定数を import する。Playwright の spec から `syntaxRepair.ts` を読むと `@abaplint/core`
  2.7 MB がテストランナーに載るので、それを避けるためのファイル
- **M2 取りこぼしの窓が 0 →最大 20 秒に広がるのに `pagehide` が無かった。** `syntax_error` は全 Run の
  約 3 割。`window.addEventListener("pagehide", flushPendingResult)` を足し、**不変条件 6 に
  「構造的に真」から「ほぼ真」への後退である**と明記した
- **M3 Task 7 (b) の CLAUDE.md 文面が「例外は `stalled` だけ」のままだった** → 3 つに直した
- **M4 ヒントが画面に出たのに `syntax_repair` が乗らない経路**（20 秒のバックストップ後に追いかけが届く）が
  どこにも書かれていなかった → 仕様に不変条件 6b、CLAUDE.md (b) に 1 段落。**重い貼り付けをねらって
  取りこぼす**（ランダムではない）と書いた

### low

- **L1 Stop 後に `data-search` が `done` のまま** → 仕様どおりなので直さず、理由を書いた
  （`handleModeChange` だけ別扱いなのは Validator 側に `handleRun` が無いから）
- **L2 `endRun` が同一 Run で 2 回呼ばれると溜めた結果が消える**（到達経路は見つからず）→ 1 行の
  構造ガードを入れ、「探して見つからなかった」を「形で保証」に変えた
- **L3 `finally` の中の `postFollowUp` が投げたら 0 通** → plain object の `postMessage` は投げないので未対応
- **L4 仕様の e2e 項目の番号が `4.` 重複** → 直した
- **L5 Task 7 Step 3b が `git stash -u`** → `git worktree add <tmp> <base-sha>` に変えた
  （Tailwind v4 がディスクを走査するため stash は基準が曖昧になる）

### 正しいと確認されたこと（実走。次の周回で再確認不要）

- **1 周目 C2 への見立ては正しかった**: Task 4+5 を当てて `App.test.tsx` を無修正実行 →
  **落ちるのは 503 の 1 件だけ**（`Tests 1 failed | 8 passed`）。`deliverFollowUp` を 1 か所足して 14/14 緑
- **Step 4d の新規 5 件はそのまま動く**（`act` / fake timers / `repairHint` / jest-dom 非依存）
- **Step 4e の変異 2 種はどちらも赤**。MUT2 は 6 件落ちる（期待の「stalled 1 + stopped 3」より広いだけ）
- **Step 2b のワーカー単体テストは jsdom で実際に動く**（`self.onmessage` 代入・`vi.spyOn(self,"postMessage")`
  ＋ `mockImplementation`・`vi.mock` の hoisting・top-level `await import`）。1 ファイル 1.33 s
- **`bounded()` は包み忘れを型エラーにする**（実測 `error TS2345`）。ただし「作った場所で包む」規約に依存
- Task 4+5 を当てた全体で `tsc -b --noEmit` exit 0、vitest 426 件中 C1 の 1 件だけが赤
- exact-match アンカーはすべてちょうど 1 回。`grep -n isError` は 57 と 90 のみ。`SilentLossSearch` の型も計画どおり
- **e2e が空振りで緑になる経路は見つからなかった** — 4 件とも `done` を待つ前に肯定的主張がある
  （`OutputPanel.tsx:118` のプレースホルダは `!error` のときしか描かれないので、stalled したビルドでは先に落ちる）
- **同一ワーカーでの要求の並走は壊れない**（`verdict` / `followUpSent` は呼び出しごとのクロージャ）
- **`stopped` を待たないことで失う `silent_loss` は無い**（実行中の Stop なら追いかけは既に届いており、
  トランスパイル中の Stop は CLAUDE.md が既に absence の原因として挙げている形そのもの）

### 確認できなかったこと

e2e は 1 件も実走していない（H1 が実際に踏むかも未確認）。Task 2・3 のコードは書いておらず、1 周目の
「48 件全緑」の実測を信頼している。Task 7 の測定スクリプト・Tailwind の CSS 差分・`npm run build` は未実行。

### 次の周回（3 周目 = 上限）

C1 と H1 を直したので、3 周目は **critical 0 の確認**が主目的。同じ根が 2 回出たら実装ではなく仕様へ戻す。

## Gate2 記録（手段 A 後・3 周目＝上限・2026-09-12）— critical 2 / high 5 / medium 11 / low 9

fresh サブエージェント（general-purpose、opus）。scratch worktree に Task 1〜4 を当てて `tsc -b` / vitest /
eslint を実走。**PASS ではない。** ただし**根は 1 つ**で、設計の穴ではなく
**「2 周目の反映が本文に落ちていない／落とした形を検証していない」**だった。

### critical（どちらも修正済み）

- **C1 `postVerdict` を入れた形がコンパイルできない。** `let verdict` を `postVerdict` クロージャの中でしか
  代入しないため、TypeScript の narrowing が外側で `"none"` のまま残り、`finally` の
  `verdict === "syntax"` が **TS2367**。`tsc -b` が止まるので `npm run build` も e2e（`webServer` が build を
  走らせる）も全滅する。しかも実装者が素直に直すと「印を post の前へ戻す」= **2 周目 C1 の復活**が最短に見える
  → **修正済み**。`const sent: { verdict: ... }` にした（プロパティは呼び出しをまたいで再 widening される）。
  自分でも最小再現で検算: `let` 版は `error TS2367`、オブジェクト版は exit 0
- **C2 2 周目 M2 の `pagehide` が本文に無かった。** 記録にはあるのに Step が 1 つも無く、それを前提にした文が
  仕様と**出荷される CLAUDE.md** に入る状態だった → **修正済み**（Task 5 Step 4 に `useEffect` を追加）。
  **原因は私の編集ミス**: 2 周目の適用スクリプトで 3 つ目の置換が例外を投げ、ファイルが書かれないまま
  先行する 2 つの置換ごと消えていた（`H1` も同じ巻き添え）。**記録を書いたことと本文に入ったことは別**

### high（すべて修正済み）

- **H1 2 周目 L2 の「1 行の構造ガード」も本文に無かった**（C2 と同じ巻き添え）→ 追加
- **H2 CLAUDE.md (e) の置換範囲が短く、置換後に「before transpilation」と「after both」が同じ文に同居**
  → 旧の範囲を文の頭から取るように直した
- **H3 Task 7 Step 3b の「前」の測定が原理的に値を出せない。** `data-search` はこの変更が新設する属性なので、
  merge-base のビルドでは 60 秒待って例外 → `firstOutputMs` すら出ない。preview の起動手順も無かった
  → `searchDoneMs` を任意（`null` 可）にし、前後を同じポートで順に測る `run_one` 手順を書いた
- **H4 Task 7 Step 3 のブラウザ測定が固定 sleep 8 秒。** この計画自身が Task 6 で「固定 sleep は当て推量」と
  書いているのに、合否（`stalled` が 15 件すべて false）はまさにその当て推量に乗っていた
  → Lint タブの件数待ちに変更
- **H5 実行開始直後の Stop で `silent_loss` が落ちるようになる**（2 周目の「確認されたこと」が逆だった）。
  現行は探索が**トランスパイルの前**なので実行開始時に答えが埋まっており、実行中の Stop には値が付く。
  変更後は並走するので、その窓で Stop を押すと付かない → CLAUDE.md (f) に原因を 1 つ足し、
  仕様 不変条件 9 を「受け入れる変化」として書き直した

### medium（M6・M9 は形を変えて対応、ほかは修正済み）

M1 Task 2 の Files に `searchLimits.ts` が無い / M2 Global Constraints が `stalled` 1 つのまま /
M3 仕様の受け入れコマンドに新テストが無い / M4 Task 4 の Interfaces が `withDeadline` のまま /
M5 e2e の新規件数が 3 と 4 で食い違う / **M6 `waitForLintToSettle` が「0 以外なら通過」で、既定プログラムが
将来 1 件でも lint を出すと赤くならずに守りが消える** → 前の件数からの**遷移**を待つ形に変更 /
M7 変異 Step の grep が webServer のタイムアウト経路を拾えない / M8 `✓`/`✘` の数え方が `CI` 依存
→ `--reporter=list` を明示 / M9 ヘルパの timeout がテスト上限と同値で発火できない → 30 秒へ /
M10 worktree ビルドが共有 `node_modules` の tsbuildinfo を汚す → `vite build` だけを呼ぶ /
**M11 `postVerdict` の JSDoc が効いている理由を取り違えていた**（内部の順序ではなく、
メッセージを**呼び出し側の引数として**組み立てることが効いている。変異で実証済み）→ 文面を書き直した

### low（修正済み）

`searchDeadline.ts` の JSDoc が `MAX_SOURCE_CHARS` の置き場所を旧ファイルで書く / 仕様 不変条件 1 の
「無修正で緑」が Task 4 のコメント 1 行変更と食い違う / `App.tsx` のコメント行数が 3 行→実際は 2 行 /
Step 5 Expected の「diff は Task 4 の変更だけ」→ 正しくは**空** / Step 6 の python の字下げが 4 と 6 で違う /
`postFollowUp` と `postVerdict` でフラグの順序が逆な理由が無い / 一時ファイルの置き場所。
（Task 番号対応表の前置きと「27 箇所」の数字は過去記録なので触っていない）

### 正しいと確認されたこと（実走）

- **2 周目 C1 の修正は runtime では効いている**: Step 2b の 4 件とも PASS。「印を `postVerdict` の手前の行で
  立てる」変異で 3 件目だけが赤 = **テストは C1 の形を検出する**
- Task 4 を当てて `src/workers` + `src/utils` + `src/types` の vitest **199 件全緑**、eslint exit 0
- C1 を直せば `tsc -b` の残りは `App.tsx` の 5 件だけ（Task 4 Step 5 の期待どおり）
- `<OutputPanel` の呼び出しは `src/App.tsx:773` の 1 か所のみ（必須 prop 追加で壊れる側は無い）
- CLAUDE.md (a)〜(f) のアンカーはすべてちょうど 1 回（(f) の新しいアンカーも確認）
- 新 e2e の期待行番号は abaplint 実走で正しい。e2e から `src/` の TS を import できることは最小 config で実走確認
- 測定スクリプトの import は両方解決する。`"x\n".repeat(MAX/2).length === MAX` で境界ちょうど

### 確認できなかったこと

e2e は 1 件も実走していない（C1 のため build が通らず、走らせても「サーバーが起動しない」赤にしかならなかった）。
Task 2・3 のテストは 1 周目の実測を信頼している。CSS 差分・バンドルサイズ・Task 7 の測定は未実行。

### この周回の扱い

**周回上限 3 に達した。critical 2 / high 5 を修正したが、修正後のレビューは回していない。**
CLAUDE.md の「修正は周回ではなく検算で閉じる」に従い、C1 は最小再現で赤→緑を自分で確認し、
C2・H1 は本文への反映を grep で確認した。**PASS とは報告しない。** 実装へ進む前に人の確認を取ること。
