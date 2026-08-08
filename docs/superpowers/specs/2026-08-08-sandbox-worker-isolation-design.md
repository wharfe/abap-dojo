# サンドボックス実行のスレッド分離（#28）

**日付**: 2026-08-08
**対象 issue**: #28（主）、#41（従・自然解消）
**状態**: 設計承認済み

---

## 何を直すのか

`REPORT ztest. DO. ENDDO.` を Run すると、**タブ全体が二度と応答しなくなる**。
ユーザーにできることはタブを閉じることだけ。

原因は `src/components/ExecutionSandbox.tsx` が `srcdoc` の
`sandbox="allow-scripts"` iframe でトランスパイル済み JS を実行していること。
srcdoc iframe は親のサイトを継承するため site isolation で別プロセスに分離されず、
**親ページと同じメインスレッドで動く**。CPU を握るループはそのスレッドを占有するので、
`EXECUTION_TIMEOUT_MS`（5 秒）の `setTimeout` に順番が回ってこない。
iframe を `remove()` するコードも同じスレッド上にある。

つまり現在のウォッチドッグは、**それが存在する唯一の理由に対して無力**。
止められるのは「非同期的に長い実行」だけ。

### 計測への影響

GA4 の `run_result` に `timeout` がほぼ無いのは、無限ループを書く人がいないからではなく
**イベントを送る前にページが死ぬから**。`run_click` と `run_result` の差にもこの分が含まれる。
この2つは #28 が直るまで正しく読めない（CLAUDE.md に記載済み）。

---

## 実測で確認したこと

設計の土台になる挙動は、推測ではなく**本番（abapdojo.com、実 CSP 下）で Playwright で実測**した。
再現スクリプトの考え方は「テスト」節に記載。

| 検証項目 | 結果 |
|---|---|
| opaque origin の iframe 内で `blob:` Worker を構築できるか | ✅ できる |
| その Worker が実際に走るか | ✅ 走る |
| **Worker が無限ループ中に iframe のメインスレッドが生存するか** | ✅ 生存する |
| `worker.terminate()` で停止できるか | ✅ できる |
| 親ページが応答し続けるか | ✅ する（現状はここで死ぬ） |
| Worker 内で `new AsyncFunction` が動くか（CSP `unsafe-eval` の2ホップ継承） | ✅ 動く |
| CSP 違反が出ないか | ✅ 出ない（`worker-src 'self' blob:` が既にある） |

### ⚠ 同時に判明した制約: 出力はバッチしなければならない

Worker から 5000 件の `postMessage` を連続で流したところ、
**iframe 側の 20ms タイマーがストリーム中に 1 回しか動かなかった**。
1 行ずつ送るとメッセージの洪水でイベントループが飽和し、弱い形でフリーズが再発する。
親へ中継すれば同じことが親でも起きる。

**したがって逐次送信は「行ごと」ではなく「バッファしてフラッシュ」で実装すること。**
これは好みではなく実測から来る要件。

---

## アーキテクチャ

```
現在:
  親メインスレッド ──── srcdoc iframe（同一スレッド。ここで実行 → 凍る）

変更後:
  親メインスレッド ──── srcdoc iframe（同一スレッド。中継役に徹する）
                            └──── blob Worker（専用スレッド。ここで実行）
```

iframe は**残す**。opaque origin による隔離（DOM / localStorage / cookie に触れない）が
このアプリの脅威モデルの中核であり、共有 URL 経由で他人のコードが動く前提だから。
Worker 単体では origin 隔離を失う。別オリジンの iframe は確実だがドメインが 1 つ増える
（#28 で却下済み、判断は据え置き）。

iframe の役割が**実行から監督へ**変わる。Worker を作り、双方向にメッセージを中継し、
停止要求で `terminate()` を呼ぶ。iframe のスレッドは空いたままなので、
親のウォッチドッグも Stop ボタンも普通に効く。

---

## コンポーネント

### 1. `src/sandbox/executor.js`（新規）

Worker 本体。現在 `ExecutionSandbox.tsx` に 118 行のテンプレート文字列として
埋め込まれているコードを実ファイルに出す。`?raw` で読み込み、
`runtime-bundle.js` と連結して blob 化する。

責務:
- `@abaplint/runtime` の ABAP インスタンス生成（出力捕捉用コンソール付き）
- 渡された JS の実行
- 出力のバッファリングとフラッシュ
- 完了 / エラーの通知

**責務から外すもの**: JS の前処理（下記 2 へ移す）。

### 2. `src/utils/prepareTranspiledJs.ts`（新規）

今サンドボックス内でやっている正規表現変換を純関数として切り出す:

```
js.replace(/^import\s+.*$/gm, "")
js.replace(/^export\s+/gm, "")
js.replace(/globalThis\.abap\s*=\s*new\s+runtime\.ABAP\(\);?/g, "")
```

テンプレート文字列の中にある限り vitest から到達できない。
トランスパイラ出力の形に依存する脆い部分なので、テストが届く場所に置く。
親スレッドで実行し、Worker には前処理済みの JS を渡す。

### 3. `src/components/ExecutionSandbox.tsx`（改修）

責務は変わらない（実行のライフサイクル、`requestId` の所有、ウォッチドッグ）。
変更点:
- ハンドルに `stop()` を追加
- ウォッチドッグ `5000ms` → `15000ms`
- iframe 内 HTML の生成は executor.js の連結に置き換え
- 出力メッセージがバッチ（行の配列）になる

### 4. `src/components/Toolbar.tsx` / `src/App.tsx`（改修）

実行中は Run を Stop に切り替える。押すと `sandboxRef.current.stop()`。

---

## メッセージフロー

### 実行

