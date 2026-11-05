-- ============ 0017 ربط التغليف بأمر الإنتاج: العلب بتتسجّل على الأمر، وآخر غرفة بتقفل بمجموع العلب ============

create or replace function public.pack_box(p_code text, p_order text default null)
returns table (sn bigint, item_name text, weight numeric, unit text, expires_at timestamptz)
language plpgsql security invoker set search_path = public as $$
declare r record; it items%rowtype; dbl int; v_sn bigint; v_exp timestamptz; v_qty numeric; po prod_orders%rowtype; st prod_steps%rowtype; prev numeric;
begin
  if not has_perm('prod.pack') then raise exception 'محتاج صلاحية التغليف'; end if;
  select * into r from parse_scale_label(p_code);
  select * into it from items where id = r.item_id;
  if it.kind <> 'product' then raise exception 'ده ملصق % — مش علبة منتج نهائي', case it.kind when 'semi' then 'نص مصنع' when 'raw' then 'خامة' else it.kind end; end if;
  if p_order is not null then
    select * into po from prod_orders where id = p_order::bigint;
    if not found then raise exception 'أمر الإنتاج ده مش موجود'; end if;
    if po.item_id <> it.id then raise exception 'الملصق ده لـ % — والأمر لـ صنف تاني', it.name; end if;
    if po.status not in ('planned','running') then raise exception 'الأمر ده مقفول'; end if;
    select * into st from prod_steps where order_id = po.id and status <> 'done' order by step limit 1;
    if not found then raise exception 'كل خطوات الأمر خلصت'; end if;
    if exists (select 1 from prod_steps where order_id = po.id and step > st.step) then raise exception 'الأمر لسه ماوصلش لآخر غرفة'; end if;
    if st.status = 'waiting' then
      select out_weight into prev from prod_steps where order_id = po.id and step < st.step order by step desc limit 1;
      update prod_steps set status = 'running', in_weight = coalesce(prev, po.qty), started_at = now(), started_by = auth.uid() where order_id = po.id and step = st.step;
      update prod_orders set status = 'running' where id = po.id;
    end if;
  end if;
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

-- خلّص التغليف: الطالع = مجموع العلب، والهالك = الداخل − الطالع
create or replace function public.prod_pack_finish(p_order bigint)
returns text language plpgsql security invoker set search_path = public as $$
declare st prod_steps%rowtype; v_out numeric; n int;
begin
  if not has_perm('prod.pack') then raise exception 'محتاج صلاحية التغليف'; end if;
  select * into st from prod_steps where order_id = p_order and status = 'running' order by step desc limit 1;
  if not found then raise exception 'التغليف للأمر ده مش شغال'; end if;
  select coalesce(sum(weight), 0), count(*) into v_out, n from boxes where prod_order = p_order::text;
  if n = 0 then raise exception 'لسه مفيش علب على الأمر ده'; end if;
  update prod_steps set status = 'done', out_weight = v_out, waste = greatest(coalesce(st.in_weight, v_out) - v_out, 0), ended_at = now(), ended_by = auth.uid()
    where order_id = p_order and step = st.step;
  update prod_orders set status = 'done' where id = p_order;
  return n || ' علبة · ' || round(v_out, 2) || ' كجم';
end $$;

-- الأوامر اللي واصلة للتغليف (آخر غرفة)
create or replace view public.pack_ready with (security_invoker = true) as
  select o.id, o.no, o.item_id, i.name as item_name, o.qty, s.step, s.status as step_status,
         (select count(*) from boxes b where b.prod_order = o.id::text) as boxes
  from prod_orders o join items i on i.id = o.item_id
  join prod_steps s on s.order_id = o.id and s.step = (select max(step) from prod_steps x where x.order_id = o.id)
  where o.status in ('planned','running') and s.status <> 'done'
    and not exists (select 1 from prod_steps p where p.order_id = o.id and p.step < s.step and p.status <> 'done');
