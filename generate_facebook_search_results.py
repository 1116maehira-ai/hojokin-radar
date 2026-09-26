#!/usr/bin/env python3
"""
Facebook検索結果の生成（フォールバック版）
ネットワーク制限のある環境向けに検索URLとメッセージテンプレートを生成
"""
import json
import urllib.parse
from datetime import datetime


def generate_message_template(name: str) -> str:
    """メッセージテンプレートを生成"""
    # 名前から敬称を抽出（最後の単語）
    parts = name.split('（')[0].split()  # 括弧を除去して分割
    first_name = parts[-1] if parts else name

    message = f"""先日、お名刺を交換させていただきありがとうございました。株式会社テノヒラの
前平 雄一朗です。

Facebookの方でももしよければつながってくださいますと嬉しいです

どこかのタイミングで、また詳しくお話もお聞かせ下さい
よろしくお願いいたします🙏

追伸・{first_name}さんは、インスタにもいらっしゃいますでしょうか？"""

    return message


def generate_facebook_search_results(subscribers: list) -> dict:
    """
    購読者リストからFacebook検索結果を生成

    Args:
        subscribers: [{'id', 'name', 'company', 'email', 'phone', 'role'}, ...]

    Returns:
        検索結果の構造化データ
    """
    results = []

    for i, contact in enumerate(subscribers, 1):
        name = contact.get('name', '')
        company = contact.get('company', '')

        # Facebook検索URL生成
        search_query = f"{name} {company}" if company else name
        encoded_query = urllib.parse.quote(search_query)
        search_url = f"https://www.facebook.com/search/people/?q={encoded_query}"

        # メッセージテンプレート生成
        message = generate_message_template(name)

        result = {
            "index": i,
            "contact_id": contact.get('id'),
            "contact_info": {
                "name": name,
                "company": company,
                "email": contact.get('email', ''),
                "phone": contact.get('phone', ''),
                "role": contact.get('role', '')
            },
            "facebook_search": {
                "query": search_query,
                "search_url": search_url,
                "instructions": "このURLをブラウザで開き、検索結果から正しい相手を確認してください"
            },
            "message_template": message,
            "next_steps": [
                "1. 上記のFacebook検索URLを開く",
                "2. 検索結果から正しい相手を見つける",
                "3. 友達申請を送る",
                "4. 上記のメッセージを送信する"
            ]
        }

        results.append(result)

    return {
        "category": "直クライアント",
        "generated_at": datetime.now().isoformat(),
        "total_contacts": len(results),
        "search_mode": "manual_url（ネットワーク制限によりブラウザ自動化は使用不可）",
        "contacts": results
    }


if __name__ == "__main__":
    # テストデータ（MCP Supabaseから取得した実データ）
    subscribers = [
        {
            "id": "0a98a1cf-9cde-47ba-aa36-e0ff07afe984",
            "name": "花井豊（UKANO）",
            "company": "株式会社UKANO",
            "email": "y.hanai@ukano.jp",
            "phone": "090-4391-9598",
            "role": "代表取締役"
        },
        {
            "id": "e33b1e47-33da-4a16-a725-9b62a33a65c8",
            "name": "川満尚彦（Reha GRIT）",
            "company": "Reha GRIT",
            "email": "rehogrit@gmail.com",
            "phone": "098-943-2077",
            "role": "代表取締役/作業療法士"
        },
        {
            "id": "49aa563b-32b8-4ece-9808-f3c21194da0c",
            "name": "又吉盛綾（設備技研）",
            "company": "株式会社 設備技研",
            "email": "matayoshi.s0223@setsubi-giken.co.jp",
            "phone": "098-934-1313",
            "role": "工事部"
        },
        {
            "id": "005283b6-27b7-4d47-ab00-5fe72ed7effb",
            "name": "宮城 大",
            "company": "株式会社ミヤセ商会",
            "email": "info@miyase-shoukai.co.jp",
            "phone": "090-9959-4836",
            "role": "代表取締役／古物査定士"
        },
        {
            "id": "9fe62cd4-35ff-4248-a0c0-1852fcd578ca",
            "name": "東恩納 大一",
            "company": "coloredtree（カラードツリー）",
            "email": "t.higashionna@coloredtree.co.jp",
            "phone": "080-6483-7890",
            "role": "代表取締役"
        },
        {
            "id": "7a100ef3-ef90-4df1-ba42-915020a295c8",
            "name": "久場 良洋",
            "company": "一般社団法人 千和 ちより学童クラブ",
            "email": "chiyorigakudou@gmail.com",
            "phone": "090-1341-3041",
            "role": "副代表／放課後児童支援員"
        },
        {
            "id": "fc85cd15-9e34-4d25-8c96-454fe2e61876",
            "name": "糸満 盛希",
            "company": "有限会社 糸工房",
            "email": "info@itokoubou.jp",
            "phone": "090-2583-8945",
            "role": "代表取締役社長"
        },
        {
            "id": "01bc4f19-ea20-4971-9035-ac7f32649ded",
            "name": "伊波 就子",
            "company": "一般社団法人 たっくたっく",
            "email": "taktak.okinawa@gmail.com",
            "phone": "090-1179-1199",
            "role": "代表理事"
        },
        {
            "id": "2419e0c3-2d35-4939-8829-37ee1b464059",
            "name": "大城 裕弥",
            "company": "株式会社478COMPANY",
            "email": "yuya.478company@gmail.com",
            "phone": "050-5364-9634",
            "role": "サステナビリティ事業部・宅地建物取引士"
        },
        {
            "id": "9e9a281e-2a42-4114-9a5b-210710aeb354",
            "name": "玉城佐恵子",
            "company": "RYUSABI GROUP",
            "email": "tamashiro@ryusabi.co.jp",
            "phone": "080-3188-2379",
            "role": "役員/アスリートネイルトレーナー"
        }
    ]

    # 検索結果を生成
    results = generate_facebook_search_results(subscribers)

    # 結果を出力
    print("="*70)
    print("📊 Facebook 検索結果サマリー")
    print("="*70)
    print(f"\n✅ {results['total_contacts']}人の検索結果を生成しました")
    print(f"カテゴリ: {results['category']}")
    print(f"モード: {results['search_mode']}")
    print("\n" + "="*70)

    # 各人の情報を出力
    for contact in results['contacts']:
        print(f"\n【{contact['index']}】 {contact['contact_info']['name']}")
        print(f"   会社: {contact['contact_info']['company']}")
        print(f"   役職: {contact['contact_info']['role']}")
        print(f"   📱 Facebook検索: {contact['facebook_search']['search_url']}")

    # 完全なJSON結果をファイルに保存
    output_file = "facebook_search_results.json"
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(results, f, ensure_ascii=False, indent=2)

    print(f"\n✅ 完全な検索結果を保存しました: {output_file}")
    print("\n使い方:")
    print("1. 上記のFacebook検索URLを開く（またはfacebook_search_results.jsonから確認）")
    print("2. 検索結果から正しい相手を見つける")
    print("3. 上記のメッセージテンプレートを使用して友達申請＆メッセージを送信")
