-- ============ 0038 رفع الأصناف والأسعار من ملف واحد + نشر اللايحة من الداشبورد + الميزان بالوزن أو بالسعر ============

alter table public.items add column if not exists code text;
create unique index if not exists items_code_uq on public.items (code) where code is not null;
update public.settings set value = value || '{"type":"weight"}'::jsonb where key = 'scale_barcode' and not value ? 'type';

-- كل صف: code, name, arm, group, family, unit, sold_by, kind, barcodes, plu, cost, shelf_days, active, price_direct, price_app, prices {loc: {direct, app}}
create or replace function public.items_import(p_rows jsonb, p_hide_demo boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r jsonb; n int := 0; v_arm text; v_grp bigint; v_fam bigint; v_item bigint; added int := 0; updated int := 0; np int := 0; errs jsonb := '[]';
        v_sold text; v_bc text; k text; v jsonb; can_price boolean := has_perm('prices.edit'); hidden int := 0;
begin
  if not is_staff() or not has_perm('items.edit') then raise exception 'محتاج صلاحية الأصناف'; end if;
  for r in select * from jsonb_array_elements(coalesce(p_rows, '[]')) loop
    n := n + 1;
    begin
      if coalesce(trim(r->>'name'), '') = '' then raise exception 'الاسم فاضي'; end if;
      v_arm := case when lower(coalesce(r->>'arm', '')) ~ '(روست|rost)' then 'rostos' when lower(coalesce(r->>'arm', '')) ~ '(أوريت|اوريت|تودزي|oric|tudz)' then 'oricci' else 'market' end;
      v_sold := case when coalesce(r->>'sold_by', '') ~ '(وزن|كيلو|كجم|weight)' then 'weight' when coalesce(r->>'sold_by', '') ~ '(علب|pack)' then 'pack' else 'piece' end;
      v_grp := null; v_fam := null;
      if coalesce(trim(r->>'group'), '') <> '' then
        select id into v_grp from families where name = trim(r->>'group') and arm = v_arm and parent_id is null limit 1;
        if v_grp is null then insert into families (name, arm) values (trim(r->>'group'), v_arm) returning id into v_grp; end if;
      end if;
      if coalesce(trim(r->>'family'), '') <> '' then
        select id into v_fam from families where name = trim(r->>'family') and arm = v_arm and parent_id is not distinct from v_grp limit 1;
        if v_fam is null then insert into families (name, arm, parent_id) values (trim(r->>'family'), v_arm, v_grp) returning id into v_fam; end if;
      else v_fam := v_grp; end if;
      v_item := null;
      if coalesce(trim(r->>'code'), '') <> '' then select id into v_item from items where code = trim(r->>'code'); end if;
      if v_item is null then select id into v_item from items where name = trim(r->>'name') and arm = v_arm order by id limit 1; end if;
      if v_item is null then
        insert into items (code, name, arm, unit, sold_by, kind, family_id, scale_plu, cost, shelf_days, active)
          values (nullif(trim(r->>'code'), ''), trim(r->>'name'), v_arm, coalesce(nullif(trim(r->>'unit'), ''), case when v_sold = 'weight' then 'كجم' else 'قطعة' end), v_sold,
                  coalesce(nullif(r->>'kind', ''), 'product'), v_fam, nullif(trim(r->>'plu'), ''), nullif(r->>'cost', '')::numeric, nullif(r->>'shelf_days', '')::int, coalesce((r->>'active')::boolean, true))
          returning id into v_item;
        added := added + 1;
      else
        update items set code = coalesce(nullif(trim(r->>'code'), ''), code), name = trim(r->>'name'), arm = v_arm, unit = coalesce(nullif(trim(r->>'unit'), ''), unit), sold_by = v_sold,
          kind = coalesce(nullif(r->>'kind', ''), kind), family_id = coalesce(v_fam, family_id), scale_plu = coalesce(nullif(trim(r->>'plu'), ''), scale_plu),
          cost = coalesce(nullif(r->>'cost', '')::numeric, cost), shelf_days = coalesce(nullif(r->>'shelf_days', '')::int, shelf_days), active = coalesce((r->>'active')::boolean, active),
          tags = array_remove(tags, 'demo')
          where id = v_item;
        updated := updated + 1;
      end if;
      for v_bc in select trim(x) from regexp_split_to_table(coalesce(r->>'barcodes', ''), '[,،;\s]+') x where trim(x) <> '' loop
        insert into item_barcodes (code, item_id) values (v_bc, v_item) on conflict (code) do update set item_id = excluded.item_id;
      end loop;
      if can_price then
        if nullif(r->>'price_direct', '') is not null then
          insert into prices (item_id, location_id, channel, price, updated_by, updated_at)
            select v_item, l.id, 'direct', (r->>'price_direct')::numeric, auth.uid(), now() from locations l where l.active and l.type in ('dark','shop')
            on conflict (item_id, location_id, channel) do update set price = excluded.price, updated_by = excluded.updated_by, updated_at = now();
          np := np + 1;
        end if;
        if nullif(r->>'price_app', '') is not null then
          insert into prices (item_id, location_id, channel, price, updated_by, updated_at)
            select v_item, l.id, 'app', (r->>'price_app')::numeric, auth.uid(), now() from locations l where l.active and l.type in ('dark','shop')
            on conflict (item_id, location_id, channel) do update set price = excluded.price, updated_by = excluded.updated_by, updated_at = now();
          np := np + 1;
        end if;
        for k, v in select * from jsonb_each(coalesce(r->'prices', '{}')) loop
          if nullif(v->>'direct', '') is not null then
            insert into prices (item_id, location_id, channel, price, updated_by, updated_at) values (v_item, k, 'direct', (v->>'direct')::numeric, auth.uid(), now())
              on conflict (item_id, location_id, channel) do update set price = excluded.price, updated_by = excluded.updated_by, updated_at = now();
          end if;
          if nullif(v->>'app', '') is not null then
            insert into prices (item_id, location_id, channel, price, updated_by, updated_at) values (v_item, k, 'app', (v->>'app')::numeric, auth.uid(), now())
              on conflict (item_id, location_id, channel) do update set price = excluded.price, updated_by = excluded.updated_by, updated_at = now();
          end if;
        end loop;
      end if;
    exception when others then
      errs := errs || jsonb_build_object('row', n + 1, 'name', r->>'name', 'error', regexp_replace(sqlerrm, '^.*?ERROR:\s*', ''));
    end;
  end loop;
  -- الأصناف التجريبية بتتوقف (مش بتتمسح)
  if p_hide_demo then
    update items set active = false where 'demo' = any(tags) and active;
    get diagnostics hidden = row_count;
    update families set tag = null where tag = 'demo' and exists (select 1 from items i where i.family_id = families.id and i.active);
  end if;
  return jsonb_build_object('rows', n, 'added', added, 'updated', updated, 'prices', np, 'hidden_demo', hidden, 'errors', errs, 'prices_skipped', not can_price);
end $$;

-- نشر نسخة جديدة من اللايحة: رقم النسخة بيزيد، وكل موظف لازم يقراها ويوافق تاني، وبيوصله إشعار
create or replace function public.policy_publish(p_text text) returns int
language plpgsql security definer set search_path = public as $$
declare v int;
begin
  if not is_staff() or not has_perm('settings.edit') then raise exception 'محتاج صلاحية الإعدادات'; end if;
  if coalesce(trim(p_text), '') = '' then raise exception 'اكتب نص اللايحة'; end if;
  v := coalesce((select (value->>'ver')::int from settings where key = 'hr.policy'), 0) + 1;
  insert into settings (key, value) values ('hr.policy', jsonb_build_object('ver', v, 'text', trim(p_text)))
    on conflict (key) do update set value = excluded.value;
  insert into staff_messages (title, body, target, needs_ack) values ('اللايحة اتحدثت 📄', 'فيه نسخة جديدة من لايحة الشغل — افتح التطبيق واقراها ووافق عليها.', 'all', true);
  return v;
end $$;

revoke execute on function public.items_import(jsonb, boolean), public.policy_publish(text) from anon, public;
grant execute on function public.items_import(jsonb, boolean), public.policy_publish(text) to authenticated;
