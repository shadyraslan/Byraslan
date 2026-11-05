-- ============ 0015 الكاشير: ورديات، فواتير، والسعر بيتحسب في الداتابيز (مش من الشاشة) ============

insert into public.permissions (id, grp, label) values
  ('pos.discount','البيع','خصم على الفاتورة في الكاشير'),
  ('pos.shift','البيع','فتح وقفل الورديات')
on conflict do nothing;

create table public.shifts (
  id bigint generated always as identity primary key,
  location_id text not null references public.locations,
  cashier uuid not null default auth.uid() references public.profiles,
  opened_at timestamptz not null default now(),
  opening_cash numeric not null default 0,
  closed_at timestamptz,
  counted_cash numeric,
  expected_cash numeric,
  status text not null default 'open' check (status in ('open','closed'))
);
create unique index one_open_shift on public.shifts (cashier) where status = 'open';

create table public.sales (
  id bigint generated always as identity primary key,
  no bigint generated always as identity (start with 100001),
  location_id text not null references public.locations,
  shift_id bigint not null references public.shifts,
  cashier uuid not null default auth.uid(),
  at timestamptz not null default now(),
  subtotal numeric not null,
  discount numeric not null default 0,
  total numeric not null,
  paid_cash numeric not null default 0,
  paid_card numeric not null default 0,
  change numeric not null default 0
);

create table public.sale_lines (
  sale_id bigint not null references public.sales,
  line int not null,
  item_id bigint not null references public.items,
  box_sn bigint references public.boxes,
  qty numeric not null,
  unit_price numeric not null,
  total numeric not null,
  primary key (sale_id, line)
);

-- سعر الصنف في الفرع (بيع مباشر)
create or replace function public.pos_price(p_item bigint, p_loc text)
returns numeric language sql stable security invoker set search_path = public as $$
  select price from prices where item_id = p_item and location_id = p_loc and channel = 'direct'
$$;

-- يقرا اللي اتمسح في الكاشير: QR علبة أو باركود صنف ← الصنف والكمية والسعر
create or replace function public.pos_lookup(p_loc text, p_code text)
returns table (item_id bigint, item_name text, unit text, box_sn bigint, qty numeric, unit_price numeric)
language plpgsql stable security invoker set search_path = public as $$
declare v text := upper(trim(p_code)); v_sn bigint; b boxes%rowtype; it items%rowtype; pr numeric;
begin
  if v ~ '^R?[0-9]{3,9}(\|.*)?$' and not exists (select 1 from item_barcodes where code = trim(p_code)) then
    v_sn := substring(split_part(v, '|', 1) from '[0-9]+')::bigint;
    select * into b from boxes x where x.sn = v_sn;
    if found then
      if b.status <> 'stock' then raise exception 'العلبة #% %', v_sn, case b.status when 'sold' then 'اتباعت قبل كده' when 'transit' then 'لسه في الطريق — استلمها الأول' when 'loaded' then 'على عربية' when 'waste' then 'متسجّلة هالك' when 'missing' then 'متسجّلة ناقصة' else 'مش متاحة للبيع' end; end if;
      if b.location_id <> p_loc then raise exception 'العلبة #% مش في الفرع ده', v_sn; end if;
      select * into it from items where id = b.item_id;
      pr := pos_price(it.id, p_loc);
      if pr is null then raise exception 'مفيش سعر لـ % في الفرع ده', it.name; end if;
      return query select it.id, it.name, it.unit, b.sn,
        case when it.unit = 'قطعة' or it.sold_by = 'piece' then 1::numeric else b.weight end, pr;
      return;
    end if;
  end if;
  select i.* into it from item_barcodes c join items i on i.id = c.item_id where c.code = trim(p_code);
  if not found then raise exception 'الكود ده مش متسجّل'; end if;
  if it.arm = 'rostos' and it.kind = 'product' then raise exception '% بيتباع بالعلبة — امسح QR العلبة', it.name; end if;
  pr := pos_price(it.id, p_loc);
  if pr is null then raise exception 'مفيش سعر لـ % في الفرع ده', it.name; end if;
  return query select it.id, it.name, it.unit, null::bigint, 1::numeric, pr;
end $$;

create or replace function public.pos_open_shift(p_loc text, p_cash numeric)
returns bigint language plpgsql security invoker set search_path = public as $$
declare s bigint;
begin
  if not has_perm('pos.sell') then raise exception 'محتاج صلاحية البيع'; end if;
  select id into s from shifts where cashier = auth.uid() and status = 'open';
  if s is not null then return s; end if;
  insert into shifts (location_id, opening_cash) values (p_loc, coalesce(p_cash, 0)) returning id into s;
  return s;
end $$;

