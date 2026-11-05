-- ============ 0020 الطلبات أونلاين: صفحة العميل (من غير تسجيل)، شاشة طلبات حيّة للفرع، تحضير بمسح العلب، توصيل وتحصيل ============

insert into public.permissions (id, grp, label) values
  ('orders.handle','الطلبات','استلام وتحضير وتوصيل طلبات الأونلاين'),
  ('orders.cancel','الطلبات','إلغاء طلب أونلاين')
on conflict do nothing;

-- إعدادات (كل رقم = إعداد من الداشبورد)
insert into public.settings (key, value) values
  ('online.open', 'true'),
  ('online.min_order', '300'),
  ('online.delivery_fee', '{"roushdy":30,"agamy":30,"masr-gedida":40,"maadi":40}'),
  ('online.weight_note', '"السعر النهائي بيتحسب بالوزن الفعلي للعلبة"')
on conflict do nothing;

create table public.customers (
  id bigint generated always as identity primary key,
  phone text not null unique,
  name text not null,
  address text,
  area text,
  notes text,
  created_at timestamptz not null default now()
);

create table public.online_orders (
  id bigint generated always as identity primary key,
  no bigint generated always as identity (start with 9001),
  token text not null unique default replace(gen_random_uuid()::text, '-', ''),
  customer_id bigint not null references public.customers,
  location_id text not null references public.locations,
  channel text not null default 'web' check (channel in ('web','phone','whatsapp')),
  status text not null default 'new' check (status in ('new','accepted','preparing','ready','out','delivered','cancelled')),
  address text,
  note text,
  pay_method text not null default 'cash' check (pay_method in ('cash','card','instapay')),
  est_total numeric not null default 0,
  subtotal numeric,
  delivery_fee numeric not null default 0,
  total numeric,
  paid boolean not null default false,
  driver text,
  cancel_reason text,
  created_at timestamptz not null default now(),
  accepted_at timestamptz, ready_at timestamptz, out_at timestamptz, delivered_at timestamptz,
  handled_by uuid
);
create index oo_loc_status on public.online_orders (location_id, status);

create table public.online_order_lines (
  order_id bigint not null references public.online_orders,
  line int not null,
  item_id bigint not null references public.items,
  qty numeric not null check (qty > 0),         -- المطلوب (كجم أو قطعة)
  unit_price numeric not null,
  prepared numeric not null default 0,           -- الفعلي من العلب الممسوحة
  primary key (order_id, line)
);

create table public.online_order_boxes (
  order_id bigint not null references public.online_orders,
  box_sn bigint not null references public.boxes,
  line int not null,
  qty numeric not null,
  removed boolean not null default false,
  at timestamptz not null default now()
);
create unique index oob_active on public.online_order_boxes (box_sn) where not removed;

-- قائمة الفرع للعميل: الأصناف اللي ليها سعر تطبيق ومتاحة في الفرع
create or replace function public.public_menu(p_loc text)
returns table (item_id bigint, name text, unit text, sold_by text, price numeric, family text, available numeric)
language sql stable security definer set search_path = public as $$
  select i.id, i.name, i.unit, i.sold_by, p.price, f.name,
         coalesce((select sum(case when i.sold_by = 'piece' then 1 else b.weight end) from boxes b where b.item_id = i.id and b.location_id = p_loc and b.status = 'stock'), 0)
           + coalesce((select sum(m.qty) from stock_moves m where m.item_id = i.id and m.location_id = p_loc and m.box_sn is null), 0)
  from prices p join items i on i.id = p.item_id left join families f on f.id = i.family_id
  where p.location_id = p_loc and p.channel = 'app' and i.active and not i.partner_only
  order by f.sort nulls last, i.name
$$;

create or replace function public.public_branches()
returns table (id text, name text, fee numeric, min_order numeric, open boolean)
language sql stable security definer set search_path = public as $$
  select l.id, l.name,
         coalesce(((select value from settings where key = 'online.delivery_fee') ->> l.id)::numeric, 0),
         coalesce((select value::text::numeric from settings where key = 'online.min_order'), 0),
         coalesce((select value::text::boolean from settings where key = 'online.open'), true)
  from locations l where l.type in ('dark','shop') and l.active order by l.sort
$$;

