# HANDOFF

- 更新: 2026-09-11（2 回目のセッション末）
- ブランチ: `feature/statement-end-repair`（push 済み・PR 未作成）

## ゴール

Run が構文エラーで失敗したとき、**ピリオド抜け**と**行末セミコロン**についても「何を直せば通るか」を 1 行で出し、
GA4 の `syntax_repair` に `missing_period` / `semicolon` を送る（#67 の残り 2 形）。あわせて #75（再パース探索が重い貼り付けで
ワーカーを塞ぎ、本物の構文エラーが 20 秒のウォッチドッグで `stalled` に化けうる）を同じ PR で直す。

## 現在地

- 仕様: `docs/superpowers/specs/2026-09-11-statement-end-repair-design.md`（Q1〜Q7。Q6 = 探索の大きさの上限 64→16 kB、Q7 = Run ごとに共有する 3 秒の打ち切り）
- 計画: `docs/superpowers/plans/2026-09-11-statement-end-repair.md`（Task 1 / 2 / 2b / 3 / 4）。末尾に Gate2 の全記録
- コードはまだ 1 行も書いていない（commit は仕様・計画・Gate2 記録だけ）
- Gate2 の経過:
  - 旧周回 1〜3 周目 → 3 周目で high 2 が残り、ユーザー判断で Q7（3 秒の打ち切り）を追加
  - **新しい周回 1 周目: high 1 — 1 回のパースが期限 3 秒を超える形が 16 kB 以内にある**（`x⏎` × 8,192 行。元 1.5 秒、
    最終行にピリオドの候補 1 回 4.6〜5.8 秒。手元で再現済み）。打ち切りは次のパースを止めるだけで、同じワーカーで始まったパースは止められない
  - **「上限で時間を抑えきれない」という同じ根が 3 回目** → 規則により実装ではなく仕様へ戻す。手段（同じワーカーの同じ応答で判定とヒントを返す）を替える判断待ち
- 判断用ページ: https://claude.ai/code/artifact/d1d97c72-dd1f-49d3-849b-c8fca5023e04（最新の選択肢が先頭）

## 次の一手

1. **手段は決定済み（2026-09-11、ユーザー）: A「判定を先に返し、ヒントは後から届ける」。** 採らなかった: B 専用 Worker で terminate、
   C 重いときは探索しない。設計で決めること（新しいセッションで brainstorming から）:
   - ワーカーのメッセージ: `transpile-error`（判定）を先に送り、探索の結果を別メッセージ（例 `syntax-hint`、同じ `requestId`）で追いかける
   - App 側: 判定の受信でウォッチドッグを止めて表示し、後から来たヒントを同じ Run のエラーに付ける。別の Run が始まっていたら捨てる
   - GA4: `run_result` を判定の時点で送るとヒントの値が載らない。ヒントを待つ（上限つき）か、`syntax_repair` を別経路で送るか。
     **新しいパラメータやイベントは GA4 登録が要り、遡及しない**（CLAUDE.md Analytics 節）ので最初に決める
   - 探索中はそのワーカーの lint が待たされる。16 kB の上限（Q6）と 3 秒の打ち切り（Q7）を lint の待ちを抑える目的で残すか
   - 成功側 `silent_loss` も同じ形（transpile 結果を先に返す）にするか、今回は失敗側だけか
2. 決まった手段で仕様を更新（brainstorming → grilling の軽量 Gate1。Q7 を置き換えるか残すかも決める）→ 計画を書き直す →
   Gate2 を新しい周回で fresh サブエージェントに回す
3. 新しい周回 1 周目の medium / low（M1 lint を含まない測定、M2 配線漏れ検査が 1 か所だけ、M3 不変条件 1 と打ち切りの矛盾、
   L1〜L3）は、手段が変われば前提ごと変わるので、書き直した計画に対して要否を判断する
4. 実装（subagent-driven-development）→ Gate3 `/code-gate` → PR（本文に最悪ケースの所要時間。PR 本文で #75 を閉じる。
   #67 を閉じるかは skill `github-issues` を読んでから）

## 注意

- `npx vitest` / `npx eslint` はガードフックに拒否される。`./node_modules/.bin/` を使う。vitest は `console.log` を出さないのでファイルに書く
- abaplint の probe は `new Config(JSON.stringify(require("@abaplint/transpiler").config))`。`Config.getDefault()` は答えが変わる
- **パースの重さは文字数に比例せず、同じ大きさでも形で数十倍違う**（16 kB で 24 ms〜1.5 秒、候補はさらに重くなりうる）。時間の見積もりは
  「1 パース × 回数」ではなく、形ごとに実測（Node とブラウザ、3 回の中央値）。重い形の例: `x⏎`、`<⏎`、`foo(1);`、`foo(1, "x");`、`WRITE 'value#';`
- Bash ツールは timeout で処理を殺さず裏へ回す。変異を当てる手順は `run_in_background` で完了通知を待つ
- Tailwind v4 は `docs/superpowers/*.md` も走査する。CSS 比較の基準を取るときは `docs/superpowers` を一時的に外す
- 「件数が減ったら採用」はピリオド系では誤発火する。厳しい判定は Q1 で確定済み — 再議論しない
- e2e で「無いこと」を確かめるときは、待つ対象が「それが現れうる最後の瞬間」より後かを確認する（#70）
