# AI Validator Mode — 設計仕様書

## 概要

ABAP DojoのPhase 2機能。LLMが生成したABAPコードを一括検証するモード。
abaplintの構文チェック・リントに加え、LLM特有のミスパターンを検出するLLM Pitfall Detectorを提供する。

## 設計方針

### ハイブリッドモード（Playgroundとの関係）

PlaygroundモードとEditorPanel、abaplintWorker、ExecutionSandboxを共有する。
OutputパネルのみモードごとにValidationReportと排他切り替え。

理由:
1. **GTM/SEO** — 「ABAP AI code validator」で検索してくる人が着地するページに専用UIが必要。モードとして独立することで `/validator` 等のランディングページも将来作れる
2. **情報設計** — 通常のlint結果一覧とValidation Reportは構造が異なる。OutputPanelに混ぜると情報設計が崩れる

### モード切り替えUI

ヘッダーにタブを配置。ドロップダウンではなくタブにすることで、AI Validatorの存在を初訪問で認知させる。

```
┌──────────────────────────────────────────────────────┐
│  ABAP Dojo    [ Playground | AI Validator ]          │
├──────────────────────────────────────────────────────┤
```

将来Modernizerが加わっても3タブなら収まる。4つ以上になった時点でドロップダウンを検討。

### URLルーティング

Phase 2ではhashベース: `#mode=validator&code=...`

Playgroundとの互換性:
- `#code=...` → Playgroundモード（既存動作を維持）
- `#mode=validator&code=...` → AI Validatorモード

## LLM Pitfall Detector

### 初期ルール（4ルール）

| ルールID | severity | 検出方法 | 実装難易度 |
|---|---|---|---|
| `llm-string-char-confusion` | warning | AST: DATA宣言のTYPE属性を走査 | 低 |
| `llm-python-loop-pattern` | warning | AST: LOOP内のSY-TABIX操作パターン検出 | 中 |
| `llm-dynamic-typing` | warning | AST: FIELD-SYMBOLやDATAの型指定欠落を検出 | 低 |
| `llm-hallucinated-class` | error | abaplintのunknown type検出結果をリラベル | 低（abaplint依存） |

除外: `llm-native-sql-confusion` — abaplintがSQL構文チェックをカバー済み。abaplintと重複するルールを持つと同じ問題に2つのイシューが出て混乱する。

### `llm-hallucinated-class` の逆引きアプローチ

CL_*クラスの正規リストは持たない。代わりに:
1. abaplintが「不明な型/クラス」と報告した結果を取得（`unknown_types`ルールのイシュー）
2. `CL_`、`IF_`、`ZCL_`、`ZIF_`プレフィクスを持つ識別子をフィルタ（これらはSAP標準クラス/インターフェースまたはカスタムクラスの命名規約）
3. 「LLMが架空のクラス名を生成した可能性があります」というコンテキスト付きメッセージに変換

メンテフリーで、abaplintのパーサー進化に自動追従する。

### ルール定義の構造

二層構造: ルール定義（TS）+ マッチャー関数（TS）

ルール定義は型安全な単一TSファイルで管理する。初期4ルールの段階ではJSON分離はオーバーエンジニアリング。ルール数が20を超えてコミュニティPRを受けるフェーズになったらJSON分離を検討。

```typescript
// src/rules/definitions.ts
import type { PitfallRule } from "../types/validation";

export const pitfallRules: PitfallRule[] = [
  {
    id: "llm-string-char-confusion",
    severity: "warning",
    message: "STRING used where CHAR may be expected",
    explanation: "LLMs default to STRING like Python's str...",
    suggestion: "DATA lv_name TYPE char40. を使用してください",
  },
  // ...
];
```

マッチャー関数はルールIDに対応する関数をexportする:

```typescript
// src/rules/matchers/stringCharConfusion.ts
export function matchStringCharConfusion(ast: INode, registry: Registry): PitfallMatch[];
```

## Validation実行フロー

### 段階的実行

「Validate」ボタン押下で5段階を順に実行。各段階の結果をリアルタイムにUIに反映。

```
Worker内のhandleValidate(source):

1. postMessage({ stage: "syntax", status: "running" })
   → parse → syntax結果を返す

2. postMessage({ stage: "lint", status: "running" })
   → findIssues → lint結果を返す
   → ★ LLM Pitfallルールも同時実行（ASTは同じものを使う）
   → lint結果とpitfall結果をまとめて返す

3. IF syntax OK:
     postMessage({ stage: "transpile", status: "running" })
     → transpile → 結果を返す（transpile済みJSを含む）
   ELSE:
     postMessage({ stage: "transpile", status: "skipped" })

--- ここからmain thread ---

4. IF transpile OK:
     → main threadがExecutionSandbox.execute(js)
     → sandbox結果をvalidation reportに統合
   ELSE:
     stage: "runtime", status: "skipped"

5. main threadが全stage結果からsummaryを構築して表示
   （Workerの仕事はstage 3で完了。summaryはmain threadが計算する）
```