-- العميل بيطلب: p_lines [{"item_id":5,"qty":1.5}]
create or replace function public.place_order(p_loc text, p_phone text, p_name text, p_address text, p_area text, p_note text, p_pay text, p_lines jsonb, p_channel text default 'web')
returns table (order_no bigint, token text, est_total numeric)
language plpgsql security definer set search_path = public as $$
declare v_phone text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'); c bigint; o online_orders%rowtype; l jsonb; i int := 0; pr numeric; est numeric := 0; fee numeric; mn numeric;
begin
  if not coalesce((select value::text::boolean from settings where key = 'online.open'), true) then raise exception 'الطلبات أونلاين مقفولة دلوقتي'; end if;
  if length(v_phone) < 10 or length(v_phone) > 13 then raise exception 'رقم الموبايل مش صحيح'; end if;
  if coalesce(trim(p_name), '') = '' then raise exception 'اكتب اسمك'; end if;
  if coalesce(trim(p_address), '') = '' then raise exception 'اكتب العنوان'; end if;
  if jsonb_array_length(coalesce(p_lines, '[]')) = 0 or jsonb_array_length(p_lines) > 40 then raise exception 'السلة فاضية'; end if;
  if not exists (select 1 from locations where id = p_loc and type in ('dark','shop') and active) then raise exception 'اختار الفرع'; end if;
  if (select count(*) from online_orders oo join customers cu on cu.id = oo.customer_id where cu.phone = v_phone and oo.status in ('new','accepted','preparing')) >= 3 then raise exception 'عندك طلبات لسه بتتحضر — كلمنا'; end if;

  insert into customers (phone, name, address, area) values (v_phone, trim(p_name), trim(p_address), nullif(trim(p_area), ''))
    on conflict (phone) do update set name = excluded.name, address = excluded.address, area = coalesce(excluded.area, customers.area)
    returning id into c;
  fee := coalesce(((select value from settings where key = 'online.delivery_fee') ->> p_loc)::numeric, 0);
  insert into online_orders (customer_id, location_id, channel, address, note, pay_method, delivery_fee)
    values (c, p_loc, coalesce(p_channel, 'web'), trim(p_address), nullif(trim(p_note), ''), coalesce(p_pay, 'cash'), fee) returning * into o;
  for l in select * from jsonb_array_elements(p_lines) loop
    i := i + 1;
    select p.price into pr from prices p where p.item_id = (l->>'item_id')::bigint and p.location_id = p_loc and p.channel = 'app';
    if pr is null then raise exception 'صنف مش متاح في الفرع ده'; end if;
    if coalesce((l->>'qty')::numeric, 0) <= 0 or (l->>'qty')::numeric > 50 then raise exception 'الكمية مش صحيحة'; end if;
    insert into online_order_lines (order_id, line, item_id, qty, unit_price) values (o.id, i, (l->>'item_id')::bigint, (l->>'qty')::numeric, pr);
    est := est + round((l->>'qty')::numeric * pr, 2);
  end loop;
  mn := coalesce((select value::text::numeric from settings where key = 'online.min_order'), 0);
  if est < mn then raise exception 'أقل طلب % ج', mn; end if;
  update online_orders set est_total = est where id = o.id;
  return query select o.no, o.token, est + fee;
end $$;

-- صفحة التتبّع للعميل بالـ token
create or replace function public.track_order(p_token text)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('no', o.no, 'status', o.status, 'branch', l.name, 'est_total', o.est_total, 'total', o.total, 'fee', o.delivery_fee,
    'created_at', o.created_at, 'cancel_reason', o.cancel_reason,
    'lines', (select jsonb_agg(jsonb_build_object('name', i.name, 'unit', i.unit, 'qty', x.qty, 'prepared', x.prepared, 'price', x.unit_price) order by x.line)
              from online_order_lines x join items i on i.id = x.item_id where x.order_id = o.id))
  from online_orders o join locations l on l.id = o.location_id where o.token = p_token
$$;

