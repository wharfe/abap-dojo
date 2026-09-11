# ピリオド抜け・行末セミコロンのヒント 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Run が構文エラーで失敗したとき、ピリオド抜けと行末セミコロンについて「何を直せば通るか」を 1 行で出し、GA4 の `syntax_repair` に `missing_period` / `semicolon` を送る。

**Architecture:** #69 の方式（書き換えた版を abaplint に再パースさせ、判定が良くなった書き換えだけ採る）を新ファイル `src/workers/statementEndRepair.ts` に作る。二重引用符の `findSyntaxRepair` は一切変えず、それが何も見つけなかったときだけ新しい探索を試す。新しい 2 種は「件数が減り、かつ対象にしたエラー行範囲から始まるエラーが残らない」ときだけ採用する。探索する大きさの上限（`MAX_SOURCE_CHARS`）は 64 kB → 16 kB に下げ、既存の二重引用符・`silent_loss` の探索にも同時に効かせる（Gate2 H1 / #75。仕様 Q6）。さらに Run ごとに探索全体で共有する 3 秒の打ち切り（`src/workers/searchDeadline.ts`、Task 2b）を入れる。大きさを揃えても形による重さの差（16 kB で 1 パース 24〜512 ms）が残り、大きさだけでは時間を保証できないため（Gate2 3 周目 H-B。仕様 Q7）。

**Tech Stack:** TypeScript, `@abaplint/core`, `@abaplint/transpiler`（config）, Vitest, Playwright

**Spec:** `docs/superpowers/specs/2026-09-11-statement-end-repair-design.md`

## Global Constraints

- 既存の `src/workers/syntaxRepair.test.ts` は**1 文字も変えない**（16 kB 以下で二重引用符の結果が変わらないことの証拠。既存の大きさのテスト 2 件は 64 kB 超の入力なので、16 kB 化の後も緑のまま）。`syntaxRepair.ts` の変更は、定数 2 つの `export`・`MAX_SOURCE_CHARS` の値（64 → 16 kB）・その 2 定数のコメント・`RepairCandidate.line` のコメント・`countErrors` の中身を切り出した `errorIssues` の export（「エラーとは何か」の定義を 1 か所に保つ — #63）だけ
- 送るのは列挙値だけ。`line` は画面表示専用で送らない
- 探索は Run の失敗時だけ（`handleTranspile` の `errors.length > 0` 分岐）。`handleLint` には入れない
- 16 kB 超のソースは探さない（`MAX_SOURCE_CHARS`。64 kB から下げる — Gate2 H1 / #75。失敗側の 3 種と成功側の `silent_loss` が同じ定数を共有する。文字数合計の上限は入れない — 仕様 Q6）。加えて、探索を始めてから `SEARCH_BUDGET_MS`（3 秒）を過ぎたら新しい再パースを始めない（仕様 Q7）。打ち切りは再パース関数を包んで投げる形で入れ、探索関数そのものは変えない。種類ごとに行候補は最大 10（`MAX_CANDIDATES`）+ まとめ候補 1
- 候補の再パースが投げたら `undefined` を返す（`syntax_error` の判定を `transpile_error` に変えない）
- 試す順: 二重引用符（既存）→ `semicolon` → `missing_period`
- ヒント文言は固定文。行番号以外にユーザー由来の値を入れない。Tailwind のユーティリティ名になる英単語を裸で書かない（#44。CSS ratchet で確認）
- コードのコメントは英語、ユーザー向け文字列は英語。2 スペース、名前付き export

---

### Task 1: 列挙値とヒント文言

**Files:**
- Modify: `src/types/diagnostics.ts:142`（`SYNTAX_REPAIRS`）とその直前のコメント
- Modify: `src/utils/repairHint.ts`（`repairHint` の switch）
- Create: `src/utils/repairHint.test.ts`

**Interfaces:**
- Produces: `SyntaxRepairKind = "double_quote" | "semicolon" | "missing_period"`、`repairHint({ kind, line? }): string`

- [ ] **Step 0: CSS の基準を取る（どのファイルも触る前に）**

Tailwind v4 はディスク上のファイルを走査するので、未追跡の新ファイルがあると `git stash` では基準にならない（CLAUDE.md Known Gotchas）。着手前のツリーで取る。

Tailwind v4 は `docs/superpowers/*.md` も走査する。この計画は新しいコードの文字列を一字一句含むので、計画を置いたまま基準を取ると、
コードが増やすクラスが基準に先に入り、比較が何も検出しない（Gate2 3 周目 M-A。レビュー役が `mt-8` など 5 ルールで実測）。
基準も最終（Task 4 Step 4）も `docs/superpowers` を一時的に外してビルドする。

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

同じファイルの `SyntaxRepair.line` のコメントは二重引用符の話（1 行に複数のペア）だけで書かれていて、新しい 2 種について偽になる（Gate2 3 周目 L-b）。
`* comment. The hint drops the row rather than point somewhere never wrong.` の行の直後（`*/` の前）に追記:

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

ファイル冒頭のコメントの `mean a comment reads "if you meant that as literal data" and moves on.` の行の直後
（空の ` *` 行と `Kept apart from App.tsx` の段落の前）に追記する。節の末尾は Tailwind の段落なので、そこに置くと
「That argument」が Tailwind の話を指して読める（Gate2 2 周目 L-4）:

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
- Modify: `src/workers/syntaxRepair.ts:69-98`（`MAX_CANDIDATES` / `MAX_SOURCE_CHARS` を `export const` に、`MAX_SOURCE_CHARS` を `16 * 1024` に、両定数のコメントを実測に合わせて書き直す。`errorIssues` を足して `countErrors` をそれで数える。他は変えない）
- Create: `src/workers/searchSizeCap.test.ts`（大きさの上限のテスト。`statementEndRepair.ts` を import しないので、実装前に「期待値で赤」を確かめられる）
- Create: `src/workers/statementEndRepair.ts`
- Create: `src/workers/statementEndRepair.test.ts`

