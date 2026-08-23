# -*- coding: utf-8 -*-
"""
TENOHIRA 販売営業部（前平事業部）設計 ─ 2026/08/22版
体制 : 前平 ＋ 役員以外から1.5人
領域 : プランニング／スケジューリング／アタック／フロント営業／商談／成約
制作 : 役員2名の映像制作事業部へ社内発注（粗利80〜90%を確保したうえで振替）
目標 : 年間売上 1.5億（＝「優秀」ライン）
単位 : 万円
"""
# ══ 1. 商品 ═══════════════════════════════════════════════
ITEMS = {
    "理念映像2本パック": (150, 120), "理念映像1本": (100, 80),
    "式典 撮影のみ": (15, 13.5), "式典 ダイジェスト": (20, 18),
    "AIリスキリング L": (120, 108), "AIリスキリング M": (80, 72), "AIリスキリング S": (30, 27),
}
def pack(*n): return (sum(ITEMS[k][0] for k in n), sum(ITEMS[k][1] for k in n), " ＋ ".join(n))

PACKS = [("① フル",      pack("理念映像2本パック","式典 撮影のみ","式典 ダイジェスト","AIリスキリング L"), 12, True),
         ("② 映像+研修",  pack("理念映像2本パック","AIリスキリング L"),                                    14, True),
         ("③ 映像+式典",  pack("理念映像2本パック","式典 撮影のみ","式典 ダイジェスト"),                    12, True),
         ("④ 研修L単体",  pack("AIリスキリング L"),                                                       14, False),
         ("⑤ 映像1本",    pack("理念映像1本"),                                                            12, True),
         ("⑥ 研修M",      pack("AIリスキリング M"),                                                       16, False),
         ("⑦ 研修S(入口)", pack("AIリスキリング S"),                                                      16, False)]
# 4列目 True = 映像/式典を含む ＝ ストック（AI補佐＋月1本の縦型インタビュー）の対象顧客

print("═"*94); print("【1. フロー商品ミックス】"); print("═"*94)
print(f"{'':14}{'単価':>7}{'粗利':>8}{'社数':>6}{'売上':>9}{'粗利':>9} ｽﾄｯｸ対象")
print("─"*94)
flow_rev = flow_gp = cnt = stock_pool = 0
for lbl,(p,g,d),n,st in PACKS:
    flow_rev += p*n; flow_gp += g*n; cnt += n
    if st: stock_pool += n
    print(f"  {lbl:12}{p:>7}{g:>8.1f}{n:>6}{p*n:>9,}{g*n:>9,.0f}{'   ○' if st else '   −'}")
print("─"*94)
print(f"  {'フロー計':12}{flow_rev/cnt:>7.0f}{flow_gp/cnt:>8.1f}{cnt:>6}{flow_rev:>9,}{flow_gp:>9,.0f}"
      f"  粗利率{flow_gp/flow_rev*100:.0f}% / ストック対象 {stock_pool}社")

# ══ 2. ストック（AI補佐サポート＋月1本の縦型インタビュー動画）═══
STOCK_PRICE, STOCK_GPR, STOCK_KEEP = 10, 0.85, 0.50
end_n   = round(stock_pool*STOCK_KEEP)
avg_n   = end_n/2                       # 初年度は期中に積み上がるので平均は期末の半分
stock_rev = avg_n*STOCK_PRICE*12
print(f"\n【2. ストック】月{STOCK_PRICE}万 ×（映像/式典 受注 {stock_pool}社 × 継続{STOCK_KEEP:.0%}）")
print(f"  期末 {end_n}社＝月{end_n*STOCK_PRICE}万／初年度は平均{avg_n:.0f}社で 売上 {stock_rev:,.0f}万")
print(f"  ※ 月500万に届くのは2年目（{500//STOCK_PRICE}社必要）。初年度末は月{end_n*STOCK_PRICE}万が着地")

REV = flow_rev + stock_rev
GP  = flow_gp + stock_rev*STOCK_GPR
print(f"\n  事業部A 売上 {REV:,.0f}万（フロー{flow_rev:,}＋ストック{stock_rev:,.0f}）／ 粗利 {GP:,.0f}万（{GP/REV*100:.0f}%）")

# ══ 3. 集客チャネル（実勢の作業量ベース）════════════════════
print("\n"+"═"*94); print("【3. 集客チャネル】必要商談 = 年%d社 ÷ 成約率40%% = 月%.0f商談"%(cnt, cnt/12/0.4)); print("═"*94)
need = cnt/12/0.4
CH = [("架電外注",        "1日1万円×60件／週3回＝月720件", 720, 0.015, 20.0),
      ("手紙＋訪問手渡し", "原稿3日＋機械1日＋訪問3日＝月30件", 30, 0.15, 1.5),
      ("SNS広告",         "エリア・ターゲットを絞って",        None, None, 3.0),
      ("YouTube/ショート", "経営者ヒアリングをそのまま公開",    None, None, 0.0),
      ("経営者団体4つ",    "倫理法人会・同友会・実践研・品質研", None, None, 0.0),
      ("既存顧客・紹介",   "納品後の2本目とリファラル",         None, None, 0.0)]
