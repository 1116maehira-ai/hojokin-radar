#!/usr/bin/env python3
"""
TENOHIRA 補助金レーダー v2
巡回 → 差分検出 → 期限切れ除去 → Claude分類 → data/items.json 更新 → LINE通知
"""
import json, os, re, sys, hashlib, datetime
import requests, yaml
from html.parser import HTMLParser
from urllib.parse import urljoin
from xml.etree import ElementTree

ROOT = os.path.dirname(os.path.abspath(__file__))
SEEN_PATH = os.path.join(ROOT, "docs", "data", "seen.json")
ITEMS_PATH = os.path.join(ROOT, "docs", "data", "items.json")
PROFILE_PATH = os.path.join(ROOT, "company_profile.md")
UA = {"User-Agent": "Mozilla/5.0 (TENOHIRA hojokin-radar; +https://github.com/)"}

# ---------- 期限切れ判定 ----------
# タイトルやURLに含まれる「終了・締切済」キーワード
EXPIRED_PATTERN = re.compile(
    r"(終了|締切済|受付終了|募集終了|公募終了|採択結果|結果発表|終了しました|終了いたしました)",
    re.IGNORECASE
)

# タイトルから日付を抽出して過去かどうか判定
DATE_PATTERNS = [
    r"(\d{4})[年/\-](\d{1,2})[月/\-](\d{1,2})[日]?",   # 2024年3月31日 / 2024/3/31
    r"令和(\d+)年(\d{1,2})月(\d{1,2})日",                 # 令和6年3月31日
]

def is_expired(title: str, url: str) -> bool:
    """期限切れっぽいものをはじく"""
    text = title + " " + url

    # キーワードで即アウト
    if EXPIRED_PATTERN.search(text):
        return True

    # 日付抽出して過去ならアウト
    today = datetime.date.today()
    for pat in DATE_PATTERNS:
        for m in re.finditer(pat, text):
            try:
                if "令和" in pat:
                    year = 2018 + int(m.group(1))
                    month, day = int(m.group(2)), int(m.group(3))
                else:
                    year, month, day = int(m.group(1)), int(m.group(2)), int(m.group(3))
                d = datetime.date(year, month, day)
                if d < today:
                    return True
            except (ValueError, OverflowError):
                pass
    return False


# ---------- HTML リンク抽出 ----------
class LinkParser(HTMLParser):
    def __init__(self, base):
        super().__init__()
        self.base = base
        self.links = []
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
        # ★ 期限切れ除去
        if is_expired(text, url):
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
        link  = (item.findtext("link")  or "").strip()
        pub   = (item.findtext("pubDate") or "").strip()
        if not (title and link):
            continue
        # ★ 期限切れ除去
        if is_expired(title, link):
            continue
        # ★ pubDate が60日以上前なら除外
        if pub:
            try:
                from email.utils import parsedate_to_datetime
                pub_dt = parsedate_to_datetime(pub).date()
                if (datetime.date.today() - pub_dt).days > 60:
                    continue
            except Exception:
                pass
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
needs_sharoushi: 厚労省系助成金で社労士の提出代行が必要そうなら true。"""


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


# ---------- 既存アイテムの期限切れ掃除 ----------
def purge_expired_items(items):
    """items.json に残ってる期限切れをまとめて削除"""
    before = len(items)
    items = [i for i in items if not is_expired(i.get("title",""), i.get("url",""))]
    removed = before - len(items)
    if removed:
        print(f"[PURGE] 期限切れ {removed} 件を削除")
    return items


# ---------- LINE 通知 ----------
def notify_line(items, token, to):
    lines = ["📡 補助金レーダー 新着 {}件".format(len(items))]
    for it in items[:5]:
        lines.append("\n▶ {}\n  {} / score {}\n  {}".format(
            it["title"], it["category"], it["score"], it["url"]))
    requests.post("https://api.line.me/v2/bot/message/push",
                  headers={"Authorization": f"Bearer {token}",
                           "Content-Type": "application/json"},
                  json={"to": to, "messages": [{"type": "text",
                        "text": "\n".join(lines)[:4900]}]}, timeout=30)


# ---------- main ----------
def main():
    cfg     = yaml.safe_load(open(os.path.join(ROOT, "sites.yaml"), encoding="utf-8"))
    seen    = json.load(open(SEEN_PATH, encoding="utf-8")) if os.path.exists(SEEN_PATH) else {}
    items   = json.load(open(ITEMS_PATH, encoding="utf-8")) if os.path.exists(ITEMS_PATH) else []
    profile = open(PROFILE_PATH, encoding="utf-8").read()
    api_key = os.environ.get("ANTHROPIC_API_KEY", "")
    today   = datetime.date.today().isoformat()

    # ★ 既存アイテムの期限切れを先に掃除
    items = purge_expired_items(items)

    new_items = []
    for site in cfg["sites"]:
        try:
            found = fetch_rss(site) if site["type"] == "rss" else fetch_links(site)
        except Exception as e:
            print(f"[WARN] {site['id']}: {e}", file=sys.stderr)
            continue
        seen_ids   = set(seen.get(site["id"], []))
        first_run  = site["id"] not in seen
        current_ids = []
        for it in found:
            h = hashlib.sha1(it["url"].encode()).hexdigest()[:16]
            current_ids.append(h)
            if h in seen_ids or first_run:
                continue
            it.update({"id": h, "source": site["name"], "found_at": today})
            new_items.append(it)
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
    json.dump(seen,  open(SEEN_PATH,  "w", encoding="utf-8"), ensure_ascii=False)
    json.dump(items, open(ITEMS_PATH, "w", encoding="utf-8"), ensure_ascii=False, indent=1)

    th = cfg.get("notify_threshold", 60)
    hot = [i for i in new_items if i.get("score", 0) >= th and i.get("direction") != "skip"]
    token, to = os.environ.get("LINE_CHANNEL_TOKEN"), os.environ.get("LINE_TO")
    if hot and token and to:
        notify_line(hot, token, to)
        print(f"LINE notified: {len(hot)}")


if __name__ == "__main__":
    main()