**Interfaces:**
- Consumes: `MAX_CANDIDATES`, `MAX_SOURCE_CHARS`, `RepairCandidate`, `errorIssues`（`syntaxRepair.ts`）、`SyntaxRepair`（Task 1）
- Produces:
  - `interface ErrorSpan { start: number; end: number }`
  - `errorSpanOf(issue: Issue): ErrorSpan`
  - `statementEndCandidates(kind: "semicolon" | "missing_period", source: string, spans: readonly ErrorSpan[]): StatementEndCandidate[]`
  - `errorRowCounter(config: Config, filename: string): (candidate: string) => Promise<number[]>`
  - `findStatementEndRepair(source: string, spans: readonly ErrorSpan[], errorRowsIn: (c: string) => Promise<number[]>): Promise<SyntaxRepair | undefined>`

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

同じ Step で `src/workers/searchSizeCap.test.ts` も作る:

```ts
import { describe, it, expect } from "vitest";
import { Buffer } from "buffer";
(globalThis as unknown as { Buffer: typeof Buffer }).Buffer = Buffer;

import { doubleQuoteCandidates, findSilentLoss } from "./syntaxRepair";

/**
 * #75: every search shares one size cap, lowered from 64 kB. The work of one
 * parse grows far faster than the source — `WRITE 'value#';` on every row
 * took 116 ms at 16 kB and 1,431 ms at 64 kB in Node (2026-09-11) — so at
 * 64 kB the double-quote search alone took 12.8 s in Firefox, and the
 * statement-end search behind it would have pushed a real syntax error past
 * the 20s watchdog.
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
  Expected: `EXIT` が非 0。`statementEndRepair.test.ts` は `Failed to resolve import "./statementEndRepair"` で FAIL。
  **`searchSizeCap.test.ts` は 2 件とも AssertionError で FAIL**（`doubleQuoteCandidates(over)` が空でない／`completed: true`）。
  こちらが import やビルドの失敗で赤になっていないことを出力で確かめる — 大きさの上限を「正しい理由で赤」にする確認はここだけ（Gate2 2 周目 L-8）

- [ ] **Step 3: 定数を export し、大きさの上限を 16 kB に下げる** — `src/workers/syntaxRepair.ts`

(i) 81〜84 行。旧:

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

(ii) 87〜98 行（`/**` から `const MAX_SOURCE_CHARS = 64 * 1024;` まで）をまるごと置き換える。新:

```ts
/**
 * Above this many characters, do not search at all.
 *
 * The candidate cap bounds the number of parses but not the work, and the
 * work of one parse does not grow in proportion to the source. A paste whose
 * quotes or semicolons swallow every period is one statement the length of
 * the file: measured 2026-09-11 (Node), one parse of `WRITE 'value#';` on
 * every row took 116 ms at 16 kB and 1,431 ms at 64 kB — four times the text,
 * about twelve times the work, and worse for other shapes. At the old 64 kB
 * cap the double-quote search alone took 12.8 s in Firefox, and the 20s
 * watchdog ends the *display* without interrupting this worker, so a real
 * `syntax_error` would be shown and counted as `stalled` (#75). At 16 kB,
 * twelve parses of a shape like that took under a second in all three
 * engines. Roughly 400 lines; a longer paste gets no hint and no
 * `silent_loss`.
 */
export const MAX_SOURCE_CHARS = 16 * 1024;
```

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
      // Same reason as findSyntaxRepair: a throw escaping here would turn a
      // correct `syntax_error` into a `transpile_error`.
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
git add src/workers/syntaxRepair.ts src/workers/statementEndRepair.ts src/workers/statementEndRepair.test.ts src/workers/searchSizeCap.test.ts
git commit -m "ピリオド抜けとセミコロンを再パースで探し、探索の大きさの上限を 16 kB に下げる (#67, #75)"
```

---

### Task 2b: 探索全体の時間の打ち切り（`searchDeadline.ts`）

仕様 Q7。大きさの上限（Task 2 Step 3）だけでは、16 kB の `foo(1);` の形で探索が Node 4.9〜6.5 秒、`foo(1, "x");` で 7.8 秒かかる（Gate2 3 周目 H-B）。
Task 3 に番号を振り直さないために「2b」とする（Gate2 記録が Task 3 / 4 の番号で指しているため）。

**Files:**
- Create: `src/workers/searchDeadline.ts`
- Create: `src/workers/searchDeadline.test.ts`

**Interfaces:**
- Consumes: `findSyntaxRepair`, `findSilentLoss`（`syntaxRepair.ts`）、`findStatementEndRepair`（Task 2）
- Produces: `SEARCH_BUDGET_MS = 3000`、`class SearchDeadlineExceeded extends Error`、`withDeadline<T>(reparse: (c: string) => Promise<T>, deadline: number, now?: () => number): (c: string) => Promise<T>`

- [ ] **Step 1: 失敗するテストを書く** — `src/workers/searchDeadline.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { Buffer } from "buffer";
(globalThis as unknown as { Buffer: typeof Buffer }).Buffer = Buffer;

import { SEARCH_BUDGET_MS, SearchDeadlineExceeded, withDeadline } from "./searchDeadline";
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
 * of them ever stops swallowing the throw, a search that ran out of time
 * would turn a correct `syntax_error` into a `transpile_error`.
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
 * The size cap (MAX_SOURCE_CHARS in syntaxRepair.ts) bounds how large a
 * source the searches look at, but not how long one parse of it takes: at
 * 16 kB that ranges from 24 ms to 512 ms by shape alone (Node, 2026-09-11),
 * and a paste of `foo(1, "x");` rows took the searches 7.8 s. So the searches
 * also share a deadline, and once it has passed no new re-parse is started.
 *
 * It cannot stop a parse already running, so the worst case is the budget
 * plus one parse (about 0.5 s at 16 kB for the heaviest shape measured). The
 * limit that matters is the 20s watchdog in App.tsx: past it, a real
 * `syntax_error` is shown and counted as `stalled`.
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
```

- [ ] **Step 4: 緑を確認** — Run: `npm test -- src/workers/searchDeadline.test.ts src/workers/statementEndRepair.test.ts src/workers/syntaxRepair.test.ts && npm run typecheck && npm run lint`
  Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/workers/searchDeadline.ts src/workers/searchDeadline.test.ts
