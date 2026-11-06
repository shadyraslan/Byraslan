-- ============ 0026 مناطق التوصيل (مُقفل في القرارات): كل حي تبع فرع أساسي + احتياطي وليه سعر توصيل؛ العميل يختار حيّه والفرع يتحدد لوحده ============
create table public.districts (
  id bigint generated always as identity primary key,
  name text not null unique,
  city text not null,
  branch text references public.locations,
  backup text references public.locations,
  fee numeric not null default 0,
  active boolean not null default true,
  sort int not null default 0
);
insert into public.districts (name, city, branch, backup, fee, sort) values
  ('رشدي','إسكندرية','roushdy','agamy',15,1),('سيدي جابر','إسكندرية','roushdy','agamy',15,2),('سموحة','إسكندرية','roushdy','agamy',20,3),
  ('كليوباترا','إسكندرية','roushdy','agamy',15,4),('ستانلي','إسكندرية','roushdy','agamy',20,5),
  ('العجمي','إسكندرية','agamy','roushdy',15,6),('البيطاش','إسكندرية','agamy','roushdy',15,7),('الهانوفيل','إسكندرية','agamy','roushdy',20,8),('الدخيلة','إسكندرية','agamy','roushdy',25,9),
  ('مصر الجديدة','القاهرة','masr-gedida','maadi',15,10),('الزيتون','القاهرة','masr-gedida','maadi',15,11),('النزهة','القاهرة','masr-gedida','maadi',20,12),
  ('مدينة نصر','القاهرة','masr-gedida','maadi',20,13),('العباسية','القاهرة','masr-gedida','maadi',20,14),('حدائق القبة','القاهرة','masr-gedida','maadi',25,15),
  ('المعادي','القاهرة','maadi','masr-gedida',15,16),('دجلة','القاهرة','maadi','masr-gedida',15,17),('زهراء المعادي','القاهرة','maadi','masr-gedida',20,18),('البساتين','القاهرة','maadi','masr-gedida',25,19),
  ('التجمع الخامس','القاهرة',null,null,30,20)
on conflict (name) do nothing;

-- عناوين برّه المناطق (بتساعد في اختيار مكان الفرع الجاي)
create table public.zone_misses (
  id bigint generated always as identity primary key,
  district_id bigint references public.districts,
  text text,
  customer_id bigint references public.customers,
  at timestamptz not null default now()
);

alter table public.customer_addresses add column if not exists district_id bigint references public.districts;
alter table public.customer_addresses add column if not exists lat double precision;
alter table public.customer_addresses add column if not exists lng double precision;
alter table public.online_orders add column if not exists district_id bigint references public.districts;
-- شكل الصنف عند العميل: الصنف اللي مالوش صورة بياخد أيقونة ولون عيلته
alter table public.families add column if not exists icon text;
alter table public.families add column if not exists color text;
alter table public.items add column if not exists photo text;

alter table public.districts enable row level security;
alter table public.zone_misses enable row level security;
create policy staff_only on public.districts as restrictive for all to authenticated using (public.is_staff()) with check (public.is_staff());
create policy staff_only on public.zone_misses as restrictive for all to authenticated using (public.is_staff()) with check (public.is_staff());
create policy dz_read on public.districts for select to authenticated using (true);
create policy dz_write on public.districts for all to authenticated using (has_perm('settings.edit')) with check (has_perm('settings.edit'));
create policy zm_read on public.zone_misses for select to authenticated using (has_perm('settings.edit') or has_perm('orders.handle'));

-- الفرع اللي هيخدم الحي: الأساسي لو شغال، وإلا الاحتياطي
create or replace function public.district_branch(p_d bigint) returns text
language sql stable security definer set search_path = public as $$
  select case when exists (select 1 from locations l where l.id = d.branch and l.active) then d.branch
              when exists (select 1 from locations l where l.id = d.backup and l.active) then d.backup end
  from districts d where d.id = p_d and d.active
$$;

create or replace function public.public_districts()
returns table (id bigint, name text, city text, branch text, branch_name text, fee numeric)
language sql stable security definer set search_path = public as $$
  select d.id, d.name, d.city, district_branch(d.id), (select l.name from locations l where l.id = district_branch(d.id)), d.fee
  from districts d where d.active order by d.city desc, d.sort, d.name
$$;

-- طلب من صفحة الويب بالحي
create or replace function public.place_order_d(p_district bigint, p_phone text, p_name text, p_address text, p_note text, p_pay text, p_lines jsonb, p_channel text default 'web')
returns table (order_no bigint, token text, est_total numeric)
language plpgsql security definer set search_path = public as $$
declare d districts%rowtype; v_loc text; r record;
begin
  select * into d from districts where id = p_district and active;
  if not found then raise exception 'اختار منطقتك'; end if;
  v_loc := district_branch(d.id);
  if v_loc is null then
    insert into zone_misses (district_id, text) values (d.id, p_address);
    raise exception 'منطقة % لسه مش متغطية — قريب إن شاء الله', d.name;
  end if;
  select * into r from place_order(v_loc, p_phone, p_name, p_address, d.name, p_note, p_pay, p_lines, p_channel);
  update online_orders set delivery_fee = d.fee, district_id = d.id where no = r.order_no;
  return query select r.order_no, r.token, (select o.est_total + o.delivery_fee from online_orders o where o.no = r.order_no);
end $$;

