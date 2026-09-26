#!/usr/bin/env python3
"""
メルマガ登録者 × Facebook 友達申請支援システム

使用方法:
  1. 新規登録: 名刺写真から Supabase登録 + Facebook検索
  2. 既存者検索: category指定で複数人のFacebook検索
"""
import json
import os
import sys
from typing import List, Dict, Optional
from datetime import datetime
import base64
from pathlib import Path

# .env ファイルを読み込み
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

# Supabase
try:
    from supabase import create_client, Client
except ImportError:
    print("⚠️  supabase-py がインストールされていません")
    print("   pip install supabase を実行してください")
    sys.exit(1)

# Facebook検索
from facebook_search import FacebookSearcher, generate_message_from_template

# Claude Vision API
try:
    import anthropic
except ImportError:
    print("⚠️  anthropic がインストールされていません")
    print("   pip install anthropic を実行してください")
    sys.exit(1)


class NewsletterFacebookIntegration:
    def __init__(self):
        """初期化"""
        self.supabase_url = os.getenv("SUPABASE_URL")
        self.supabase_key = os.getenv("SUPABASE_KEY")
        self.anthropic_key = os.getenv("ANTHROPIC_API_KEY")

        if not all([self.supabase_url, self.supabase_key, self.anthropic_key]):
            raise ValueError("環境変数が不足しています: SUPABASE_URL, SUPABASE_KEY, ANTHROPIC_API_KEY")

        self.supabase: Client = create_client(self.supabase_url, self.supabase_key)
        self.anthropic_client = anthropic.Anthropic(api_key=self.anthropic_key)

        # Seleniumを試す。失敗したらフォールバックモード
        try:
            self.fb_searcher = FacebookSearcher(headless=True, fallback_mode=False)
            self.fb_mode = "automated"
        except Exception as e:
            print(f"⚠️  Selenium起動失敗（ネットワーク制限の可能性）: {e}")
            print("   フォールバックモード（検索URLのみ生成）に切り替えます")
            self.fb_searcher = FacebookSearcher(headless=True, fallback_mode=True)
            self.fb_mode = "fallback"

    def extract_business_card_info(self, image_path: str) -> Dict[str, str]:
        """
        名刺の写真からOCR抽出（Claude Vision）

        Args:
            image_path: 画像ファイルパス

        Returns:
            {
                'name': 氏名,
                'company': 会社名,
                'role': 役職,
                'email': メアド,
                'phone': 電話番号
            }
        """
        print(f"📸 名刺から情報を抽出中: {image_path}")

        # 画像をBase64エンコード
        with open(image_path, "rb") as f:
            image_data = base64.standard_b64encode(f.read()).decode("utf-8")

        # ファイル拡張子から媒体タイプを判定
        ext = Path(image_path).suffix.lower()
        media_type_map = {
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.png': 'image/png',
            '.gif': 'image/gif',
            '.webp': 'image/webp'
        }
        media_type = media_type_map.get(ext, 'image/jpeg')

        # Claude Vision で抽出
        message = self.anthropic_client.messages.create(
            model="claude-3-5-sonnet-20241022",
            max_tokens=1024,
            messages=[
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "image",
                            "source": {
                                "type": "base64",
                                "media_type": media_type,
                                "data": image_data,
                            },
                        },
                        {
                            "type": "text",
                            "text": """この名刺の情報を JSON形式で抽出してください。以下のフィールドを含めてください:
- name: 氏名
- company: 会社名
- role: 役職/肩書き
- email: メールアドレス
- phone: 電話番号

抽出できない情報は空文字列を入れてください。
JSONのみを返してください。"""
                        }
                    ],
                }
            ],
        )

        try:
            # レスポンスをJSONとしてパース
            response_text = message.content[0].text
            # JSONコード内に含まれている場合のために、```で囲まれたコードを抽出
            if "```json" in response_text:
                json_str = response_text.split("```json")[1].split("```")[0].strip()
            elif "```" in response_text:
                json_str = response_text.split("```")[1].split("```")[0].strip()
            else:
                json_str = response_text

            extracted = json.loads(json_str)
            print(f"✅ 抽出完了: {extracted.get('name', 'Unknown')}")
            return extracted
        except json.JSONDecodeError as e:
            print(f"❌ JSON解析エラー: {e}")
            return {}

    def register_contact(self, image_path: str, category: str = "直クライアント") -> Optional[Dict]:
        """
        名刺から登録 → Supabase保存 → Facebook検索

        Args:
            image_path: 名刺の写真パス
            category: 分類（デフォルト: 直クライアント）

        Returns:
            登録情報 + Facebook検索結果
        """
        print("\n" + "="*60)
        print("📝 新規登録フロー開始")
        print("="*60)

        # 1. 名刺から情報抽出
        card_info = self.extract_business_card_info(image_path)
        if not card_info:
            print("❌ 名刺の情報抽出に失敗しました")
            return None

        # 2. Supabaseに登録
        print("\n📦 Supabaseに登録中...")
        data = {
            "name": card_info.get("name", ""),
            "company": card_info.get("company", ""),
            "email": card_info.get("email", ""),
            "role": card_info.get("role", ""),
            "phone": card_info.get("phone", ""),
            "category": category,
            "send_yn": "Y",
            "created_at": datetime.now().isoformat(),
            "registered_at": datetime.now().isoformat(),
        }

        response = self.supabase.table("mailing_list").insert(data).execute()
        if response.data:
            print(f"✅ 登録完了（ID: {response.data[0].get('id')}）")
        else:
            print(f"❌ Supabase登録エラー: {response}")
            return None

        # 3. Facebook検索
        print("\n🔍 Facebookで検索中...")
        fb_results = self.fb_searcher.search_person(
            name=card_info.get("name", ""),
            company=card_info.get("company", ""),
            max_results=5
        )

        # 4. メッセージテンプレート生成
        message_template = generate_message_from_template(
            card_info.get("name", ""),
            first_name=card_info.get("name", "").split()[-1]
        )

        result = {
            "contact_info": card_info,
            "facebook_candidates": fb_results,
            "message_template": message_template,
            "next_step": "👤 上記の候補から正しい人を選んで、友達申請＆メッセージを送ってください"
        }

        return result

    def search_existing_contacts(self, category: str, limit: int = 10) -> Dict:
        """
        既存登録者をカテゴリで検索 → Facebook検索

        Args:
            category: 検索するカテゴリ（例: '直クライアント'）
            limit: 検索対象の最大人数

        Returns:
            複数人の検索結果
        """
        print("\n" + "="*60)
        print(f"🔍 既存登録者の検索フロー開始: {category}")
        print("="*60)

        # Supabaseからカテゴリに該当する人を取得
        print(f"\n📋 {category} の登録者を取得中...")
        response = self.supabase.table("mailing_list").select(
            "id, name, company, email, phone, role"
        ).eq("category", category).eq("send_yn", "Y").limit(limit).execute()

        contacts = response.data if response.data else []
        print(f"✅ {len(contacts)}人を取得しました")

        if not contacts:
            return {"error": f"{category} の登録者が見つかりません"}

        # 各人をFacebook検索
        print(f"\n🔍 Facebookで検索中（最大{len(contacts)}人）...\n")
        results = []

        for i, contact in enumerate(contacts, 1):
            print(f"[{i}/{len(contacts)}] {contact.get('name', 'Unknown')}...")

            fb_results = self.fb_searcher.search_person(
                name=contact.get("name", ""),
                company=contact.get("company", ""),
                max_results=3
            )

            message_template = generate_message_from_template(
                contact.get("name", ""),
                first_name=contact.get("name", "").split()[-1]
            )

            results.append({
                "contact_id": contact.get("id"),
                "contact_info": contact,
                "facebook_candidates": fb_results,
                "message_template": message_template
            })

            # API制限対策: 適度に遅延
            import time
            time.sleep(1)

        return {
            "category": category,
            "total_searched": len(results),
            "results": results,
            "next_step": "👤 各候補から正しい人を選んで、友達申請＆メッセージを送ってください"
        }

    def close(self):
        """リソースのクローズ"""
        self.fb_searcher.close()


