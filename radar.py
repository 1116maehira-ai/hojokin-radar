#!/usr/bin/env python3
"""
TENOHIRA 補助金レーダー v3
巡回 → 差分検出 → 期限切れ除去 → 締切日抽出 → Claude分類 → data/items.json 更新 → LINE通知
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
JGRANTS_API = "https://api.jgrants-portal.go.jp/exp/v1/public/subsidies"

# ---------- 締切日抽出 ----------
DEADLINE_PATTERNS = [
    r"(\d{4})[年/\-](\d{1,2})[月/\-](\d{1,2})[日]?.*?(?:締切|期限|まで|受付)",
    r"(?:締切|期限|まで|受付).*?(\d{4})[年/\-](\d{1,2})[月/\-](\d{1,2})",
    r"令和(\d+)年(\d{1,2})月(\d{1,2})日.*?(?:締切|期限|まで)",
    r"(\d{1,2})[月/](\d{1,2})[日].*?(?:締切|期限|まで)",  # 月/日だけのパターン
]

def extract_deadline(title: str) -> str | None:
    """タイトルから締切日をISO形式で抽出"""
    today = datetime.date.today()
    for pat in DEADLINE_PATTERNS:
        m = re.search(pat, title)
        if m:
            try:
                groups = m.groups()
                if "令和" in pat:
                    year = 2018 + int(groups[0])
                    month, day = int(groups[1]), int(groups[2])
                elif len(groups) == 2:  # 月/日だけ
                    year = today.year
                    month, day = int(groups[0]), int(groups[1])
                    # 過去月なら来年
                    if datetime.date(year, month, day) < today:
                        year += 1
                else:
                    year, month, day = int(groups[0]), int(groups[1]), int(groups[2])
                return datetime.date(year, month, day).isoformat()
            except (ValueError, OverflowError):
                pass
    return None

# ---------- 期限切れ判定 ----------
EXPIRED_PATTERN = re.compile(
    r"(終了|締切済|受付終了|募集終了|公募終了|採択結果|結果発表|終了しました|終了いたしました)",
    re.IGNORECASE
)
DATE_PATTERNS = [
    r"(\d{4})[年/\-](\d{1,2})[月/\-](\d{1,2})[日]?",
    r"令和(\d+)年(\d{1,2})月(\d{1,2})日",
]

def is_expired(title: str, url: str) -> bool:
    text = title + " " + url
    if EXPIRED_PATTERN.search(text):
        return True
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
        if is_expired(title, link):
            continue
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

# ---------- jGrants 公式API ----------
# 採択後フェーズ（新規公募ではない）のレコードを除外するパターン
JGRANTS_SKIP_TITLE = re.compile(
    r"(交付申請|実績報告|完了報告|変更承認|上乗せ措置|促進上乗せ|共同申請者|"
    r"事業化状況報告|繰越|概算払|取下げ)")

def _iso_date(s):
    """'2026-07-03T08:00:00.000Z' -> '2026-07-03'"""
    return s[:10] if s else None

def fetch_jgrants(site):
    """デジタル庁jGrants公開APIから受付中(acceptance=1)の補助金を取得。
    複数キーワードで叩いてid重複排除し、対象地域が全国/沖縄県のものだけ残す。
    締切・補助上限・対象従業員が構造化データで最初から取れる。
    採択後フェーズ・締切が極端に先のレコードは新規公募でないため除外。"""
    areas = site.get("areas", [])
    keywords = site.get("keywords", ["事業"])
    seen_ids, out = set(), []
    today = datetime.date.today()
    for kw in keywords:
        try:
            r = requests.get(JGRANTS_API, headers=UA, timeout=30, params={
                "keyword": kw, "sort": "acceptance_end_datetime",
                "order": "ASC", "acceptance": 1})
            r.raise_for_status()
            result = r.json().get("result", [])
        except Exception as e:
            print(f"[WARN] jgrants kw={kw}: {e}", file=sys.stderr)
            continue
        for it in result:
            jid = it.get("id")
            if not jid or jid in seen_ids:
                continue
            title = it.get("title") or it.get("name") or "(無題)"
            # 採択後フェーズ（交付申請・実績報告等）は新規公募でないので除外
            if JGRANTS_SKIP_TITLE.search(title):
                continue
            area = it.get("target_area_search") or ""
            # 沖縄企業が使えるもの＝対象地域に全国 or 沖縄県を含むもののみ
            if areas and not any(a in area for a in areas):
                continue
            deadline = _iso_date(it.get("acceptance_end_datetime"))
            # 締切が1年半(540日)以上先＝新規公募でなく手続き期限の可能性が高く除外
            if deadline:
                try:
                    if (datetime.date.fromisoformat(deadline) - today).days > 540:
                        continue
                except ValueError:
                    pass
            seen_ids.add(jid)
            url = it.get("front_subsidy_detail_page_url") \
                  or f"https://www.jgrants-portal.go.jp/subsidy/{jid}"
            out.append({
                "url": url,
                "title": title,
                "deadline": deadline,
                "subsidy_max_limit": it.get("subsidy_max_limit"),
                "target_area": area,
                "target_employees": it.get("target_number_of_employees"),
            })
    print(f"[jGrants] {len(out)} 件（受付中・全国/沖縄対象・{len(keywords)}キーワード）")
    return out

# ---------- Claude 分類 ----------
CLASSIFY_PROMPT = """あなたは沖縄の中小企業「株式会社TENOHIRA」の補助金リサーチ担当です。
会社プロフィール:
{profile}