-- البيع: الأسعار بتتحسب هنا، والعلب بتتعلّم "اتباعت"، والمخزون بيتخصم
-- p_lines: [{"box_sn":1234}] أو [{"item_id":5,"qty":2}]
create or replace function public.pos_sale(p_shift bigint, p_lines jsonb, p_discount numeric, p_cash numeric, p_card numeric)
returns table (sale_id bigint, sale_no bigint, total numeric, change numeric)
language plpgsql security invoker set search_path = public as $$
declare sh shifts%rowtype; l jsonb; i int := 0; r record; sub numeric := 0; tot numeric; sid bigint; sno bigint; seen bigint[] := '{}'; ch numeric;
begin
  if not has_perm('pos.sell') then raise exception 'محتاج صلاحية البيع'; end if;
  select * into sh from shifts where id = p_shift and cashier = auth.uid() and status = 'open';
  if not found then raise exception 'افتح وردية الأول'; end if;
  if jsonb_array_length(coalesce(p_lines, '[]')) = 0 then raise exception 'الفاتورة فاضية'; end if;
  if coalesce(p_discount, 0) > 0 and not has_perm('pos.discount') then raise exception 'الخصم محتاج صلاحية'; end if;

  insert into sales (location_id, shift_id, subtotal, discount, total) values (sh.location_id, sh.id, 0, 0, 0) returning id, no into sid, sno;
  for l in select * from jsonb_array_elements(p_lines) loop
    i := i + 1;
    if l ? 'box_sn' then
      if (l->>'box_sn')::bigint = any(seen) then raise exception 'العلبة #% متكررة في الفاتورة', l->>'box_sn'; end if;
      seen := seen || (l->>'box_sn')::bigint;
      select * into r from pos_lookup(sh.location_id, l->>'box_sn');
      update boxes set status = 'sold' where sn = r.box_sn;
      insert into stock_moves (item_id, location_id, qty, kind, ref, box_sn)
        select b.item_id, sh.location_id, -b.weight, 'sale', 'S' || sno, b.sn from boxes b where b.sn = r.box_sn;
    else
      select it.id as item_id, pos_price(it.id, sh.location_id) as unit_price, null::bigint as box_sn, greatest((l->>'qty')::numeric, 0) as qty
        into r from items it where it.id = (l->>'item_id')::bigint;
      if r.unit_price is null then raise exception 'مفيش سعر لصنف في الفاتورة'; end if;
      if r.qty <= 0 then raise exception 'الكمية لازم أكبر من صفر'; end if;
      insert into stock_moves (item_id, location_id, qty, kind, ref) values (r.item_id, sh.location_id, -r.qty, 'sale', 'S' || sno);
    end if;
    insert into sale_lines (sale_id, line, item_id, box_sn, qty, unit_price, total)
      values (sid, i, r.item_id, r.box_sn, r.qty, r.unit_price, round(r.qty * r.unit_price, 2));
    sub := sub + round(r.qty * r.unit_price, 2);
  end loop;
  tot := greatest(sub - coalesce(p_discount, 0), 0);
  if coalesce(p_cash, 0) + coalesce(p_card, 0) < tot then raise exception 'المدفوع أقل من الإجمالي (% ج)', tot; end if;
  if coalesce(p_card, 0) > tot then raise exception 'الفيزا أكتر من الإجمالي'; end if;
  ch := coalesce(p_cash, 0) + coalesce(p_card, 0) - tot;
  update sales set subtotal = sub, discount = coalesce(p_discount, 0), total = tot, paid_cash = coalesce(p_cash, 0), paid_card = coalesce(p_card, 0), change = ch where id = sid;
  return query select sid, sno, tot, ch;
end $$;

create or replace function public.pos_close_shift(p_shift bigint, p_counted numeric)
returns numeric language plpgsql security invoker set search_path = public as $$
declare sh shifts%rowtype; v_exp numeric;
begin
  select * into sh from shifts where id = p_shift and status = 'open' and (cashier = auth.uid() or has_perm('pos.shift'));
  if not found then raise exception 'الوردية دي مش مفتوحة'; end if;
  select sh.opening_cash + coalesce(sum(s.paid_cash - s.change), 0) into v_exp from sales s where s.shift_id = p_shift;
  update shifts set status = 'closed', closed_at = now(), counted_cash = p_counted, expected_cash = v_exp where id = p_shift;
  return coalesce(p_counted, 0) - v_exp;
end $$;

alter table public.shifts enable row level security;
alter table public.sales enable row level security;
alter table public.sale_lines enable row level security;
create policy sh_read on public.shifts for select to authenticated using (cashier = auth.uid() or has_perm('pos.shift') or has_perm('acc.view'));
create policy sh_ins on public.shifts for insert to authenticated with check (cashier = auth.uid() and has_perm('pos.sell'));
create policy sh_upd on public.shifts for update to authenticated using (cashier = auth.uid() or has_perm('pos.shift'));
create policy sa_read on public.sales for select to authenticated using (cashier = auth.uid() or has_perm('pos.shift') or has_perm('acc.view'));
create policy sa_ins on public.sales for insert to authenticated with check (cashier = auth.uid() and has_perm('pos.sell'));
create policy sa_upd on public.sales for update to authenticated using (cashier = auth.uid() and has_perm('pos.sell'));
create policy sl_read on public.sale_lines for select to authenticated using (exists (select 1 from sales s where s.id = sale_id and (s.cashier = auth.uid() or has_perm('pos.shift') or has_perm('acc.view'))));
create policy sl_ins on public.sale_lines for insert to authenticated with check (has_perm('pos.sell'));
-- البيع بيعلّم العلبة "اتباعت" بصلاحية البيع
create policy box_upd_sale on public.boxes for update to authenticated using (has_perm('pos.sell') and status = 'stock');
