-- Invoker rights only. No new table grants and no bypass of existing row policies.
create or replace function public.sales_ops_apply_batch_v1(p_changes jsonb)
returns integer language plpgsql security invoker
set search_path = pg_catalog, public
as $$
declare r public.ceremony_attacks%rowtype; item jsonb; n integer := 0;
begin
  if jsonb_typeof(p_changes) is distinct from 'array' or jsonb_array_length(p_changes) not between 1 and 5000 then
    raise exception '1〜5000社の対象を指定してください';
  end if;
  if (select count(distinct e->>'id') from jsonb_array_elements(p_changes) e) <> jsonb_array_length(p_changes) then
    raise exception '対象企業が重複しています';
  end if;
  -- Stable lock ordering; a concurrent call or research update cancels the whole batch.
  for item in select value from jsonb_array_elements(p_changes) order by value->>'id' loop
    select * into r from public.ceremony_attacks where id=item->>'id' for update;
    if not found then raise exception '対象企業が見つかりません'; end if;
    if coalesce(r.source_data,'null'::jsonb) is distinct from coalesce(item->'expected_source','null'::jsonb)
      or to_jsonb(r)->'phase' is distinct from item->'expected_phase'
      or to_jsonb(r)->'excluded' is distinct from item->'expected_excluded'
      or to_jsonb(r)->'no_solicitation' is distinct from item->'expected_no_solicitation'
      or to_jsonb(r)->'last_called_at' is distinct from item->'expected_last_called_at'
      or to_jsonb(r)->'updated_at' is distinct from item->'expected_updated_at'
      or ((item ? 'expected_row') and (to_jsonb(r)-'source_data') is distinct from item->'expected_row') then
      raise exception '別の更新がありました。再読込してやり直してください';
    end if;
    if jsonb_typeof(item->'source_data') is distinct from 'object' then raise exception '保存内容が不正です'; end if;
    update public.ceremony_attacks set source_data=item->'source_data',updated_at=clock_timestamp() where id=r.id;
    n:=n+1;
  end loop;
  return n;
end $$;
