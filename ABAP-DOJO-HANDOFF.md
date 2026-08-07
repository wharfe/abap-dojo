# ABAP Dojo — ブラウザで動くABAP Playground

## プロダクト概要

**ABAP Dojo** は、SAPシステム不要でブラウザ上でABAPコードを書いて・検証して・実行して・学べるWebアプリケーション。
2026年のAI時代において「LLMが生成したABAPコードの一次検証」「レガシー構文のモダン化確認」「SAP環境なしでのABAP学習」を統合的に提供する。

### なぜ今これが必要か

1. **ABAPは"低リソース言語"** — LLMの学習データが圧倒的に少なく、生成コードの品質がPython等より劣る。検証ステップが不可欠
2. **SAPシステムへのアクセス障壁** — ABAPを試すにはクライアントのSAPシステムか、SAP BTP契約が必要。気軽に「ちょっと試す」ができない
3. **S/4HANA移行の波** — レガシーABAP→ABAP Cloud構文への書き換え需要が爆発的に増加中
4. **既存ツールの隙間** — playground.abaplint.orgはリントルールのデモ用途。「開発者が日常使いするPlayground」は存在しない

### ターゲットユーザー

- ABAPコンサルタント（現場のSAPシステム以外で試したい）
- LLMを使ってABAPコードを書いている開発者（生成コードの検証）
- ABAP学習者（SAPシステムなしで構文を学びたい）
- S/4HANA移行プロジェクトのメンバー（レガシー→モダン構文の変換確認）

---

## 技術基盤（車輪の再発明をしない）

すべてLars Hvam氏のabaplintエコシステム（MIT License）の上に構築する。

| npmパッケージ | 用途 | ブラウザ対応 |
|---|---|---|
| `@abaplint/core` (v2.115.x) | ABAPパーサー + 163ルールのリンター | ✅ |
| `@abaplint/transpiler` (v2.12.x) | ABAP → JavaScript トランスパイラ | ✅ |
| `@abaplint/runtime` (v2.12.x) | トランスパイルされたABAPの実行ランタイム | ✅ |

### 制約事項

- トランスパイラの入力は **ABAP 7.02構文** が基本。高い構文はabaplintのdownportルールで自動変換可能
- DB操作（SELECT等）はインメモリDBシミュレーション（`@abaplint/database-sqlite`相当をブラウザで）
- SAP標準クラス・関数モジュールは未実装のものが多い。open-abap-coreで基本的なもののみ

---

## 機能構成（3つのモード）

### Mode 1: Playground（自由に書いて動かす）

コア体験。Monaco Editorベースのエディタで、ABAPを書いてブラウザ上で実行。

```
┌─────────────────────────────────────────────┐
│  ABAP Dojo                    [▾ Mode]      │
├──────────────────────┬──────────────────────┤
│                      │  Output              │
│  Monaco Editor       │  > Hello, ABAP!      │
│  (ABAP syntax        │  > lt_result: 3 rows │
│   highlighting +     │                      │
│   inline lint)       │  ──────────────────── │
│                      │  Lint Issues (2)      │
│                      │  ⚠ L12: prefer NEW   │
│                      │  ⓘ L18: use boolc    │
├──────────────────────┴──────────────────────┤
│ [▶ Run]  [🔍 Lint]  [📋 Copy]  [📤 Share]  │
└─────────────────────────────────────────────┘
```

**機能詳細:**
- リアルタイムリント（タイピング中にabaplintがバックグラウンドで実行）
- **LLM Pitfall ルール4件も同じリントに乗る**（当初は Mode 2 専用の設計だったが、
  モード切替を要求する限りほぼ誰にも届かないため Playground 側にも出す）
- ▶ Run: ABAP → JS トランスパイル → ブラウザ上で実行 → WRITE出力を表示
- エラーがあればトランスパイルエラー or ランタイムエラーを分かりやすく表示
- サンプルコードプリセット（内部テーブル操作、文字列処理、OOの基本等）
- URLハッシュでのコード共有（GitHubのGist的なシェア機能は将来）

### Mode 2: AI Validator（LLM生成コードの検証）

LLMが生成したABAPコードを貼り付けて、構文・スタイル・実行可否を一括チェック。

