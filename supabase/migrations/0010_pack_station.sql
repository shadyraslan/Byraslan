-- ============ 0010 التغليف بالميزان: مسح ملصق الميزان ← علبة برقم مسلسل + دخول مخزون المصنع ============

create or replace function public.pack_box(p_code text, p_order text default null)
returns table (sn bigint, item_name text, weight numeric, unit text, expires_at timestamptz)
language plpgsql security invoker set search_path = public as $$
declare r record; it items%rowtype; dbl int; v_sn bigint; v_exp timestamptz; v_qty numeric;
begin
  if not has_perm('prod.pack') then raise exception 'محتاج صلاحية التغليف'; end if;
  select * into r from parse_scale_label(p_code);
  select * into it from items where id = r.item_id;
  if it.kind <> 'product' then raise exception 'ده ملصق % — مش علبة منتج نهائي', case it.kind when 'semi' then 'نص مصنع' when 'raw' then 'خامة' else it.kind end; end if;
  select coalesce((value->>'double_read_sec')::int, 1) into dbl from settings where key = 'scale_barcode';
  if exists (select 1 from boxes b where b.scale_code = p_code and b.packed_at > now() - make_interval(secs => dbl)) then
    raise exception 'السكانر قرا نفس الملصق مرتين — اتحسبت علبة واحدة';
  end if;
  v_exp := case when it.shelf_days is not null then now() + make_interval(days => it.shelf_days) end;
  insert into boxes (item_id, weight, scale_code, prod_order, expires_at)
    values (it.id, r.weight, p_code, p_order, v_exp) returning boxes.sn into v_sn;
  v_qty := case when it.sold_by = 'piece' or it.unit = 'قطعة' then 1 else r.weight end;
  insert into stock_moves (item_id, location_id, qty, kind, ref, box_sn) values (it.id, 'factory', v_qty, 'pack', 'B' || v_sn, v_sn);
  return query select v_sn, it.name, r.weight, it.unit, v_exp;
end $$;

-- رصيد كل موقع: من دفتر الحركات + عدد العلب الموجودة فعلًا
create or replace view public.stock_by_location with (security_invoker = true) as
  select m.item_id, i.name as item_name, i.unit, m.location_id, l.name as location_name, sum(m.qty) as qty,
         (select count(*) from boxes b where b.item_id = m.item_id and b.location_id = m.location_id and b.status = 'stock') as boxes
  from stock_moves m join items i on i.id = m.item_id join locations l on l.id = m.location_id
  group by m.item_id, i.name, i.unit, m.location_id, l.name;
