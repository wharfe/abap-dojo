# SEO対応 & ランディング体験改善 — 設計仕様

## 目的

ABAP Dojoを公開して検索流入を待てる状態にする。初訪問者に「何のサイトか」を一瞬で伝え、SEOインフラを整備し、コンテンツページでロングテールキーワードを獲得する。

## 決定事項サマリ

| 項目 | 決定 |
|------|------|
| ドメイン | `abapdojo.com`（Cloudflare DNS済み） |
| ランディング体験 | 統合型 — コンパクトHero + エディタが1ページ |
| 言語 | 英語メイン + 日本語サブ |
| コンテンツページ実装 | Vite multi-page構成で `/docs` 以下に静的HTML |
| アナリティクス | GA4 (`G-YY1YV51K2X`) + Google Search Console |

## 1. Heroセクション

### 配置

ModeHeaderの直下、Toolbarの上に挿入する新コンポーネント `HeroBanner`。

### コンテンツ

- **タグライン**: "Write, Lint & Run ABAP — In Your Browser"
- **サブテキスト**: "No SAP system required. Validate LLM-generated code. SAPシステム不要の道場。"
- **4つの機能ピル**:
  1. ▶ Execute ABAP（青系 `#1e3a5f`）
  2. ✓ AI Pitfall Detection（緑系 `#1a3a2a`）
  3. ⚡ 163 Lint Rules（黄系 `#3a2a1a`）
  4. 🔒 Safe for Client Code（紫系 `#2a1a3a`）
- **🔒 ピルのhover補足**: "All processing runs in your browser. Your code is never sent to any server."

### 表示/非表示ロジック

- **閉じるボタン**: 右上に `✕` ボタン。クリックで非表示、`localStorage("hero-dismissed")` で記憶
- **URL共有リンク経由**: `#code=...` パラメータ付きURLで来た場合はHero非表示（コードを見に来ている）
- **リピーター**: localStorageに記憶されている場合は非表示

### デザイン

- 背景: `linear-gradient(180deg, #1e293b 0%, #111827 100%)`
- 下部ボーダー: `border-gray-700`
- 高さ: 約120px（スクロール不要でエディタもfirst viewに入る）
- テキスト: gray-100/gray-400系、既存のダークテーマと統一

## 2. SEOメタデータ

### index.html 追加項目

```html
<!-- Canonical -->
<link rel="canonical" href="https://abapdojo.com/" />
<meta name="robots" content="index, follow" />

<!-- Open Graph -->
<meta property="og:type" content="website" />
<meta property="og:title" content="ABAP Dojo — Browser-based ABAP Playground & AI Validator" />
<meta property="og:description" content="Write, lint, and execute ABAP code in your browser. No SAP system required. Validate LLM-generated ABAP with AI pitfall detection." />
<meta property="og:url" content="https://abapdojo.com/" />
<meta property="og:image" content="https://abapdojo.com/og-image.png" />
<meta property="og:site_name" content="ABAP Dojo" />
<meta property="og:locale" content="en_US" />

<!-- Twitter Card -->
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="ABAP Dojo — Browser-based ABAP Playground & AI Validator" />
<meta name="twitter:description" content="Write, lint, and execute ABAP code in your browser. No SAP system required." />
<meta name="twitter:image" content="https://abapdojo.com/og-image.png" />

<!-- Theme -->
<meta name="theme-color" content="#111827" />
```

### JSON-LD 構造化データ

2つのスキーマを `<script type="application/ld+json">` で挿入:

1. **WebApplication**: name, url, applicationCategory("DeveloperApplication"), operatingSystem("Any"), offers(price: "0")
2. **FAQPage**: 3つのQ&A
   - "What is ABAP Dojo?" — ブラウザベースのABAPプレイグラウンド＆バリデーター
   - "Is my code safe?" — 100%クライアントサイド、サーバー送信なし
   - "Do I need an SAP system?" — 不要、ブラウザのみで完結

### favicon

`/public/favicon.svg` — 道場/ABAPをモチーフにしたシンプルなSVGアイコン。ダークテーマに映える配色。

### OG画像

`/public/og-image.png` — 1200x630px。アプリのスクリーンショット風デザイン。タグラインとロゴを含む。

