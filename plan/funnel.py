# -*- coding: utf-8 -*-
Q=["Q1","Q2","Q3","Q4","Q5","Q6"]
deals=[2,4,5.5,7,9,9]            # 四半期成約件数
close=0.40                        # 商談→成約
sem_per_q=[0,1,2,2,2,2]           # セミナー開催回数/四半期
sem_guest=15                      # 1回あたり参加社数
sem_to_mtg=0.30                   # セミナー参加→商談
letter_rate=0.08                  # 手紙+訪問+追跡架電 → 商談
cold_rate=0.02                    # 単独架電/DM → 商談

print(f"{'Q':4}{'成約':>6}{'商談':>6}{'ｾﾐﾅｰ経由':>10}{'ｱｳﾄﾊﾞｳﾝﾄﾞ':>11}{'手紙/月':>9}{'架電/月':>9}{'商談/月':>9}")
for i in range(6):
    mtg = deals[i]/close
    sem_mtg = sem_per_q[i]*sem_guest*sem_to_mtg
    out_mtg = max(mtg - sem_mtg, 0)
    # アウトバウンドの6割を手紙ルート、4割を架電/DMルートで取る
    letters = (out_mtg*0.6)/letter_rate/3
    calls   = (out_mtg*0.4)/cold_rate/3
    print(f"{Q[i]:4}{deals[i]:6.1f}{mtg:6.1f}{sem_mtg:10.1f}{out_mtg:11.1f}{letters:9.0f}{calls:9.0f}{mtg/3:9.1f}")

print("\n=== 社長の月間時間配分（Q6水準）===")
mtg_m=9/3/0.40   # 月商談数 ≈ 7.5
items=[("初回ヒアリング商談", mtg_m, 2.5),
       ("2回目・提案商談", mtg_m*0.7, 2.5),
       ("プランニング・提案書作成", mtg_m*0.7, 3.0),
       ("研修 初回・最終登壇", 2.7, 3.0),
       ("セミナー登壇＋準備", 0.7, 6.0),
       ("経営・採用・数値管理", 1, 20.0),
       ("団体活動・会食（関係構築）", 6, 2.5)]
tot=0
for n,c,h in items:
    t=c*h; tot+=t
    print(f"  {n:26}{c:6.1f}件 × {h:4.1f}h = {t:6.1f}h")
print(f"  {'合計':26}{tot:24.1f}h/月  （週 {tot/4.3:.1f}h）")