-- عنوان العميل في التطبيق بالحي
create or replace function public.app_address_save(p_id bigint, p_label text, p_district bigint, p_address text, p_default boolean)
returns bigint language plpgsql security definer set search_path = public as $$
declare c bigint := app_customer(); d districts%rowtype; v bigint;
begin
  select * into d from districts where id = p_district and active;
  if not found then raise exception 'اختار منطقتك'; end if;
  if coalesce(trim(p_address), '') = '' then raise exception 'اكتب العنوان'; end if;
  if district_branch(d.id) is null then insert into zone_misses (district_id, text, customer_id) values (d.id, p_address, c); end if;
  if p_default or not exists (select 1 from customer_addresses where customer_id = c and active) then
    update customer_addresses set is_default = false where customer_id = c;
  end if;
  if p_id is null then
    insert into customer_addresses (customer_id, label, area, address, location_id, district_id, is_default)
      values (c, coalesce(nullif(trim(p_label), ''), 'البيت'), d.name, trim(p_address), district_branch(d.id), d.id,
              p_default or not exists (select 1 from customer_addresses where customer_id = c and active))
      returning id into v;
  else
    update customer_addresses set label = coalesce(nullif(trim(p_label), ''), label), area = d.name, address = trim(p_address),
           location_id = district_branch(d.id), district_id = d.id, is_default = p_default or is_default
     where id = p_id and customer_id = c returning id into v;
    if v is null then raise exception 'العنوان مش موجود'; end if;
  end if;
  return v;
end $$;

create or replace function public.app_me() returns jsonb
language sql security definer set search_path = public as $$
  select jsonb_build_object('id', c.id, 'name', c.name, 'phone', c.phone,
    'addresses', coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'label', a.label, 'area', a.area, 'address', a.address,
                  'district_id', a.district_id, 'location_id', coalesce(district_branch(a.district_id), a.location_id), 'is_default', a.is_default) order by a.is_default desc, a.id)
                            from customer_addresses a where a.customer_id = c.id and a.active), '[]'::jsonb))
  from customers c where c.id = public.app_customer()
$$;

create or replace function public.app_place_order(p_address bigint, p_note text, p_pay text, p_lines jsonb)
returns table (order_no bigint, token text, est_total numeric)
language plpgsql security definer set search_path = public as $$
declare c customers%rowtype; a customer_addresses%rowtype; r record; v_loc text; v_fee numeric;
begin
  select * into c from customers where id = app_customer();
  if coalesce(c.name, '') = '' then raise exception 'اكتب اسمك الأول'; end if;
  select * into a from customer_addresses where id = p_address and customer_id = c.id and active;
  if not found then raise exception 'اختار العنوان'; end if;
  v_loc := coalesce(district_branch(a.district_id), a.location_id);
  if v_loc is null then raise exception 'منطقتك لسه مش متغطية — قريب إن شاء الله'; end if;
  v_fee := (select fee from districts where id = a.district_id);
  select * into r from place_order(v_loc, c.phone, c.name, a.address, a.area, p_note, p_pay, p_lines, 'web');
  update online_orders set from_app = true, address_id = a.id, district_id = a.district_id, delivery_fee = coalesce(v_fee, delivery_fee) where no = r.order_no;
  return query select r.order_no, r.token, (select o.est_total + o.delivery_fee from online_orders o where o.no = r.order_no);
end $$;

create or replace function public.app_catalog(p_loc text)
returns table (item_id bigint, name text, unit text, sold_by text, price numeric, family text, brand text, available numeric, photo text, icon text, color text)
language sql stable security definer set search_path = public as $$
  select i.id, i.name, i.unit, i.sold_by, p.price, f.name, i.arm,
         coalesce((select sum(case when i.sold_by = 'piece' then 1 else b.weight end) from boxes b where b.item_id = i.id and b.location_id = p_loc and b.status = 'stock'), 0)
           + coalesce((select sum(m.qty) from stock_moves m where m.item_id = i.id and m.location_id = p_loc and m.box_sn is null), 0),
         i.photo, coalesce(f.icon, pf.icon), coalesce(f.color, pf.color)
  from prices p join items i on i.id = p.item_id left join families f on f.id = i.family_id left join families pf on pf.id = f.parent_id
  where p.location_id = p_loc and p.channel = 'app' and i.active and not i.partner_only
  order by i.arm, f.sort nulls last, i.name
$$;

create or replace function public.app_config() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'brands', coalesce((select value from settings where key = 'app.brands'), '{}'::jsonb),
    'note', (select value from settings where key = 'online.weight_note'),
    'test_mode', coalesce((select value::text::boolean from settings where key = 'app.test_mode'), false),
    'open', coalesce((select value::text::boolean from settings where key = 'online.open'), true),
    'min_order', coalesce((select value::text::numeric from settings where key = 'online.min_order'), 0),
    'districts', (select coalesce(jsonb_agg(to_jsonb(d)), '[]'::jsonb) from public_districts() d),
    'branches', (select coalesce(jsonb_agg(to_jsonb(b)), '[]'::jsonb) from public_branches() b))
$$;

grant execute on function public.public_districts() to anon, authenticated;
grant execute on function public.app_catalog(text) to anon, authenticated;
grant execute on function public.place_order_d(bigint, text, text, text, text, text, jsonb, text) to anon, authenticated;
revoke execute on function public.app_address_save(bigint, text, bigint, text, boolean) from anon, public;
grant execute on function public.app_address_save(bigint, text, bigint, text, boolean) to authenticated;
