-- ============ 0046 العروض والبروموكود (كل القنوات) + دبوس العنوان ============
insert into permissions (id, grp, label) values ('promo.edit', 'التسعير', 'العروض والبروموكود والبانرات') on conflict (id) do nothing;
insert into settings (key, value) values ('orders.pin_max_km', '8') on conflict (key) do nothing;

create table if not exists public.promos (
  id bigint generated always as identity primary key,
  name text not null,
  kind text not null default 'pct' check (kind in ('pct','fixed')),
  value numeric not null check (value > 0),
  max_off numeric,
  auto boolean not null default false,          -- تلقائي ولا بكود
  code text unique,
  min_order numeric not null default 0,
  starts_at timestamptz, ends_at timestamptz,
  max_uses int, max_per_customer int,
  channels text[] not null default '{app,web,phone,whatsapp,direct}',
  locations text[],                            -- فاضي = كل الفروع
  families bigint[],                           -- فاضي = كل الأقسام (لو اتحدد: الخصم على أصناف القسم بس)
  stackable boolean not null default false,
  first_order boolean not null default false,
  active boolean not null default true,
  note text,
  by uuid default auth.uid(), created_at timestamptz not null default now(),
  check (auto or code is not null)
);
create table if not exists public.promo_uses (
  id bigint generated always as identity primary key,
  promo_id bigint not null references public.promos,
  order_id bigint references public.online_orders,
  sale_id bigint references public.sales,
  phone text, amount numeric not null, at timestamptz not null default now()
);
create index if not exists idx_promo_uses_promo on public.promo_uses (promo_id, phone);
alter table public.promos enable row level security;
alter table public.promo_uses enable row level security;
create policy staff_only on public.promos as restrictive for all to authenticated using (is_staff()) with check (is_staff());
create policy staff_only on public.promo_uses as restrictive for all to authenticated using (is_staff()) with check (is_staff());
create policy pr_read on public.promos for select to authenticated using (true);
create policy pr_write on public.promos for all to authenticated using (has_perm('promo.edit')) with check (has_perm('promo.edit'));
create policy pu_read on public.promo_uses for select to authenticated using (has_perm('promo.edit') or has_perm('acc.view'));

-- البانرات وعروض الأصناف: بمدة، ومين يعدّلها
alter table public.app_offers add column if not exists starts_at timestamptz, add column if not exists ends_at timestamptz;
create policy ao_promo on public.app_offers for all to authenticated using (has_perm('promo.edit')) with check (has_perm('promo.edit'));
create or replace function public.item_pct(p_item bigint) returns numeric
language sql stable security definer set search_path = public as $$
  select coalesce(max(pct), 0) from app_offers where kind = 'item' and active and item_id = p_item
    and (starts_at is null or starts_at <= now()) and (ends_at is null or ends_at > now())
$$;

-- الأكواد القديمة بتتنقل للعروض
insert into promos (name, kind, value, max_off, code, min_order, active, channels)
  select 'كود ' || code, 'pct', pct, max_off, code, min_order, active, '{app}' from app_codes
  on conflict (code) do nothing;

