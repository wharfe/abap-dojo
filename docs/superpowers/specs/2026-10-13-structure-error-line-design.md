# `structure` エラーが 1 行目を指さないようにする（#72 案A）

**要は**: abaplint の `structure` エラーのうち `Expected <文>` と `Unexpected code structure` は、
どこで起きても位置 `(1,1)` で報告される（`@abaplint/core` `structure_parser.js:79-81`）。
今は 4 つの表示面すべてが、その「1 行目」をそのまま問題の場所として見せている。
syntax_error の 25.7%（2026-09-23..10-12、750/2,915）がこのキーで、利用者は 1 行目を探しに行く。
これを、**行を示さず、何が起きたかを条件付きで言う**表示に変える。

## 決めたこと（grilling 2026-10-13、全問推奨どおり）

- Q1 文面は条件付き: 「閉じていない」と断定しない。`IF` の中に `FORM` があっても `Expected ENDIF` になるため
- Q2 行は出さない: Run の見出しの `(L1)`、Lint 一覧の `L1:1` を消す。エディタの波線は行が必須なので 1 行目に残し、文面だけ差し替える
- Q3 対象は `(1,1)` 固定の 2 形だけ。`Unexpected WHEN` のように正しい行を指すものは触らない
- Q4 変換はワーカーの 1 箇所。計測には元の Issue を渡す
- Q5 閉じる文 → 開く文の対応表 → **Gate2 C1 で取り下げ**（下記）

## 既にある仕組みを探したか

- abaplint: 開いたままのブロックの位置を返す API は無い（`runFile` は `result.errorDescription` だけを持ち、位置は固定 `(1,1)`）
- この repo: 後からヒントを届ける `syntax-hint`（#75）は「直せば通る編集」を探す仕組みで、ここでは何も探さない。同期で文面を作れば足りる
- 結論: 新しい純関数 1 つで足りる

## 不変条件

- **I1 計測は変わらない**: `classifySyntaxError` には元の `Issue` の key と message を渡す（`syntax_key = structure` のまま）
- **I2 対象を広げない**: 書き換えるのは `key === "structure"` かつ開始位置が `(1,1)` かつ message が `/^Expected [A-Z]+$/` か `Unexpected code structure` の Issue だけ。他はバイト単位で今のまま。abaplint が将来本物の位置を返すようになったら、`(1,1)` の条件で自動的に書き換えが止まる
- **I3 誤った行を見せない**: 書き換えた Issue は、Run の見出し・Playground の Lint 一覧・Validator の Lint 一覧のどこにも `L1` を出さない
- **I4 4 面で同じ文面**: Run のエラー、Validator の syntax 段、Lint 一覧、エディタの波線が同じ説明文を出す
- **I5 修正の探索は無関係**: `syntax_repair` / `silent_loss` の探索は `Issue` を直接使うので影響を受けない

## 非ゴール

- 開いたままのブロックの行を特定すること（文の列を自前で突き合わせる必要があり、別の作業）
- `structure` の内訳を GA4 に送ること（#72 案B。効果測定のときに足す）
- `Unexpected <文>` の文面
- `syntax_repair` の値を足すこと（これは修正の発見ではない）

## 文面（英語。利用者向け文字列は英語）

元の message（`Expected ENDIF` など）を先頭に残し、その後ろに説明を足す。**開く文は名指ししない**（Gate2 C1）。

`Expected X` 全般と `Unexpected code structure` で同じ文面:

> Expected ENDIF. abaplint could not match the program's block structure, and it does not say where the problem is, so no line is given. Usually a block opened earlier is not closed (IF, LOOP, METHOD, CLASS, BEGIN OF, or a SELECT without SINGLE or INTO TABLE, which loops until ENDSELECT), a statement appears where its block does not allow it, or a statement ran on past its line (in ABAP a " starts a comment). If other errors are listed, fix those first: this one is often a consequence of them.

## Gate2 1 周目で変えたこと

- **C1**: 閉じる文は、実際に開いたままのブロックを指さない（METHOD の中の IF 閉じ忘れ → `Expected ENDMETHOD`、IF の中の LOOP 閉じ忘れ → `Expected ENDIF`、ENDCLASS はあるのに中身が不正 → `Expected ENDCLASS`）。そのため Q5 の閉じる文と開く文の対応表はやめ、名指ししない文面にした
- **H1**: ピリオド抜けや二重引用符の誤りでも、structure が `errors[0]` になる（`IF…ENDIF` のピリオド抜けで `[structure@1,1, parser_error@3]`）。そこで「他のエラーを先に」と書き、App.tsx:495-506 で後から足されるヒントとの組み合わせも入口の表に入れた
- **M1**: `X` は文クラス名（`DATAEND` や `ENDOFDEFINITION`）。キーワードとして読ませる文は書かない。元の message はもともと表示されていたので残す
- **L1**: 波線は Issue の終わり位置まで伸びて 1 文目全体に付くので、`positionUnknown` のときは `(1,1)-(1,2)` に縮める
- **L2**: `Unexpected code structure` と空の説明は実物で作れない。合成した Issue で試す。空の説明は対象外で、表示は今のまま