```
┌─────────────────────────────────────────────┐
│  AI Validator                               │
├──────────────────────┬──────────────────────┤
│                      │  Validation Report   │
│  Paste LLM output    │                      │
│  here...             │  ✅ Syntax: OK       │
│                      │  ⚠ Lint: 3 issues    │
│                      │  ✅ Transpile: OK    │
│                      │  ✅ Runtime: OK      │
│                      │                      │
│                      │  Known LLM Pitfalls: │
│                      │  ⚠ L5: STRING used   │
│                      │    where CHAR expected│
│                      │  ⚠ L12: Python-style │
│                      │    pattern detected   │
├──────────────────────┴──────────────────────┤
│ [🔍 Validate]  [🔧 Auto-fix]  [📋 Copy]   │
└─────────────────────────────────────────────┘
```

**機能詳細:**
- 通常のリントに加え、**LLM特有の間違いパターン検出** を追加
  - STRING vs CHAR(n) の混同
  - Native SQL と Open SQL の混同
  - 存在しないBAPI/関数モジュール名の使用（既知の正規名リストとの照合）
  - Python/JS由来の構文パターン（動的型付け的な書き方等）
- 検出パターンはJSONルールファイルで管理（コミュニティ拡張可能）
- Auto-fix: abaplintのquickfix機能で自動修正可能なものは一括適用

### Mode 3: Modernizer（レガシー→モダン構文変換）

古いABAP構文を貼り付けると、ABAP Cloud準拠の構文に変換候補を提示。

```
┌─────────────────────────────────────────────┐
│  Modernizer                  [Target: 7.57] │
├──────────────────────┬──────────────────────┤
│  Legacy (input)      │  Modern (output)     │
│                      │                      │
│  MOVE a TO b.        │  b = a.              │
│                      │                      │
│  CALL METHOD         │  obj->method(        │
│    obj->method       │    param = val       │
│    EXPORTING         │  ).                  │
│      param = val.    │                      │
│                      │                      │
│  READ TABLE lt       │  DATA(ls) =          │
│    WITH KEY k = v    │    lt[ k = v ].      │
│    INTO ls.          │                      │
│                      │                      │
├──────────────────────┴──────────────────────┤
│ [🔄 Convert]  [Target ▾]  [📋 Copy Modern] │
└─────────────────────────────────────────────┘
```

**機能詳細:**
- abaplintの downport/upport ルールを**逆方向**に活用
- ターゲットバージョン選択（7.40 SP05 / 7.50 / 7.57 / ABAP Cloud）
- diff表示（変更箇所のハイライト）
- 変換理由の解説（なぜこの書き換えが推奨されるか）
- 変換不可能な箇所の明示（「これはSAPシステムでの確認が必要」）

---

## アーキテクチャ

### 完全クライアントサイド

```
Browser
├── React (UI framework)
│   ├── Monaco Editor (code editing + ABAP syntax)
│   ├── Mode Router (Playground / Validator / Modernizer)
│   └── Result Display (output / lint issues / diff view)
│
├── abaplint Core (in Web Worker)
│   ├── Parser → AST
│   ├── Linter (163 rules)
│   └── Downport/Upport rules
│
├── abaplint Transpiler (in Web Worker)
│   ├── ABAP → JavaScript conversion
│   └── Runtime execution (sandboxed)
│
└── Custom Layer (ABAP Dojoの独自部分)
    ├── LLM Pitfall Detector (JSON rule engine)
    ├── Modernizer Logic (upport rule orchestration)
    ├── Sample Code Library
    └── Share/URL encoding
```

### 重要な設計判断

1. **サーバーレス** — すべてブラウザ内で完結。バックエンドなし。秘匿コードがサーバーに送信されない
2. **Web Worker** — abaplint/transpilerの処理はWeb Workerで実行。UIスレッドをブロックしない
3. **LLM API連携なし** — AI Validatorモードは静的ルールベース。LLMは呼ばない。理由：
   - ユーザーのコードを外部APIに送りたくない（秘匿性）
   - オフラインでも動く
   - ルールベースの方が再現性・信頼性が高い
4. **PWA対応**（将来） — Service Workerでオフライン動作可能に

### Tech Stack

```
Framework:    React + TypeScript (Vite)
Editor:       Monaco Editor (@monaco-editor/react)
ABAP Engine:  @abaplint/core + @abaplint/transpiler + @abaplint/runtime
Diff View:    monaco-editor の diff editor モード
Styling:      Tailwind CSS
State:        React state (zustand if needed)
Deploy:       Static hosting (Cloudflare Pages / Vercel / GitHub Pages)
```

