# ピリオド抜け・行末セミコロンのヒント 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Run が構文エラーで失敗したとき、ピリオド抜けと行末セミコロンについて「何を直せば通るか」を 1 行で出し、GA4 の `syntax_repair` に `missing_period` / `semicolon` を送る。

**Architecture:** #69 の方式（書き換えた版を abaplint に再パースさせ、判定が良くなった書き換えだけ採る）を新ファイル `src/workers/statementEndRepair.ts` に作る。二重引用符の `findSyntaxRepair` は一切変えず、それが何も見つけなかったときだけ新しい探索を試す。新しい 2 種は「件数が減り、かつ対象にしたエラー行範囲から始まるエラーが残らない」ときだけ採用する。

**Tech Stack:** TypeScript, `@abaplint/core`, `@abaplint/transpiler`（config）, Vitest, Playwright

**Spec:** `docs/superpowers/specs/2026-09-11-statement-end-repair-design.md`

## Global Constraints

- 既存の `src/workers/syntaxRepair.test.ts` は**1 文字も変えない**（二重引用符の結果が変わらないことの証拠）。`syntaxRepair.ts` の変更は定数 2 つの `export` 追加だけ
- 送るのは列挙値だけ。`line` は画面表示専用で送らない
- 探索は Run の失敗時だけ（`handleTranspile` の `errors.length > 0` 分岐）。`handleLint` には入れない
- 64 kB 超のソースは探さない（`MAX_SOURCE_CHARS`）。種類ごとに行候補は最大 10（`MAX_CANDIDATES`）+ まとめ候補 1
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

```bash
npm run build >/dev/null 2>&1 && cp dist/assets/index-*.css /tmp/before.css && ls -l /tmp/before.css
```

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

ファイル冒頭のコメント（`## Why this is worded as a condition` の節の末尾）に追記:

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
- Modify: `src/workers/syntaxRepair.ts:85,98`（`const MAX_CANDIDATES` / `const MAX_SOURCE_CHARS` を `export const` に。他は変えない）
- Create: `src/workers/statementEndRepair.ts`
- Create: `src/workers/statementEndRepair.test.ts`

**Interfaces:**
- Consumes: `MAX_CANDIDATES`, `MAX_SOURCE_CHARS`, `RepairCandidate`（`syntaxRepair.ts`）、`SyntaxRepair`（Task 1）
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

/** The worker's own configuration — see the note in syntaxRepair.test.ts. */
const config = new Config(JSON.stringify(transpilerConfig));
const errorRowsIn = errorRowCounter(config, "ztest.prog.abap");