def main():
    """CLI実装例"""
    import argparse

    parser = argparse.ArgumentParser(description="メルマガ×Facebook統合ツール")
    subparsers = parser.add_subparsers(dest="command", help="コマンド")

    # 新規登録
    register_parser = subparsers.add_parser("register", help="名刺から新規登録")
    register_parser.add_argument("image_path", help="名刺の画像ファイルパス")
    register_parser.add_argument("--category", default="直クライアント", help="分類")

    # 既存者検索
    search_parser = subparsers.add_parser("search", help="既存登録者をFacebook検索")
    search_parser.add_argument("category", help="検索するカテゴリ")
    search_parser.add_argument("--limit", type=int, default=10, help="検索対象の最大人数")

    args = parser.parse_args()

    if not args.command:
        parser.print_help()
        return

    try:
        integration = NewsletterFacebookIntegration()

        if args.command == "register":
            result = integration.register_contact(args.image_path, args.category)
            print("\n" + "="*60)
            print("📊 結果サマリー")
            print("="*60)
            print(json.dumps(result, ensure_ascii=False, indent=2))

        elif args.command == "search":
            result = integration.search_existing_contacts(args.category, args.limit)
            print("\n" + "="*60)
            print("📊 検索結果サマリー")
            print("="*60)
            print(json.dumps(result, ensure_ascii=False, indent=2))

        integration.close()

    except Exception as e:
        print(f"❌ エラー: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()
