# -*- coding: utf-8 -*-
# 単位: 万円
Q = ["Q1","Q2","Q3","Q4","Q5","Q6"]
period = ["2026/09-11","2026/12-2027/02","2027/03-05","2027/06-08","2027/09-11","2027/12-2028/02"]

# 商品単価（仮置き）
P_VIDEO = 150.0   # 映像1本 平均
P_TRAIN = 180.0   # AI研修1社 平均（導入プログラム）
P_SUB_M = 7.0     # 伴走サポート 月額/社

# 原価率
C_VIDEO = 0.50
C_TRAIN = 0.35
C_SUB   = 0.20

# 件数計画（四半期）
video = [1, 2, 3, 4, 5, 5]
train = [1, 2, 2.5, 3, 4, 4]
sub_cum = [0, 1, 3, 6, 11, 18]   # 期末の伴走契約社数（平均は前期末との中間）

# 役員報酬（月額・額面）
yakuin = [50, 50, 80, 80, 110, 130]
# 社員/業務委託（月額合計）
staff  = [0, 22, 50, 50, 78, 78]   # IS1名22 / +フロント28 / +IS2人目28
# 販管費（月額）: 家賃光熱/ガソリン会食/団体会費/AIツール/広告
sga    = [25, 33, 45, 52, 60, 66]

rows=[]
prev_sub=0
for i in range(6):
    rev_v = video[i]*P_VIDEO
    rev_t = train[i]*P_TRAIN
    avg_sub = (prev_sub + sub_cum[i])/2
    rev_s = avg_sub*P_SUB_M*3
    prev_sub = sub_cum[i]
    rev = rev_v+rev_t+rev_s
    cogs = rev_v*C_VIDEO + rev_t*C_TRAIN + rev_s*C_SUB
    gp = rev-cogs
    # 法定福利費 会社負担 概算15%（役員報酬上限考慮でざっくり）
    labor = (yakuin[i]+staff[i])*3
    houtei = labor*0.15
    fixed = labor + houtei + sga[i]*3
    op = gp - fixed
    rows.append(dict(q=Q[i],period=period[i],video=video[i],train=train[i],sub=sub_cum[i],
                     rev_v=rev_v,rev_t=rev_t,rev_s=rev_s,rev=rev,cogs=cogs,gp=gp,gpr=gp/rev*100,
                     yakuin=yakuin[i],staff=staff[i],sga=sga[i],fixed=fixed,op=op))

print(f"{'Q':4}{'期間':22}{'売上':>9}{'原価':>9}{'粗利':>9}{'粗利率':>8}{'固定費':>9}{'営業利益':>10}")
cum=0
for r in rows:
    cum+=r['op']
    print(f"{r['q']:4}{r['period']:22}{r['rev']:9.0f}{r['cogs']:9.0f}{r['gp']:9.0f}{r['gpr']:7.0f}%{r['fixed']:9.0f}{r['op']:10.0f}  累積{cum:8.0f}")

print()
tot_rev=sum(r['rev'] for r in rows); tot_op=sum(r['op'] for r in rows)
print(f"19ヶ月合計 売上 {tot_rev:.0f}万 / 営業利益 {tot_op:.0f}万")
print(f"最終Q年換算 売上 {rows[-1]['rev']*4:.0f}万 粗利 {rows[-1]['gp']*4:.0f}万 営業利益 {rows[-1]['op']*4:.0f}万")

# 2028/3以降の定常モデル（役員報酬150万+賞与140万額面）
print("\n=== 2028年3月以降 定常（年換算） ===")
rev_v=6*4*P_VIDEO/4*4  # 年24本
rev_v=24*P_VIDEO
rev_t=16*P_TRAIN
rev_s=20*P_SUB_M*12
rev=rev_v+rev_t+rev_s
cogs=rev_v*C_VIDEO+rev_t*C_TRAIN+rev_s*C_SUB
gp=rev-cogs
yak=150*12+140
stf=78*12
hou=(yak+stf)*0.15
sg=66*12
fixed=yak+stf+hou+sg
print(f"売上 {rev:.0f}万 (映像{rev_v:.0f}/研修{rev_t:.0f}/伴走{rev_s:.0f})")
print(f"原価 {cogs:.0f}万 粗利 {gp:.0f}万 ({gp/rev*100:.0f}%)")
print(f"役員{yak:.0f} 社員{stf:.0f} 法定福利{hou:.0f} 販管{sg:.0f} 固定費計{fixed:.0f}")
print(f"営業利益 {gp-fixed:.0f}万")