```
親  ──{execute, js, requestId}──▶  iframe
                                    └──{run, js}──▶  Worker
Worker ──{lines: [...], requestId}──▶ iframe ──▶ 親    （下記のフラッシュ条件）
Worker ──{done, outputLines}────────▶ iframe ──▶ 親
Worker ──{error, message}───────────▶ iframe ──▶ 親
```

### 停止（Stop ボタン / ウォッチドッグ）

```
親 ──{stop, requestId}──▶ iframe ──▶ worker.terminate()
                          iframe ──{stopped, outputLines}──▶ 親
```

親による iframe の `remove()` はバックストップとして残す。
親スレッドが空いているので、これも今度は実際に効く。

**停止時も、それまでにフラッシュ済みの出力は画面に残す。**
「5 秒で殺されたが何も見えない」が今の最悪の体験なので、ここが体験上の主目的。

### フラッシュ条件と上限（具体値）

- **フラッシュ**: 500 行たまるか、前回フラッシュから 50ms 経過したか、早い方。
  1 メッセージ 1 行は上の実測で否定されている。
- **表示上限**: 10,000 行（現行と同じ）。到達後は行を送るのをやめ、
  打ち切りの通知を 1 回だけ送る。
- **バッファ上限**: 1 MB（現行 `MAX_OUTPUT_BYTES` と同じ）。

**`output_lines` は「送った行数」ではなく「実際に produce された行数」を維持する。**
これは既存の不変条件（CLAUDE.md に明記）で、表示が 10,000 行で止まるため
送信数を数えると暴走ループが全部きっかり 10,001 と報告されてしまう。
ストリーミング化でこれを壊さないこと — Worker 側で真のカウンタを別に持ち、
終端メッセージ（`done` / `stopped`）でそれを送る。

---

## エラーハンドリング

| 事象 | 扱い |
|---|---|
| Worker の構築に失敗 | `load_error`（ランタイムを積めなかった＝こちらの失敗） |
| Worker 内で例外 | `runtime_error`（既存どおり） |
| Stop ボタン | 新しい outcome が要る（下記） |
| ウォッチドッグ発火 | `timeout`（既存。ここで**初めて実際に発火するようになる**） |
| 他方のモードに横取りされた | `cancelled`（既存） |

### outcome の追加について

ユーザーが明示的に止めた実行は `timeout` でも `cancelled` でもない。
`cancelled` は「他方のモードの実行に横取りされた」を指す既存の意味を持っており、
これを流用すると「ユーザーが止めた」と「システムが奪った」が混ざる。
`syntax_error` / `transpile_error` を分けたのと同じ理由で分けるべき。

→ **`stopped` を `RunOutcome` に追加する。**

GA4 のカスタム定義は変更不要（`outcome` は登録済みディメンションで、
**値の追加**には再登録がいらない。パラメータの新設だけが再登録を要する）。

伴って更新が要る箇所:
- `RunOutcome` と `RUN_OUTCOMES`（`src/utils/analytics.ts`）
- CLAUDE.md の outcome 表。「eight outcomes」という記述が 9 になる
- `analytics.test.ts` の「App.tsx の全 exit path が allowlist を通る」テスト

ウォッチドッグの 15 秒は「10〜15 秒」の上端を採った値。モバイル実機での確認（下記）で
短くする判断があり得る。

---

## テスト

### vitest では検出できない

このバグは jsdom にスレッドが無いため**構造的にユニットテストで捕まえられない**。
「テストが通ったから直った」を根拠にしてはいけない類の変更。

### 追加するテスト

1. **`src/utils/prepareTranspiledJs.test.ts`** — 純関数の変換。
   実際のトランスパイラ出力の形（`import runtime from "@abaplint/runtime";` 等）に対する
   回帰テスト。正規表現の脆さが表に出る場所。

2. **Playwright（新規・本番ビルドに対して）** — この repo に常設の Playwright テストは今無い。
   `npm run build` + `vite preview` に対して:
   - `DO. ENDDO.` を Run → **ページが応答し続ける**（短い timeout の `page.evaluate` を
     1 秒ごとにポーリングし、フリーズをハングではなくエラーとして観測する）
   - 終端イベントが来る（`timeout` outcome）
   - **フラッシュ済みの出力が画面に見える**（`DO. WRITE 'x'. ENDDO.` で確認）
   - Stop ボタンで即座に止まる

   CSP は `vite preview` では適用されない（CLAUDE.md 記載）。CSP 由来の破綻は
   Cloudflare Pages プレビューでしか出ないので、blob Worker が CSP を通ることは
   **本番プレビュー URL に対しても 1 回確認する**。

### 手動確認

モバイル実機（メインスレッドが遅い環境）で 15 秒ウォッチドッグが妥当か。

---

## スコープ外

- 別オリジン / サブドメインでの実行（#28 で却下、判断据え置き）
- #43（`transpile_reason` の `other` とカテゴリ間汚染）
- #45（`runtime_error` に未対応構文が混ざっている）— ただし本変更で
  「未対応構文の throw」が Worker 側に移るので、実装時に経路を確認すること
- Validator 経路の作り変え（動作維持のみ。Validator も同じサンドボックスを使う）

## 自然に解消するもの

- **#41** — `runtime_error` / `timeout` で `output_lines` が必ず 0 になる問題。
  行を数えながら流すので、異常終了しても実数が入る。実装時に #41 をクローズする。

---

## 依存関係

このブランチは `feature/transpile-error-diagnostics`（PR #46）の上に積まれている。
`App.tsx` の `endRun` が両方で変わるため。

**#46 をマージしたら、この PR の base を `main` に付け替えること。**
親 PR のマージ時にベースブランチが削除されるので、先に付け替えないと子 PR が壊れる。
