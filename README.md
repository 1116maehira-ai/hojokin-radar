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
- `strategy/` … 事業戦略メモと面談記録（レーダーが何を拾うべきかの上位判断）
- `docs/growth-plan.html` … AI事業の成長計画（共有用ページ）

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
- 事業方針そのものが変わったときは `strategy/okinawa-dx-ai-strategy.md` → `company_profile.md` の順で更新する
- ⚠ 厚労省系「助成金」の提出代行は社労士独占業務。`needs_sharoushi: true` の案件は提携社労士へ
- 次フェーズ候補: 公募要領PDFの自動取得→申請書骨子の自動生成 / 締切カウントダウン / Supabase移行
