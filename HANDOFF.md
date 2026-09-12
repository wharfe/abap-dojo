# HANDOFF

- 更新: 2026-09-12 11:35
- ブランチ: `feature/statement-end-repair`（push 済み・PR 未作成）

## ゴール

Run が構文エラーで失敗したとき、**ピリオド抜け**と**行末セミコロン**についても「何を直せば通るか」を 1 行で出し、
GA4 の `syntax_repair` に `missing_period` / `semicolon` を送る（#67 の残り 2 形）。あわせて #75 を同じ PR で直す。

## 現在地

**手段は替わった。仕様も計画も書き直し済み。コードはまだ 1 行も書いていない。**

- 手段 A =「**判定を先に返し、ヒントは後から届ける**」。ワーカーの返信を 2 通に割り、20 秒のウォッチドッグの窓から
  探索を外す。これで探索がどれだけ遅くても `outcome` が嘘にならない（3 周つぶした根がここで消えた）
- 仕様: `docs/superpowers/specs/2026-09-11-statement-end-repair-design.md`（Q1〜Q13、不変条件 1〜11）
- 計画: `docs/superpowers/plans/2026-09-11-statement-end-repair.md`（Task 1〜7、約 2,500 行）。末尾に Gate2 記録 5 周分
- 判断用ページ: https://claude.ai/code/artifact/3d780ed4-af18-44a6-b33f-553428f8176c

**Gate2 は新しい周回の 1 周目が終わったところ（周回上限 3 のうち 1 消化）。**
結果は **critical 2 / high 3 / medium 4 / low 2**。**3 周つぶした根（上限で時間を保証できない）の再提起は 0 件。**

直したのは 2 件だけ:

- **C1** `let issues: Issue[]` が TS4104（`findIssues()` は `readonly Issue[]` を返す — `abaplint.d.ts:4197`）→ 修正済み
- **M4** 不変条件番号 10 → 8 → 修正済み
- 仕様 239 行の事実誤認（下記 C2 の根）→ 仕様側は修正済み

**残り 9 件は未修正。** 全文は計画末尾の「Gate2 記録（手段 A 後・1 周目）」にある。

## 次の一手

1. **C2 / H1 — `src/App.test.tsx`（615 行）を計画に組み込む。** 仕様の誤認は直したが、**計画側が未対応**。
   - この変更で **4 件落ちる**（`App.test.tsx:150 / 216 / 397 / 503`）。根は 1 つで、FakeWorker が追いかけの 1 通を
     送らないため `endRun` が溜めたまま返り `run_result` が 0 件になる
   - 落ちる 4 件は **`run_click`/`run_result` の 1:1（不変条件 6）をピン留めしている唯一のスイート**
   - **Task 5 に単体テストの Step を足す**（e2e に丸投げしない）。FakeWorker の `onmessage` を直接叩けるので
     「追いかけが来ないまま 20 秒」「A の追いかけが B に付かない」「unmount 後にタイマーが発火しない」
     「`stalled` は待たない」は数行で書ける
   - 同じ陳腐化がコードにも 2 か所: `e2e/silentLoss.spec.ts:87`、`e2e/syntaxHint.spec.ts:9`（どちらも
     `#17` を根拠に「App.tsx に単体テストが無い」と書いている）。Task 6 で触るファイルなので同じ Step で直す
2. **H3 — 判定メッセージの組み立てが try の外に出ている。** `new Registry(...)`・`first.getMessage()`・
   `classifySyntaxError(...)` がどの try にも入っておらず、投げると**判定も追いかけも 0 通**になり
   `transpile_error` が `stalled` に化ける。不変条件 5（必ず 2 通）もこの経路で破れる
3. **H2 — `stalled` の後、`data-search` が `pending` のまま `done` にならない。** `endRun` が `followUpRef` を
   空にしてから即送信するので、後から届く追いかけが捨てられ `setSearchState("done")` に到達しない。
   `waitForSearchDone` が 30 秒待って落ちる。踏むのは Task 6 Step 2 の `x⏎` × 8,192 がまさに狙う入力
4. **M1〜M3・L1〜L2** を計画に反映（M1 = `withDeadline` の包み忘れを検出する検証が 1 つも無い）
5. **Gate2 2 周目**を fresh サブエージェント（fork 不可）で回す
6. 緑になったら実装（subagent-driven-development）→ Gate3 `/code-gate` → PR。
   PR 本文で **#75 を閉じる**。**#67 を閉じるかは skill `github-issues` を読んでから**。**#76 は閉じない**

## 注意

- **Gate2 の周回は上限 3 で、いま 1 消化。** 同じ根の指摘が 2 回出たら実装ではなく仕様へ戻す
- **`npx vitest` / `npx eslint` はガードフックに拒否される。** `./node_modules/.bin/` を使う。vitest は
  `console.log` を出さないのでファイルに書く
- **Bash ツールは timeout で処理を殺さず裏へ回す。** 変異確認は `run_in_background` で完了通知を待つ
- **長い Write は黙って切れる。** このセッションで約 2,300 行の計画が heredoc の途中で切れ、しかも上書きで
  Gate2 記録 4 周分が消えた（ツールは成功を返す）。大きく書いたら `wc -l` とフェンス数で構造を検算する
- abaplint の probe は `new Config(JSON.stringify(require("@abaplint/transpiler").config))`。
  `Config.getDefault()` は答えが変わる
- **パースの重さは文字数に比例せず、同じ大きさでも形で数十倍違う。** 時間の見積もりは形ごとに実測
- Tailwind v4 は `docs/superpowers/*.md` も走査する。CSS 比較の基準を取るときは `docs/superpowers` を一時的に外す
- **「件数が減ったら採用」はピリオド系では誤発火する。** 厳しい判定は Q1 で確定済み — 再議論しない
- e2e で「無いこと」を確かめるときは、待つ対象が「それが現れうる最後の瞬間」より後かを確認する（#70）