git commit -m "再パースの探索に Run ごとの 3 秒の打ち切りを足す (#75)"
```

---

### Task 3: ワーカーへの配線と e2e

**Files:**
- Modify: `src/workers/abaplintWorker.ts:15-35`（import と counter）、`:103`（探索呼び出し）
- Modify: `e2e/syntaxHint.spec.ts`

**Interfaces:**
- Consumes: `errorRowCounter`, `errorSpanOf`, `findStatementEndRepair`（Task 2）、`errorIssues`（Task 2）、`withDeadline`, `SEARCH_BUDGET_MS`（Task 2b）、`repairHint`（Task 1。`App.tsx:376` が既に `data.repair` を描画するので App.tsx は変更不要）

**この Task の e2e を走らせる前に毎回**（Gate2 2 周目 H-1 / M-3）:

- `ss -ltn | grep ':4173 '` が何も出さないこと。出たら止める。Playwright の `webServer` は `reuseExistingServer: false` なので、
  ふさがっていると起動に失敗する
- Bash ツールの `timeout` を **600000** にするか `run_in_background` で走らせる。既定の 120 秒では、ビルド込みの
  e2e（Step 4 は 70 件、Step 5 は 30 秒待ちで落ちる 10 件）が途中で切られる

- [ ] **Step 1: 失敗する e2e を書く** — `e2e/syntaxHint.spec.ts` の末尾に追加

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

  // The hint is appended to the same message as the error, in the same
  // update, so once the error is visible its absence is already decided.
  await expect(page.getByText(/Syntax error/i)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(PERIOD_HINT)).toHaveCount(0);
  await expect(page.getByText(SEMICOLON_HINT)).toHaveCount(0);
});
```

同じファイル冒頭のコメントは二重引用符の単体テストにしか触れていないので、変更後に偽になる（Gate2 2 周目 L-7）。旧:

```ts
 * `transpile-error` message, and is rendered by OutputPanel. Nothing in the
 * Vitest suite crosses that boundary: `syntaxRepair.test.ts` proves the search
 * and abaplint's judgement, and stops at the module. App.tsx's worker wiring
```

新:

```ts
 * `transpile-error` message, and is rendered by OutputPanel. Nothing in the
 * Vitest suite crosses that boundary: `syntaxRepair.test.ts` and
 * `statementEndRepair.test.ts` prove the searches and abaplint's judgement,
 * and stop at the module. App.tsx's worker wiring
```

- [ ] **Step 2: 赤を確認** — Run: `npx playwright test e2e/syntaxHint.spec.ts --project=chromium`
  Expected: 新しい 2 件（period / semicolon）が FAIL、JavaScript の件と既存 4 件は PASS

- [ ] **Step 3: 配線する** — `src/workers/abaplintWorker.ts`

import に追加（`} from "./syntaxRepair";` の直後）:

```ts
import {
  errorRowCounter,
  errorSpanOf,
  findStatementEndRepair,
} from "./statementEndRepair";
import { SEARCH_BUDGET_MS, withDeadline } from "./searchDeadline";
```

既存の `} from "./syntaxRepair";` の import 一覧に `errorIssues` を足す。

`const scoreIn = ...`（35 行目）の直後:

```ts
const errorRowsIn = errorRowCounter(abaplintConfig, SOURCE_FILENAME);
```

93〜103 行目（`// Computed before the response is built` のコメントから `const repair = await findSyntaxRepair(...)` の行まで）を置き換え。古いコメントは `findSyntaxRepair` にしか触れておらず、変更後は偽になる（Gate2 M4）:

```ts
      // Computed before the response is built, and both searches swallow
      // their own parse failures, so this cannot reach the catch below: the
      // syntax verdict is already correct at this point and a hint that fails
      // must not turn it into a `transpile_error`.
      //
      // Costs a bounded number of extra parses — at most 11 for the double
      // quote and 22 more for the statement end, none above MAX_SOURCE_CHARS
      // and none started once SEARCH_BUDGET_MS has passed (searchDeadline.ts)
      // — and only on the Run path after a failure the user is already waiting
      // on. Never on `lint`, which runs on every keystroke. It is not scoped
      // to the parse-failure keys: any Error-severity outcome gets the search,
      // which is a superset of what can ever match and one fewer rule to keep
      // in step with abaplint.
      //
      // The double quote is tried first and unchanged; the statement-end search
      // (#67) only runs when it found nothing, so what `double_quote` reports
      // cannot move.
      // One deadline for every search in this Run (#75): no re-parse starts
      // once it has passed, so the worst case is the budget plus one parse,
      // whatever shape the paste has.
      const deadline = performance.now() + SEARCH_BUDGET_MS;
      const repair =
        (await findSyntaxRepair(
          source,
          countErrors(issues),
          withDeadline(errorsIn, deadline),
        )) ??
        (await findStatementEndRepair(
          source,
          errors.map(errorSpanOf),
          withDeadline(errorRowsIn, deadline),
        ));
```

同じファイルで、あと 2 か所:

- 90 行の `const errors = issues.filter(isError);` を `const errors = errorIssues(issues);` にし、ほかに使われていない
  `function isError`（57〜59 行。`grep -n isError src/workers/abaplintWorker.ts` が 57 と 90 だけ）を消す。
  エラーの定義を `errorIssues` の 1 か所に揃える（Gate2 3 周目 L-a）
- 成功側の `findSilentLoss(` の呼び出しの第 3 引数 `scoreIn,` を `withDeadline(scoreIn, performance.now() + SEARCH_BUDGET_MS),` にする
  （成功側は探索が 1 種なので、自分の期限を 1 つ持つ — 仕様 Q7）

- [ ] **Step 4: 緑を確認（繰り返し）** — Run: `npx playwright test e2e/syntaxHint.spec.ts --project=chromium --project=firefox --repeat-each=5`
  Expected: 全件 PASS（WebKit はファイル先頭で skip）

- [ ] **Step 5: 配線を外すと赤になることを確認（#70 の教訓）**

変異は**型が通る形**にすること。未使用のカンマ式などで `tsc -b` が落ちると `webServer` が起動せず、
e2e は「期待値が外れた」ではなく「サーバーが起動しない」で赤になる — それは何も確かめていない赤で、
#70 と同じ形の偽の証拠になる。ここでは探索に空の範囲を渡し、import と変数を使ったまま結果だけ消す。