---

## LLM Pitfall Detector（独自価値の核）

既存ツールとの最大の差別化ポイント。LLMがABAPで犯しがちなミスパターンをルールベースで検出。

### ルール例（初期セット）

```jsonc
{
  "rules": [
    {
      "id": "llm-string-char-confusion",
      "description": "STRING型をCHAR(n)が期待される場所で使用",
      "severity": "warning",
      "pattern": "AST: TYPE STRING in DATA declaration where DDIC expects CHAR",
      "explanation": "LLMはPythonの影響でstring型をデフォルトにしがち。ABAPではCHAR(n)とSTRINGは明確に異なる",
      "suggestion": "DATA lv_name TYPE char40. を使用してください"
    },
    {
      "id": "llm-native-sql-confusion",
      "description": "Native SQL構文をOpen SQLコンテキストで使用",
      "severity": "error",
      "pattern": "SELECT ... JOIN ... ON ... (non-OpenSQL syntax)",
      "explanation": "LLMは標準SQLの知識をABAPに適用しがち"
    },
    {
      "id": "llm-python-loop-pattern",
      "description": "Python的なループパターン（indexベースのLOOP）",
      "severity": "info",
      "pattern": "LOOP with SY-TABIX manipulation instead of LOOP AT ... ASSIGNING",
      "explanation": "LLMはfor-in-range的なパターンに引きずられる"
    },
    {
      "id": "llm-nonexistent-class",
      "description": "存在しない標準クラス/メソッド名の参照",
      "severity": "error",
      "pattern": "CALL METHOD of unknown CL_* class",
      "explanation": "LLMはもっともらしいクラス名を生成するが存在しないことがある"
    },
    {
      "id": "llm-dynamic-typing",
      "description": "暗黙的な型変換に依存したコード",
      "severity": "warning",
      "pattern": "FIELD-SYMBOL or DATA without explicit type",
      "explanation": "動的型付け言語の癖が出ている可能性"
    }
  ]
}
```

### ルールの実装方針

- abaplintのASTを走査してパターンマッチング
- abaplintの既存ルールと重複するものは除外（abaplintに任せる）
- LLM特有のパターンに特化したルールのみ独自実装
- コミュニティからのルール追加をPR受付（JSON追加のみで拡張可能）

---

## サンプルコードライブラリ

Playgroundモードで選択できるプリセットサンプル。ABAP学習と動作確認の両方に使える。

### カテゴリ

1. **Hello World & 基本構文**
   - WRITE文、変数宣言、条件分岐、ループ
2. **内部テーブル操作**
   - STANDARD / SORTED / HASHED TABLE
   - LOOP AT ... ASSIGNING / REF TO
   - LINE_EXISTS, REDUCE, VALUE
3. **文字列処理**
   - CONCATENATE vs &&
   - CONDENSE, TRANSLATE, SHIFT
   - 正規表現（CL_ABAP_REGEX相当の範囲で）
4. **OOの基本**
   - CLASS定義、メソッド、インターフェース
   - 継承、多態性
5. **モダン構文ショーケース**
   - インラインデータ宣言
   - メソッドチェーン
   - FOR式、REDUCE
   - CONV, COND, SWITCH
6. **レガシー vs モダン比較**
   - 同じ処理をレガシーとモダンで並べて表示

---

## MVP定義（Phase 1）

最小限で価値を出せるスコープ:

**Phase 1 は完了し、abapdojo.com で稼働中。** Phase 2 は AI Validator のみ実装済みで、
Modernizer は未着手（このドキュメントの Mode 3 は設計のみ）。

### 含む
- [x] Monaco Editor with ABAP syntax highlighting
- [x] abaplint integration (リアルタイムリント)
- [x] ▶ Run (transpile + execute + output display)
- [x] 5-10個のサンプルコードプリセット（6個）
- [x] URL hash sharing
- [x] レスポンシブデザイン（モバイル閲覧可能）

### Phase 2
- [x] AI Validator モード（LLM Pitfall Detector — ルール4件）
- [ ] Modernizer モード（diff view付き）
- [ ] PWA + オフライン対応
- [ ] サンプルコード拡充（20-30個）

### Phase 3
- [ ] カスタムabaplintルール設定（ユーザーがルールを選択）
- [ ] コードスニペットの保存・共有（localStorage or optional backend）
- [ ] ABAP Unit テスト実行対応（transpiler経由）
- [ ] コミュニティルール投稿機能

