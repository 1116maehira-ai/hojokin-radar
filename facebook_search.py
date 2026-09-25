#!/usr/bin/env python3
"""
Facebook 検索 & 友達申請補助スクリプト
Seleniumでブラウザ自動化してFacebook検索を実行
"""
import json
import re
import time
import os
from typing import Optional
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.chrome.options import Options


class FacebookSearcher:
    def __init__(self, headless=False):
        """
        Seleniumドライバの初期化

        Args:
            headless: True時はヘッドレスモード（画面非表示）
        """
        self.driver = None
        self.headless = headless
        self._setup_driver()

    def _setup_driver(self):
        """Chrome WebDriverの設定"""
        options = Options()
        if self.headless:
            options.add_argument("--headless")
        options.add_argument("--no-sandbox")
        options.add_argument("--disable-dev-shm-usage")
        options.add_argument("--disable-blink-features=AutomationControlled")
        options.add_experimental_option("excludeSwitches", ["enable-automation"])
        options.add_experimental_option('useAutomationExtension', False)

        # User-Agent設定
        options.add_argument("user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")

        try:
            self.driver = webdriver.Chrome(options=options)
        except Exception as e:
            print(f"⚠️  Chrome起動失敗: {e}")
            print("   ChromeDriverがインストールされているか確認してください")
            raise

    def search_person(self, name: str, company: str = None, max_results: int = 5) -> list:
        """
        Facebookで人物を検索

        Args:
            name: 検索対象者の名前
            company: 会社名（オプション）
            max_results: 返す結果数（最大）

        Returns:
            [{
                'name': 氏名,
                'profile_url': FacebookプロフィールURL,
                'company': 会社名（表示されている場合）,
                'thumbnail': プロフィール画像URL
            }, ...]
        """
        try:
            # Facebook検索ページへ
            search_query = f"{name} {company}" if company else name
            search_url = f"https://www.facebook.com/search/people/?q={search_query}"

            print(f"🔍 検索中: {search_query}")
            self.driver.get(search_url)

            # ページ読込待機
            time.sleep(3)

            results = []

            # 検索結果の取得（最大5件）
            result_elements = self.driver.find_elements(By.CSS_SELECTOR, "div[data-testid='UFI2List/Item']")

            if not result_elements:
                # 代替セレクタで検索
                result_elements = self.driver.find_elements(By.CSS_SELECTOR, "div.x1yztbdb")

            for i, elem in enumerate(result_elements[:max_results]):
                try:
                    # プロフィール名
                    name_elem = elem.find_element(By.TAG_NAME, "a")
                    profile_name = name_elem.text
                    profile_url = name_elem.get_attribute("href")

                    # 会社名（存在する場合）
                    company_info = ""
                    try:
                        company_elem = elem.find_element(By.CSS_SELECTOR, "span.x1qjc9v5")
                        company_info = company_elem.text
                    except:
                        pass

                    if profile_url and profile_name:
                        results.append({
                            'name': profile_name,
                            'profile_url': profile_url,
                            'company': company_info,
                            'thumbnail': None
                        })
                        print(f"  ✓ {profile_name} - {profile_url}")
                except Exception as e:
                    print(f"  ⚠️  要素解析エラー: {e}")
                    continue

            return results

        except Exception as e:
            print(f"❌ 検索エラー: {e}")
            return []

    def close(self):
        """ドライバのクローズ"""
        if self.driver:
            self.driver.quit()


def generate_message_from_template(contact_name: str, first_name: str = "") -> str:
    """
    メッセージテンプレートを生成

    Args:
        contact_name: 連絡先の名前（相手の名前）
        first_name: 相手の名前の最初の部分（オプション）

    Returns:
        フォーマットされたメッセージ
    """
    if not first_name:
        # 名前から苗字を抽出（スペースまで）
        parts = contact_name.split()
        first_name = parts[-1] if parts else contact_name

    message = f"""先日、お名刺を交換させていただきありがとうございました。株式会社テノヒラの
前平 雄一朗です。

Facebookの方でももしよければつながってくださいますと嬉しいです

どこかのタイミングで、また詳しくお話もお聞かせ下さい
よろしくお願いいたします🙏

追伸・{first_name}さんは、インスタにもいらっしゃいますでしょうか？"""

    return message


if __name__ == "__main__":
    # テスト用
    searcher = FacebookSearcher(headless=False)

    try:
        # テスト検索
        results = searcher.search_person("田中太郎", "TENOHIRA")

        print("\n=== 検索結果 ===")
        for result in results:
            print(f"名前: {result['name']}")
            print(f"URL: {result['profile_url']}")
            print(f"会社: {result['company']}")
            print()

        # メッセージテンプレートテスト
        if results:
            message = generate_message_from_template(results[0]['name'])
            print("=== メッセージ例 ===")
            print(message)

    finally:
        searcher.close()