/** Search the way the worker does: take the spans from one parse, then look. */
async function repairOf(source: string) {
  const registry = new Registry(config);
  registry.addFile(new MemoryFile("ztest.prog.abap", source));
  await registry.parseAsync();
  const spans = registry
    .findIssues()
    .filter((issue) => issue.getSeverity().toString() === "Error")
    .map(errorSpanOf);
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

  it("does not search a source too large to search cheaply", () => {
    const source = `WRITE 'a';\n`.repeat(7000);
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
 * while writing the spec (2026-09-11); the quiet ones are the reason the
 * acceptance rule is stricter than the double quote's.
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
});
```

- [ ] **Step 2: 赤を確認** — Run: `npm test -- src/workers/statementEndRepair.test.ts`
  Expected: FAIL（`Failed to resolve import "./statementEndRepair"`）

- [ ] **Step 3: 定数を export する** — `src/workers/syntaxRepair.ts`

```ts
export const MAX_CANDIDATES = 10;
```
```ts
export const MAX_SOURCE_CHARS = 64 * 1024;
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
    candidates.push({ source: edited.join("\n"), targets: rowsOf(spans) });
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
    return registry
      .findIssues()
      .filter((issue) => issue.getSeverity().toString() === "Error")
      .map((issue) => issue.getStart().getRow());
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

- [ ] **Step 5: 緑を確認** — Run: `npm test -- src/workers/statementEndRepair.test.ts src/workers/syntaxRepair.test.ts && npm run typecheck && npm run lint`
  Expected: PASS。`git diff --stat src/workers/syntaxRepair.test.ts` が空

- [ ] **Step 6: Commit**

```bash
git add src/workers/syntaxRepair.ts src/workers/statementEndRepair.ts src/workers/statementEndRepair.test.ts
git commit -m "ピリオド抜けとセミコロンを再パースで探す (#67)"
```

---

### Task 3: ワーカーへの配線と e2e

**Files:**
- Modify: `src/workers/abaplintWorker.ts:15-35`（import と counter）、`:103`（探索呼び出し）
- Modify: `e2e/syntaxHint.spec.ts`

**Interfaces:**
- Consumes: `errorRowCounter`, `errorSpanOf`, `findStatementEndRepair`（Task 2）、`repairHint`（Task 1。`App.tsx:376` が既に `data.repair` を描画するので App.tsx は変更不要）

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
```

`const scoreIn = ...`（35 行目）の直後:

```ts
const errorRowsIn = errorRowCounter(abaplintConfig, SOURCE_FILENAME);
```

103 行目を置き換え:

```ts
      // The double quote is tried first and unchanged; the statement-end search
      // (#67) only runs when it found nothing, so what `double_quote` reports
      // cannot move.
      const repair =
        (await findSyntaxRepair(source, countErrors(issues), errorsIn)) ??
        (await findStatementEndRepair(source, errors.map(errorSpanOf), errorRowsIn));
```

- [ ] **Step 4: 緑を確認（繰り返し）** — Run: `npx playwright test e2e/syntaxHint.spec.ts --project=chromium --project=firefox --repeat-each=5`
  Expected: 全件 PASS（WebKit はファイル先頭で skip）

- [ ] **Step 5: 配線を外すと赤になることを確認（#70 の教訓）**

変異は**型が通る形**にすること。未使用のカンマ式などで `tsc -b` が落ちると `webServer` が起動せず、
e2e は「期待値が外れた」ではなく「サーバーが起動しない」で赤になる — それは何も確かめていない赤で、
#70 と同じ形の偽の証拠になる。ここでは探索に空の範囲を渡し、import と変数を使ったまま結果だけ消す。

```bash
cp src/workers/abaplintWorker.ts /tmp/worker.bak
python3 - <<'PY'
p='src/workers/abaplintWorker.ts'; s=open(p).read()
old = 'findStatementEndRepair(source, errors.map(errorSpanOf), errorRowsIn)'
assert s.count(old) == 1, 'wiring not found'
open(p,'w').write(s.replace(old, 'findStatementEndRepair(source, errors.map(errorSpanOf).slice(0, 0), errorRowsIn)'))
PY
npx playwright test e2e/syntaxHint.spec.ts --project=chromium --grep "missing period|semicolon used" --repeat-each=5 > /tmp/mutant.log 2>&1; echo "MUTANT_EXIT=$?"
sed 's/\x1b\[[0-9;]*m//g' /tmp/mutant.log | grep -cE '✘|\[chromium\] › .* (missing period|semicolon used)'
grep -c 'was not able to start\|error TS' /tmp/mutant.log
cp /tmp/worker.bak src/workers/abaplintWorker.ts && git diff --stat src/workers/abaplintWorker.ts
```
  Expected: `MUTANT_EXIT` が非 0、失敗行が 10 件、**`was not able to start` / `error TS` が 0 件**（落ちた理由が期待値であってビルドではないこと）。復元後の diff は Step 3 の変更だけ

- [ ] **Step 6: Commit**

```bash
git add src/workers/abaplintWorker.ts e2e/syntaxHint.spec.ts
git commit -m "Run の構文エラーにピリオド抜けとセミコロンのヒントを出す (#67)"
```

---

### Task 4: 文書・所要時間・全体検証

**Files:**
- Modify: `CLAUDE.md`（`### syntax_repair says what to change` 節）
- Modify: `src/utils/analytics.ts:117-123`（`syntax_repair` のコメント）

- [ ] **Step 1: CLAUDE.md を更新** — 「It is an enum with one member today, `double_quote`, so unlike the three parameters above it needs no membership test」を次に置き換え:

```md
one-line edit would have made the parse succeed. It is an enum —
`double_quote`, `semicolon`, `missing_period` — so unlike the three parameters
above it needs no membership test — nothing the user writes can reach the wire
through it.

**The two statement-end kinds (#67) use a stricter acceptance rule than
`double_quote`, and the difference is load-bearing.** Appending a period makes
almost any line look like a finished statement: `console.log('a')` is two
errors on one row and a period turns it into one, so "the count went down"
would tell someone who pasted JavaScript that they forgot a period. They are
kept only if the count went down **and** no error is left on a row they
targeted (`src/workers/statementEndRepair.ts`). `double_quote` keeps the plain
count, because its data has been flowing since 2026-09-08 and changing what it
reports would break the comparison across that date. The same strictness is
why their hints state the fix flatly while `double_quote`'s stays conditional.
The search order is `double_quote` → `semicolon` → `missing_period`, first hit
wins. Known limit: a missing period hidden behind an end-of-line comment
(`WRITE 'a' " note`) is out of reach — the appended period lands in the comment.
```

同節の「Reading it」段落の末尾に 1 文追加:

```md
Since #67 the three kinds split the `WRITE` bucket three ways, so compare
their sum against `syntax_statement = WRITE`, not `double_quote` alone.
```

- [ ] **Step 2: analytics.ts のコメントを更新** — 「An enum with a single member today (`double_quote`), so unlike」を「An enum (`double_quote`, `semicolon`, `missing_period`), so unlike」に置き換え

- [ ] **Step 3: 最悪ケースの所要時間を 1 回測る**（コミットしない一時テスト）

```bash
cat > src/workers/perf.tmp.test.ts <<'TS'
import { it } from "vitest";
import { Buffer } from "buffer";
(globalThis as unknown as { Buffer: typeof Buffer }).Buffer = Buffer;
import { Config, Registry, MemoryFile } from "@abaplint/core";
import { config as transpilerConfig } from "@abaplint/transpiler";
import { errorCounter, countErrors, findSyntaxRepair } from "./syntaxRepair";
import { errorRowCounter, errorSpanOf, findStatementEndRepair } from "./statementEndRepair";
it("worst case", async () => {
  const config = new Config(JSON.stringify(transpilerConfig));
  const source = "REPORT z.\n" + Array.from({ length: 300 }, (_, i) => `console.log("x${i}");`).join("\n");
  const reg = new Registry(config); reg.addFile(new MemoryFile("ztest.prog.abap", source)); await reg.parseAsync();
  const issues = reg.findIssues(); const errors = issues.filter((i) => i.getSeverity().toString() === "Error");
  const t0 = performance.now();
  const repair = (await findSyntaxRepair(source, countErrors(issues), errorCounter(config, "ztest.prog.abap")))
    ?? (await findStatementEndRepair(source, errors.map(errorSpanOf), errorRowCounter(config, "ztest.prog.abap")));
  console.log(`PERF errors=${errors.length} search_ms=${(performance.now() - t0).toFixed(0)} repair=${JSON.stringify(repair)}`);
}, 120_000);
TS
npx vitest run src/workers/perf.tmp.test.ts 2>&1 | grep PERF; rm src/workers/perf.tmp.test.ts
```
  Expected: `PERF` の行が 1 つ出る。`repair` の値は問わない（二重引用符入りの貼り付けなので #69 の探索が何か返す可能性がある）。`search_ms` を PR 本文に書く

- [ ] **Step 4: 全体検証**

```bash
npm run lint; echo "LINT=$?"
npm run typecheck; echo "TYPECHECK=$?"
npm test; echo "VITEST=$?"
npm run build >/dev/null 2>&1; echo "BUILD=$?"
diff <(tr "}" "\n" < /tmp/before.css) <(tr "}" "\n" < dist/assets/index-*.css); echo "CSS_DIFF=$? (0 = no new rules)"
ls -l dist/assets/index-*.js
git diff --stat origin/main -- src/workers/syntaxRepair.test.ts
```
  Expected: LINT / TYPECHECK / VITEST / BUILD / CSS_DIFF すべて 0（`/tmp/before.css` は Task 1 Step 0 で取ったもの）。`index-*.js` は約 350 kB のまま。`syntaxRepair.test.ts` の diff は空

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md src/utils/analytics.ts
git commit -m "syntax_repair の文書に statement-end の 2 種と厳しい判定の理由を書く (#67)"
```

---

## Gate2 記録（1 周目・2026-09-11）— **この計画は未修正。次のセッションはここから始める**

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