以下の新着公募情報を分類し、JSONのみで回答してください（前置き・コードブロック禁止）。

新着情報:
タイトル: {title}
URL: {url}{extra}

出力フォーマット:
{{
  "direction": "self" | "client" | "both" | "skip",
  "category": "人材開発型" | "新規事業型" | "既存事業発展型" | "設備・ツール導入型" | "委託・コンテンツ公募型" | "その他",
  "score": 0-100の整数（TENOHIRAへの関連度）,
  "reason": "1文の理由",
  "needs_sharoushi": true | false,
  "deadline": "YYYY-MM-DD形式の締切日（タイトルから読み取れる場合のみ、不明ならnull）"
}}"""

def classify(item, profile, api_key):
    extra = ""
    if item.get("subsidy_max_limit"):
        extra += f"\n補助上限額: {item['subsidy_max_limit']:,}円"
    if item.get("target_area"):
        extra += f"\n対象地域: {item['target_area']}"
    if item.get("target_employees"):
        extra += f"\n対象規模: {item['target_employees']}"
    if item.get("deadline"):
        extra += f"\n締切: {item['deadline']}"
    body = {
        "model": "claude-sonnet-4-5",
        "max_tokens": 300,
        "messages": [{"role": "user", "content": CLASSIFY_PROMPT.format(
            profile=profile, title=item["title"], url=item["url"], extra=extra)}],
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
                "reason": "分類失敗", "needs_sharoushi": False, "deadline": None}

def purge_expired_items(items):
    before = len(items)
    items = [i for i in items if not is_expired(i.get("title",""), i.get("url",""))]
    removed = before - len(items)
    if removed:
        print(f"[PURGE] 期限切れ {removed} 件を削除")
    return items

def notify_line(items, token, to):
    lines = ["📡 補助金レーダー 新着 {}件".format(len(items))]
    for it in items[:5]:
        dl = f" / 締切:{it['deadline']}" if it.get("deadline") else ""
        lines.append("\n▶ {}\n  {} / score {}{}\n  {}".format(
            it["title"], it["category"], it["score"], dl, it["url"]))
    requests.post("https://api.line.me/v2/bot/message/push",
                  headers={"Authorization": f"Bearer {token}",
                           "Content-Type": "application/json"},
                  json={"to": to, "messages": [{"type": "text",
                        "text": "\n".join(lines)[:4900]}]}, timeout=30)

def main():
    cfg     = yaml.safe_load(open(os.path.join(ROOT, "sites.yaml"), encoding="utf-8"))
    seen    = json.load(open(SEEN_PATH, encoding="utf-8")) if os.path.exists(SEEN_PATH) else {}
    items   = json.load(open(ITEMS_PATH, encoding="utf-8")) if os.path.exists(ITEMS_PATH) else []
    profile = open(PROFILE_PATH, encoding="utf-8").read()
    api_key = os.environ.get("ANTHROPIC_API_KEY", "")
    today   = datetime.date.today().isoformat()

    items = purge_expired_items(items)
    items = [i for i in items if i.get("direction") != "skip"]  # 無関係(skip)を一掃

    new_items = []
    for site in cfg["sites"]:
        try:
            if site["type"] == "rss":
                found = fetch_rss(site)
            elif site["type"] == "jgrants":
                found = fetch_jgrants(site)
            else:
                found = fetch_links(site)
        except Exception as e:
            print(f"[WARN] {site['id']}: {e}", file=sys.stderr)
            continue
        seen_ids    = set(seen.get(site["id"], []))
        first_run   = site["id"] not in seen
        current_ids = []
        for it in found:
            h = hashlib.sha1(it["url"].encode()).hexdigest()[:16]
            current_ids.append(h)
            # jGrantsは受付中＝今出すべき情報なので初回からnew_itemsに入れる
            if h in seen_ids or (first_run and site["type"] != "jgrants"):
                continue
            # 締切が未取得の場合のみタイトルから抽出（jGrantsは正規の締切を保持）
            if not it.get("deadline"):
                it["deadline"] = extract_deadline(it["title"])
            it.update({"id": h, "source": site["name"], "found_at": today})
            new_items.append(it)
        seen[site["id"]] = list(set(seen.get(site["id"], []) + current_ids))
        print(f"[OK] {site['id']}: {len(found)} links, baseline={first_run}")

    print(f"new items: {len(new_items)}")
    for it in new_items:
        c = classify(it, profile, api_key) if api_key else {
            "direction": "self", "category": "その他", "score": 50,
            "reason": "未分類（APIキー未設定）", "needs_sharoushi": False, "deadline": None}
        # Claudeが締切を読み取った場合はそちらを優先
        if c.get("deadline") and not it.get("deadline"):
            it["deadline"] = c.pop("deadline")
        else:
            c.pop("deadline", None)
        it.update(c)
        if it.get("direction") == "skip":
            continue  # 無関係はレーダーに乗せない
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
