# HANDOFF

- 更新: 2026-09-11 22:11
- ブランチ: `feature/statement-end-repair`（push 済み・PR 未作成）

## ゴール

Run が構文エラーで失敗したとき、**ピリオド抜け**と**行末セミコロン**についても「何を直せば通るか」を 1 行で出し、
GA4 の `syntax_repair` に `missing_period` / `semicolon` を送る（#67 の残り 2 形）。
出荷後 2 日の実測で、`WRITE` で止まった失敗 31 件のうち二重引用符のヒントが出たのは 4 件だけだった。

## 現在地

- 仕様（Gate1 確定済み）: `docs/superpowers/specs/2026-09-11-statement-end-repair-design.md`
- 実装計画（4 タスク）: `docs/superpowers/plans/2026-09-11-statement-end-repair.md`
- **Gate2（計画の敵対レビュー）1 周目: critical 0 / high 2 / medium 4 / low 4 — どれも未修正。**
  指摘の全文は計画ファイル末尾の「Gate2 記録」節にある
- コードはまだ 1 行も書いていない（ブランチ上の commit は仕様・計画・Gate2 記録だけ）
- 同じ日に #70（e2e の偽の緑）は PR #74 でマージ済み。`e2e/helpers.ts` に `waitForRunToEnd` がある

## 次の一手

1. **H1 を決める**: 64 kB 入力で探索が合計約 17 秒になり、20 秒のウォッチドッグ（`src/App.tsx:626-628`）に負けうる。
   二重引用符・セミコロン・ピリオドの 3 探索で**共有する上限**（経過時間 or 再パース回数）を入れる。
   上限値の決め方はユーザーに確認してから計画へ書く。既存の二重引用符側の同じ問題は #75 — 一緒に直すか分けるかも確認する
2. H2（Task 3 Step 5 の grep を `✘` 行だけ数える）、M1（まとめ候補の targets を書き換えた行のスパンに絞る＋テスト）、
   M2（厳しい判定の損得を仕様に書く・誤ったテストコメントを直す）、M3（測定手順を `./node_modules/.bin/vitest` と
   ファイル出力に直し、入力を H1 の最悪ケースにする）、M4（偽になるコメント 3 か所を計画の対象に入れる）を計画に反映する
3. Gate2 2 周目を **fresh サブエージェント**（fork 不可）で回す。high 以上 0 まで、周回上限 3（1 周目は消費済み）
4. 実装: Task 1 → 4（subagent-driven-development）。**Task 1 Step 0 の CSS 基準を取り直す**（`/tmp/before.css` はセッションをまたぐと消えうる）
5. Gate3 `/code-gate` → PR（本文に 64 kB 最悪ケースの所要時間を書く）

## 注意

- `npx vitest` はガードフックに拒否される。`npm test -- <file>` か `./node_modules/.bin/vitest` を使う
- abaplint の挙動を probe するときは `new Config(JSON.stringify(require("@abaplint/transpiler").config))`。`Config.getDefault()` は別ルールが効き答えが変わる
- 「件数が減ったら採用」はピリオド系では誤発火する（`console.log('a')` が 2→1）。厳しい判定は Q1 で確定済み — 再議論しない
- e2e で「無いこと」を確かめるときは、待つ対象が「それが現れうる最後の瞬間」より後かを確認する（#70 の原因）
