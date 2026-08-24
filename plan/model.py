# -*- coding: utf-8 -*-
"""
TENOHIRA 事業計画 数値モデル（2026/08/22 版・役員級3名条件を反映）
目標 FY2027（2027/03/01-2028/02/28）: 売上4億円・粗利2億円・税引後2,000万円・ストック月500万円
到達条件: 役員級3名がそれぞれ 額面150万/月（手取り100万）＋ 年1回 賞与 手取り100万
単位: 万円
"""

# ─────────────────────────────────────────────
# 1. 商品ラインナップ
#    事業A＝直請け（前平＋営業チーム）／ 事業B＝代理店下請け TVCM・ブランドムービー（役員2名）
# ─────────────────────────────────────────────
PRODUCTS = {
    "A": ("創業の魂プロジェクト（理念映像＋式典＋記録）", 500, 0.44, "事業A"),
    "B": ("ブランディング／採用映像",                    250, 0.44, "事業A"),
    "C": ("AI導入研修 全社型（6ヶ月）",                  400, 0.35, "事業A"),
    "D": ("AI導入研修 部門型（3ヶ月）",                  180, 0.35, "事業A"),
    "E": ("AI運用パートナー（月額・ストック）",            20, 0.20, "事業A"),
    "F": ("代理店経由 TVCM・ブランドムービー",            -1, 0.52, "事業B"),
}
# ※ A・Bの原価率50%→44%、Fの原価率60%→52% は、事業Bの役員2名が稼働の約30%を
#    直請け映像のディレクションに移し、外注に出していた工程を社内に戻す前提。

QUARTERS = [("Q1","2026/09-11","準備"), ("Q2","2026/12-2027/02","準備"),
            ("Q3","2027/03-05","本番"), ("Q4","2027/06-08","本番"),
            ("Q5","2027/09-11","本番"), ("Q6","2027/12-2028/02","本番")]

UNITS     = {"A":[1,2,4,6,7,8], "B":[2,3,4,5,5,5], "C":[1,2,4,5,6,6], "D":[1,2,2,3,3,3]}
STOCK_END = [0, 2, 6, 12, 19, 25]          # 期末のストック契約社数
AGENCY    = [2500]*6                        # 事業B：金額は据え置き（ビジョン2年）

# ─────────────────────────────────────────────
# 2. 人件費（月額・額面）
# ─────────────────────────────────────────────
EXEC_N      = 3                                   # 役員級（本人＋TVCM担当2名）
EXEC_PAY    = [80, 90, 110, 120, 135, 150]        # 1人あたり月額の段階引き上げ
EXEC_BONUS  = 140                                 # 到達後の年1回賞与（額面／手取り100万相当）
STAFF_N     = [1, 3, 4, 5, 5, 5]                  # 一般社員の人数
STAFF_PAY   = 45                                  # 一般社員 1人あたり月額
SGA         = [150, 250, 380, 480, 550, 600]      # その他経費 月額
STAFF_H     = 0.15                                # 一般社員の法定福利（会社負担）
EXEC_H_Y    = 170                                 # 役員級1人あたり年間の法定福利（上限考慮の実額）
TAX_RATE    = 0.34

def quarter(i):
    rev = {k: UNITS[k][i]*PRODUCTS[k][1] for k in UNITS}
    prev = STOCK_END[i-1] if i else 0
    rev["E"] = (prev + STOCK_END[i])/2 * PRODUCTS["E"][1] * 3
    rev["F"] = AGENCY[i]
    total = sum(rev.values())
    cogs  = sum(v*PRODUCTS[k][2] for k, v in rev.items())
    exec_pay  = EXEC_PAY[i]*EXEC_N*3
    staff_pay = STAFF_PAY*STAFF_N[i]*3
    houtei    = EXEC_H_Y*EXEC_N/4 + staff_pay*STAFF_H
    fixed = exec_pay + staff_pay + houtei + SGA[i]*3
    gp = total - cogs
    return dict(rev=rev, total=total, cogs=cogs, gp=gp, gpr=gp/total*100, fixed=fixed,
                exec_pay=exec_pay, staff_pay=staff_pay, sga=SGA[i]*3, op=gp-fixed,
                stock_m=STOCK_END[i]*PRODUCTS["E"][1], units=sum(UNITS[k][i] for k in UNITS),
                head=EXEC_N+STAFF_N[i], takehome=EXEC_PAY[i]*0.68)

print("═"*112)
print("四半期別 P/L（単位: 万円）　※役員級3名 ＋ 一般社員")
print("═"*112)
print(f"{'Q':4}{'期間':17}{'区分':5}{'人数':>5}{'役員手取':>9}{'売上':>8}{'原価':>8}{'粗利':>8}"
      f"{'率':>5}{'固定費':>8}{'営業利益':>9}{'累積':>9}{'成約':>5}{'ｽﾄｯｸ':>7}")