---

## 名前について

**ABAP Dojo** — 道場のメタファー。
- 「練習する場所」「型を学ぶ場所」という意味でPlayground + 学習を包含
- 日本語圏・英語圏どちらでも通じる
- dojo.dev とかは取れないだろうが、abap-dojo.dev あたりは候補
- 他の候補: ABAP Sandbox, ABAP Lab, tryabap

---

## セキュリティ・秘匿性の考慮

- **コードは一切サーバーに送信されない**（完全クライアントサイド）
- Analytics（もし入れるなら）もコード内容は収集しない
- URL共有機能ではコードがURLに含まれるため、共有時の注意喚起UIを表示
- LLM APIへの送信なし（静的ルールベースのみ）

---

## 競合・類似ツール

| ツール | 構文チェック | 実行 | LLM検証 | モダン化 | SAPシステム不要 |
|---|---|---|---|---|---|
| playground.abaplint.org | ✅ | ❌ | ❌ | ❌ | ✅ |
| SAP BTP Trial | ✅ | ✅ | ❌ | ❌ | ❌（要契約）|
| Joule for Developers | ✅ | ✅ | 部分的 | ✅ | ❌（要SAP）|
| ABAP Cloud Dev Trial (Docker) | ✅ | ✅ | ❌ | ❌ | △（要Docker）|
| **ABAP Dojo** | ✅ | ✅ | ✅ | ✅ | ✅ |

---

## 開発メモ

### abaplintのブラウザ利用に関する注意

```typescript
// @abaplint/core のブラウザ利用例
import { Registry, MemoryFile, Config } from "@abaplint/core";

const config = Config.getDefault();
const registry = new Registry(config);
registry.addFile(new MemoryFile("ztest.prog.abap", sourceCode));
await registry.parseAsync();
const issues = registry.findIssues();
// issues: Array<Issue> — 各issueにmessage, severity, start/end positionあり
```

```typescript
// @abaplint/transpiler のブラウザ利用例
import { Transpiler } from "@abaplint/transpiler";

const transpiler = new Transpiler();
const result = await transpiler.run(/* ITranspilerOptions */);
// result.js — トランスパイルされたJavaScript
// eval or Function() で実行（sandboxed iframe推奨）
```

### Web Worker設計

重い処理（パース・リント・トランスパイル）はWeb Workerに逃がす。

```
Main Thread          Web Worker
    │                    │
    ├─ source code ─────►│
    │                    ├─ parse
    │                    ├─ lint
    │                    ├─ transpile
    │◄── results ────────┤
    │                    │
```

Comlink等を使ってWorkerとの通信をPromiseベースで簡潔にする。

### トランスパイルコードの実行サンドボックス

安全性のため、トランスパイルされたJSは sandboxed iframe 内で実行する。
WRITE文の出力はpostMessageでメインスレッドに返す。

---

## Claude Code向けの実装ガイダンス

このプロジェクトをClaude Codeで実装する場合の推奨手順:

1. `npm create vite@latest abap-dojo -- --template react-ts` でプロジェクト初期化
2. `@abaplint/core`, `@abaplint/transpiler`, `@abaplint/runtime` をインストール
3. まずMonaco Editor + abaplint lint のみで動く最小Playgroundを作る
4. 次にtranspiler統合（▶ Run機能）
5. その後、モード分割（Validator / Modernizer）を段階的に追加

### ブラウザバンドル時の注意

- abaplintパッケージはNode.js前提の部分がある可能性。Viteのビルドで問題が出たらpolyfill設定を確認
- Monaco Editorはchunkが大きいのでlazy loadを検討
- Web Worker内でのimportはViteの `?worker` suffixを使う

---

## Go-to-Market 戦略

### 市場概観

- SAPは世界180カ国以上、35万〜44万社以上の顧客を持つ
- 米国だけでABAP開発者は約4,255人（Zippia調査）。グローバルでは推定数万〜十数万人
- ABAP開発者の平均年収は$85K〜$130K（米国）。高単価ニッチ市場
- 大学でABAPを教える機関はほぼ皆無。学習は企業内研修 or 独学が主流
- ABAP Academyが提供していた無料オンラインエディタは2023年10月に利用不可。後継なし
- SAP Communityフォーラムでは「ABAPをオンラインで練習できる場所」を探す投稿が複数あり、回答は「Exercism以外にほぼない」

