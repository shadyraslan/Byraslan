-- ============ 0005 أكواد الميزان: كل أشكال روستو ليها كود PLU ============
-- الميزان بيطبع باركود 13 رقم: البادئة + كود الصنف + الوزن + رقم تحقق. السكانر يقرا ← السيستم يعرف الصنف والوزن ← يطبع QR.

alter table public.items add column if not exists kind text not null default 'product'
  check (kind in ('product','semi','raw','mix','pack'));      -- منتج نهائي / نص مصنع / خامة / خلطة / تغليف
alter table public.items add column if not exists scale_plu text unique;  -- كوده على الميزان

insert into public.settings (key, value) values
  ('scale_barcode', '{"prefix":"20","plu_digits":5,"weight_digits":5,"decimals":3,"double_read_sec":1}')
on conflict (key) do nothing;

-- يقرا باركود الميزان ويرجّع الصنف والوزن
create or replace function public.parse_scale_label(p_code text)
returns table (item_id bigint, item_name text, item_kind text, weight numeric)
language plpgsql stable security invoker set search_path = public as $$
declare s jsonb; pre text; pd int; wd int; dc int; v_plu text;
begin
  select value into s from settings where key = 'scale_barcode';
  pre := s->>'prefix'; pd := (s->>'plu_digits')::int; wd := (s->>'weight_digits')::int; dc := (s->>'decimals')::int;
  if length(p_code) <> 13 or left(p_code, length(pre)) <> pre then raise exception 'ده مش ملصق ميزان'; end if;
  v_plu := substr(p_code, length(pre) + 1, pd);
  return query select i.id, i.name, i.kind, substr(p_code, length(pre) + pd + 1, wd)::numeric / power(10, dc)
    from items i where i.scale_plu = v_plu;
  if not found then raise exception 'كود الصنف % مش متسجّل', v_plu; end if;
end $$;
