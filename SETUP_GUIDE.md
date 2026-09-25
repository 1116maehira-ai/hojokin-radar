# 🚀 TENOHIRA Facebook 統合システム - セットアップガイド

## ✅ インストール完了状況

- ✅ Python 3.11
- ✅ 必要なライブラリ（Anthropic, Selenium, Supabase）
- ✅ webdriver-manager（ChromeDriver自動管理）
- ✅ .env ファイル作成済み

---

## 📋 あと2ステップで完成！

### **ステップ1：環境変数を設定** （5分）

`.env` ファイルを編集して、以下の3つのキーを入力してください：

#### 1️⃣ **SUPABASE_KEY の取得**

```bash
# Supabase ダッシュボード → Project Settings → API
# 「anon public」キーをコピー
SUPABASE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

📍 [Supabase ダッシュボール](https://app.supabase.com/project/vfgujkocemgezvcuixpp/)

#### 2️⃣ **ANTHROPIC_API_KEY の取得**

```bash
# Anthropic Console → API Keys
# あなたのAPIキーをコピー
ANTHROPIC_API_KEY=sk-ant-v0-...
```

📍 [Anthropic Console](https://console.anthropic.com/keys)

#### 3️⃣ **編集方法**

```bash
# .env ファイルを編集
nano .env
# または
vim .env
```

入力後：
```
SUPABASE_URL=https://vfgujkocemgezvcuixpp.supabase.co
SUPABASE_KEY=<ここに Supabase キーを貼り付け>
ANTHROPIC_API_KEY=<ここに Claude APIキーを貼り付け>
```

---

### **ステップ2：テスト実行** （10分）

#### 新規登録のテスト：

```bash
# 名刺の写真から登録＆Facebook検索
python newsletter_facebook_integration.py register <名刺画像パス> --category 直クライアント

# 例：
python newsletter_facebook_integration.py register business_card.jpg
```

**期待される出力：**
```
========================================
📝 新規登録フロー開始
========================================

📸 名刺から情報を抽出中: business_card.jpg
✅ 抽出完了: 花井豊

📦 Supabaseに登録中...
✅ 登録完了（ID: xxxxx）

🔍 Facebookで検索中...
[検索結果が表示されます]
```

#### 既存登録者の検索テスト：

```bash
# 「直クライアント」カテゴリから10人を検索
python newsletter_facebook_integration.py search 直クライアント --limit 10
```

---

## 🎯 使い方（日常運用）

### **毎日：新規登録者を追加**

```bash
# 1. 名刺を撮影
# 2. チャットから実行
python newsletter_facebook_integration.py register business_card.jpg
```

出力されたFacebook候補URLを確認 → 正しい人に友達申請＆メッセージ送信

### **週1回：既存登録者をFacebook検索**

```bash
# 直クライアント一覧を Facebook で検索
python newsletter_facebook_integration.py search 直クライアント --limit 10

# 倫理法人会メンバーを検索
python newsletter_facebook_integration.py search 倫理法人会 --limit 10
```

---

## ⚠️ トラブルシューティング

### 「Chrome/Chromium が見つからない」

```bash
# webdriver-manager が自動でダウンロードします
# 1回目の実行時に少し時間がかかります（2-3分）
```

### 「Supabase キーが無効」

```bash
# .env を確認
cat .env

# Supabase キーをコピーし直してください
# https://app.supabase.com/project/vfgujkocemgezvcuixpp/settings/api
```

### 「Facebook 検索結果が出ない」

- Facebook の自動化制限のため、検索結果が限定される可能性があります
- 同じ人を複数回検索しないでください
- 1時間以上の間隔を空けてから再度検索してください

### 「Anthropic API エラー」

```bash
# APIキーを確認
echo $ANTHROPIC_API_KEY

# 新しいキーを取得
# https://console.anthropic.com/keys
```

---

## 📚 詳細ドキュメント

👉 [README.md](./README.md) に完全なドキュメントがあります

---

## 🤝 サポート

問題が発生した場合は、以下を確認してください：

1. `.env` ファイルが正しく編集されている
2. APIキーが有効で最新のもの
3. インターネット接続が正常
4. Chrome/Chromium がシステムにインストールされている

---

✨ セットアップ完了後は、チャットからコマンドを実行できます！
