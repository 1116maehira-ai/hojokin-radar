#!/usr/bin/env python3
"""
TENOHIRA 補助金レーダー ─ 取得実測（audit）
各監視サイトを叩いて「実際に何件拾えてるか」「どのフィルタで何件落ちたか」
「締切が何件取れたか」「JS描画/bot対策で死んでないか」を数値化し、
docs/data/audit.json に出力する。本番のレーダー本体(radar.py)とは独立。
Claude API も LINE も seen.json も使わない。純粋に取得力だけを測る。
"""
import json, os, re, sys, datetime
import requests, yaml
from html.parser import HTMLParser
from urllib.parse import urljoin
from xml.etree import ElementTree

ROOT = os.path.dirname(os.path.abspath(__file__))
SITES_PATH = os.path.join(ROOT, "sites.yaml")
OUT_PATH = os.path.join(ROOT, "docs", "data", "audit.json")
UA = {"User-Agent": "Mozilla/5.0 (TENOHIRA hojokin-radar audit; +https://github.com/)"}

# JS描画フレームワークの痕跡（静的HTMLに中身が無いサイトの判別用）
JS_HINTS = re.compile(
    r"(__NUXT__|__NEXT_DATA__|window\.__|id=[\"']app[\"']|id=[\"']root[\"']|"
    r"data-reactroot|ng-app|v-app|React\.createElement|vue(?:\.min)?\.js)",
    re.IGNORECASE,
)

# ---------- 締切抽出（radar.py と同じロジック）----------
DEADLINE_PATTERNS = [
    r"(\d{4})[年/\-](\d{1,2})[月/\-](\d{1,2})[日]?.*?(?:締切|期限|まで|受付)",
    r"(?:締切|期限|まで|受付).*?(\d{4})[年/\-](\d{1,2})[月/\-](\d{1,2})",
    r"令和(\d+)年(\d{1,2})月(\d{1,2})日.*?(?:締切|期限|まで)",
    r"(\d{1,2})[月/](\d{1,2})[日].*?(?:締切|期限|まで)",
]

def extract_deadline(title: str):
    today = datetime.date.today()
    for pat in DEADLINE_PATTERNS:
        m = re.search(pat, title)
        if m:
            try:
                g = m.groups()
                if "令和" in pat:
                    year = 2018 + int(g[0]); month, day = int(g[1]), int(g[2])
                elif len(g) == 2:
                    year = today.year; month, day = int(g[0]), int(g[1])
                    if datetime.date(year, month, day) < today:
                        year += 1
                else:
                    year, month, day = int(g[0]), int(g[1]), int(g[2])
                return datetime.date(year, month, day).isoformat()
            except (ValueError, OverflowError):
                pass
    return None

# ---------- 期限切れ判定（radar.py と同じロジック）----------
EXPIRED_PATTERN = re.compile(
    r"(終了|締切済|受付終了|募集終了|公募終了|採択結果|結果発表|終了しました|終了いたしました)",
    re.IGNORECASE)
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
                    year = 2018 + int(m.group(1)); month, day = int(m.group(2)), int(m.group(3))
                else:
                    year, month, day = int(m.group(1)), int(m.group(2)), int(m.group(3))
                if datetime.date(year, month, day) < today:
                    return True
            except (ValueError, OverflowError):
                pass
    return False

# ---------- リンク抽出 ----------
class LinkParser(HTMLParser):
    def __init__(self, base):
        super().__init__()
        self.base = base; self.links = []
        self._href = None; self._text = []
    def handle_starttag(self, tag, attrs):
        if tag == "a":
            href = dict(attrs).get("href")
            if href:
                self._href = urljoin(self.base, href); self._text = []
    def handle_data(self, data):
        if self._href is not None:
            self._text.append(data)
    def handle_endtag(self, tag):
        if tag == "a" and self._href:
            text = re.sub(r"\s+", " ", "".join(self._text)).strip()
            if text:
                self.links.append((self._href, text))
            self._href = None

# ---------- サイト1件を実測 ----------
def audit_links(site):
    """linksタイプ：フィルタ各段の脱落数を計測"""
    rec = {"raw_links": 0, "after_len6": 0, "after_include": 0,
           "after_exclude": 0, "final": 0, "deadline_hit": 0,
           "samples": [], "http_code": None, "bytes": 0,
           "status": "error", "note": ""}
    r = requests.get(site["url"], headers=UA, timeout=30)
    rec["http_code"] = r.status_code
    rec["bytes"] = len(r.content)
    if r.status_code in (403, 406, 429):
        rec["status"] = "blocked"
        rec["note"] = f"HTTP {r.status_code}（bot対策/アクセス拒否の疑い）"
        return rec
    r.raise_for_status()
    if not re.search(r"charset", r.headers.get("content-type", ""), re.I):
        r.encoding = r.apparent_encoding or "utf-8"

    p = LinkParser(site["url"]); p.feed(r.text)
    rec["raw_links"] = len(p.links)

    inc = re.compile(site.get("include", "."))
    exc = re.compile(site["exclude"]) if site.get("exclude") else None

    after_len6 = [(u, t) for (u, t) in p.links if len(t) >= 6]
    rec["after_len6"] = len(after_len6)
    after_inc = [(u, t) for (u, t) in after_len6 if inc.search(t)]
    rec["after_include"] = len(after_inc)
    after_exc = [(u, t) for (u, t) in after_inc if not (exc and exc.search(t + u))]
    rec["after_exclude"] = len(after_exc)
    final = [(u, t) for (u, t) in after_exc if not is_expired(t, u)]
    rec["final"] = len(final)
    rec["deadline_hit"] = sum(1 for (u, t) in final if extract_deadline(t))
    rec["samples"] = [t for (u, t) in final[:6]]

    # ステータス判定
    if rec["final"] > 0:
        rec["status"] = "ok"
    elif rec["raw_links"] < 5 and JS_HINTS.search(r.text):
        rec["status"] = "js_suspect"
        rec["note"] = "静的HTMLにリンクがほぼ無くJSフレームワーク痕跡あり（JS描画でスクレイピング不可の疑い）"
    elif rec["raw_links"] < 5:
        rec["status"] = "js_suspect"
        rec["note"] = "静的HTMLにリンクがほぼ無い（JS描画 or 構造変更の疑い）"
    elif rec["after_include"] == 0:
        rec["status"] = "empty"
        rec["note"] = f"リンクは{rec['raw_links']}件あるがincludeキーワードに1件も合致せず（include正規表現が厳しすぎ/対象ページが一覧ではない疑い）"
    else:
        rec["status"] = "empty"
        rec["note"] = "include通過後に全件が期限切れ判定 or exclude除外（is_expired誤爆の疑い）"
    return rec

