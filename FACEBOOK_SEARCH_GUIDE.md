# Facebook 友達申請支援システム - 完全ガイド

## 🎯 システム概要

メルマガ登録者をFacebookで検索し、友達申請・メッセージ送信を支援するシステムです。

### 2つの使用フロー

#### 1️⃣ **新規登録フロー** （名刺写真から登録＋Facebook検索）

```bash
python newsletter_facebook_integration.py register <名刺画像パス> --category 直クライアント
```

**動作:**
1. 📸 Claude Vision で名刺から情報抽出（氏名、会社、役職、電話、メール）
2. 🗄️ Supabase に登録
3. 🔍 Facebook で検索候補を取得
4. 💬 メッセージテンプレートを自動生成

#### 2️⃣ **既存登録者の一括検索** （カテゴリ指定でFacebook検索）

```bash
python newsletter_facebook_integration.py search <カテゴリ名> --limit 10
```

**例:**
```bash
python newsletter_facebook_integration.py search 直クライアント --limit 10
```

**動作:**
1. 🗄️ Supabase から該当カテゴリの登録者を取得（最大10人）
2. 🔍 各人を Facebook で検索
3. 💬 各人のメッセージテンプレートを生成
4. 📊 結果を JSON で出力＋ファイルに保存

---

## 📊 出力例

### JSON形式の結果

```json
{
  "category": "直クライアント",
  "generated_at": "2026-09-26T00:53:56.731717",
  "total_contacts": 10,
  "contacts": [
    {
      "index": 1,
      "contact_id": "0a98a1cf-9cde-47ba-aa36-e0ff07afe984",
      "contact_info": {
        "name": "花井豊（UKANO）",
        "company": "株式会社UKANO",
        "email": "y.hanai@ukano.jp",
        "phone": "090-4391-9598",
        "role": "代表取締役"
      },
      "facebook_search": {
        "query": "花井豊（UKANO） 株式会社UKANO",
        "search_url": "https://www.facebook.com/search/people/?q=%E8%8A%B1%E4%BA%95...",
        "instructions": "このURLをブラウザで開き、検索結果から正しい相手を確認してください"
      },
      "message_template": "先日、お名刺を交換させていただきありがとうございました...",
      "next_steps": [
        "1. 上記のFacebook検索URLを開く",
        "2. 検索結果から正しい相手を見つける",
        "3. 友達申請を送る",
        "4. 上記のメッセージを送信する"
      ]
    }
  ]
}
```

---

## 🚀 使用方法（ステップバイステップ）

### Step 1: 環境設定

```bash
# .env ファイルに必要な情報を設定
SUPABASE_URL=https://vfgujkocemgezvcuixpp.supabase.co
SUPABASE_KEY=<あなたのSupabase APIキー>
ANTHROPIC_API_KEY=<あなたのClaude APIキー>
```

### Step 2: 既存登録者の検索（クラウド環境向け）

```bash
cd /home/user/hojokin-radar
python generate_facebook_search_results.py
```

**出力ファイル:**
- `facebook_search_results.json` - 10人分の検索URLとメッセージテンプレート

### Step 3: Facebook検索（ローカルマシン）

1. `facebook_search_results.json` を開く
2. 各人の `facebook_search.search_url` をブラウザにコピー＆ペースト
3. 検索結果から正しい相手を確認
4. メッセージテンプレートをコピーして友達申請＆メッセージを送信

### Step 4: 新規登録（ローカルマシン）

名刺の写真がある場合：

```bash
python newsletter_facebook_integration.py register business_card.jpg --category 直クライアント
```

---

## 🛠️ 環境別の実行方法

### ローカルマシン（Chrome/Chromium搭載）

```bash
# 全ての機能がフル動作
python newsletter_facebook_integration.py search 直クライアント --limit 10
```

**結果:** JSON + 自動 Facebook 検索

### クラウド環境（ネットワーク制限あり）

```bash
# フォールバックモード: 検索URLのみ生成
python generate_facebook_search_results.py
```

**結果:** JSON (facebook_search_results.json) に検索URLを保存

---

## 📋 メッセージテンプレート（カスタマイズ可能）

デフォルト:
```
先日、お名刺を交換させていただきありがとうございました。株式会社テノヒラの
前平 雄一朗です。

Facebookの方でももしよければつながってくださいますと嬉しいです

どこかのタイミングで、また詳しくお話もお聞かせ下さい
よろしくお願いいたします🙏

追伸・{相手の名前}さんは、インスタにもいらっしゃいますでしょうか？
```

`facebook_search.py` の `generate_message_from_template()` 関数を編集してカスタマイズできます。

---

## ⚠️ 注意事項

1. **Facebook自動化制限**: Facebook は自動化を制限しているため、検索結果は完全ではない可能性があります
2. **1日の申請数**: アカウント制限のため、1日の申請数は10件程度に抑えることをお勧めします
3. **検索間隔**: 同じ人を複数回検索しないでください。1時間以上の間隔を空けてください
4. **ネットワーク**: クラウド環境では Selenium が使用不可な場合があります。その場合は、生成された検索URLを手動で使用してください

---

## 📁 ファイル構成

```
hojokin-radar/
├── facebook_search.py                      # Selenium + フォールバック実装
├── newsletter_facebook_integration.py      # メイン統合スクリプト
├── generate_facebook_search_results.py     # クラウド向けURL生成スクリプト
├── facebook_search_results.json            # 生成された検索結果（実行例）
├── FACEBOOK_SEARCH_GUIDE.md               # このファイル
└── README.md                               # プロジェクト全体のREADME
```

---

## 🔧 トラブルシューティング

### ❌ "supabase-py がインストールされていません"

```bash
pip install supabase --break-system-packages
```

### ❌ "Chrome/Chromium が見つかりません"

1. Google Chrome または Chromium をインストール
2. または、`generate_facebook_search_results.py` を使用（URL生成のみ）

### ❌ "Anthropic API エラー"

```bash
# APIキーを確認
echo $ANTHROPIC_API_KEY

# キーが正しいか https://console.anthropic.com/keys で確認
```

### ❌ "Supabase キーが無効"

```bash
# .env を確認
cat .env

# 新しいキーを取得
# https://app.supabase.com/project/vfgujkocemgezvcuixpp/settings/api
```

---

## 📞 サポート

問題が発生した場合は、以下をご確認ください:

1. `.env` ファイルが正しく設定されている
2. APIキーが有効で最新のもの
3. インターネット接続が正常
4. Supabase のプロジェクトが有効

---

## 🎓 実行例

### 既存登録者10人の検索URLを生成

```bash
$ python generate_facebook_search_results.py
======================================================================
📊 Facebook 検索結果サマリー
======================================================================

✅ 10人の検索結果を生成しました
カテゴリ: 直クライアント
モード: manual_url（ネットワーク制限によりブラウザ自動化は使用不可）

======================================================================

【1】 花井豊（UKANO）
   会社: 株式会社UKANO
   役職: 代表取締役
   📱 Facebook検索: https://www.facebook.com/search/people/?q=...

【2】 川満尚彦（Reha GRIT）
   会社: Reha GRIT
   役職: 代表取締役/作業療法士
   📱 Facebook検索: https://www.facebook.com/search/people/?q=...

... (10人分)

✅ 完全な検索結果を保存しました: facebook_search_results.json
```

---

## 🚀 次のステップ

1. `facebook_search_results.json` を確認
2. 各URLをブラウザで開いて正しい相手を確認
3. メッセージテンプレートを使用して友達申請＆メッセージを送信
4. 継続的に新規登録者を追加・検索

---

✨ システムが正常に動作しています！
