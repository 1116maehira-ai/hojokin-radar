-- TENOHIRA 月間固定費（重複排除）
-- production-mgmt / Supabase project: vfgujkocemgezvcuixpp
-- fixed_costs は 2026-03-31 の初回登録以降、08-08〜08-09 に同一データが複数回
-- 再投入されており（81行中の大半が重複）、単純合計は実額の約2.2倍になる。
-- 排除ルール:
--   1) 同一 label は最新 created_at の1件のみ採用（金額改定を反映）
--   2) 改称された旧 label は除外
--        電車かガソリン(直輝)          → ガソリン(直輝) 20,000 に改称・改定
--        比嘉大臣(会計・相談役) 200,000 → 比嘉さん(経理会計) 150,000 に改称・減額
--        携帯(まげ)チャットGPT… 40,000 → 携帯(まげ) 10,000（GPT分はソフト関係へ移管）
--        ハルヒ(サブメンバー) 210,000  → staff.HARUHI 250,000 として社員化
--   3) 人件費は staff テーブル（type='in' かつ salary>0）から取る
with latest as (
  select distinct on (label) label, category, amount, created_at
  from fixed_costs order by label, created_at desc
),
dedup as (
  select * from latest where label not in (
    '電車かガソリン(直輝)', '比嘉大臣(会計・相談役)',
    '携帯(まげ)チャットGPTがここに紐ついてる', 'ハルヒ')
)
select 'A. 人件費(社員8名)' grp, sum(salary) amt from staff where type='in' and salary>0
union all
select case
  when label in ('ボーナス積立','会社利益・チャレンジ枠') then 'H. 積立・利益枠'
  when category='人件費'                                  then 'B. 法定福利'
  when category='経理'                                    then 'C. 外部委託(経理)'
  when category in ('社宅・住居','オフィス')               then 'D. 住居・オフィス'
  when category='交通・車両'                              then 'E. 車両・交通'
  when category in ('通信','ソフト・設備')                 then 'F. 通信・ソフト'
  else 'G. 雑費' end, sum(amount)
from dedup group by 1
order by 1;
-- 結果: A 3,150,000 / B 410,000 / C 150,000 / D 425,000 / E 170,000
--       F 270,000 / G 288,000 → 実費計 4,863,000
--       H 540,000 → 総額 5,403,000（年 64,836,000）