**結論: 需要はあるが供給が途絶えている。競合ほぼ空白の市場**

### 獲得チャネル：検索が主力

ABAPのような専門ツールは「友達に勧められる」より「困って検索する」パターンが圧倒的。
検索ベースのGTMが最も効率的。

#### 狙うべき検索クエリ群

| クエリ群 | 意図 | 競合状況 |
|---|---|---|
| `ABAP online editor` / `ABAP playground` | 書いて試したい | ABAP Academy消滅、ほぼ空白 |
| `ABAP code checker online` / `ABAP syntax check` | コードを検証したい | abaplint playgroundのみ（UX弱い） |
| `ABAP practice online` / `learn ABAP without SAP` | 学習環境が欲しい | Exercismのみ |
| `ABAP AI code generator` / `LLM ABAP validate` | AI生成コードを確認したい | 2026年の新しいニーズ、競合ゼロ |
| `ABAP legacy to modern syntax` / `ABAP modernization` | S/4HANA移行 | SAP公式ツールのみ（要SAPシステム） |

上3つは検索ボリュームは小さいが**コンバージョン率が極めて高い**（そのツールが欲しくて検索している）。

#### SEOコンテンツ戦略

ツール単体だと検索流入に限界があるため、ブログ/ドキュメントページで長尾キーワードを拾い、ツールに誘導する構造を作る。

**コンテンツカテゴリ：**

1. **サンプルコード解説ページ**（各サンプルに1ページ）
   - 例：「ABAP internal table LOOP examples — try it live」
   - ページ内にPlaygroundへのリンク（サンプル付き）を埋め込む
   - 検索クエリ：「ABAP LOOP AT example」「ABAP READ TABLE INDEX」等

2. **LLM Pitfall解説ページ**（各ルールに1ページ）
   - 例：「Why LLMs confuse STRING and CHAR in ABAP」
   - AI時代特有の検索クエリを拾う新しいSEOカテゴリ
   - 検索クエリ：「ABAP AI generated code wrong」「ChatGPT ABAP errors」等

3. **レガシー→モダン変換ガイド**（構文パターンごと）
   - 例：「MOVE vs assignment operator — ABAP syntax migration guide」
   - S/4HANA移行需要を直接拾う
   - 検索クエリ：「ABAP MOVE deprecated」「ABAP 7.40 inline declaration」等

4. **比較・まとめ記事**
   - 「ABAP online tools comparison 2026」
   - 「How to practice ABAP without SAP system」

**コンテンツの言語戦略:**
- 英語がメイン（ABAP開発者のグローバル分布：インド、ドイツ、米国、ブラジル等）
- 日本語でもZennに記事投稿（国内SAPコンサル市場向け）
- ドイツ語は将来オプション（SAP本拠地、ABAP開発者数が多い）

#### コミュニティチャネル

| チャネル | アクション | 期待効果 |
|---|---|---|
| SAP Community | ブログ投稿（ツール紹介 + 技術解説） | ABAP開発者の中心地。1本の記事で認知が取れる |
| LinkedIn | SAP系インフルエンサーへのリーチ | SAPコミュニティはLinkedIn活用率が高い |
| dev.to | 英語圏の開発者向け記事 | ABAP記事は競合がほぼなく目立つ |
| Zenn | 日本語圏の開発者向け記事 | 国内SAPコンサル・SIer向け |
| GitHub | abaplintエコシステムとの相互リンク | 技術的信頼性の獲得 |
| Exercism ABAP track | 連携・相互リンク | 同じtranspiler技術基盤の兄弟ツール |

**キーパーソン:** Marian Zeis（ABAP MCP Server、LLMベンチマーク）、Lars Hvam（abaplint/abapGit作者）。
これらの人に知ってもらえれば、SAP Community内での拡散力が大きい。

### 収益化ロードマップ

#### 原則

- LLM APIは使用しない（完全クライアントサイド）→ 運営コスト≒0
- まず無料で公開し、ユーザーと信頼を獲得してから課金を導入
- ABAPのユーザーは企業所属が大半 → 少額課金は経費処理しやすい

#### Tier 1: 無料のまま持続（運営コスト≒0）

静的ホスティング（Cloudflare Pages等）のみ。

