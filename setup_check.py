#!/usr/bin/env python3
"""
セットアップ確認スクリプト
必要な環境設定とライブラリが揃っているか確認します
"""
import os
import sys
from pathlib import Path

print("="*60)
print("🔧 TENOHIRA Facebook 統合システム - セットアップチェック")
print("="*60)

# チェック項目
checks = {
    "✅ Python バージョン": lambda: sys.version.split()[0],
    "✅ 作業ディレクトリ": lambda: os.getcwd(),
}

# 環境変数チェック
env_checks = {
    "SUPABASE_URL": "Supabase プロジェクトURL",
    "SUPABASE_KEY": "Supabase API キー",
    "ANTHROPIC_API_KEY": "Anthropic (Claude) API キー",
}

# ライブラリチェック
lib_checks = {
    "anthropic": "Anthropic SDK",
    "supabase": "Supabase クライアント",
    "selenium": "Selenium（ブラウザ自動化）",
    "requests": "Requests",
    "dotenv": "Python-dotenv",
}

print("\n📋 基本情報:")
for check_name, check_func in checks.items():
    try:
        result = check_func()
        print(f"  {check_name}: {result}")
    except Exception as e:
        print(f"  ❌ {check_name}: {e}")

print("\n🔐 環境変数チェック:")
env_file_exists = Path(".env").exists()
if env_file_exists:
    print("  ✅ .env ファイルが存在します")
else:
    print("  ⚠️  .env ファイルが見つかりません")
    print("     cp .env.example .env を実行し、値を設定してください")

for var_name, var_desc in env_checks.items():
    value = os.getenv(var_name, "")
    if value and value != "sk-ant-v0-your-api-key-here":
        print(f"  ✅ {var_name}: 設定済み")
    else:
        print(f"  ⚠️  {var_name}: 未設定")

print("\n📦 ライブラリチェック:")
for lib_name, lib_desc in lib_checks.items():
    try:
        __import__(lib_name)
        print(f"  ✅ {lib_desc}: インストール済み")
    except ImportError:
        print(f"  ❌ {lib_desc}: インストール未了")
        print(f"     pip install {lib_name}")

print("\n🌐 Chrome/Chromium チェック:")
try:
    from selenium import webdriver
    from selenium.webdriver.chrome.options import Options

    options = Options()
    options.add_argument("--headless")
    options.add_argument("--no-sandbox")
    options.add_argument("--disable-dev-shm-usage")

    driver = webdriver.Chrome(options=options)
    print(f"  ✅ Chrome/Chromium: 利用可能")
    driver.quit()
except Exception as e:
    print(f"  ⚠️  Chrome/Chromium: {e}")
    print("     ChromeDriver をインストールしてください")

print("\n" + "="*60)
print("📝 次のステップ:")
print("="*60)
print("""
1. .env ファイルを編集して、各APIキーを設定してください:
   - SUPABASE_KEY: Supabaseダッシュボードから取得
   - ANTHROPIC_API_KEY: Anthropic コンソールから取得

2. テスト実行:
   python newsletter_facebook_integration.py register <名刺画像パス>

3. 詳細は README.md を参照してください

Questions? Check README.md or contact the team.
""")
print("="*60)
