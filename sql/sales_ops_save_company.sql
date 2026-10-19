-- POST body CAS avoids putting entire research/letter JSON in a request URL.
-- Invoker rights: keeps the caller's existing table grants and RLS policies.
create or replace function public.sales_ops_save_company_v1(p_change jsonb)
returns setof public.ceremony_attacks
language plpgsql security invoker
set search_path = pg_catalog, public
as $$
declare
  r public.ceremony_attacks%rowtype;
  v public.ceremony_attacks%rowtype;
  saved public.ceremony_attacks%rowtype;
  cols jsonb := coalesce(p_change->'columns', '{}'::jsonb);
begin
  if jsonb_typeof(p_change) is distinct from 'object'
    or jsonb_typeof(p_change->'source_data') is distinct from 'object'
    or jsonb_typeof(p_change->'expected_row') is distinct from 'object'
    or not (p_change ? 'expected_source')
    or jsonb_typeof(cols) is distinct from 'object' then
    raise exception '保存内容が不正です';
  end if;
  if exists (select 1 from jsonb_object_keys(cols) k where k not in (
    'company_name','postal_code','address','ceo_name','phone','website',
    'established_date','founding_date','revenue','own_recruit_url',
    'last_called_at','phase','next_date','next_action','no_solicitation'
  )) then raise exception '変更できない項目が含まれています'; end if;
  select * into r from public.ceremony_attacks where id=p_change->>'id' for update;
  if not found then raise exception '対象企業が見つからないか、保存権限がありません'; end if;
  if coalesce(r.source_data,'null'::jsonb) is distinct from p_change->'expected_source'
    or (to_jsonb(r)-'source_data') is distinct from p_change->'expected_row' then
    raise exception using errcode='40001', message='別の更新がありました。再読込してやり直してください';
  end if;
  v := jsonb_populate_record(r, cols);
  update public.ceremony_attacks set
    company_name=v.company_name, postal_code=v.postal_code, address=v.address,
    ceo_name=v.ceo_name, phone=v.phone, website=v.website,
    established_date=v.established_date, founding_date=v.founding_date,
    revenue=v.revenue, own_recruit_url=v.own_recruit_url,
    last_called_at=v.last_called_at, phase=v.phase, next_date=v.next_date,
    next_action=v.next_action, no_solicitation=v.no_solicitation,
    source_data=p_change->'source_data', updated_at=clock_timestamp()
  where id=r.id returning * into saved;
  if not found then raise exception '保存権限がありません'; end if;
  return next saved;
end;
$$;