## 3. 静的ファイル

### robots.txt

```
User-agent: *
Allow: /

Sitemap: https://abapdojo.com/sitemap.xml
```

### sitemap.xml

トップページ + 全docsページのURL。`<lastmod>` は初回デプロイ日。
更新頻度: トップ=weekly、docs=monthly。

## 4. SEOコンテンツページ

### ファイル構造

```
public/
  docs/
    index.html                     — コンテンツ一覧（ハブページ）
    about.html                     — サイト概要・機能説明
    guides/
      internal-tables.html         — サンプル解説: 内部テーブル操作
      string-processing.html       — サンプル解説: 文字列処理
      modern-syntax.html           — サンプル解説: モダンABAP構文
    pitfalls/
      string-char-confusion.html   — LLM Pitfall: STRING vs CHAR混同
      python-loop-pattern.html     — LLM Pitfall: Python的ループパターン
```

計7ページ（GTM Phase1の「5-10本」に合致）。

### 各ページのSEOターゲット

| ページ | 狙うキーワード | CTAリンク先 |
|--------|--------------|------------|
| about | "ABAP online editor", "ABAP playground" | Playground |
| internal-tables | "ABAP internal table LOOP example" | サンプル付きPlayground |
| string-processing | "ABAP string concatenation example" | サンプル付きPlayground |
| modern-syntax | "ABAP 7.40 inline declaration example" | サンプル付きPlayground |
| string-char-confusion | "ABAP STRING vs CHAR", "LLM ABAP errors" | AI Validator |
| python-loop-pattern | "ABAP LOOP AT example", "ChatGPT ABAP" | AI Validator |
| docs/index | "ABAP tutorial", "learn ABAP online" | 各ページ |

### 共通テンプレート構造

すべてのdocsページは同じHTMLテンプレートに基づく:

- **ヘッダー**: "ABAP Dojo" ロゴ + トップ(`/`)へのリンク + docs index(`/docs/`)へのリンク
- **本文**: H1（ページタイトル）、H2（セクション）、コードブロック、解説テキスト
- **CTA**: "Try this code in ABAP Dojo →" ボタン（`/#code=...` でプリセットコード付きリンク）
- **フッター**: 共通フッター
- **スタイル**: Tailwind CDN。アプリのビルドパイプラインとは独立
- **メタデータ**: 各ページ固有の title, description, canonical URL, OGタグ

### CTA仕様

各ガイド/ピットフォールページのコードサンプルは `encodeSource()` でエンコードし、`/#code=...` または `/#mode=validator&code=...` のリンクとしてCTAボタンに埋め込む。クリックでPlayground/Validatorが対応コード付きで開く。

## 5. フッター

### アプリ本体フッター

App.tsxの最下部に軽量なフッターを追加:

```
ABAP Dojo — Browser-based ABAP Playground
Guides | AI Pitfalls | About | GitHub
© 2026 ABAP Dojo. Powered by abaplint.
```

リンク先:
- Guides → `/docs/index.html`
- AI Pitfalls → `/docs/index.html`（pitfallsセクション）
- About → `/docs/about.html`
- GitHub → リポジトリURL

### docsページフッター

同じ内容 + 「← Back to ABAP Dojo」リンク。

## 6. アナリティクス

### GA4

- measurement ID: `G-YY1YV51K2X`
- `gtag.js` スニペットを以下に挿入:
  - `index.html`（アプリ本体）
  - 全docsページの共通テンプレート
- HTMLに直書き（静的サイトのため、環境変数注入は不要）

### Google Search Console

- `sitemap.xml` をGSCに登録
- DNS TXT検証は `abapdojo.com` のCloudflare DNSで設定（ユーザーが手動で実施）

## 7. Vite設定

docsページは `/public/` に純粋な静的HTMLとして配置する。Viteは `/public/` の内容をビルド時にそのまま `/dist/` にコピーするため、`vite.config.ts` の変更は不要。

## スコープ外

- i18n（日本語版フルページ）
- PWA / Service Worker
- Modernizer モード
- ブログ / CMS
- カスタムドメインのデプロイ設定（Cloudflare側の設定はユーザーが実施）
