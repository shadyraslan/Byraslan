-- ============ 0016 أوامر الإنتاج وتابلت الغرف: كل منتج ليه مشوار على الغرف، والأمر بيمشي غرفة غرفة ============

insert into public.locations (id, name, type, parent, city, sort) values
  ('f-poultry','قسم الدواجن','section','factory','إسكندرية',3),
  ('f-meat','قسم اللحوم','section','factory','إسكندرية',4),
  ('f-marin','التتبيل','section','factory','إسكندرية',5),
  ('f-hot','المطبوخ','section','factory','إسكندرية',6),
  ('f-fill','الحشو والتشكيل','section','factory','إسكندرية',7),
  ('f-wrap','التغليف','section','factory','إسكندرية',8)
on conflict (id) do nothing;

-- مشوار المنتج على الغرف بالترتيب
-- كل تعديل = نسخة جديدة (ver)، والأوامر بتاخد آخر نسخة
create table public.item_routes (
  item_id bigint not null references public.items,
  ver int not null default 1,
  step int not null,
  section_id text not null references public.locations,
  primary key (item_id, ver, step)
);

create or replace function public.set_route(p_item bigint, p_sections text[])
returns int language plpgsql security invoker set search_path = public as $$
declare v int;
begin
  if not has_perm('items.edit') then raise exception 'محتاج صلاحية تعديل الأصناف'; end if;
  if coalesce(array_length(p_sections, 1), 0) = 0 then raise exception 'اختار غرفة واحدة على الأقل'; end if;
  select coalesce(max(ver), 0) + 1 into v from item_routes where item_id = p_item;
  insert into item_routes (item_id, ver, step, section_id) select p_item, v, o, s from unnest(p_sections) with ordinality as t(s, o);
  return v;
end $$;

create or replace view public.current_routes with (security_invoker = true) as
  select r.item_id, r.step, r.section_id, l.name as section_name from item_routes r join locations l on l.id = r.section_id
  where r.ver = (select max(ver) from item_routes x where x.item_id = r.item_id);

create table public.prod_orders (
  id bigint generated always as identity primary key,
  no bigint generated always as identity (start with 2001),
  item_id bigint not null references public.items,
  qty numeric not null check (qty > 0),             -- الكمية المطلوبة (كجم أو قطعة)
  due date not null default current_date,
  status text not null default 'planned' check (status in ('planned','running','done','cancelled')),
  note text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);

create table public.prod_steps (
  order_id bigint not null references public.prod_orders,
  step int not null,
  section_id text not null references public.locations,
  status text not null default 'waiting' check (status in ('waiting','running','done')),
  in_weight numeric,
  out_weight numeric,
  waste numeric,
  started_at timestamptz,
  ended_at timestamptz,
  started_by uuid,
  ended_by uuid,
  primary key (order_id, step)
);

-- أمر جديد: الخطوات بتتنسخ من مشوار المنتج
create or replace function public.prod_create(p_item bigint, p_qty numeric, p_due date default current_date, p_note text default null)
returns bigint language plpgsql security invoker set search_path = public as $$
declare v_oid bigint;
begin
  if not has_perm('prod.orders') then raise exception 'محتاج صلاحية أوامر الإنتاج'; end if;
  if not exists (select 1 from item_routes where item_id = p_item) then raise exception 'المنتج ده مالوش مشوار على الغرف — حدده الأول'; end if;
  insert into prod_orders (item_id, qty, due, note) values (p_item, p_qty, coalesce(p_due, current_date), p_note) returning id into v_oid;
  insert into prod_steps (order_id, step, section_id) select v_oid, r.step, r.section_id from current_routes r where r.item_id = p_item order by r.step;
  return v_oid;
end $$;

-- الغرفة بتبدأ: لازم الخطوة اللي قبلها تكون خلصت
create or replace function public.prod_start(p_order bigint, p_step int, p_in numeric)
returns void language plpgsql security invoker set search_path = public as $$
declare st prod_steps%rowtype;
begin
  if not has_perm('prod.orders') then raise exception 'محتاج صلاحية الإنتاج'; end if;
  select * into st from prod_steps where order_id = p_order and step = p_step for update;
  if not found then raise exception 'الخطوة دي مش موجودة'; end if;
  if st.status <> 'waiting' then raise exception 'الخطوة دي بدأت قبل كده'; end if;
  if exists (select 1 from prod_steps where order_id = p_order and step < p_step and status <> 'done') then raise exception 'الغرفة اللي قبلها لسه ماخلصتش'; end if;
  if coalesce(p_in, 0) <= 0 then raise exception 'اكتب الوزن اللي داخل'; end if;
  update prod_steps set status = 'running', in_weight = p_in, started_at = now(), started_by = auth.uid() where order_id = p_order and step = p_step;
  update prod_orders set status = 'running' where id = p_order and status = 'planned';
end $$;

-- الغرفة خلصت: الوزن الطالع والهالك
create or replace function public.prod_finish(p_order bigint, p_step int, p_out numeric, p_waste numeric)
returns text language plpgsql security invoker set search_path = public as $$
declare st prod_steps%rowtype; nxt text;
begin
  if not has_perm('prod.orders') then raise exception 'محتاج صلاحية الإنتاج'; end if;
  select * into st from prod_steps where order_id = p_order and step = p_step for update;
  if st.status <> 'running' then raise exception 'الخطوة دي مش شغالة'; end if;
  if coalesce(p_out, 0) <= 0 then raise exception 'اكتب الوزن الطالع'; end if;
  if p_out + coalesce(p_waste, 0) > st.in_weight * 1.05 then raise exception 'الطالع والهالك أكتر من اللي دخل (%)', st.in_weight; end if;
  update prod_steps set status = 'done', out_weight = p_out, waste = coalesce(p_waste, 0), ended_at = now(), ended_by = auth.uid() where order_id = p_order and step = p_step;
  select l.name into nxt from prod_steps s join locations l on l.id = s.section_id where s.order_id = p_order and s.step > p_step order by s.step limit 1;
  if nxt is null then update prod_orders set status = 'done' where id = p_order; return 'الأمر خلص'; end if;
  return nxt;
end $$;

alter table public.item_routes enable row level security;
alter table public.prod_orders enable row level security;
alter table public.prod_steps enable row level security;
create policy rt_read on public.item_routes for select to authenticated using (true);
create policy rt_ins on public.item_routes for insert to authenticated with check (has_perm('items.edit'));
create policy po_read on public.prod_orders for select to authenticated using (true);
create policy po_ins on public.prod_orders for insert to authenticated with check (has_perm('prod.orders'));
create policy po_upd on public.prod_orders for update to authenticated using (has_perm('prod.orders'));
create policy ps_read on public.prod_steps for select to authenticated using (true);
create policy ps_ins on public.prod_steps for insert to authenticated with check (has_perm('prod.orders'));
create policy ps_upd on public.prod_steps for update to authenticated using (has_perm('prod.orders'));