print("─"*112)
cum = 0; rows = []
for i, (q, p, ph) in enumerate(QUARTERS):
    r = quarter(i); rows.append(r); cum += r["op"]
    print(f"{q:4}{p:17}{ph:5}{r['head']:>4}名{r['takehome']:>8,.0f}万{r['total']:8,.0f}"
          f"{r['cogs']:8,.0f}{r['gp']:8,.0f}{r['gpr']:4.0f}%{r['fixed']:8,.0f}"
          f"{r['op']:9,.0f}{cum:9,.0f}{r['units']:5.0f}{r['stock_m']:7,.0f}")

main = rows[2:]
mt = sum(r['total'] for r in main); mg = sum(r['gp'] for r in main)
mo = sum(r['op'] for r in main)
print("─"*112)
print(f"{'準備期 2Q 合計':30}{sum(r['total'] for r in rows[:2]):8,.0f}{'':8}"
      f"{sum(r['gp'] for r in rows[:2]):8,.0f}{'':5}{sum(r['fixed'] for r in rows[:2]):8,.0f}"
      f"{sum(r['op'] for r in rows[:2]):9,.0f}")
print(f"{'★ FY2027 本番期 4Q 合計':28}{mt:8,.0f}{sum(r['cogs'] for r in main):8,.0f}"
      f"{mg:8,.0f}{mg/mt*100:4.0f}%{sum(r['fixed'] for r in main):8,.0f}{mo:9,.0f}")
print("═"*112)

print(f"""
【FY2027 目標との照合】
  売上        計画 {mt:,.0f}万   目標 40,000万   {'✓' if mt>=40000 else '×'}
  粗利        計画 {mg:,.0f}万   目標 20,000万   {'✓' if mg>=20000 else '×'}
  粗利率      計画 {mg/mt*100:.0f}%（ロス4ptを吸収して実績50%着地）
  税引後      計画 {mo*(1-TAX_RATE):,.0f}万   目標 2,000万   {'✓' if mo*(1-TAX_RATE)>=2000 else '×'}
  ストック    期末 月{rows[-1]['stock_m']:,.0f}万   目標 月500万   {'✓' if rows[-1]['stock_m']>=500 else '×'}""")

print("\n【FY2027 事業別】")
agg = {}
for r in main:
    for k, v in r["rev"].items(): agg[k] = agg.get(k, 0) + v
for seg in ("事業A", "事業B"):
    ks = [k for k in agg if PRODUCTS[k][3] == seg]
    s = sum(agg[k] for k in ks); g = sum(agg[k]*(1-PRODUCTS[k][2]) for k in ks)
    print(f"  {seg}  売上 {s:>7,.0f}万 ({s/mt*100:4.1f}%)  粗利 {g:>7,.0f}万 ({g/s*100:.0f}%)"
          f"   {'直請け（理念映像・AI研修・ストック）' if seg=='事業A' else '代理店下請け TVCM・ブランドムービー'}")
print("\n【FY2027 商品別】")
for k in "ABCDEF":
    n, pr, cr, seg = PRODUCTS[k]
    c = f"{sum(UNITS[k][2:])}件" if k in UNITS else ("期末25社" if k=="E" else "—")
    print(f"  {k}. {n:36} {agg[k]:>7,.0f}万 ({agg[k]/mt*100:4.1f}%)  粗利 {agg[k]*(1-cr):>7,.0f}万  {c}")

print(f"""
【2028/03〜 到達後の定常（年換算）】
  役員級3名  額面150万×12 ＋ 賞与140万 ＝ 1人 1,940万 × 3 = {(150*12+EXEC_BONUS)*3:,.0f}万
             法定福利（上限考慮の実額） {EXEC_H_Y*EXEC_N:,.0f}万
  一般社員5名 45万×12×5 ＝ {STAFF_PAY*12*5:,.0f}万 ＋ 法定福利 {STAFF_PAY*12*5*STAFF_H:,.0f}万
  人件費合計 {(150*12+EXEC_BONUS)*3 + EXEC_H_Y*EXEC_N + STAFF_PAY*12*5*(1+STAFF_H):,.0f}万（社内8名）
  その他経費 {600*12:,}万（月600万）
  必要粗利   {(150*12+EXEC_BONUS)*3 + EXEC_H_Y*EXEC_N + STAFF_PAY*12*5*(1+STAFF_H) + 600*12 + 2000/0.66:,.0f}万
             → 粗利率50%なら 売上 {((150*12+EXEC_BONUS)*3 + EXEC_H_Y*EXEC_N + STAFF_PAY*12*5*(1+STAFF_H) + 600*12 + 2000/0.66)/0.5:,.0f}万
  {'✓ 売上4億で成立' if ((150*12+EXEC_BONUS)*3+EXEC_H_Y*EXEC_N+STAFF_PAY*12*5*1.15+7200+2000/0.66)/0.5 <= 40000 else '× 4億では不足'}
""")
