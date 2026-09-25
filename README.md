# TENOHIRA 補助金レーダー（プロトタイプ）

沖縄県内＋全国の補助金・助成金・業務委託公募を毎朝巡回し、新着を差分検出 →
Claudeで「自社エントリー/顧客提案」「カテゴリー」「マッチ度」を自動分類 →
GitHub Pagesのダッシュボード表示＋LINE通知するツール。

## 構成
- `sites.yaml` … 監視対象（初期5サイト）と通知しきい値
- `company_profile.md` … 分類AIに渡すTENOHIRAのプロフィール（精度の心臓部。育てる）
- `radar.py` … 巡回・差分・分類・通知の本体
- `data/seen.json` … 既読URLハッシュ（差分検出用）
- `data/items.json` … 蓄積された新着＋分類結果
- `docs/index.html` … ダッシュボード（GitHub Pages: docsフォルダ公開）
- `.github/workflows/radar.yml` … 毎朝 JST 7:30 自動実行

## セットアップ（10分）
1. GitHubに新規リポジトリ（例: `1116maehira-ai/hojokin-radar`）を作り、この一式をpush
2. Settings → Pages → Source: `main` / `docs` フォルダ
3. Settings → Secrets and variables → Actions に登録:
   - `ANTHROPIC_API_KEY` … Claude APIキー（分類用）
   - `LINE_CHANNEL_TOKEN` / `LINE_TO` … LINE Messaging APIのチャネルトークンと送信先ID（任意。無くても動く）
4. Actionsタブ → hojokin-radar → Run workflow で手動初回実行
   - 初回は「ベースライン登録」のみ（過去分を全部通知しないため新着0件で正常）
   - 翌日以降、差分だけが新着として分類・通知される

## 運用メモ
- 監視サイトの追加は `sites.yaml` に1ブロック追記するだけ。`include` の正規表現で絞る
- 分類精度が悪いと感じたら `company_profile.md` を具体化する（採択実績・狙う公募の実例を足す）
- ⚠ 厚労省系「助成金」の提出代行は社労士独占業務。`needs_sharoushi: true` の案件は提携社労士へ
- 次フェーズ候補: 公募要領PDFの自動取得→申請書骨子の自動生成 / 締切カウントダウン / Supabase移行

---

## 📱 新機能：メルマガ登録者 × Facebook 友達申請支援システム

ニュースレター登録者をFacebookで検索し、友達申請・メッセージ送信を支援するシステム。

### 使用方法

#### 1️⃣ **新規登録フロー** （名刺から登録＋Facebook検索）

```bash
python newsletter_facebook_integration.py register <名刺画像パス> [--category 分類]
```

**動作フロー：**
1. 📸 名刺の画像から Claude Vision で情報抽出（氏名、会社、役職、電話等）
2. 🗄️ Supabase `mailing_list` に登録
3. 🔍 Facebook で該当者を検索（最大5件）
4. 💬 メッセージテンプレートを自動生成
5. 👤 ユーザーが確認して友達申請＆メッセージを送信

**例：**
```bash
python newsletter_facebook_integration.py register business_card.jpg --category 直クライアント
```

**出力例：**
```json
{
  "contact_info": {
    "name": "花井豊",
    "company": "株式会社UKANO",
    "role": "代表取締役",
    "email": "y.hanai@ukano.jp",
    "phone": "090-4391-9598"
  },
  "facebook_candidates": [
    {
      "name": "花井 豊",
      "profile_url": "https://www.facebook.com/profile.php?id=123456789",
      "company": "UKANO"
    }
  ],
  "message_template": "先日、お名刺を交換させていただきありがとうございました...",
  "next_step": "👤 上記の候補から正しい人を選んで、友達申請＆メッセージを送ってください"
}
```

#### 2️⃣ **既存登録者の一括検索** （カテゴリ指定でFacebook検索）

```bash
python newsletter_facebook_integration.py search <カテゴリ名> [--limit 10]
```

**動作フロー：**
1. 🗄️ Supabase から指定カテゴリの登録者を取得（最大10人）
2. 🔍 各人を Facebook で検索（最大3件の候補）
3. 💬 各人のメッセージテンプレートを生成
4. 👤 ユーザーが確認して一括申請可能

**例：**
```bash
python newsletter_facebook_integration.py search 直クライアント --limit 10
```

### 環境変数設定

```bash
# .env ファイルに以下を設定
SUPABASE_URL=https://vfgujkocemgezvcuixpp.supabase.co
SUPABASE_KEY=<your-supabase-key>
ANTHROPIC_API_KEY=<your-claude-api-key>
```

### 必要な環境

- **Chrome/Chromium** … Selenium でFacebook自動検索に使用
- **Python 3.8+**
- **必要ライブラリ** … `pip install -r requirements.txt`

### メッセージテンプレート

自動生成されるメッセージ例：

```
先日、お名刺を交換させていただきありがとうございました。株式会社テノヒラの
前平 雄一朗です。

Facebookの方でももしよければつながってくださいますと嬉しいです

どこかのタイミングで、また詳しくお話もお聞かせ下さい
よろしくお願いいたします🙏

追伸・{相手の名前}さんは、インスタにもいらっしゃいますでしょうか？
```

### 注意点

- ⚠️ Facebook は自動化を制限しているため、検索結果は完全ではない可能性があります
- ⚠️ 友達申請数が多い場合、アカウント制限のリスクがあるため、**1日の申請数は10件程度に抑えることをお勧めします**
- ⚠️ 検索結果は最大5件（新規登録時）または3件（一括検索時）です