def audit_rss(site):
    rec = {"raw_links": 0, "after_len6": 0, "after_include": 0,
           "after_exclude": 0, "final": 0, "deadline_hit": 0,
           "samples": [], "http_code": None, "bytes": 0,
           "status": "error", "note": ""}
    r = requests.get(site["url"], headers=UA, timeout=30)
    rec["http_code"] = r.status_code
    rec["bytes"] = len(r.content)
    if r.status_code in (403, 406, 429):
        rec["status"] = "blocked"
        rec["note"] = f"HTTP {r.status_code}（bot対策/アクセス拒否の疑い）"
        return rec
    r.raise_for_status()
    root = ElementTree.fromstring(r.content)
    raw = list(root.iter("item"))
    rec["raw_links"] = len(raw)
    final = []
    for item in raw:
        title = (item.findtext("title") or "").strip()
        link = (item.findtext("link") or "").strip()
        if not (title and link):
            continue
        if is_expired(title, link):
            continue
        final.append((link, title))
    rec["after_len6"] = rec["after_include"] = rec["after_exclude"] = len(final)
    rec["final"] = len(final)
    rec["deadline_hit"] = sum(1 for (u, t) in final if extract_deadline(t))
    rec["samples"] = [t for (u, t) in final[:6]]
    if rec["final"] > 0:
        rec["status"] = "ok"
    elif rec["raw_links"] == 0:
        rec["status"] = "js_suspect"
        rec["note"] = "RSSにitemが0件（フィードURL変更/廃止の疑い）"
    else:
        rec["status"] = "empty"
        rec["note"] = "item はあるが全件期限切れ判定（is_expired誤爆の疑い）"
    return rec

def main():
    cfg = yaml.safe_load(open(SITES_PATH, encoding="utf-8"))
    results = []
    for site in cfg["sites"]:
        base = {"id": site["id"], "name": site["name"],
                "type": site["type"], "url": site["url"]}
        try:
            rec = audit_rss(site) if site["type"] == "rss" else audit_links(site)
        except requests.exceptions.Timeout:
            rec = {"status": "error", "note": "タイムアウト（30秒以内に応答なし）",
                   "http_code": None, "bytes": 0, "raw_links": 0, "after_len6": 0,
                   "after_include": 0, "after_exclude": 0, "final": 0,
                   "deadline_hit": 0, "samples": []}
        except Exception as e:
            rec = {"status": "error", "note": f"{type(e).__name__}: {e}",
                   "http_code": None, "bytes": 0, "raw_links": 0, "after_len6": 0,
                   "after_include": 0, "after_exclude": 0, "final": 0,
                   "deadline_hit": 0, "samples": []}
        base.update(rec)
        results.append(base)
        print(f"[{rec['status'].upper():10}] {site['id']:24} "
              f"final={rec['final']:3} raw={rec['raw_links']:3} "
              f"deadline={rec['deadline_hit']:3}  {rec.get('note','')}")

    totals = {
        "sites": len(results),
        "ok": sum(1 for r in results if r["status"] == "ok"),
        "empty": sum(1 for r in results if r["status"] == "empty"),
        "js_suspect": sum(1 for r in results if r["status"] == "js_suspect"),
        "blocked": sum(1 for r in results if r["status"] == "blocked"),
        "error": sum(1 for r in results if r["status"] == "error"),
        "total_final": sum(r["final"] for r in results),
        "total_deadline_hit": sum(r["deadline_hit"] for r in results),
    }
    out = {"generated_at": datetime.datetime.now().isoformat(timespec="seconds"),
           "totals": totals, "sites": results}
    os.makedirs(os.path.dirname(OUT_PATH), exist_ok=True)
    json.dump(out, open(OUT_PATH, "w", encoding="utf-8"), ensure_ascii=False, indent=1)

    print("\n===== 実測サマリ =====")
    print(f"監視サイト {totals['sites']} 件中：")
    print(f"  ✅ 取得OK      : {totals['ok']}")
    print(f"  ⬜ 0件(empty) : {totals['empty']}")
    print(f"  🟡 JS描画疑い  : {totals['js_suspect']}")
    print(f"  🚫 ブロック    : {totals['blocked']}")
    print(f"  ❌ エラー      : {totals['error']}")
    print(f"  取得総数       : {totals['total_final']} 件")
    print(f"  うち締切取れた : {totals['total_deadline_hit']} 件 "
          f"({100*totals['total_deadline_hit']//max(totals['total_final'],1)}%)")

if __name__ == "__main__":
    main()
