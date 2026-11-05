-- ============ 0022 تطبيق العميل "باي رسلان": حساب العميل، العناوين، المنيو بالبراند، الطلب، طلباتي، الإشعارات ============
create extension if not exists pg_net with schema extensions;

insert into public.settings (key, value) values
  ('app.brands', '{"rostos":"روستوز","market":"رسلان ماركت","oricci":"تودزي"}'),
  ('app.push_text', '{"accepted":"طلبك اتقبل وبيتحضّر","ready":"طلبك جاهز","out":"طلبك خرج مع الطيار","delivered":"طلبك وصل — بالهنا والشفا","cancelled":"طلبك اتلغى"}')
on conflict do nothing;

alter table public.online_orders add column if not exists from_app boolean not null default false;
alter table public.online_orders add column if not exists address_id bigint;

create table public.customer_addresses (
  id bigint generated always as identity primary key,
  customer_id bigint not null references public.customers,
  label text not null default 'البيت',
  area text,
  address text not null,
  location_id text references public.locations,
  is_default boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.push_tokens (
  token text primary key,
  customer_id bigint not null references public.customers,
  platform text,
  updated_at timestamptz not null default now()
);

alter table public.customer_addresses enable row level security;
alter table public.push_tokens enable row level security;
create policy staff_only on public.customer_addresses as restrictive for all to authenticated using (public.is_staff()) with check (public.is_staff());
create policy staff_only on public.push_tokens as restrictive for all to authenticated using (public.is_staff()) with check (public.is_staff());
create policy ca_read on public.customer_addresses for select to authenticated using (has_perm('orders.handle'));

-- العميل الحالي
create or replace function public.app_customer() returns bigint
language plpgsql security definer set search_path = public as $$
declare c bigint; u auth.users%rowtype;
begin
  if auth.uid() is null then raise exception 'سجّل دخول الأول'; end if;
  select id into c from customers where auth_id = auth.uid();
  if c is not null then return c; end if;
  select * into u from auth.users where id = auth.uid();
  if u.phone is null then raise exception 'الحساب ده مش حساب عميل'; end if;
  insert into customers (phone, name, auth_id) values (regexp_replace(u.phone, '^\+?20', '0'), '', u.id)
    on conflict (phone) do update set auth_id = excluded.auth_id returning id into c;
  return c;
end $$;

create or replace function public.app_me() returns jsonb
language sql security definer set search_path = public as $$
  select jsonb_build_object('id', c.id, 'name', c.name, 'phone', c.phone,
    'addresses', coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'label', a.label, 'area', a.area, 'address', a.address, 'location_id', a.location_id, 'is_default', a.is_default) order by a.is_default desc, a.id)
                            from customer_addresses a where a.customer_id = c.id and a.active), '[]'::jsonb))
  from customers c where c.id = public.app_customer()
$$;

create or replace function public.app_save_name(p_name text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(trim(p_name), '') = '' then raise exception 'اكتب اسمك'; end if;
  update customers set name = trim(p_name) where id = app_customer();
end $$;

create or replace function public.app_save_address(p_id bigint, p_label text, p_area text, p_address text, p_loc text, p_default boolean)
returns bigint language plpgsql security definer set search_path = public as $$
declare c bigint := app_customer(); v bigint;
begin
  if coalesce(trim(p_address), '') = '' then raise exception 'اكتب العنوان'; end if;
  if p_loc is not null and not exists (select 1 from locations where id = p_loc and type in ('dark','shop')) then raise exception 'اختار الفرع'; end if;
  if p_default or not exists (select 1 from customer_addresses where customer_id = c and active) then
    update customer_addresses set is_default = false where customer_id = c;
  end if;
  if p_id is null then
    insert into customer_addresses (customer_id, label, area, address, location_id, is_default)
      values (c, coalesce(nullif(trim(p_label), ''), 'البيت'), nullif(trim(p_area), ''), trim(p_address), p_loc,
              p_default or not exists (select 1 from customer_addresses where customer_id = c and active))
      returning id into v;
  else
    update customer_addresses set label = coalesce(nullif(trim(p_label), ''), label), area = nullif(trim(p_area), ''), address = trim(p_address), location_id = p_loc,
           is_default = p_default or is_default where id = p_id and customer_id = c returning id into v;
    if v is null then raise exception 'العنوان مش موجود'; end if;
  end if;
  return v;
end $$;

create or replace function public.app_remove_address(p_id bigint) returns void
language sql security definer set search_path = public as $$
  update customer_addresses set active = false, is_default = false where id = p_id and customer_id = public.app_customer()
$$;

-- المنيو بالبراند
create or replace function public.app_menu(p_loc text)
returns table (item_id bigint, name text, unit text, sold_by text, price numeric, family text, brand text, available numeric)
language sql stable security definer set search_path = public as $$
  select i.id, i.name, i.unit, i.sold_by, p.price, f.name, i.arm,
         coalesce((select sum(case when i.sold_by = 'piece' then 1 else b.weight end) from boxes b where b.item_id = i.id and b.location_id = p_loc and b.status = 'stock'), 0)
           + coalesce((select sum(m.qty) from stock_moves m where m.item_id = i.id and m.location_id = p_loc and m.box_sn is null), 0)
  from prices p join items i on i.id = p.item_id left join families f on f.id = i.family_id
  where p.location_id = p_loc and p.channel = 'app' and i.active and not i.partner_only
  order by i.arm, f.sort nulls last, i.name
$$;

create or replace function public.app_config() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'brands', coalesce((select value from settings where key = 'app.brands'), '{}'::jsonb),
    'note', (select value from settings where key = 'online.weight_note'),
    'branches', (select coalesce(jsonb_agg(to_jsonb(b)), '[]'::jsonb) from public_branches() b))