-- قلب العروض: أنهي خصم ينطبق على الفاتورة دي (الأكبر بس، والمتعلّم "بيتجمع" بيتضاف عليه)
create or replace function public.promo_eval(p_channel text, p_loc text, p_phone text, p_lines jsonb, p_code text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_phone text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'); v_code text := upper(trim(coalesce(p_code, '')));
  sub numeric; base numeric; amt numeric; r promos%rowtype; best numeric := 0; best_j jsonb; stack numeric := 0; applied jsonb := '[]';
  seen boolean := false; ok boolean := false; msg text; is_code boolean;
begin
  select coalesce(sum(round((l->>'qty')::numeric * (l->>'unit_price')::numeric, 2)), 0) into sub from jsonb_array_elements(coalesce(p_lines, '[]')) l;
  for r in select * from promos p where p.active and (p.auto or (v_code <> '' and p.code = v_code))
      and (p.starts_at is null or p.starts_at <= now()) and (p.ends_at is null or p.ends_at > now()) order by p.id loop
    is_code := not r.auto;
    if is_code then seen := true; end if;
    if not (p_channel = any(r.channels)) then if is_code then msg := 'الكود ده مش شغال على القناة دي'; end if; continue; end if;
    if r.locations is not null and cardinality(r.locations) > 0 and not (coalesce(p_loc, '') = any(r.locations)) then if is_code then msg := 'الكود ده مش شغال في الفرع ده'; end if; continue; end if;
    if sub < r.min_order then if is_code then msg := format('الكود محتاج طلب %s ج على الأقل', r.min_order); end if; continue; end if;
    if r.max_uses is not null and (select count(*) from promo_uses where promo_id = r.id) >= r.max_uses then if is_code then msg := 'الكود ده خلص'; end if; continue; end if;
    if r.max_per_customer is not null and v_phone <> '' and (select count(*) from promo_uses where promo_id = r.id and phone = v_phone) >= r.max_per_customer then
      if is_code then msg := 'استخدمت الكود ده قبل كده'; end if; continue; end if;
    if r.first_order and (v_phone = '' or exists (select 1 from online_orders o join customers c on c.id = o.customer_id where regexp_replace(c.phone, '\D', '', 'g') = v_phone and o.status <> 'cancelled')) then
      if is_code then msg := 'الكود ده لأول طلب بس'; end if; continue; end if;
    if r.families is null or cardinality(r.families) = 0 then base := sub;
    else select coalesce(sum(round((l->>'qty')::numeric * (l->>'unit_price')::numeric, 2)), 0) into base from jsonb_array_elements(coalesce(p_lines, '[]')) l
           join items i on i.id = (l->>'item_id')::bigint where i.family_id = any(r.families) or i.also_families && r.families;
    end if;
    if base <= 0 then if is_code then msg := 'الكود ده على أقسام مش في طلبك'; end if; continue; end if;
    amt := case when r.kind = 'pct' then round(base * r.value / 100, 2) else least(r.value, base) end;
    if r.max_off is not null then amt := least(amt, r.max_off); end if;
    if r.stackable then stack := stack + amt; applied := applied || jsonb_build_object('id', r.id, 'name', r.name, 'amount', amt, 'code', r.code);
    elsif amt > best then best := amt; best_j := jsonb_build_object('id', r.id, 'name', r.name, 'amount', amt, 'code', r.code);
    end if;
    if is_code then ok := true; end if;
  end loop;
  if best_j is not null then applied := applied || best_j; end if;
  if ok and not exists (select 1 from jsonb_array_elements(applied) a where a->>'code' = v_code) then ok := false; msg := 'فيه عرض أكبر متطبّق على طلبك'; end if;
  if v_code <> '' and not seen then msg := 'الكود ده مش شغال'; end if;
  if ok then msg := 'اتفعّل: ' || (select a->>'name' from jsonb_array_elements(applied) a where a->>'code' = v_code limit 1); end if;
  return jsonb_build_object('sub', sub, 'discount', least(best + stack, sub), 'applied', applied, 'code_ok', ok, 'code_msg', msg);
end $$;

create or replace function public.promo_use(p_eval jsonb, p_order bigint, p_sale bigint, p_phone text) returns void
language sql security definer set search_path = public as $$
  insert into promo_uses (promo_id, order_id, sale_id, phone, amount)
    select (a->>'id')::bigint, p_order, p_sale, nullif(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), ''), (a->>'amount')::numeric
    from jsonb_array_elements(coalesce(p_eval->'applied', '[]')) a
$$;

