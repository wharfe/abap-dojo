# structure エラーの内訳を run_result に載せる（#72 案B）— Gate1 軽量 spec

**要は**: `syntax_error` の 25.7%（2026-09-23..10-12）を占める `syntax_key = structure` は、今は
「ブロックの対応が取れなかった」以上のことが分からない。abaplint の `structure` メッセージは
3 形しかなく、名前の部分は abaplint 自身の文クラス名なので、**閉じた集合との照合を通した値だけ**を
2 つのパラメータで送る。表示・探索・既存パラメータは一切変えない。

## 事実（実測 2026-10-14、`@abaplint/core` 2.120.42、worker と同じ transpiler config）

- `structure` キーを付けるのは `abap/3_structures/structure_parser.js` の 1 箇所だけ（`grep -rn '"structure"'`）。
- 文面は 3 形 + 空文字:
  - `Expected <X>` — `_combi.js:289,308`。`<X>` は **`SubStatement.obj.name.toUpperCase()` = 文クラス名**
    （issue コメントの「構造クラス名」は誤り）。位置は常に (1,1)
  - `Unexpected <X>` — `structure_parser.js`。`<X>` は `statement.get().constructor.name.toUpperCase()`
  - `Unexpected code structure` — `_combi.js:136`
  - `""` — `_combi.js:106`（`countError` の初期値がそのまま残る経路）
- `<X>` に利用者のソースは入らない。それでも安全性の根拠は「入らないはず」ではなく照合に置く。
- `Statements` の export 317 個は、大文字化しても衝突しない。export 名 = `constructor.name`（Node 実測）。
- 値はキーワードではない: `Unexpected METHODIMPLEMENTATION`、`Unexpected PUBLIC`。だから
  `syntax_statement`（先頭キーワード 176 語）の語彙とは別物で、相乗りしない。
- **名前は開いたままのブロックではない**: METHOD 内で ENDIF を忘れると `Expected ENDMETHOD`。
  `IF` の中に `FORM` を置いても `Expected ENDIF`。
- **`structure` の一部は parser_error が姿を変えたもの**（Gate2 H1）: `structure_parser.js:49` は parser_error に
  なった文（`Unknown`）を構造解析の前に捨てる。閉じ文自体が壊れていると「閉じていない」になり、(1,1) なので
  `errors[0]` を取る。`ENDIF` のピリオド抜け・`ENDFI.`・`ENDDO;` はどれも `Expected ENDIF`/`ENDDO` が先頭。
  だから `structure_node = ENDIF` は「ブロックの対応ミス」と「閉じ文の綴り・句読点の誤り」を混ぜる。
  読むときは `syntax_error_count`（>1 なら後続に parser_error がある可能性）と組み合わせる。分離する新信号は今回作らない。

## 既にある仕組みを探したか

探した。`syntax_statement`（parser_error の先頭キーワード）と `transpile_node`（PascalCase の AST 名）が近いが、
前者は語彙が違い（上記）、後者は outcome が違う（`transpile_error` 限定）。どちらかへ相乗りすると
GA4 の 1 つの次元に 2 つの定義が載り、登録は遡及しないので後から分けられない。新規 2 パラメータにする。
GA4 側の既存機能（イベントパラメータ）以外に流用できる仕組みはない。

## 決定

| # | 問い | 決定 |
|---|---|---|
| 1 | 何を送るか | `structure_kind`（enum: `expected` / `unexpected` / `unexpected_code_structure`）と `structure_node`（大文字の文クラス名） |
| 2 | 照合する集合 | `Object.keys(Statements)` を大文字化した集合 + 文字列固定の `MACROCALL` `MACROCONTENT` `MACRORECURSION` `NATIVESQL`（Structures の matcher が参照するのに `Statements` に無い 4 個。`MacroRecursion` は top-level export も無い）。網羅はテストで Structures の matcher を辿って保証し、実行時には辿らない |
| 3 | 送る値の形 | 画面と同じ大文字形。`has` で集合の要素と一致を確かめた文字列だけ |
| 4 | 未知の値 | 文面が 3 形のどれにも完全一致しなければ両方なし。`Expected`/`Unexpected` で名前が集合外なら kind だけ送り node はなし |
| 5 | 範囲 | `errors[0].getKey() === "structure"` のときだけ（worker の classifier と analytics の `refine` の両方で強制）。outcome は `syntax_error` 限定 |
| 5b | node の kind 範囲 | node は kind が `expected`/`unexpected` のときだけ（classifier と `refine` の両方）|
| 6 | 置き場所 | 分類は `src/workers/syntaxDiagnostics.ts` の `classifySyntaxError` を拡張（worker の呼び出しは変更なし）。enum は `src/types/diagnostics.ts` |

## 不変条件

