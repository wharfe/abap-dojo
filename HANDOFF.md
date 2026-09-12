# HANDOFF

- 更新: 2026-09-12（Gate2 3 周目まで完了）
- ブランチ: `feature/statement-end-repair`（push 済み・PR 未作成）

## ゴール

Run が構文エラーで失敗したとき、**ピリオド抜け**と**行末セミコロン**についても「何を直せば通るか」を 1 行で出し、
GA4 の `syntax_repair` に `missing_period` / `semicolon` を送る（#67 の残り 2 形）。あわせて #75 を同じ PR で直す。

## 現在地

**手段は替わった。仕様も計画も書き直し済み。コードはまだ 1 行も書いていない。**

- 手段 A =「**判定を先に返し、ヒントは後から届ける**」。ワーカーの返信を 2 通に割り、20 秒のウォッチドッグの窓から
  探索を外す。これで探索がどれだけ遅くても `outcome` が嘘にならない（3 周つぶした根がここで消えた）
- 仕様: `docs/superpowers/specs/2026-09-11-statement-end-repair-design.md`（Q1〜Q13、不変条件 1〜11）
- 計画: `docs/superpowers/plans/2026-09-11-statement-end-repair.md`（Task 1〜7、約 3,640 行）。末尾に Gate2 記録
- 判断用ページ: https://claude.ai/code/artifact/3d780ed4-af18-44a6-b33f-553428f8176c

**Gate2 は 3 周＝上限まで回した。3 周とも fresh サブエージェント。PASS ではない。**

| 周 | 結果 | 扱い |
|---|---|---|
| 1 | critical 2 / high 3 / medium 4 / low 2 | 全件反映（commit `0c5fbe5`） |
| 2 | critical 1 / high 1 / medium 4 / low 5 | 全件反映（commit `11313a8`）**— ただし 2 件が本文に落ちていなかった** |
| 3 | critical 2 / high 5 / medium 11 / low 9 | 全件反映（commit `b5b4b87`）**。修正後のレビューは未実施** |

**3 周目の根は 1 つで、設計の穴ではない** — 「2 周目の反映が本文に落ちていない／落とした形を検証していない」。
2 周目の適用スクリプトで 3 つ目の置換が例外を投げ、**ファイルが書かれないまま前 2 つの置換ごと消えた**のに
「修正済み」と記録していた（`pagehide` のフラッシュと pending の上書きガード）。教訓は dotfiles#156 に登録済み。

3 周目の critical 2 件はどちらも修正済み:

- **C1** `let verdict` を closure の中でしか代入しないと narrowing が残り、`finally` の比較が **TS2367**。
  `tsc -b` ごと止まるので build も e2e も全滅する。→ `const sent: { verdict: ... }` に変更。
  **最小再現で赤→緑を自分で検算済み**（`let` 版 `error TS2367` / オブジェクト版 exit 0）
- **C2** `pagehide` のフラッシュが本文に無かった → Task 5 Step 4 に追加（grep で確認）

## 次の一手

**1. まず人の判断を仰ぐ。** 周回上限に達しており、修正後のレビューを回していない。選べるのは:

- (a) このまま実装へ進む（3 周目の指摘はすべて反映済み・critical は検算済み）
- (b) 4 周目を回す（上限を 1 つ超える。超えるなら理由を記録する）
- (c) 仕様へ戻す — **3 周目の根は設計ではないので、推奨しない**

**2. 実装へ進むなら** subagent-driven-development で Task 1 から。順序の注意:

- Task 4 は **Step 2b/2c（ワーカーの単体テスト）を Step 3 より先に**書く。赤を見てから直す
- Task 4 Step 2c で 3 件目が赤のままなら、**直すのはテストではなく実装**（計画に明記済み）
- Task 5 Step 4c で `App.test.tsx` が落ちるのは `success` の 1 件だけのはず。`stopped` の 3 件が落ちたら
  `ABANDONED_OUTCOMES` の配線が入っていない

**3. Gate3** は `/code-gate`（(B) 区分・必須）。**4.** PR 本文で **#75 を閉じる**。
**#67 を閉じるかは skill `github-issues` を読んでから**。**#76 は閉じない**

## 注意

- **一括置換スクリプトは、`assert` を全部先に通してから write する。** 後段の例外で前段の置換ごと消え、
  しかも「修正済み」と記録だけが残る（この repo で実際に 1 周分を失った。dotfiles#156）。
  記録する前に `grep -c` で本文を確かめる
- **Gate2 の周回は上限 3 で、3 つとも消化済み。** これ以上回すなら上限を超える判断が要る（上の「次の一手」）
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