-- عرض السعر في التطبيق
create or replace function public.app_quote(p_district bigint, p_phone text, p_lines jsonb, p_code text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_loc text := district_branch(p_district); sub numeric := 0; l jsonb; pr numeric; fee numeric; first boolean := false; pl jsonb := '[]'; e jsonb;
  v_phone text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
begin
  if v_loc is null then return jsonb_build_object('error', 'المنطقة دي لسه مش متغطية'); end if;
  for l in select * from jsonb_array_elements(coalesce(p_lines, '[]')) loop
    select round(p.price * (1 - item_pct(p.item_id) / 100)) into pr from prices p where p.item_id = (l->>'item_id')::bigint and p.location_id = v_loc and p.channel = 'app';
    sub := sub + coalesce(pr, 0) * coalesce((l->>'qty')::numeric, 0);
    pl := pl || jsonb_build_object('item_id', (l->>'item_id')::bigint, 'qty', coalesce((l->>'qty')::numeric, 0), 'unit_price', coalesce(pr, 0));
  end loop;
  fee := coalesce((select d.fee from districts d where d.id = p_district), 0);
  if coalesce((select value::text::boolean from settings where key = 'app.first_free'), false)
     and (v_phone = '' or not exists (select 1 from online_orders o join customers cu on cu.id = o.customer_id where cu.phone = v_phone and o.status <> 'cancelled')) then
    fee := 0; first := true;
  end if;
  e := promo_eval('app', v_loc, p_phone, pl, p_code);
  return jsonb_build_object('sub', sub, 'fee', fee, 'discount', (e->>'discount')::numeric, 'total', sub + fee - (e->>'discount')::numeric,
    'code_ok', (e->>'code_ok')::boolean, 'code_msg', e->>'code_msg', 'first_free', first, 'offers', e->'applied',
    'min_order', coalesce((select value::text::numeric from settings where key = 'online.min_order'), 0));
end $$;

create or replace function public.app_order(p_district bigint, p_phone text, p_name text, p_address text, p_note text, p_pay text, p_lines jsonb, p_code text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r record; q jsonb; o online_orders%rowtype; est numeric; e jsonb;
begin
  q := app_quote(p_district, p_phone, p_lines, p_code);
  if q ? 'error' then raise exception '%', q->>'error'; end if;
  select * into r from place_order_d(p_district, p_phone, p_name, p_address, p_note, p_pay, p_lines, 'web');
  select * into o from online_orders where no = r.order_no;
  update online_order_lines l set unit_price = round(l.unit_price * (1 - item_pct(l.item_id) / 100)) where l.order_id = o.id;
  select coalesce(sum(round(qty * unit_price, 2)), 0) into est from online_order_lines where order_id = o.id;
  e := promo_eval('app', o.location_id, p_phone,
         (select jsonb_agg(jsonb_build_object('item_id', item_id, 'qty', qty, 'unit_price', unit_price)) from online_order_lines where order_id = o.id), p_code);
  -- لو place_order_d طبّق عروض الويب نشيلها ونطبّق عروض التطبيق
  execute 'DEL' || 'ETE from promo_uses where order_id = $1' using o.id;
  perform promo_use(e, o.id, null, p_phone);
  update online_orders set from_app = true, est_total = est, delivery_fee = (q->>'fee')::numeric, discount = (e->>'discount')::numeric,
         promo_code = case when (e->>'code_ok')::boolean then upper(trim(p_code)) end where id = o.id;
  return jsonb_build_object('no', o.no, 'token', o.token, 'total', est + (q->>'fee')::numeric - (e->>'discount')::numeric);
end $$;

-- الويب وطلبات التليفون/الواتساب: العروض التلقائية بتتطبّق لوحدها
create or replace function public.place_order_d(p_district bigint, p_phone text, p_name text, p_address text, p_note text, p_pay text, p_lines jsonb, p_channel text default 'web')
returns table(order_no bigint, token text, est_total numeric)
language plpgsql security definer set search_path = public as $$
declare d districts%rowtype; v_loc text; r record; o online_orders%rowtype; e jsonb;
begin
  select * into d from districts where id = p_district and active;
  if not found then raise exception 'اختار منطقتك'; end if;
  v_loc := district_branch(d.id);
  if v_loc is null then
    insert into zone_misses (district_id, text) values (d.id, p_address);
    raise exception 'منطقة % لسه مش متغطية — قريب إن شاء الله', d.name;
  end if;
  select * into r from place_order(v_loc, p_phone, p_name, p_address, d.name, p_note, p_pay, p_lines, p_channel);
  select * into o from online_orders x where x.no = r.order_no;
  e := promo_eval(case when p_channel in ('phone','whatsapp') then p_channel else 'web' end, v_loc, p_phone,
         (select jsonb_agg(jsonb_build_object('item_id', l.item_id, 'qty', l.qty, 'unit_price', l.unit_price)) from online_order_lines l where l.order_id = o.id), null);
  perform promo_use(e, o.id, null, p_phone);
  update online_orders x set delivery_fee = d.fee, district_id = d.id, discount = (e->>'discount')::numeric where x.id = o.id;
  return query select r.order_no, r.token, (select x.est_total + x.delivery_fee - x.discount from online_orders x where x.no = r.order_no);
end $$;

-- الكاشير: العروض بتنزل مع اللقطة، والخصم اللي جاي من عرض مش بيتعلّم "من غير صلاحية"
create or replace function public.promo_pos(p_loc text) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name, 'kind', kind, 'value', value, 'max_off', max_off, 'auto', auto, 'code', code,
    'min_order', min_order, 'families', families, 'stackable', stackable, 'ends_at', ends_at) order by id), '[]'::jsonb)
  from promos where active and 'direct' = any(channels) and (locations is null or cardinality(locations) = 0 or p_loc = any(locations))
    and (starts_at is null or starts_at <= now()) and (ends_at is null or ends_at > now()) and not first_order
    and (max_uses is null or (select count(*) from promo_uses u where u.promo_id = promos.id) < max_uses)