**変異させたファイルを残さない**（Gate2 2 周目 H-1、3 周目 H-A）:

- この Step は **`run_in_background` で 1 回だけ**走らせ、**完了通知が来るまで** `abaplintWorker.ts` に触る作業も、この Step の再実行も、Step 6 もしない。
  Bash ツールは timeout で処理を殺さず裏へ回すので、「打ち切られた」と思って次へ進むと、裏で走っている変異版と並ぶ
  （10 件が 30 秒ずつ待って落ちるので、ビルド込みで 6〜7 分かかる）
- バックアップは `mktemp` で毎回別の名前にし、取る前に「現ファイルに変異が無い」ことを確かめて止める。前回の変異版をバックアップとして
  上書き保存すると、以後の復元が変異版を戻す
- 復元は `trap` でも行う。最後の砦は Step 6 の確認（変異が残っていれば `exit 1` で止まり、コミットまで進まない）

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
npx playwright test e2e/syntaxHint.spec.ts --project=chromium --grep "missing period|semicolon used" --repeat-each=5 > /tmp/mutant.log 2>&1; echo "MUTANT_EXIT=$?"
sed 's/\x1b\[[0-9;]*m//g' /tmp/mutant.log | grep -c '✘'
sed 's/\x1b\[[0-9;]*m//g' /tmp/mutant.log | grep -c '✓'
sed 's/\x1b\[[0-9;]*m//g' /tmp/mutant.log | grep -E '^\s+[0-9]+ (failed|passed)'
grep -c 'was not able to start\|error TS' /tmp/mutant.log
cp "$BAK" src/workers/abaplintWorker.ts && git diff --stat src/workers/abaplintWorker.ts
```
  Expected: `MUTANT_EXIT` が非 0、**`✘` の行が 10 件・`✓` の行が 0 件**、集計行が `10 failed` だけ、**`was not able to start` / `error TS` が 0 件**（落ちた理由が期待値であってビルドではないこと）。復元後の diff は Step 3 の変更だけ。
  成功行も数える grep だと「変異が効かず全件成功」も 10 件になり、区別できない（Gate2 H2）。`✘` と `✓` を別々に数えるのはそのため

- [ ] **Step 6: Commit**

```bash
# Step 5 を裏で走らせたなら、その完了通知を受け取ってからこの Step を始める
if grep -q 'slice(0, 0)' src/workers/abaplintWorker.ts; then echo "MUTANT_LEFT"; exit 1; fi
if ! git diff src/workers/abaplintWorker.ts | grep -q 'withDeadline(errorRowsIn, deadline)'; then echo "WIRING_MISSING"; exit 1; fi
git add src/workers/abaplintWorker.ts e2e/syntaxHint.spec.ts
if git diff --cached | grep -q 'slice(0, 0)'; then echo "MUTANT_STAGED"; git reset -q; exit 1; fi
git commit -m "Run の構文エラーにピリオド抜けとセミコロンのヒントを出す (#67)"
```

---

### Task 4: 文書・所要時間・全体検証

**Files:**
- Modify: `CLAUDE.md`（`### syntax_repair says what to change` 節）
- Modify: `src/utils/analytics.ts:117-123`（`syntax_repair` のコメント）

- [ ] **Step 1: CLAUDE.md を更新**（5 か所。どれも「旧」と完全一致する範囲だけを置き換える。旧の文が行をまたぐので、1 文だけ当てると前後が重複する — Gate2 L2。行番号は編集前のもので、(a) を当てると後ろがずれるので、旧の文面で探す）