### Worker/Main thread責任分担

- **Worker**: stages 1-3（syntax, lint+pitfalls, transpile）
- **Main thread**: stage 4（runtime — 既存のExecutionSandboxをそのまま使用）+ stage 5（summary計算 — 全stageの結果を集約）

新しい通信チャネルは不要。既存アーキテクチャと一致。

## メッセージ型

### WorkerRequest拡張

```typescript
// 既存
| { type: "lint"; source: string }
| { type: "transpile"; source: string }
// 追加
| { type: "validate"; source: string }
```

### WorkerResponse拡張

```typescript
// 既存
| { type: "lint-result"; issues: LintIssue[] }
| { type: "transpile-result"; js: string }
| { type: "transpile-error"; message: string; line?: number }
// 追加
| { type: "validate-progress"; stage: ValidationStage; status: "running" | "skipped" }
| { type: "validate-stage-result"; stage: ValidationStage; result: StageResult }
// validate-doneはWorkerからは送信しない。main threadが全stage結果からsummaryを計算。
```

### 型定義

```typescript
// src/types/validation.ts

type ValidationStage = "syntax" | "lint" | "transpile" | "runtime";

type StageStatus = "pending" | "running" | "pass" | "warn" | "fail" | "skipped";

interface StageResult {
  status: StageStatus;
  issues?: LintIssue[];       // lint stage
  pitfalls?: PitfallMatch[];  // lint stage (LLM pitfalls)
  js?: string;                // transpile stage (for runtime execution)
  error?: string;             // any stage on failure
}

interface ValidationSummary {
  overall: "pass" | "warn" | "fail";
  totalIssues: number;
  stages: Record<ValidationStage, StageStatus>;
}

interface PitfallRule {
  id: string;
  severity: "error" | "warning" | "info";
  message: string;
  explanation: string;
  suggestion: string;
}

interface PitfallMatch {
  ruleId: string;
  message: string;
  explanation: string;
  suggestion: string;
  severity: "error" | "warning" | "info";
  startLine: number;
  startCol: number;
  endLine: number;
  endCol: number;
}
```

## Validation Report UI

### アコーディオン展開

5つのUI表示行。クリックで詳細展開。

内部のValidationStage（4段階）とUI表示行（5行）の対応:

```
ValidationStage (内部)    →  UI表示行
─────────────────────────────────────
syntax                    →  ✅ Syntax
lint                      →  ⚠️ Lint (3 issues)
  └ (同時実行)            →  🤖 LLM Pitfalls (2 issues)
transpile                 →  ✅ Transpile
runtime                   →  ✅ Runtime
```

lintステージの結果が2つのUI行に分かれて表示される。ValidationReportコンポーネントはStageResultの`issues`（通常lint）と`pitfalls`（LLM Pitfall）をそれぞれ別のアコーディオンセクションとして描画する。

各セクションの表示形式:
- **Syntax / Transpile / Runtime**: OK/NG表示のみ。展開時はエラーメッセージ
- **Lint**: コンパクト1行表示（`⚠ L12: prefer inline declaration [rule_key]`）
- **LLM Pitfalls**: リッチ表示。explanation + suggestion をインラインで表示。紫系の視覚的区別

LLM Pitfallだけリッチにする理由: 「なぜLLMがこのミスをするか」の解説が差別化の核。通常lintはルール名で検索すれば詳細が分かるが、LLM Pitfallの価値はコンテキスト解説そのもの。

### 総合判定

- **PASS**: エラーなし、warning 0件
- **WARN**: errorなし、warning 1件以上
- **FAIL**: error 1件以上

### 行ジャンプ（Phase 2.1 — 後追い）

各イシュークリックでエディタの該当行にジャンプ＋ハイライト。Monaco Editorの`revealLineInCenter` + `deltaDecorations`で実装。初回リリースには含めない。

## コンポーネント構成

### 新規ファイル

```
src/
  components/
    ValidationReport.tsx    # Validation Report UI（アコーディオン）
    ModeHeader.tsx          # ヘッダータブ（Playground | AI Validator）
  rules/
    definitions.ts          # PitfallRule定義（4ルール、単一TSファイル）
    detector.ts             # LlmPitfallDetector本体（ASTマッチ実行）
    matchers/
      stringCharConfusion.ts
      pythonLoopPattern.ts
      dynamicTyping.ts
      hallucinatedClass.ts
  types/
    validation.ts           # ValidationReport関連の型定義
```

### 変更ファイル

```
src/
  App.tsx                   # モード状態管理、Validate実行フロー追加
  components/Toolbar.tsx    # Validateボタン追加（Validatorモード時）
  workers/abaplintWorker.ts # handleValidate追加
  types/messages.ts         # WorkerRequest/Response拡張
```

### 共有（変更なし）

```
src/
  components/EditorPanel.tsx
  components/ExecutionSandbox.tsx
  components/SampleSelector.tsx
  utils/debounce.ts
  utils/urlShare.ts
```