## 入口の表（不変条件ごとに、破れうる場所）

| 不変条件 | 場所 | 内容 |
|---|---|---|
| I1 | `src/workers/abaplintWorker.ts:182-186` | `classifySyntaxError(first.getKey(), errors.length, first.getMessage())` — 元の Issue のまま |
| I2,I4 | `src/workers/abaplintWorker.ts:53-65` | `issueToLintIssue` — lint と Validator の Lint 一覧の唯一の変換 |
| I2,I4 | `src/workers/abaplintWorker.ts:177-178` | Run の `message` と `line` |
| I4 | `src/workers/abaplintWorker.ts:329` | Validator の syntax 段 `error` |
| I3 | `src/App.tsx:472-473` | `data.line` があるときだけ `(L…)` を付ける |
| I3 | `src/components/OutputPanel.tsx:159` | `L{issue.startLine}:{issue.startCol}` |
| I3 | `src/components/ValidationReport.tsx:119` | 同上（Validator） |
| I4 | `src/components/MonacoEditor.tsx:152-160` | 波線。1 行目のまま、message が変わり、範囲は `(1,1)-(1,2)` に縮む |
| I4 | `src/App.tsx:495-506` | syntax-hint が Run のエラー文の末尾に足される（H1: structure の説明と別の原因のヒントが並ぶ） |
| I5 | `src/workers/syntaxRepair.ts` ほか | `Issue` を直接読む（`LintIssue` を経由しない） |
| — | `src/rules/matchers/hallucinatedClass.ts:56` | `LintIssue` の message を読むが `unknown_types` のみ |

## 実装計画

1. `src/workers/structureExplanation.ts`（新規）: `explainStructureIssue(key, message, row, col): string | null`。
   対象外なら `null`。`ENDSELECT` だけ専用の文面
2. `LintIssue` に `positionUnknown?: true` を足す（`src/types/messages.ts`）
3. `issueToLintIssue`: 説明があれば `message` を差し替え、`positionUnknown: true`、終わり位置を `(1,2)` に
4. Run（`:177-178`）: 説明があれば `message` を差し替え、`line` を付けない。Validator（`:329`）: `message` を差し替え
5. `OutputPanel.tsx:159` / `ValidationReport.tsx:119`: `positionUnknown` のときは `L…:…` を出さない
6. テスト: `structureExplanation.test.ts`（実 Registry で、閉じ忘れ・入れ子・ENDSELECT・ピリオド抜け起因の 4 形と、対象外 3 形（先頭行の `ENDIF` など本物の (1,1)）。`Unexpected code structure` と空の説明は合成した入力で）、
   ワーカーの Run 経路で `line` が無いこと、`OutputPanel` の表示。e2e: `IF` 閉じ忘れを Run して `(L1)` が無く説明文が出ること

## 受け入れコマンド

```bash
npm run lint && npm run typecheck && npm test && npm run test:e2e
npm run build   # index-*.js が ~350 kB のまま、CSS の差分が無いこと（#44: 英文コメントがクラスになる）
```

## Gate2 2 周目（critical/high 0。medium を反映）

- **M-a/M-b**: ENDSELECT 専用文面は取り下げ。`PACKAGE SIZE` 付きや中の IF 閉じ忘れで誤り、しかも外側にブロックがあると `Expected ENDMETHOD` 等になり届かない。汎用文の例に SELECT ループと BEGIN OF を入れた
- **M-c**: Validator の syntax 段のラベル（`ValidationReport.tsx:36,82-84`）は状態ラベル用の狭い場所なので、元の message のまま。説明は同じ画面の Lint 一覧に出る。**I4 はこの 1 面を除く 3 面＋Validator の Lint 一覧**に読み替える
- **L-a**: `"` でコメントが始まり文が続いた形（`DO.` の中の `WRITE "hi".` → `Expected ENDDO`）も文面に含めた
- **L-b**: Validator の Lint 一覧で `L…` を出さないテストを足す

## Gate3 1 周目で変えたこと

- 文面の書き出しを「abaplint could not match the program's block structure」に変えた。`Unexpected code structure` では文の名前が出ないので、「that statement」が何も指さなかったため（/code-review）
- Run では、説明の後に「The next error abaplint reports is on line N: …」を足す。ピリオド抜けが原因のとき、行を持つ本当の原因が Lint タブにしか出なかったため（/code-review）。`syntax_key` は従来どおり `errors[0]`
- 2 つの一覧を実際に描画するテスト（`src/components/issueLists.test.tsx`）を足した。ヘルパーの単体テストだけでは、一覧の接続を外しても緑のままだった（intent-alignment の critical、codex の Important）