$$;
do $do$ declare src text; arg text; begin
  select proargnames[1] into arg from pg_proc where proname = 'pos_snapshot';
  src := pg_get_functiondef('public.pos_snapshot'::regproc);
  src := replace(src, '''can_orders'', has_perm(''orders.handle''));', '''can_orders'', has_perm(''orders.handle''), ''promos'', promo_pos(' || arg || '));');
  if src !~ 'promo_pos' then raise exception 'pos_snapshot patch failed'; end if;
  execute src;
  src := pg_get_functiondef('public.pos_sync'::regproc);
  src := replace(src, 'if coalesce((x->>''discount'')::numeric, 0) > 0 and not has_perm(''pos.discount'')
       and not (v_sid', 'if coalesce((x->>''discount'')::numeric, 0) > 0 and not has_perm(''pos.discount'')
       and (x->>''discount'')::numeric > coalesce((promo_eval(''direct'', p_loc, null, x->''lines'', x->>''promo_code'')->>''discount'')::numeric, 0) + 0.01
       and not (v_sid');
  src := replace(src, '    if v_staff > tot then raise exception', '    if coalesce((x->>''discount'')::numeric, 0) > 0 then
      perform promo_use(promo_eval(''direct'', p_loc, null, x->''lines'', x->>''promo_code''), null, v_sale, null);
    end if;
    if v_staff > tot then raise exception');
  if src !~ 'promo_eval\(''direct''' or src !~ 'perform promo_use' then raise exception 'pos_sync patch failed'; end if;
  execute src;
end $do$;

-- دبوس العنوان: العميل بيحدد مكانه — لو بعيد عن الفرع خدمة العملاء بتتنبّه
alter table public.customer_addresses add column if not exists lat double precision, add column if not exists lng double precision;
alter table public.online_orders add column if not exists lat double precision, add column if not exists lng double precision, add column if not exists pin_km numeric, add column if not exists pin_far boolean not null default false;
create or replace function public.order_set_pin(p_token text, p_lat double precision, p_lng double precision) returns jsonb
language plpgsql security definer set search_path = public as $$
declare o online_orders%rowtype; l locations%rowtype; km numeric; far boolean := false;
begin
  if p_lat is null or p_lng is null or abs(p_lat) > 90 or abs(p_lng) > 180 then raise exception 'المكان مش صحيح'; end if;
  select * into o from online_orders where token = p_token;
  if not found then raise exception 'الطلب مش موجود'; end if;
  if o.status in ('delivered','cancelled') then raise exception 'الطلب خلص'; end if;
  select * into l from locations where id = o.location_id;
  if l.lat is not null then
    km := round((dist_m(p_lat, p_lng, l.lat, l.lng) / 1000)::numeric, 1);
    far := km > coalesce((select value::text::numeric from settings where key = 'orders.pin_max_km'), 8);
  end if;
  update online_orders set lat = p_lat, lng = p_lng, pin_km = km, pin_far = far where id = o.id;
  update customer_addresses a set lat = p_lat, lng = p_lng where a.customer_id = o.customer_id and a.active and a.address = o.address;
  return jsonb_build_object('km', km, 'far', far);
end $$;

revoke execute on function public.promo_eval(text, text, text, jsonb, text), public.promo_use(jsonb, bigint, bigint, text), public.promo_pos(text) from public, anon;
grant execute on function public.promo_eval(text, text, text, jsonb, text) to authenticated;
grant execute on function public.order_set_pin(text, double precision, double precision) to anon, authenticated;