-- تغيير الحالة
create or replace function public.order_status(p_id bigint, p_status text, p_driver text default null, p_reason text default null)
returns void language plpgsql security invoker set search_path = public as $$
declare o online_orders%rowtype;
begin
  select * into o from online_orders where id = p_id for update;
  if not found then raise exception 'الطلب مش موجود'; end if;
  if p_status = 'cancelled' then
    if not has_perm('orders.cancel') then raise exception 'الإلغاء محتاج صلاحية'; end if;
    if o.status in ('delivered','cancelled') then raise exception 'الطلب اتقفل'; end if;
    if coalesce(length(trim(p_reason)), 0) < 3 then raise exception 'اكتب سبب الإلغاء'; end if;
    update online_order_boxes set removed = true where order_id = p_id;
    update online_orders set status = 'cancelled', cancel_reason = p_reason, handled_by = auth.uid() where id = p_id;
    return;
  end if;
  if not has_perm('orders.handle') then raise exception 'محتاج صلاحية الطلبات'; end if;
  if p_status = 'accepted' and o.status = 'new' then
    update online_orders set status = 'accepted', accepted_at = now(), handled_by = auth.uid() where id = p_id;
  elsif p_status = 'ready' and o.status in ('accepted','preparing') then
    if not exists (select 1 from online_order_boxes where order_id = p_id and not removed) and not exists (select 1 from online_order_lines where order_id = p_id and prepared > 0) then raise exception 'امسح العلب الأول'; end if;
    update online_orders set status = 'ready', ready_at = now() where id = p_id;
  elsif p_status = 'out' and o.status = 'ready' then
    if coalesce(trim(p_driver), '') = '' then raise exception 'اكتب اسم الطيار'; end if;
    update online_orders set status = 'out', out_at = now(), driver = trim(p_driver) where id = p_id;
  else
    raise exception 'مينفعش ينتقل من % لـ %', o.status, p_status;
  end if;
end $$;

-- التحضير بمسح العلبة (أو باركود صنف مش بعلبة بكمية)
create or replace function public.order_scan(p_id bigint, p_code text, p_qty numeric default null)
returns text language plpgsql security invoker set search_path = public as $$
declare o online_orders%rowtype; r record; ln online_order_lines%rowtype; v_sn bigint;
begin
  if not has_perm('orders.handle') then raise exception 'محتاج صلاحية الطلبات'; end if;
  select * into o from online_orders where id = p_id for update;
  if not found or o.status not in ('accepted','preparing') then raise exception 'اقبل الطلب الأول'; end if;
  select * into r from pos_lookup(o.location_id, p_code);
  select * into ln from online_order_lines where order_id = p_id and item_id = r.item_id order by (prepared >= qty), line limit 1;
  if not found then raise exception '% مش في الطلب ده', r.item_name; end if;
  if r.box_sn is not null then
    if exists (select 1 from online_order_boxes where box_sn = r.box_sn and not removed) then raise exception 'العلبة #% محجوزة لطلب تاني', r.box_sn; end if;
    insert into online_order_boxes (order_id, box_sn, line, qty) values (p_id, r.box_sn, ln.line, r.qty);
    update online_order_lines set prepared = prepared + r.qty where order_id = p_id and line = ln.line;
  else
    update online_order_lines set prepared = prepared + coalesce(nullif(p_qty, 0), 1) where order_id = p_id and line = ln.line;
  end if;
  update online_orders set status = 'preparing' where id = p_id and status = 'accepted';
  return r.item_name || ' ' || r.qty || case when r.box_sn is not null then ' (#' || r.box_sn || ')' else '' end;
end $$;

create or replace function public.order_unscan(p_id bigint, p_sn bigint)
returns void language plpgsql security invoker set search_path = public as $$
declare b online_order_boxes%rowtype;
begin
  if not has_perm('orders.handle') then raise exception 'محتاج صلاحية الطلبات'; end if;
  select * into b from online_order_boxes where order_id = p_id and box_sn = p_sn and not removed;
  if not found then raise exception 'العلبة دي مش في الطلب'; end if;
  if (select status from online_orders where id = p_id) not in ('accepted','preparing','ready') then raise exception 'الطلب خرج'; end if;
  update online_order_boxes set removed = true where order_id = p_id and box_sn = p_sn and not removed;
  update online_order_lines set prepared = greatest(prepared - b.qty, 0) where order_id = p_id and line = b.line;
end $$;