$$;

-- الطلب من التطبيق: الاسم والموبايل من الحساب، والعنوان من عناوينه
create or replace function public.app_place_order(p_address bigint, p_note text, p_pay text, p_lines jsonb)
returns table (order_no bigint, token text, est_total numeric)
language plpgsql security definer set search_path = public as $$
declare c customers%rowtype; a customer_addresses%rowtype; r record;
begin
  select * into c from customers where id = app_customer();
  if coalesce(c.name, '') = '' then raise exception 'اكتب اسمك الأول'; end if;
  select * into a from customer_addresses where id = p_address and customer_id = c.id and active;
  if not found then raise exception 'اختار العنوان'; end if;
  if a.location_id is null then raise exception 'اختار الفرع للعنوان ده'; end if;
  select * into r from place_order(a.location_id, c.phone, c.name, a.address, a.area, p_note, p_pay, p_lines, 'web');
  update online_orders set from_app = true, address_id = a.id where no = r.order_no;
  return query select r.order_no, r.token, r.est_total;
end $$;

create or replace function public.app_my_orders() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('no', o.no, 'token', o.token, 'status', o.status, 'created_at', o.created_at, 'branch', l.name, 'location_id', o.location_id,
           'total', coalesce(o.total, o.est_total + o.delivery_fee),
           'lines', (select jsonb_agg(jsonb_build_object('item_id', x.item_id, 'name', i.name, 'qty', x.qty, 'unit', i.unit) order by x.line) from online_order_lines x join items i on i.id = x.item_id where x.order_id = o.id))
         order by o.id desc), '[]'::jsonb)
  from (select * from online_orders where customer_id = public.app_customer() order by id desc limit 30) o join locations l on l.id = o.location_id
$$;

create or replace function public.app_register_push(p_token text, p_platform text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(p_token, '') !~ '^ExponentPushToken\[' then raise exception 'token غلط'; end if;
  insert into push_tokens (token, customer_id, platform) values (p_token, app_customer(), p_platform)
    on conflict (token) do update set customer_id = excluded.customer_id, platform = excluded.platform, updated_at = now();
end $$;

-- إشعار للعميل مع كل تغيير في حالة الطلب
create or replace function public.notify_order_status() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
declare msg text; toks jsonb;
begin
  if new.status = old.status then return new; end if;
  msg := (select value ->> new.status from settings where key = 'app.push_text');
  if msg is null then return new; end if;
  select jsonb_agg(jsonb_build_object('to', token, 'title', 'طلب رقم ' || new.no, 'body', msg, 'sound', 'default', 'data', jsonb_build_object('token', new.token)))
    into toks from push_tokens where customer_id = new.customer_id;
  if toks is null then return new; end if;
  perform net.http_post(url := 'https://exp.host/--/api/v2/push/send', body := toks, headers := '{"Content-Type":"application/json","Accept":"application/json"}'::jsonb);
  return new;
end $$;
create trigger order_push after update of status on public.online_orders for each row execute function public.notify_order_status();

revoke execute on function public.app_customer() from anon;
grant execute on function public.app_menu(text) to anon, authenticated;
grant execute on function public.app_config() to anon, authenticated;
revoke execute on function public.app_me(), public.app_save_name(text), public.app_save_address(bigint, text, text, text, text, boolean), public.app_remove_address(bigint),
  public.app_place_order(bigint, text, text, jsonb), public.app_my_orders(), public.app_register_push(text, text) from anon, public;
grant execute on function public.app_me(), public.app_save_name(text), public.app_save_address(bigint, text, text, text, text, boolean), public.app_remove_address(bigint),
  public.app_place_order(bigint, text, text, jsonb), public.app_my_orders(), public.app_register_push(text, text) to authenticated;