FIXED_MTG = {"SNS広告":1.5, "YouTube/ショート":2.0, "経営者団体4つ":2.5, "既存顧客・紹介":2.0}
print(f"{'チャネル':18}{'月間量':>8}{'転換率':>8}{'商談/月':>9}{'費用/月':>9}  内容")
print("─"*94)
tot_mtg = tot_cost = 0
for name, desc, vol, rate, cost in CH:
    m = vol*rate if vol else FIXED_MTG[name]
    tot_mtg += m; tot_cost += cost
    v = f"{vol:,}件" if vol else "—"
    r = f"{rate:.1%}" if rate else "—"
    print(f"  {name:16}{v:>8}{r:>8}{m:>9.1f}{cost:>8.1f}万  {desc}")
print("─"*94)
print(f"  {'合計':16}{'':8}{'':8}{tot_mtg:>9.1f}{tot_cost:>8.1f}万")
print(f"  必要 {need:.0f}商談/月 に対し {tot_mtg:.1f} → {'✓ 余力 %.1f商談'%(tot_mtg-need) if tot_mtg>=need else '× %.1f商談 不足'%(need-tot_mtg)}")

# ══ 4. 1.5人の稼働（20営業日）════════════════════════════
print("\n"+"═"*94); print("【4. 1.5人の稼働】"); print("═"*94)
W1 = [("手紙の原稿制作（AI下書き＋仕上げ）", 3.0), ("機械で清書", 1.0), ("訪問お届け（30件）", 3.0),
      ("架電外注のリスト作成・進行管理", 2.0), ("SNS広告・ポスティング手配", 1.0),
      ("中継コミュニケーション（商談後フォロー）", 1.5), ("YouTube/ショートの撮影同行・投稿", 3.0)]
W05= [("プランニング補助（立案の具体化）", 2.0), ("提案書の清書", 2.0), ("スケジュール遂行管理（稼働30案件）", 2.0)]
for title, rows, cap in [("1.0人：営業実働", W1, 20), ("0.5人：企画・進行", W05, 10)]:
    s = sum(d for _,d in rows)
    print(f"\n  ◆ {title}（月{cap}日）")
    for n,d in rows: print(f"      {n:36}{d:>5.1f}日")
    print(f"      {'─'*46}")
    print(f"      {'計':36}{s:>5.1f}日 / {cap}日   "
          f"{'✓ 余力 %.1f日'%(cap-s) if s<=cap else '× %.1f日 超過'%(s-cap)}")

# ══ 5. 事業部P/L ════════════════════════════════════════
print("\n"+"═"*94); print("【5. 事業部A P/L（年間）】"); print("═"*94)
MAE, STAFF15 = 150*12+140+170, 60*12*1.5*1.15
DIRECT = tot_cost*12 + (30*0.05*12) + 36 + 120     # チャネル費＋手紙実費＋交通36＋ツール120
print(f"  売上                          {REV:>8,.0f}万   フロー{flow_rev:,}＋ストック{stock_rev:,.0f}")
print(f"  原価（制作事業部への社内発注等） {REV-GP:>8,.0f}万   粗利率 {GP/REV*100:.0f}%")
print(f"  粗利                          {GP:>8,.0f}万")
print(f"  ──────────────────────────────────────")
print(f"  前平（報酬・賞与・社保）        {MAE:>8,}万")
print(f"  1.5人（額面60万・手取り2倍）    {STAFF15:>8,.0f}万")
print(f"  直接経費                      {DIRECT:>8,.0f}万   架電240/SNS36/ポスティング60/手紙18/交通36/ツール120")
print(f"  ──────────────────────────────────────")
print(f"  貢献利益                      {GP-MAE-STAFF15-DIRECT:>8,.0f}万")

# ══ 6. 全社ロールアップ ══════════════════════════════════
B_REV, B_GPR = 10000, 0.48
EXEC3, STAFF5, COMMON, RESERVE = 6331, 60*12*5*1.15, 135.5*12, (34+20)*12
LOAN, TAX = 29.539*12, 0.34
FIXED = EXEC3 + STAFF5 + DIRECT + COMMON + RESERVE
print("\n"+"═"*94); print("【6. 全社】販売営業部A ＋ 映像制作事業部B（代理店1億・据え置き）"); print("═"*94)
print(f"  全社固定費 {FIXED:,.0f}万 = 役員3名{EXEC3:,}／一般5名{STAFF5:,.0f}／A直接{DIRECT:,.0f}／共通{COMMON:,.0f}／積立{RESERVE}")
print()
print(f"{'A売上':>9}{'全社売上':>10}{'粗利':>9}{'率':>6}{'営業利益':>10}{'税引後':>9}{'返済後':>9}  判定")
print("─"*94)
for a in (12000, 14000, REV, 16000, 17900):
    g = a*(GP/REV) + B_REV*B_GPR; op = g - FIXED; at = op*(1-TAX)
    j = [x for x,c in [("税引後2000万✓", at>=2000), ("粗利2億✓", g>=20000)] if c]
    mark = " ★本計画" if abs(a-REV)<1 else ""
    print(f"{a:>9,.0f}{a+B_REV:>10,.0f}{g:>9,.0f}{g/(a+B_REV)*100:>5.0f}%{op:>10,.0f}{at:>9,.0f}"
          f"{at-LOAN:>9,.0f}  {' '.join(j)}{mark}")
need_a = ((2000+LOAN)/(1-TAX) + FIXED - B_REV*B_GPR)/(GP/REV)
print(f"\n  税引後2,000万＋借入返済354万 を満たす A売上 = {need_a:,.0f}万（{need_a/10000:.2f}億）"
      f"／全社 {(need_a+B_REV)/10000:.2f}億")
