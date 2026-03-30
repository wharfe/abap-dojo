# MVP設計: Playground Mode

## 概要

ブラウザ上でABAPコードを書いて、リントして、実行できるPlayground。完全クライアントサイド。

## アーキテクチャ

```
Browser (Main Thread)
├── React App (Vite)
│   ├── Monaco Editor (ABAP syntax highlighting)
│   ├── Output Panel (WRITE出力 + lint issues)
│   ├── Toolbar (Run / Lint / Sample selector)
│   └── URL hash encoder/decoder (共有機能)
│
├── Web Worker (abaplint)
│   ├── @abaplint/core — parse + lint (163 rules)
│   └── @abaplint/transpiler — ABAP → JS変換
│
└── Sandboxed iframe (実行環境)
    ├── @abaplint/runtime
    ├── トランスパイル済みJSを実行
    └── WRITE出力をpostMessageで親に返す
```

## データフロー

### リアルタイムリント

1. ユーザーがコード入力
2. Monaco `onDidChangeModelContent` → **300-500ms debounce** → Workerへソースコード送信
3. Worker: `Registry.parseAsync()` → `findIssues()` → lint結果を返す
4. Main thread: lint結果をMonaco Editor のdiagnostics markersに反映

debounceは300-500ms。タイピング中に毎キーストロークWorkerへメッセージを送るとキューが詰まるため。

### コード実行

1. Runボタンクリック → Workerへtranspileリクエスト
2. Worker: `Transpiler.run()` → transpile済みJSを返す
3. Main thread: JSをsandboxed iframeにpostMessageで送信
4. iframe: JSを実行、WRITE出力をpostMessageで親に返す
5. Main thread: Output Panelに表示

### エラーハンドリング

- **transpileエラー**: Workerから返されるエラーをOutput Panelに表示（行番号付き）
- **ランタイムエラー**: iframeからのpostMessageでエラー情報を受信して表示
- **実行タイムアウト**: iframe送信後 **5秒のtimeout**。超過時はiframeをterminate（removeして再生成）し「Execution timeout」エラーを表示。無限ループ対策としてMVPから必須

## コンポーネント構成

| コンポーネント | ファイル | 責務 |
|---|---|---|
| `App` | `src/App.tsx` | レイアウト、状態管理（ソースコード、出力、lint issues） |
| `EditorPanel` | `src/components/EditorPanel.tsx` | Monaco Editor wrapper、lint marker反映、debounce付きonChange |
| `OutputPanel` | `src/components/OutputPanel.tsx` | 実行結果表示、lintイシュー一覧（タブ切り替え） |
| `Toolbar` | `src/components/Toolbar.tsx` | Run / Sample選択 / Share ボタン |
| `SampleSelector` | `src/components/SampleSelector.tsx` | プリセットサンプルコード選択ドロップダウン |
| `abaplintWorker` | `src/workers/abaplintWorker.ts` | Web Worker: parse + lint + transpile |
| `ExecutionSandbox` | `src/components/ExecutionSandbox.tsx` | sandboxed iframe管理、postMessage通信、timeout制御 |

## Sandboxed iframe設計

- `sandbox="allow-scripts"` のみ。allow-same-originは付与しない
- iframe内にrunner HTMLを埋め込み（srcdoc or blob URL）
- `@abaplint/runtime` はiframe内にバンドル
- 通信プロトコル:
  - 親→iframe: `{ type: "execute", js: "..." }`
  - iframe→親: `{ type: "output", text: "..." }` / `{ type: "error", message: "..." }` / `{ type: "done" }`
- timeout: 5秒。`setTimeout`で管理し、`done`メッセージ受信でクリア。timeout時はiframeをDOMから除去して再生成

## サンプルコード

MVP: 6個。以下の順番で表示。

1. **Hello World** — WRITE文の基本
2. **変数と条件分岐** — DATA宣言、IF/CASE
3. **内部テーブル操作** — LOOP AT / APPEND / READ TABLE
4. **文字列処理** — CONCATENATE, &&演算子
5. **OO基本** — CLASS定義、メソッド呼び出し
6. **モダン構文ショーケース** — インライン宣言、VALUE等

**注意**: サンプル6はtranspiler入力制約（ABAP 7.02ベース）との兼ね合いを実装時に検証する。VALUE式やインライン宣言がtranspilerで直接対応していない場合、downportルールの自動適用をtranspileパイプラインに組み込むか、サンプル内容を7.02準拠に調整する。

## URL共有

- フォーマット: `#code=<base64(deflate(source))>`
- 圧縮: pako (deflate) を使用
- デコード: ページロード時にhashを読み取り、エディタに展開
- URLが長すぎる場合（ブラウザの上限約2000文字）は警告を表示

## Tech Stack

- React + TypeScript (Vite)
- Monaco Editor (`@monaco-editor/react`)
- `@abaplint/core` (v2.115.x)
- `@abaplint/transpiler` (v2.12.x)
- `@abaplint/runtime` (v2.12.x)
- Tailwind CSS
- pako (URL圧縮)

## スコープ外（Phase 2以降）

- AI Validatorモード
- Modernizerモード
- PWA / オフライン対応
- カスタムlintルール設定
- コードスニペット保存
