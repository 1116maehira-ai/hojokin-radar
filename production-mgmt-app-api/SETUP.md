# production-mgmt-app API ファイル — セットアップ手順

## 1. ファイルをコピー

このフォルダの `api/` 中身を production-mgmt-app の `api/` フォルダにコピーしてください:

```
api/generate-image.js     ← 新規
api/upload-wix-media.js   ← 新規
api/post-blog.js          ← 既存を置き換え（画像対応済み）
api/youtube-to-articles.js ← 新規（メインパイプライン）
```

## 2. 脳手郎参考画像を Supabase Storage にアップロード

1. Supabase ダッシュボード → Storage → 新しいバケット `notero-refs` を作成（Public）
2. 脳手郎の参考画像4枚をアップロード
3. 各画像の公開URL（`https://vfgujkocemgezvcuixpp.supabase.co/storage/v1/object/public/notero-refs/xxx.png`）をコピー

## 3. 環境変数を追加（Vercel ダッシュボード）

```
OPENAI_API_KEY=sk-...          ← GPT-4o + gpt-image-1 用（新規追加が必要）
NOTERO_REF_IMAGE_URLS=https://vfgujkocemgezvcuixpp.supabase.co/storage/v1/object/public/notero-refs/ref1.png,https://.../ref2.png,https://.../ref3.png,https://.../ref4.png
```

既存（そのまま使用）:
```
ANTHROPIC_API_KEY=...          ← Claude テキスト生成（既存）
WIX_API_KEY=...                ← Wix Blog API（既存）
WIX_SITE_ID=...                ← Wix サイトID（既存）
NEXT_PUBLIC_SUPABASE_URL=...   ← Supabase URL（既存）
SUPABASE_SERVICE_ROLE_KEY=...  ← Supabase 書き込み権限（既存 or 追加）
```

## 4. Supabase テーブル確認

`magazine_topics` テーブルに以下のカラムがあることを確認（なければ追加）:
- `youtube_url` (text)
- `video_id` (text)
- `transcript` (text)
- `status` (text)

## 5. 使い方（magazine.html または Claude チャットから）

```
POST /api/youtube-to-articles
{
  "youtubeUrl": "https://www.youtube.com/watch?v=XXXX",
  "recipientCategory": "直クライアント"  // optional
}
```

レスポンス:
```json
{
  "success": true,
  "topicId": 123,
  "articles": [
    {
      "tone": "便利・時短",
      "subject": "メルマガ件名",
      "blog_title": "ブログタイトル",
      "wixPostId": "xxx",
      "variationId": 456,
      "imageUrls": ["url1", "url2", "url3"]
    },
    ...
  ],
  "message": "✅ 完了！配信時間をセットして送信してください。"
}
```

## 6. YouTube 文字起こしについて

- 動画に自動字幕（日本語 or 英語）があれば自動取得
- なければ既存の `/api/fetch-youtube` エンドポイントを経由
- 字幕なし動画の場合は Whisper API（OpenAI）での音声認識を別途実装が必要

## 7. パイプラインの流れ

```
YouTube URL
  ↓
文字起こし取得（youtube timedtext API or fetch-youtube）
  ↓
Claude (claude-sonnet-4-6) で4記事生成
  ↓ (記事ごとに並列)
GPT-4o で脳手郎参考画像を分析 → gpt-image-1 で3枚生成
  ↓
Wix Media Manager にアップロード
  ↓
Wix Blog v3 にドラフト投稿（画像embedded）
  ↓
Supabase magazine_variations に保存
  ↓
完了 → 配信時間セット待ち
```
