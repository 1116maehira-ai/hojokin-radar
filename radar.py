#!/usr/bin/env python3
"""
TENOHIRA 補助金レーダー
巡回 → 差分検出 → Claude分類 → data/items.json 更新 → LINE通知
GitHub Actions から毎朝実行する想定。
"""
import json, os, re, sys, hashlib, datetime
import requests, yaml
from html.parser import HTMLParser
from urllib.parse import urljoin
from xml.etree import ElementTree

ROOT = os.path.dirname(os.path.abspath(__file__))
SEEN_PATH = os.path.join(ROOT, "data", "seen.json")
ITEMS_PATH = os.path.join(ROOT, "data", "items.json")
PROFILE_PATH = os.path.join(ROOT, "company_profile.md")
UA = {"User-Agent": "Mozilla/5.0 (TENOHIRA hojokin-radar; +https://github.com/)"}

# ---------- HTML リンク抽出 ----------
class LinkParser(HTMLParser):
    def __init__(self, base):
        super().__init__()
        self.base = base
        self.links = []          # (url, text)
        self._href = None
        self._text = []

    def handle_starttag(self, tag, attrs):
        if tag == "a":
            href = dict(attrs).get("href")
            if href:
                self._href = urljoin(self.base, href)
                self._text = []

    def handle_data(self, data):
        if self._href is not None:
            self._text.append(data)

    def handle_endtag(self, tag):
        if tag == "a" and self._href:
            text = re.sub(r"\s+", " ", "".join(self._text)).strip()
            if text:
                self.links.append((self._href, text))
            self._href = None


def fetch_links(site):
    r = requests.get(site["url"], headers=UA, timeout=30)
    r.raise_for_status()
    if not re.search(r"charset", r.headers.get("content-type", ""), re.I):
        r.encoding = r.apparent_encoding or "utf-8"
    p = LinkParser(site["url"])
    p.feed(r.text)
    inc = re.compile(site.get("include", "."))
    exc = re.compile(site["exclude"]) if site.get("exclude") else None
    out = []
    for url, text in p.links:
        if len(text) < 6:
            continue
        if not inc.search(text):
            continue
        if exc and exc.search(text + url):
            continue
        out.append({"url": url, "title": text})
    return out


def fetch_rss(site):
    r = requests.get(site["url"], headers=UA, timeout=30)
    r.raise_for_status()
    root = ElementTree.fromstring(r.content)
    out = []
    for item in root.iter("item"):
        title = (item.findtext("title") or "").strip()
        link = (item.findtext("link") or "").strip()
        if title and link:
            out.append({"url": link, "title": title})
    return out

# ---------- Claude 分類 ----------
CLASSIFY_PROMPT = """あなたは沖縄の中小企業「株式会社TENOHIRA」の補助金リサーチ担当です。
会社プロフィール:
{profile}

以下の新着公募情報を分類し、JSONのみで回答してください（前置き・コードブロック禁止）。

新着情報:
タイトル: {title}
URL: {url}

出力フォーマット:
{{
  "direction": "self" | "client" | "both" | "skip",
  "category": "人材開発型" | "新規事業型" | "既存事業発展型" | "設備・ツール導入型" | "委託・コンテンツ公募型" | "その他",
  "score": 0-100の整数（TENOHIRAへの関連度）,
  "reason": "1文の理由",
  "needs_sharoushi": true | false
}}
direction: self=自社エントリー向け, client=顧客提案向け（TENOHIRAが受託/連携先になれる）, both=両方, skip=関係なし。
needs_sharoushi: 厚労省系助成金で社労士の提出代行が必要そうなら true。タイトルだけで判断できない項目は推定で構いません。"""


def classify(item, profile, api_key):
    body = {
        "model": "claude-sonnet-4-5",
        "max_tokens": 300,
        "messages": [{"role": "user", "content": CLASSIFY_PROMPT.format(
            profile=profile, title=item["title"], url=item["url"])}],
    }
    r = requests.post(
        "https://api.anthropic.com/v1/messages",
        headers={"x-api-key": api_key, "anthropic-version": "2023-06-01",
                 "content-type": "application/json"},
        json=body, timeout=60)
    r.raise_for_status()
    text = "".join(b.get("text", "") for b in r.json()["content"])
    text = re.sub(r"```json|```", "", text).strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        return {"direction": "skip", "category": "その他", "score": 0,
                "reason": "分類失敗", "needs_sharoushi": False}

# ---------- LINE 通知 ----------
def notify_line(items, token, to):
    lines = ["📡 補助金レーダー 新着 {}件".format(len(items))]
    for it in items[:5]:
        lines.append("\n▶ {}\n  {} / score {} \n  {}".format(
            it["title"], it["category"], it["score"], it["url"]))
    requests.post("https://api.line.me/v2/bot/message/push",
                  headers={"Authorization": f"Bearer {token}",
                           "Content-Type": "application/json"},
                  json={"to": to, "messages": [{"type": "text",
                        "text": "\n".join(lines)[:4900]}]}, timeout=30)

# ---------- main ----------
def main():
    cfg = yaml.safe_load(open(os.path.join(ROOT, "sites.yaml"), encoding="utf-8"))
    seen = json.load(open(SEEN_PATH, encoding="utf-8")) if os.path.exists(SEEN_PATH) else {}
    items = json.load(open(ITEMS_PATH, encoding="utf-8")) if os.path.exists(ITEMS_PATH) else []
    profile = open(PROFILE_PATH, encoding="utf-8").read()
    api_key = os.environ.get("ANTHROPIC_API_KEY", "")
    today = datetime.date.today().isoformat()

    new_items = []
    for site in cfg["sites"]:
        try:
            found = fetch_rss(site) if site["type"] == "rss" else fetch_links(site)
        except Exception as e:
            print(f"[WARN] {site['id']}: {e}", file=sys.stderr)
            continue
        seen_ids = set(seen.get(site["id"], []))
        first_run = site["id"] not in seen
        current_ids = []
        for it in found:
            h = hashlib.sha1(it["url"].encode()).hexdigest()[:16]
            current_ids.append(h)
            if h in seen_ids:
                continue
            it.update({"id": h, "source": site["name"], "found_at": today})
            new_items.append(it)
        # 初回はベースライン登録のみ（過去分を全部通知しないため）
        seen[site["id"]] = list(set(seen.get(site["id"], []) + current_ids))
        print(f"[OK] {site['id']}: {len(found)} links, baseline={first_run}")

    print(f"new items: {len(new_items)}")
    for it in new_items:
        c = classify(it, profile, api_key) if api_key else {
            "direction": "self", "category": "その他", "score": 50,
            "reason": "未分類（APIキー未設定）", "needs_sharoushi": False}
        it.update(c)
        items.insert(0, it)

    os.makedirs(os.path.dirname(SEEN_PATH), exist_ok=True)
    json.dump(seen, open(SEEN_PATH, "w", encoding="utf-8"), ensure_ascii=False)
    json.dump(items, open(ITEMS_PATH, "w", encoding="utf-8"),
              ensure_ascii=False, indent=1)

    th = cfg.get("notify_threshold", 60)
    hot = [i for i in new_items if i.get("score", 0) >= th and i.get("direction") != "skip"]
    token, to = os.environ.get("LINE_CHANNEL_TOKEN"), os.environ.get("LINE_TO")
    if hot and token and to:
        notify_line(hot, token, to)
        print(f"LINE notified: {len(hot)}")


if __name__ == "__main__":
    main()