(a) 533〜535 行。旧:

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
misspelt keyword on the next row, pinned in `statementEndRepair.test.ts`. `double_quote` keeps the
plain count, because its data has been flowing since 2026-09-08 and changing
what it reports would break the comparison across that date. The same
strictness is why their hints state the fix flatly while `double_quote`'s
stays conditional. The search order is `double_quote` → `semicolon` →
`missing_period`, first hit wins. Known limit: a missing period hidden behind
an end-of-line comment (`WRITE 'a' " note`) is out of reach — the appended
period lands in the comment.
```

(b) 611〜615 行。旧:

```md
The search costs a bounded number of extra parses, and only on the Run path
after a failure — never on `lint`, which fires on every keystroke. It is
skipped entirely above 64 kB of source: the candidate cap bounds the parses
but not the work, and the 20s watchdog ends the *display* without interrupting
this worker, so an unbounded search would outlive the run it belonged to.
```

新:

```md
The search costs a bounded number of extra parses — at most 33 across the
three kinds — and only on the Run path after a failure, never on `lint`,
which fires on every keystroke. It is skipped entirely above 16 kB of source
(`MAX_SOURCE_CHARS`; 64 kB until #75). The candidate cap bounds the parses but
not the work, and the work of one parse grows far faster than the source: a
paste that is one long statement (`WRITE 'value#';` on every row) took 116 ms
to parse at 16 kB and 1,431 ms at 64 kB (Node, 2026-09-11), and at 64 kB the
double-quote search alone took
12.8 s in Firefox. The 20s watchdog ends the *display* without interrupting
this worker, so past it a real `syntax_error` is shown and counted as
`stalled`. A paste over 16 kB — roughly 400 lines — gets no hint.

The size cap did not bound the time on its own: at 16 kB one parse still
ranges from 24 ms to 512 ms by shape, and `foo(1, "x");` rows took the
searches 7.8 s. So every search in a Run also shares a 3 s deadline
(`src/workers/searchDeadline.ts`): once it has passed no new re-parse starts,
and the search ends with no hint. For a paste heavy enough to reach it,
whether a hint appears depends on the device, and a missing `syntax_repair`
does not say whether the search found nothing or ran out of time.
```

(c) 620 行（`compare it against \`syntax_statement = WRITE\` over the same period.`）の直後に追記:

```md
Since #67 the three kinds split the `WRITE` bucket three ways, so compare
their sum against `syntax_statement = WRITE`, not `double_quote` alone. A line
with two of the mistakes at once (`WRITE "hello";`) gets no hint from any
kind, so the sum undercounts what that bucket holds.
```

(d) 653 行の `a source over 64 kB,` を `a source over 16 kB (64 kB until #75, so absence rises slightly across that release), a search cut off by the 3 s search deadline,` に置き換え

(e) 688〜689 行。旧:

```md
succeeds or throws. It costs the same bounded number of extra parses as its
sibling (10 candidates, skipped above 64 kB), but unlike its sibling it runs on
```

新:

```md
succeeds or throws. It searches the same candidates as the double-quote repair
(10 plus one that rewrites every pair, skipped above 16 kB), but unlike that
search it runs on
```

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

- [ ] **Step 3: 上限ちょうどの最悪ケースの所要時間を測る**（コミットしない。Node と 3 ブラウザ）

入力は Gate2 H1 で重いと分かった形（ファイル全体が 1 つの文になる形）と、3 周目 H-B で 16 kB でも 5 秒を超えた
`foo(1);`・`foo(1, "x");` を `MAX_SOURCE_CHARS` ちょうどまで並べたもの。300 行の貼り付けは最悪ケースではない（Gate2 M3）。
探索は本番と同じく `withDeadline` で包み、合否は形ごとの「元のパース + 探索」で判定する（「1 パースの最悪 × 回数」は、候補が元と
同じ重さとは限らないので上限にならない — 3 周目 H-B）。同じ入力でも 4.9〜6.5 秒とばらつくので 3 回の中央値を使う。

Node — `npx vitest` はフック G2 が拒否するので `./node_modules/.bin/vitest` を使う。この repo の vitest は
`console.log` を出さないので結果はファイルに書く:

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

it("worst case at the size cap", async () => {
  const config = new Config(JSON.stringify(transpilerConfig));
  const file = "ztest.prog.abap";
  const shapes: Record<string, string> = {
    dq: `lv = |a#| && 'b' "c";\n`,
    dqAll: `lv = |a#| && 'b' 'c';\n`,
    semi: `WRITE 'value#';\n`,
    period: `WRITE 'a'\n`,
    js: `console.log("x");\n`,
    foo1: `foo(1);\n`,
    foo1x: `foo(1, "x");\n`,
  };
  const rows: string[] = [];
  for (const [name, line] of Object.entries(shapes)) {
    const source = line.repeat(Math.floor(MAX_SOURCE_CHARS / line.length));
    // Best of two, so JIT warm-up on the first shape cannot inflate parse_ms.
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
      `${name} chars=${source.length} errors=${errors.length} parse_ms=${parseMs.toFixed(0)} ` +
        `search_parses=${mid.parses} search_ms=${mid.ms.toFixed(0)} ` +
        `total_ms=${(parseMs + mid.ms).toFixed(0)} repair=${JSON.stringify(mid.repair)}`,
    );
  }
  writeFileSync("/tmp/perf.txt", rows.join("\n") + "\n");
}, 300_000);
TS
./node_modules/.bin/vitest run src/workers/perf.tmp.test.ts > /tmp/perf.log 2>&1; echo "PERF_EXIT=$?"
cat /tmp/perf.txt; rm src/workers/perf.tmp.test.ts; git status --short src/workers
```

ブラウザ — 本番ビルドで Run を押してからエラー表示までを 3 エンジンで測る（Node とブラウザの比は形によって 0.3〜1 倍と一定しない）:

```bash
cat > /tmp/browser-perf.mjs <<'JS'
import { chromium, firefox, webkit } from "/home/feathach/dev/abap-dojo/node_modules/playwright/index.mjs";
import pako from "/home/feathach/dev/abap-dojo/node_modules/pako/dist/pako.esm.mjs";
const CAP = 16 * 1024;
const encode = (s) => Buffer.from(pako.deflate(new TextEncoder().encode(s)))
  .toString("base64").replace(/\+/g, "-").replace(/\//g, "_");
const fill = (line) => line.repeat(Math.floor(CAP / line.length));
// `js` exhausts all three searches (33 re-parses, nothing found); the two
// `foo` shapes are the ones that passed 5 s in Node at 16 kB (Gate2 round 3).
const SOURCES = {
  dq: fill(`lv = |a#| && 'b' "c";\n`),
  semi: fill(`WRITE 'value#';\n`),
  js: fill(`console.log("x");\n`),
  foo1: fill(`foo(1);\n`),
  foo1x: fill(`foo(1, "x");\n`),
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
      await page.waitForTimeout(8_000); // let the on-load lint parse finish first
      const t0 = Date.now();
      await run.click();
      const end = page.getByText(/Syntax error|stopped responding/i).first();
      await end.waitFor({ timeout: 40_000 });
      const text = (await end.textContent()) ?? "";
      out.push({ name, label, chars: source.length, ms: Date.now() - t0, stalled: /stopped responding/i.test(text) });
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
  Node とブラウザのどちらの呼び出しも、Bash ツールの `timeout` は 600000（ブラウザは 3 エンジン × 5 形、1 件あたり 8 秒待ちを含む）。
  Expected: `PERF_EXIT=0`・`BUILD=0`・`BROWSER_EXIT=0`・`already in use` が 0 件・`KILL=0`（測ったのが自分で立てた preview であることの確認。
  スクリプトは例外を握りつぶして `error` に書くので、`BROWSER_EXIT=0` だけでは証拠にならない）。
  Node の 7 形の `total_ms` がすべて **5,000 未満**（期限 3 秒 + 候補 1 回分 + 元のパース）、ブラウザ 15 件の `ms` がすべて **6,000 未満**、
  `stalled` がすべて `false`、`error` が 0 件。`foo1` / `foo1x` は期限で打ち切られて `repair` が無くてよい。
  超えたら**上限の値を自分で変えずに止めて**ユーザーに報告する（上限の決め方は仕様 Q6 でユーザーが決めた）。
  Node の各行とブラウザ 15 件を PR 本文に表で書く

- [ ] **Step 4: 全体検証**

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
  Expected: LINT / TYPECHECK / VITEST / BUILD / CSS_DIFF すべて 0（`/tmp/before.css` は Task 1 Step 0 で取ったもの）。`index-*.js` は約 350 kB のまま。`syntaxRepair.test.ts` の diff は空

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md src/utils/analytics.ts
git commit -m "syntax_repair の文書に statement-end の 2 種・厳しい判定の理由・16 kB の上限を書く (#67, #75)"
```

PR 本文で #75 を閉じる。#67 は「WRITE バケツの 3 形」全体の issue なので、自動クローズ語を付けるかは
`gh` を打つ前に skill `github-issues` を読んで決める。

---

## Gate2 記録（1 周目・2026-09-11）— 末尾の「1 周目の反映」で計画に反映済み

fresh サブエージェント（general-purpose）による敵対レビュー。critical 0 / high 2 / medium 4 / low 4。
計画のコードを一時ファイルに写して実 abaplint で動かし、単体テスト 30 件はそのまま緑だった。
誤ヒント・ソース送信・`syntax_error`/`transpile_error` の分離破壊は、58 入力で見つからなかった。

### 実行前に直す（high）

- **H1（レビュー役が実測）** 64 kB 入力で探索が合計約 16.8 秒。`lv = |a#| && 'b' "c";` の繰り返しで
  二重引用符 11 回 8466 ms + 新探索 13 回 7739 ms。`WRITE 'value#';` の繰り返しで新探索 9334 ms。
  20 秒のウォッチドッグ（`App.tsx:626-628`）が先に `stalled` を出し、後から届く結果は捨てられる
  （`App.tsx:196-210`）。仕様の 413 ms は 300 行の値で、最悪ケースではない。コストは「文字数 × 回数」。
  → 3 種で共有する上限（経過時間またはパース回数）を入れ、64 kB で測り直す。上限の決め方はユーザー判断に回すか検討
- **H2（ソース読解のみ）** Task 3 Step 5 の grep は成功行も数えるので、期待値 10 が「変異が効かず全件成功」と一致する。
  → `✘` 行だけ数え、期待値 10 にする

### 同じ周回で直す（medium）

- **M1（実測）** まとめ候補の targets が全エラーの行（`rowsOf(spans)`）なので、無関係なエラーが別の行に 1 つあると
  連続ピリオド抜け・連続セミコロンが黙る（`WRITE 'a'` ⏎ `WRITE 'b'` ⏎ `WRITE 'c'.` ⏎ `WRTE 'd'.`）。
  → targets を「実際に書き換えた行を含むスパン」に絞る。テストを足す
- **M2（実測）** 「ヒントなし」9 件のうち、厳しい判定が効いているのは `console.log('a')` と `console.log('a');` の 2 件だけ。
  コメント「the quiet ones are the reason the rule is stricter」は誤り。58 入力で、厳しい判定が止めた誤ヒントは 2 件・
  止めてしまった正ヒントは 2 件（M1）。この損得を仕様に書く
- **M3（実測）** 所要時間の測定手順は動かない: `npx vitest` はフック G2 が拒否する（`./node_modules/.bin/vitest` を使う）。
  この repo の vitest では `console.log` が出ない（ファイルに書く）。入力も H1 の最悪ケースになっていない
- **M4** 変更後に偽になる記述が計画の対象外にある: `syntaxRepair.ts:81`（eleven parses）/ `:92`（~138 ms）、
  `CLAUDE.md:688-689`（sibling と同じ 10 候補）、`abaplintWorker.ts:93-102`（findSyntaxRepair だけに言及）

### low（任意）

- L1 連続ピリオド抜けに複数行の文が混ざると見逃す（`lv = to_upper(` ⏎ `'a' )` ⏎ `WRITE lv`）。2 種混在も黙る
- L2 Task 4 Step 1 の CLAUDE.md 置換文は、字義どおり当てると文とダッシュが重複する
- L3 `return;` / `break;` → semicolon、`exit` → missing_period（直せば通るので内容は正しい）。
  セミコロンが複数あるのに 1 つを名指しすると「the one」が唯一に読める
- L4 CSS 比較は仕様・計画の文言を構造上検出できない（実害なし: 両ファイルの有無で CSS は同一と実測）

CSS の基準: 変更ゼロのツリーで取得済み（CSS 24,900 B、`index-*.js` 376,062 B）。ただし `/tmp/before.css` はセッションをまたぐと消えうるので、次回は取り直す。

### 1 周目の反映（2026-09-11）

**H1 — ユーザー判断: 探索する大きさの上限を 64 kB → 16 kB に下げ、#75 も同じ変更で直す（仕様 Q6）。**
最初は「再パースした文字数の合計で上限」が選ばれたが、実測で「パースの重さは文字数に比例する」という前提が崩れたため、
数字を示して再確認し、変更した。実測（Node は vitest 内で 1 回のパース、2 回のうち速い方）:

| 1 行の中身を並べた形 | 16 kB | 32 kB | 64 kB |
|---|---|---|---|
| `lv = \|a#\| && 'b' "c";`（全体が 1 文） | 111 ms | 369 ms | 1,151 ms |
| `lv = \|a#\| && 'b' 'c';`（まとめ候補の中身） | 69 ms | 273 ms | 2,642 ms |
| `WRITE 'value#';`（全体が 1 文） | 116 ms | 315 ms | 1,431 ms |
| `console.log("x");` | 37 ms | 66 ms | 122 ms |
| `WRTE 'a'.`（行ごとにエラー） | 24 ms | 38 ms | 68 ms |

ブラウザ（本番ビルド、`lv = |a#| && 'b' "c";` の形、Run → エラー表示。二重引用符探索 11 回＋元のパース）:
16 kB で Chromium 862 / Firefox 942 / WebKit 864 ms、64 kB で 3,883 / 12,756 / 10,600 ms。stalled 0。
→ Global Constraints、Task 2 Step 1（大きさの上限テスト）/ Step 3、Task 4 Step 1 (b)(d)(e) / Step 3

**H2** → Task 3 Step 5（`✘` と `✓` を別々に数え、集計行も見る）

**M1** → Task 2 Step 1（単体 1・実パーサ 1・届かない形の固定 1）/ Step 4（まとめ候補の targets を、書き換えた行を含むエラーだけに絞る）。
実パーサで確認: `WRITE 'a'` ⏎ `WRITE 'b'` ⏎ `WRITE 'c'.` ⏎ `WRTE 'd'.` は絞る前は黙り、絞った後は `missing_period`。
一方 `WRITE 'a';` ⏎ `WRITE 'b';` ⏎ `WRTE 'd'.` は abaplint が 2〜4 行を 1 つのエラーにまとめるため、絞っても黙る。
「書き換えた行だけ」まで絞ると `console.log` の 2 行貼り付けで別行のエラーが対象から外れ、厳しい判定そのものが弱まるので、そこまではしない。
既存の正例・負例 10 件は絞る前後で結果が同じ

**M2** → 仕様「厳しい判定の損得」節、Task 2 Step 1 の実パーサ節のコメント、Task 4 Step 1 (a)

**M3** → Task 4 Step 3（`./node_modules/.bin/vitest`、ファイル出力、上限ちょうどの重い形、ブラウザ 3 種）

**M4** → `syntaxRepair.ts:81,92` は Task 2 Step 3、`CLAUDE.md:688-689` は Task 4 Step 1 (e)、`abaplintWorker.ts:93-102` は Task 3 Step 3。
64 kB に触れる箇所は `grep -rn "64 kB\|64 \* 1024"` で数えた: `syntaxRepair.ts:95,98`、`CLAUDE.md:613,653,689`、
`syntaxRepair.test.ts:133,576`（入力が 64 kB 超なので 16 kB 化の後も正しい。無修正）、仕様・計画・HANDOFF

**L2** → Task 4 Step 1（旧と新を行単位で示す）。**L1 / L3 / L4 は対応しない**: L1 は誤ったヒントではなく届かない形、
L3 は直せば通るので内容は正しい、L4 は実害なしと実測済み

## Gate2 記録（2 周目・2026-09-11）

fresh サブエージェント（general-purpose）。critical 0 / high 1 / medium 3 / low 8。
約 85 入力を実パーサで試して誤ヒント 0 件（件数だけの判定なら誤ヒントになる入力を厳しい判定がさらに 3 件止めた）。
計画のテスト 35 件・既存 `syntaxRepair.test.ts` 72 件が 16 kB 化の後も緑、Task 1〜2 のコードは `tsc -b` と ESLint を通過。
CLAUDE.md (a)〜(e) と `analytics.ts` の旧文面は現ファイルと完全一致。

| 指摘 | 内容 | 反映先 |
|---|---|---|
| **H-1** | 変異確認が既定 120 秒で切られると復元が走らず、`.slice(0, 0)` 入りのワーカーがコミットされうる（型もビルドも通り、本番でヒントが一切出ない） | Task 3 冒頭の前提、Step 5 に `trap` と timeout、Step 6 に `slice(0, 0)` が無いことの確認 |
| M-1 | 116 ms / 2,642 ms は別の形の数字の組 | 同じ形（`WRITE 'value#';`: 116 / 1,431 ms）に統一。Task 2 Step 1・3、Task 4 Step 1 (b)、仕様 |
| M-2 | ブラウザ測定が 33 回使い切る形（`js`）を含まない。`bound_ms` が JIT の立ち上がりで水増し | Task 4 Step 3（2 回のうち速い方、`js` 形を追加、ブラウザ 9 件） |
| M-3 | ポート 4173 がふさがっていると e2e が起動せず、測定は他人のサーバを測る | Task 3 冒頭の前提、Step 5 と Task 4 Step 3 にポート確認・`already in use`・`KILL=0` |
| L-2 | `WRITE "hello";` はどの種類にも入らない | Task 4 Step 1 (c) に 1 文 |
| L-3 | `MAX_CANDIDATES` / `MAX_SOURCE_CHARS` の置き換え範囲が曖昧 | Task 2 Step 3 を旧/新の行単位に |
| L-4 | `repairHint.ts` の追記位置 | Task 1 Step 4 |
| L-5 | エラーの判定が 3 か所目になる | `errorIssues` を `syntaxRepair.ts` から export し、`countErrors`・`errorRowCounter`・テストが共有 |
| L-6 | Node 測定の一時ファイルが残ると `tsc -b` が落ちる | Task 4 Step 3 に `trap rm` |
| L-7 | `e2e/syntaxHint.spec.ts` 冒頭のコメント、HANDOFF の 64 kB | Task 3 Step 1。HANDOFF はセッション末に更新 |
| L-8 | 大きさの上限テストが正しい理由で赤になるのを確かめていない。仕様の受け入れコマンドの対象ファイルが食い違う | `searchSizeCap.test.ts` に分離して Task 2 Step 2 で「AssertionError で赤」を確認。仕様の受け入れコマンドを修正 |
| L-1 | `WRITE 'a'.;` に「セミコロンをピリオドに」と言う | **対応しない**: 従うと `WRITE 'a'..` になりパースは通る。前にピリオドがあるセミコロンを除外すると、今度はピリオド抜けの候補 `WRITE 'a'.;.` の挙動が未確認になる |

## Gate2 記録（3 周目・2026-09-11）— **周回上限。high が残ったので実装に進まず人へ戻した**

fresh サブエージェント（general-purpose）。critical 0 / high 2 / medium 1 / low 3。
206 入力を実パーサで試し、ヒントが出た 94 件に誤ヒント 0 件（件数だけの判定なら誤っていた 4 件を厳しい判定が止めた）。
Task 1〜4 を計画の旧/新文面どおりに当てて `npm test` 459 件緑・`tsc -b` 0・ESLint 0。
`searchSizeCap.test.ts` が定数変更前に AssertionError 2 件で赤・変更後に緑も実測。

- **H-A（手順）** 変異確認の後の Step 6 の `grep -c 'slice(0, 0)'` は表示するだけで止まらない。Bash ツールは timeout で
  処理を殺さず裏へ回す（レビュー役が 4 秒 timeout で実測）ので、裏の Step 5 と並んで Step 6 や Step 5 の再実行が走ると、
  変異入りのコミット・バックアップの上書き・直した後のファイルの巻き戻しが起きうる。
  → Step 6 を `if grep -q 'slice(0, 0)' ...; then exit 1; fi` と `git diff --cached` の確認で止める形に、
  Step 5 は `run_in_background` で完了通知を待つ、バックアップは `mktemp` にし変異が無いことを確かめてから取る
- **H-B（時間の保証）** 16 kB でも Node で 5 秒を超える形がある: `foo(1);` の繰り返しで探索 4.9 / 5.4 / 6.5 秒（13 回）、
  `foo(1, "x");` で 7.8 秒（24 回）。計画の測定は `bound_ms = 元の 1 パースの最悪 × 34` で合格（2,615 ms）してしまい、
  ブラウザ測定にもこの形が無いので、仕様の「5 秒超なら人へ」が発動しないまま出荷される。
  **同じ根（上限で時間を抑えきれていない）の指摘が 1 周目 H1 に続いて 2 回目** なので、規則どおり仕様へ戻す。
  自分でも確認（2026-09-11、Node、2 回のうち速い方）: `foo(1);` 16 kB の元のパース 512 ms（エラー 1 件 = 全体が 1 文）、
  全セミコロンを書き換えた版 48 ms。1 行ずつの候補は元と同じく 1 文のままなので約 0.5 秒ずつかかる。
  レビュー役の補足「`CONCATENATE 'a' 'b'` のまとめ候補が元の 80 倍」は再現しなかった（元 39 ms、全行にピリオド 17 ms）
- M-A Tailwind v4 は `docs/superpowers/*.md` も走査するので、計画に写したコードの文字列が基準 CSS に先に入り、CSS 比較が新しいクラスを検出できない（今の実害は 0 と実測）→ 基準も最終も `docs/superpowers` を外してビルド
- L-a ワーカーの `isError` が `errorIssues` と別の定義のまま → Task 3 Step 3 で `errorIssues(issues)` に
- L-b `SyntaxRepair.line`（`src/types/diagnostics.ts`）と `RepairCandidate.line`（`syntaxRepair.ts:129-139`）のコメントが二重引用符の話だけ
- L-c `;` だけのプログラム → semicolon line 1、`WRITE 'a' COLOR` → missing_period（事実としては正しいが先で壊れたまま）。任意

### 3 周目の後の判断（2026-09-11、ユーザー）

根に戻って問い直した: 守りたいのは「本物の構文エラーを『応答しない』にしない」（目的由来）。「上限は大きさだけ・同じコードなら
どの端末でも同じヒント」は手段由来だったので、手段を替える。選択肢（16 kB＋時間の打ち切り / 基準を緩める / 8 kB に下げる）を
実測表つきで示し、**16 kB ＋ Run ごとに共有する 3 秒の打ち切り**に決定（仕様 Q7）。

反映: Task 2b（新規）、Task 3 Step 3（配線・成功側・L-a）/ Step 5〜6（H-A）、Task 1 Step 0 と Task 4 Step 4（M-A）、
Task 1 Step 3 と Task 2 Step 3 (iv)（L-b）、Task 4 Step 1 (b)(d) と Step 3（測定）。L-c は対応しない（内容は事実として正しい）。
**この形で Gate2 を新しい周回（1 周目から）でやり直す。**

## Gate2 記録（新しい周回の 1 周目・2026-09-11）— **high が残り、同じ根が 3 回目。実装に進まず人へ戻した**

fresh サブエージェント（general-purpose）。critical 0 / high 1 / medium 3 / low 3。
Task 1・2・2b・3 Step 3 を計画どおりに当てて `npm test` 465 件緑・`tsc -b` 0・ESLint 0。各 Step の赤も記載どおり。
173 入力で新しい種類の誤ヒント 0 件。打ち切りが誤ヒントを生む余地は無い（順序固定・最初に見つかったもので止まる・期限共有）。
計画の Node 測定 7 形は total_ms 最大 3,408 ms（foo1x）で合格。

- **H1（実測）1 回のパースが期限より長い形が 16 kB 以内にある。** 短い行を 16 kB 並べて全体が 1 文になる形（`x⏎` や `<⏎` × 8,192 行）は、
  元のパース 1.5〜1.75 秒、最終行にピリオドを足した候補 1 回が 4.0〜4.3 秒。探索開始の直後に始まるので打ち切りが一度も効かず、
  中央値 5.7 秒で合格線 5 秒を超える（`<⏎` は 1 回 8.6 秒）。計画の 7 形はこの形を含まないので偽の合格になる。
  **自分でも確認（2026-09-11、Node）: `x⏎` × 8,192 の元のパース 1,567 / 1,487 ms、最終行にピリオドの候補 5,817 / 4,553 ms。**
  打ち切りは「次のパースを始めない」しかできず、同じワーカーの中で始まったパースは止められない。これが時間の保証の限界
- M1 ブラウザ測定は Run の前に 8 秒待つので、貼ってすぐ押したとき先に処理される lint（上限なし）を測っていない
- M2 Task 3 Step 6 の配線漏れ検査が `errorRowsIn` だけ。`errorsIn` や成功側 `scoreIn` の包み忘れはどの検証も緑のまま
- M3 仕様の不変条件 1（16 kB 以下で `double_quote` は変わらない）とワーカー・CLAUDE.md の「cannot move」が打ち切りと矛盾（まとめ候補が先に切られる）
- L1 Task 2b Step 2 の赤は import 失敗だけ（変異 6 通りで 5 通りは捕まる。ピリオド側 catch の return→continue だけすり抜け）
- L2 行番号のずれ（81〜84 は実際 80〜85、(ii) は (i) 適用後 2 行ずれ、`isError` は import 追加後 64 / 97）。文面で当たるので実行は可
- L3 `break;` / `continue;` → semicolon、`break` → missing_period（既知の `return;` と同じ種類）。`LOOP AT ... INTO DATA(ls)` ⏎ `WRITE ls.` など届かない形

**同じ根（上限で時間を抑えきれない）が 1 周目 H1・3 周目 H-B・今回 H1 と 3 回。** 周回の規則により、実装ではなく仕様へ戻す。
問うべきは「その制約は目的由来か手段由来か」: 守りたいのは「本物の構文エラーを `stalled` にしない」（目的）で、
「判定と探索を同じワーカーの同じ応答で返す」は手段。次の判断はユーザーに渡した（HANDOFF 参照）。