-- اتسلّم واتحصّل: العلب تتباع وتطلع من المخزن
create or replace function public.order_deliver(p_id bigint)
returns numeric language plpgsql security invoker set search_path = public as $$
declare o online_orders%rowtype; sub numeric; x record;
begin
  if not has_perm('orders.handle') then raise exception 'محتاج صلاحية الطلبات'; end if;
  select * into o from online_orders where id = p_id for update;
  if not found or o.status <> 'out' then raise exception 'الطلب لازم يكون خرج مع الطيار'; end if;
  for x in select b.box_sn from online_order_boxes b where b.order_id = p_id and not b.removed loop
    update boxes set status = 'sold' where sn = x.box_sn and status = 'stock';
    if not found then raise exception 'العلبة #% مش متاحة', x.box_sn; end if;
    insert into stock_moves (item_id, location_id, qty, kind, ref, box_sn)
      select bx.item_id, o.location_id, -bx.weight, 'sale', 'W' || o.no, bx.sn from boxes bx where bx.sn = x.box_sn;
  end loop;
  insert into stock_moves (item_id, location_id, qty, kind, ref)
    select l.item_id, o.location_id, -(l.prepared - coalesce((select sum(b.qty) from online_order_boxes b where b.order_id = p_id and b.line = l.line and not b.removed), 0)), 'sale', 'W' || o.no
    from online_order_lines l where l.order_id = p_id
      and l.prepared > coalesce((select sum(b.qty) from online_order_boxes b where b.order_id = p_id and b.line = l.line and not b.removed), 0);
  select coalesce(sum(round(prepared * unit_price, 2)), 0) into sub from online_order_lines where order_id = p_id;
  update online_orders set status = 'delivered', delivered_at = now(), subtotal = sub, total = sub + delivery_fee, paid = true where id = p_id;
  return sub + o.delivery_fee;
end $$;

alter table public.customers enable row level security;
alter table public.online_orders enable row level security;
alter table public.online_order_lines enable row level security;
alter table public.online_order_boxes enable row level security;
create policy cu_read on public.customers for select to authenticated using (has_perm('orders.handle') or has_perm('acc.view'));
create policy cu_upd on public.customers for update to authenticated using (has_perm('orders.handle'));
create policy oo_read on public.online_orders for select to authenticated using (has_perm('orders.handle') or has_perm('acc.view'));
create policy oo_upd on public.online_orders for update to authenticated using (has_perm('orders.handle') or has_perm('orders.cancel'));
create policy ool_read on public.online_order_lines for select to authenticated using (has_perm('orders.handle') or has_perm('acc.view'));
create policy ool_upd on public.online_order_lines for update to authenticated using (has_perm('orders.handle'));
create policy oob_read on public.online_order_boxes for select to authenticated using (has_perm('orders.handle') or has_perm('acc.view'));
create policy oob_ins on public.online_order_boxes for insert to authenticated with check (has_perm('orders.handle'));
create policy oob_upd on public.online_order_boxes for update to authenticated using (has_perm('orders.handle'));
create policy box_upd_order on public.boxes for update to authenticated using (has_perm('orders.handle') and status = 'stock');
create policy mv_ins_order on public.stock_moves for insert to authenticated with check (kind = 'sale' and has_perm('orders.handle'));

grant execute on function public.public_menu(text) to anon;
grant execute on function public.public_branches() to anon;
grant execute on function public.place_order(text, text, text, text, text, text, text, jsonb, text) to anon;
grant execute on function public.track_order(text) to anon;

-- الملخص اليومي يشمل الأونلاين
create or replace view public.daily_summary with (security_invoker = true) as
  with s0 as (
         select (at at time zone 'Africa/Cairo')::date as day, location_id, total as sales, paid_cash - change as cash, paid_card as card from sales
         union all
         select (delivered_at at time zone 'Africa/Cairo')::date, location_id, total, case when pay_method = 'cash' then total else 0 end, case when pay_method = 'cash' then 0 else total end
         from online_orders where status = 'delivered'),
       s as (select day, location_id, sum(sales) as sales, sum(cash) as cash, sum(card) as card, count(*) as n from s0 group by 1, 2),
       e as (select day, location_id, sum(amount) as expenses from expenses where status = 'ok' group by 1, 2),
       p as (select (r.at at time zone 'Africa/Cairo')::date as day, 'main'::text as location_id, sum(l.accepted * l.price) as purchases
             from receipts r join receipt_lines l on l.receipt_id = r.id group by 1)
  select coalesce(s.day, e.day, p.day) as day, coalesce(s.location_id, e.location_id, p.location_id) as location_id,
         coalesce(s.sales, 0) as sales, coalesce(s.cash, 0) as cash, coalesce(s.card, 0) as card, coalesce(s.n, 0) as invoices,
         coalesce(e.expenses, 0) as expenses, coalesce(p.purchases, 0) as purchases
  from s full join e on e.day = s.day and e.location_id = s.location_id
         full join p on p.day = coalesce(s.day, e.day) and p.location_id = coalesce(s.location_id, e.location_id);