- GitHub Sponsorsで任意の支援を受ける
- abaplintと同じモデル。コミュニティベースの持続
- SAPコンサル企業からのスポンサーロゴ掲載（将来オプション）

#### Tier 2: Freemium — 個人Pro課金（月$9-15）

| 無料 | Pro |
|---|---|
| Playground（実行あり） | カスタムlintルール設定（ルールON/OFF、閾値調整） |
| AI Validator（基本ルール5-10個） | 拡張LLM Pitfallルール（全ルール） |
| Modernizer（基本変換） | バージョン別変換マトリクス（7.40→7.50→7.57→Cloud） |
| サンプルコード5個 | 全サンプル + 逆引きリファレンス |
| URL hash共有 | コードスニペット保存（クラウド同期） |
| | チームでのスニペット共有 |
| | 優先的な新ルール追加 |

**収益試算:** 1,000有料ユーザー × $12/月 = $144K/年
ABAP開発者の年収（$85K〜$130K）に対して月$12は極めて低い。企業経費としても個人としても障壁が低い。

#### Tier 3: B2B — エンタープライズライセンス

SAPコンサル企業・研修機関向けの最大の収益機会。

**ターゲット企業:**
- グローバル: Accenture, Deloitte, TCS, Infosys, Capgemini等のSAP部門
- 日本: NTTデータ, 富士通, NEC, アビームコンサルティング, SAPジャパン等
- SAP研修機関: ABAP Academy, GTR Academy等

**エンタープライズ版の追加機能:**
- 独自サンプルコード / 課題セットの管理（研修カリキュラム対応）
- 受講者の進捗トラッキング
- 自社コーディング規約に基づくカスタムlintルール
- セルフホスティング版（オンプレ or プライベートクラウド）
- SSO対応

**価格感:** 年間$5K〜$50K/企業（研修コスト1人あたり数十万円〜と比較して圧倒的に安い）

#### Tier 4: 間接収益

- ABAP Dojoの認知度をベースにした技術記事の有料公開（Zenn等）
- ABAPコミュニティでの発信力を活かした顧問・受託
- ABAP × AI の知見を活かしたコンサルティング

### GTM実行の優先順位

```
Phase 1 (MVP公開後 0-3ヶ月)
├── SEOコンテンツ 5-10本を公開
│   ├── サンプルコード解説 x 3-5本
│   ├── LLM Pitfall解説 x 2-3本
│   └── 「ABAP without SAP」系まとめ x 1-2本
├── SAP Communityにブログ投稿 x 1本
├── dev.to + Zenn に紹介記事 x 各1本
├── GitHub README + Sponsors設定
└── Google Search Console / Analytics設置

Phase 2 (3-6ヶ月)
├── SEOコンテンツを20本以上に拡充
├── LinkedIn でSAP系インフルエンサーにリーチ
├── Marian Zeis / Lars Hvam にツール紹介（GitHub issue or DM）
├── ユーザーフィードバック収集（GitHub Discussions）
└── Pro機能の設計（実際の利用パターンを見てから決定）

Phase 3 (6-12ヶ月)
├── Pro課金の導入
├── B2Bパイロット（1-2社のSAPコンサル企業と研修利用テスト）
├── カンファレンス登壇検討（SAP TechEd, DSAG等）
└── ドイツ語コンテンツ追加（オプション）
```

### KPI

| 指標 | Phase 1目標 | Phase 2目標 | Phase 3目標 |
|---|---|---|---|
| 月間ユニークユーザー | 500 | 3,000 | 10,000 |
| SEOコンテンツ本数 | 10 | 20 | 40+ |
| GitHub Stars | 50 | 200 | 500 |
| Pro課金ユーザー | - | - | 100+ |
| B2Bパイロット | - | - | 1-2社 |

### リスクと対策

| リスク | 対策 |
|---|---|
| SAPが公式に同等ツールを出す | 「完全クライアントサイド＝秘匿性」「SAP非依存」で差別化。SAPツールは必ずSAPエコシステム内に閉じる |
| abaplintの開発が停滞 | MITライセンスなのでfork可能。コアコントリビュータになって影響力を持つのが理想 |
| ニッチすぎてスケールしない | ABAPは「小さいが高単価」市場。数千人のアクティブユーザーで十分な収益が成立する |
| LLMの精度向上でValidator不要に | LLMが完璧にABAPを書ける日が来ても、実行＋構文チェック環境としての価値は残る |