1. 生の message・利用者のソース・利用者が増やせる自由文字列は送らない。`structure_node` は集合照合を通った値だけ。shape 正規表現は backstop（`ZSECRET` は通る）であり保証ではない。
2. `structure_*` は `syntax_key = structure` かつ `outcome = syntax_error` 以外の run_result から必ず落ちる。
3. 既存の `syntax_key` / `syntax_error_count` / `syntax_statement` / `syntax_repair` / `silent_loss`、エラー表示、ヒント探索の挙動は変えない。
4. `Expected ENDMETHOD` を「内側の ENDIF 忘れ」とも「METHOD の閉じ忘れ」とも断定しない — 文書でもコードコメントでも「abaplint が次に期待した閉じ文」とだけ言う。閉じ文の綴り・句読点の誤り（parser_error 由来）も同じ値になることを併記する。
5. kind あり・node なし = abaplint の更新か `keepNames` の喪失による語彙のずれ（網羅テストが通る限り）。残り物として読まない。

## 入口表（不変条件が破れうる場所）

| 場所 | 何が起きうるか |
|---|---|
| `src/workers/abaplintWorker.ts:182` | classifier に `errors[0]` 以外を渡す |
| `src/workers/syntaxDiagnostics.ts:137` | 分類と照合（新規ロジック） |
| `src/types/diagnostics.ts:94` / `src/types/messages.ts:67` | 型の運搬 |
| `src/App.tsx:327-337`（endRun の params） | 新フィールドの積み忘れ・別 outcome への混入 |
| `src/App.tsx:259-271`（flushPendingResult） | pending の spread で運ばれる。追加の書き換えなし |
| `src/utils/analytics.ts:86-155,285-297,371-415` | EventMap / EVENT_PARAMS / OUTCOME_ONLY_PARAMS / refine |

## 非目標

- 表示の変更（#89 の担当）。`Expected` の (1,1) 問題も #89。
- `check_syntax` など他キーの内訳（#56）。Validator 経路の計測。
- GA4 のカスタム定義登録（**main へのマージ＝本番 deploy の前に** `structure_kind` / `structure_node` を custom dimension として登録する。登録は遡及しない。PR に順序として明記）。実 GA4 送信・本番操作。
- CLAUDE.md の `syntax_key` 表への `structure` 行追加は、計測が貯まってから（意味の断定を避ける）。今回は計測の読み方の節と登録表だけ。

## 受け入れコマンド

- `npm run lint` / `npm run typecheck` / `npm test`（新規: classifier の入れ子・parser_error 由来の 3 例・不正値・空文字・小文字・集合外、Structures 網羅、集合全要素が shape を通る、analytics の outcome ルールと key ルールを独立に（片方を消すと赤）、node の kind 範囲、App→実 `track`→`gtag` 配線）/ `npm run build` / `npm run test:e2e`（新規: 本番ビルドで `window.gtag` を addInitScript で差し替え、`structure_kind`/`structure_node` が届くこと＝keepNames 依存の検証。CI 必須。ローカルは Chromium、他は CI）/ `npm run build:runtime:check`

## Gate2 2 周目で足したこと（critical/high 0、medium/low を反映）

- e2e は `e2e/syntaxHint.spec.ts` に置き、既存の WebKit skip（#47）を引き継ぐ。gtag の記録は `[data-search="done"]`（`e2e/helpers.ts`）を待ってから読む — syntax_error の run_result は follow-up 到着まで保留されるため。
- 読み方: `structure` かつ `syntax_repair ∈ {missing_period, semicolon}` なら閉じ文の句読点の誤り。綴り誤り（`ENDFI.`）は切り分けられない。
- `refine` の順序: key 規則（`syntax_key ≠ structure` なら kind を消す）→ kind 規則（kind が expected/unexpected 以外なら node を消す。key 規則で kind が消えた node もここで消える）→ outcome 規則。key 規則が node を直接消さないのは、各規則を単独で外したときにどれが効いていたかをテストで区別するため（Gate3 で実装に合わせて訂正）。
- 入口表に追加: `src/workers/abaplintWorker.ts:96-113`（classifier が throw すると syntax_error が transpile_error に化ける → 任意の文字列で throw しないテスト）、`src/App.tsx:482-493`（`isSyntax` での振り分け）。
- 不変条件 5 は「kind が expected/unexpected で node が無い場合」に限定し、原因は「abaplint 更新による名前のずれ」とする（keepNames 喪失は worker 起動失敗として現れるので node 欠落にはならない）。e2e の価値は「本番 worker バンドルで分類と運搬が通ること」。
- 網羅テストは `getUsing()` で集めた名前のうち `Statements` に無いものが固定 4 個と**一致**することを確かめる。`Unexpected` 側の語彙は公開 API では網羅できない旨をコメントに書く。
- GA4 登録は本番管理画面での人手の操作。ユーザーの明示許可の下で、マージ前に行う手順として PR に書く。
