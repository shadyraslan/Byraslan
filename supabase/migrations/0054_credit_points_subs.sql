-- ============ 0054 حسابات الآجل (جملة وشركات) + نقاط الولاء + بديل صنف الشريك + كود أمان الكابتن + ربط الباركود وقت الاستلام ============

insert into permissions (id, grp, label) values
  ('credit.open',    'العملاء', 'فتح حساب آجل لعميل وتعديل حدّه (الحد = أقصى حد ائتمان ج)'),
  ('credit.sell',    'العملاء', 'البيع آجل لعميل جملة/شركة في الكاشير'),
  ('credit.collect', 'العملاء', 'تحصيل فلوس من عملاء الآجل'),
  ('credit.view',    'العملاء', 'كشوف حسابات الآجل والمتأخرات'),
  ('loyalty.edit',   'العملاء', 'إعدادات نقاط الولاء وشريحة العميل'),
  ('loyalty.adjust', 'العملاء', 'إضافة أو خصم نقاط يدوي (الحد = أقصى نقاط في المرة)'),
  ('barcode.link',   'المشتريات', 'ربط باركود مش معروف بصنف (في الاستلام)')
on conflict (id) do nothing;

insert into settings (key, value) values
  ('credit', '{"block_overdue": true, "grace_days": 0, "default_days": 30}'::jsonb),
  ('loyalty', '{"on": true, "earn_per": 10, "point_value": 0.1, "min_redeem": 200, "expire_months": 6, "vip_mult": 1.5, "wholesale": false, "max_pct": 50, "channels": ["app"]}'::jsonb),
  ('partner.sub_wait_min', '3'::jsonb)
on conflict (key) do nothing;

-- ===================== العملاء: الشريحة وبيانات الشركة =====================
alter table customers add column if not exists tier text not null default 'normal';
alter table customers add column if not exists company text;
alter table customers add column if not exists tax_no text;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'customers_tier_chk') then
    alter table customers add constraint customers_tier_chk check (tier in ('normal','vip','wholesale'));
  end if;
end $$;

-- ===================== الآجل =====================
create table if not exists credit_accounts (
  customer_id bigint primary key references customers(id),
  limit_amt numeric not null default 0 check (limit_amt >= 0),
  days int not null default 30 check (days between 0 and 365),
  active boolean not null default true,
  note text,
  opened_by uuid default auth.uid(), opened_at timestamptz not null default now(),
  updated_by uuid, updated_at timestamptz
);
create sequence if not exists credit_moves_no;
create table if not exists credit_moves (
  id bigserial primary key,
  no bigint not null default nextval('credit_moves_no'),
  customer_id bigint not null references customers(id),
  kind text not null check (kind in ('sale','order','pay','adjust','return')),
  amount numeric not null,               -- موجب = عليه (دين)، سالب = دفع / خصم
  method text, ref text,
  sale_id bigint references sales(id), order_id bigint references online_orders(id),
  location_id text, due date,
  "by" uuid default auth.uid(), at timestamptz not null default now(), note text
);
create index if not exists credit_moves_cust on credit_moves (customer_id, at);
create unique index if not exists credit_moves_order on credit_moves (order_id) where kind = 'order';
alter table sales add column if not exists paid_credit numeric not null default 0;
alter table sales add column if not exists credit_customer bigint references customers(id);

alter table credit_accounts enable row level security;
alter table credit_moves enable row level security;
drop policy if exists staff_only on credit_accounts; create policy staff_only on credit_accounts as restrictive for all using (is_staff()) with check (is_staff());
drop policy if exists staff_only on credit_moves; create policy staff_only on credit_moves as restrictive for all using (is_staff()) with check (is_staff());
drop policy if exists ca_read on credit_accounts; create policy ca_read on credit_accounts for select using (has_perm('credit.view') or has_perm('credit.open') or has_perm('credit.collect') or has_perm('credit.sell') or has_perm('acc.view'));
drop policy if exists cm_read on credit_moves; create policy cm_read on credit_moves for select using (has_perm('credit.view') or has_perm('credit.collect') or has_perm('acc.view'));

-- الحالة: الرصيد، المتأخر (بالترتيب: الدفع بيقفل أقدم دين الأول)، المتاح، وممنوع ولا لا
create or replace function public.credit_state(p_cust bigint) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare a credit_accounts%rowtype; bal numeric; od numeric; paid numeric; oldest date; cfg jsonb := coalesce((select value from settings where key = 'credit'), '{}'); blocked text;
begin
  select * into a from credit_accounts where customer_id = p_cust;
  select coalesce(sum(amount), 0), coalesce(-sum(amount) filter (where amount < 0), 0) into bal, paid from credit_moves where customer_id = p_cust;
  od := greatest(coalesce((select sum(amount) from credit_moves where customer_id = p_cust and amount > 0 and due < current_date), 0) - paid, 0);
  -- أقدم دين لسه مااتدفعش
  select due into oldest from (select due, sum(amount) over (order by at, id) run from credit_moves where customer_id = p_cust and amount > 0) z where run > paid order by due nulls last limit 1;
  if a.customer_id is null then blocked := 'مالوش حساب آجل';
  elsif not a.active then blocked := 'الحساب الآجل موقوف';
  elsif od > 0 and coalesce((cfg->>'block_overdue')::boolean, true) and oldest + coalesce((cfg->>'grace_days')::int, 0) < current_date then blocked := format('عليه متأخرات %s ج من %s', round(od, 2), oldest);
  end if;
  return jsonb_build_object('customer_id', p_cust, 'limit', coalesce(a.limit_amt, 0), 'days', coalesce(a.days, 0), 'active', coalesce(a.active, false),
    'balance', round(bal, 2), 'overdue', round(od, 2), 'oldest_due', oldest, 'available', round(greatest(coalesce(a.limit_amt, 0) - bal, 0), 2), 'blocked', blocked);
end $$;

-- الكاشير: يدوّر على عميل الآجل برقمه
create or replace function public.credit_check(p_phone text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare c customers%rowtype; st jsonb;
begin
  if not (has_perm('credit.sell') or has_perm('credit.collect') or has_perm('credit.view')) then raise exception 'محتاج صلاحية الآجل'; end if;
  select * into c from customers where regexp_replace(phone, '\D', '', 'g') = regexp_replace(coalesce(p_phone, ''), '\D', '', 'g') limit 1;
  if not found then raise exception 'مفيش عميل بالرقم ده'; end if;
  st := credit_state(c.id);
  if not (st->>'active')::boolean and st->>'blocked' = 'مالوش حساب آجل' then raise exception '% مالوش حساب آجل', coalesce(c.company, c.name); end if;
  return st || jsonb_build_object('name', c.name, 'company', c.company, 'phone', c.phone);
end $$;

-- فتح / تعديل حساب آجل
create or replace function public.credit_open(p_phone text, p_name text, p_company text, p_tax text, p_limit numeric, p_days int, p_tier text, p_active boolean, p_note text) returns bigint
language plpgsql security definer set search_path = public as $$
declare v_phone text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'); c bigint; lim numeric := perm_limit('credit.open');
begin
  if lim = -1 then raise exception 'محتاج صلاحية فتح الآجل'; end if;
  if lim is not null and coalesce(p_limit, 0) > lim then raise exception 'حدّك تفتح لحد % ج', lim; end if;
  if v_phone !~ '^0?1[0125]\d{8}$' then raise exception 'رقم موبايل غلط'; end if;
  if coalesce(trim(p_name), '') = '' and coalesce(trim(p_company), '') = '' then raise exception 'اكتب اسم العميل أو الشركة'; end if;
  if v_phone !~ '^0' then v_phone := '0' || v_phone; end if;
  select id into c from customers where regexp_replace(phone, '\D', '', 'g') in (v_phone, substr(v_phone, 2)) limit 1;
  if c is null then
    insert into customers (phone, name) values (v_phone, coalesce(nullif(trim(p_name), ''), trim(p_company))) returning id into c;
  end if;
  update customers set company = nullif(trim(p_company), ''), tax_no = nullif(trim(p_tax), ''),
    name = coalesce(nullif(trim(p_name), ''), name), tier = case when p_tier in ('normal','vip','wholesale') then p_tier else tier end where id = c;
  insert into credit_accounts (customer_id, limit_amt, days, active, note)
    values (c, coalesce(p_limit, 0), coalesce(p_days, 30), coalesce(p_active, true), nullif(trim(p_note), ''))
    on conflict (customer_id) do update set limit_amt = excluded.limit_amt, days = excluded.days, active = excluded.active, note = excluded.note, updated_by = auth.uid(), updated_at = now();
  return c;
end $$;

-- تحصيل / تسوية
create or replace function public.credit_pay(p_cust bigint, p_amount numeric, p_method text, p_ref text, p_loc text, p_note text) returns bigint
language plpgsql security definer set search_path = public as $$
declare n bigint;
begin
  if not has_perm('credit.collect') then raise exception 'محتاج صلاحية التحصيل'; end if;
  if coalesce(p_amount, 0) <= 0 then raise exception 'اكتب المبلغ'; end if;
  if not exists (select 1 from credit_accounts where customer_id = p_cust) then raise exception 'العميل ده مالوش حساب آجل'; end if;
  if p_method not in ('cash','transfer','instapay','cheque') then raise exception 'طريقة دفع غلط'; end if;
  insert into credit_moves (customer_id, kind, amount, method, ref, location_id, note) values (p_cust, 'pay', -p_amount, p_method, nullif(trim(p_ref), ''), p_loc, nullif(trim(p_note), ''))
    returning no into n;
  return n;
end $$;
-- تعديل يدوي (خصم أو إضافة) — بحد صلاحية الفتح
create or replace function public.credit_adjust(p_cust bigint, p_amount numeric, p_note text) returns void
language plpgsql security definer set search_path = public as $$
declare lim numeric := perm_limit('credit.open');
begin
  if lim = -1 then raise exception 'محتاج صلاحية الآجل'; end if;
  if lim is not null and abs(p_amount) > lim then raise exception 'حدّك % ج', lim; end if;
  if coalesce(length(trim(p_note)), 0) < 3 then raise exception 'اكتب السبب'; end if;
  insert into credit_moves (customer_id, kind, amount, note, due) values (p_cust, 'adjust', p_amount, trim(p_note), current_date);
end $$;

-- قايمة الحسابات للداشبورد
create or replace function public.credit_list() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(credit_state(a.customer_id) || jsonb_build_object('name', c.name, 'company', c.company, 'phone', c.phone, 'tier', c.tier, 'tax_no', c.tax_no, 'note', a.note,
           'last_pay', (select max(at) from credit_moves m where m.customer_id = a.customer_id and m.kind = 'pay')) order by coalesce(c.company, c.name)), '[]'::jsonb)
  from credit_accounts a join customers c on c.id = a.customer_id
  where has_perm('credit.view') or has_perm('credit.open') or has_perm('credit.collect') or has_perm('acc.view')
$$;

-- طلب أونلاين بالآجل: بيتسجّل دين لما يتسلّم، وبيترجع لو اتلغى/رجع بعد التسليم
create or replace function public.credit_on_order() returns trigger
language plpgsql security definer set search_path = public as $$
declare d int;
begin
  if new.pay_method = 'credit' and new.status = 'delivered' and old.status is distinct from 'delivered' then
    select days into d from credit_accounts where customer_id = new.customer_id;
    insert into credit_moves (customer_id, kind, amount, ref, order_id, location_id, due, "by")
      values (new.customer_id, 'order', coalesce(new.total, 0), '#' || new.no, new.id, new.location_id, current_date + coalesce(d, 30), auth.uid())
      on conflict do nothing;
  elsif new.pay_method = 'credit' and new.status in ('cancelled','returned') and old.status = 'delivered' then
    insert into credit_moves (customer_id, kind, amount, ref, location_id, note)
      select new.customer_id, 'return', -m.amount, '#' || new.no, new.location_id, 'مرتجع طلب' from credit_moves m where m.order_id = new.id and m.kind = 'order';
  end if;
  return new;
end $$;
drop trigger if exists credit_on_order on online_orders;
create trigger credit_on_order after update of status on online_orders for each row execute function credit_on_order();

-- ===================== نقاط الولاء =====================
alter table online_orders add column if not exists points_used int not null default 0;
alter table online_orders add column if not exists points_off numeric not null default 0;
alter table online_orders add column if not exists sub_pref text not null default 'ask';
create table if not exists points_moves (
  id bigserial primary key,
  customer_id bigint not null references customers(id),
  kind text not null check (kind in ('earn','redeem','refund','reverse','expire','adjust')),
  points int not null,
  order_id bigint references online_orders(id),
  expires_at timestamptz,
  "by" uuid default auth.uid(), at timestamptz not null default now(), note text
);
create index if not exists points_moves_cust on points_moves (customer_id, at);
create unique index if not exists points_moves_once on points_moves (order_id, kind) where order_id is not null and kind in ('earn','redeem','refund','reverse');
alter table points_moves enable row level security;
drop policy if exists staff_only on points_moves; create policy staff_only on points_moves as restrictive for all using (is_staff()) with check (is_staff());
drop policy if exists pm_read on points_moves; create policy pm_read on points_moves for select using (has_perm('loyalty.edit') or has_perm('loyalty.adjust') or has_perm('cs.agent') or has_perm('acc.view'));

create or replace function public.points_cfg() returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce((select value from settings where key = 'loyalty'), '{}'::jsonb) $$;
create or replace function public.points_balance(p_cust bigint) returns int language sql stable security definer set search_path = public as $$
  select coalesce(sum(points), 0)::int from points_moves where customer_id = p_cust $$;
-- اللي هيخلص قريب (أول بأول: الاستبدال بياكل أقدم نقاط)
create or replace function public.points_expiring(p_cust bigint, p_before timestamptz) returns int
language sql stable security definer set search_path = public as $$
  select greatest(coalesce((select sum(points) from points_moves where customer_id = p_cust and points > 0 and expires_at is not null and expires_at < p_before), 0)
                + coalesce((select sum(points) from points_moves where customer_id = p_cust and points < 0), 0), 0)::int $$;

-- الطلب: كسب النقاط لما يتسلّم، ورجوع النقاط المستبدلة لو اتلغى، وعكس الكسب لو رجع
create or replace function public.points_on_order() returns trigger
language plpgsql security definer set search_path = public as $$
declare cfg jsonb := points_cfg(); t text; ch text; pts int; base numeric;
begin
  if new.status = 'delivered' and old.status is distinct from 'delivered' and coalesce((cfg->>'on')::boolean, false) then
    select tier into t from customers where id = new.customer_id;
    ch := case when new.from_app then 'app' else coalesce(new.channel, 'web') end;
    if (t <> 'wholesale' or coalesce((cfg->>'wholesale')::boolean, false)) and coalesce(cfg->'channels', '["app"]'::jsonb) ? ch and new.pay_method <> 'credit' then
      base := greatest(coalesce(new.subtotal, new.est_total, 0) - coalesce(new.discount, 0), 0);
      pts := floor(base / greatest(coalesce((cfg->>'earn_per')::numeric, 10), 0.01) * case when t = 'vip' then coalesce((cfg->>'vip_mult')::numeric, 1) else 1 end);
      if pts > 0 then
        insert into points_moves (customer_id, kind, points, order_id, expires_at, "by", note)
          values (new.customer_id, 'earn', pts, new.id, now() + make_interval(months => coalesce((cfg->>'expire_months')::int, 6)), null, 'طلب #' || new.no)
          on conflict do nothing;
      end if;
    end if;
  elsif new.status in ('cancelled','returned') and old.status is distinct from new.status then
    if new.points_used > 0 then
      insert into points_moves (customer_id, kind, points, order_id, expires_at, "by", note)
        values (new.customer_id, 'refund', new.points_used, new.id, now() + make_interval(months => coalesce((cfg->>'expire_months')::int, 6)), null, 'رجوع نقاط طلب #' || new.no || ' اتلغى')
        on conflict do nothing;
    end if;
    insert into points_moves (customer_id, kind, points, order_id, "by", note)
      select new.customer_id, 'reverse', -m.points, new.id, null, 'طلب #' || new.no || ' رجع' from points_moves m where m.order_id = new.id and m.kind = 'earn'
      on conflict do nothing;
  end if;
  return new;
end $$;
drop trigger if exists points_on_order on online_orders;
create trigger points_on_order after update of status on online_orders for each row execute function points_on_order();

-- انتهاء النقاط (يومي)
create or replace function public.points_expire_tick() returns int
language plpgsql security definer set search_path = public as $$
declare r record; n int := 0; e int;
begin
  for r in select distinct customer_id from points_moves where kind in ('earn','refund','adjust') and points > 0 and expires_at < now() loop
    e := points_expiring(r.customer_id, now());
    if e > 0 then insert into points_moves (customer_id, kind, points, "by", note) values (r.customer_id, 'expire', -e, null, 'نقاط خلصت مدتها'); n := n + 1; end if;
  end loop;
  return n;
end $$;

-- إثبات إن الموبايل ده بتاع صاحب الرقم: لازم يكون عليه رقم تتبّع طلب سابق من نفس الرقم (من غير OTP)
create or replace function public.points_owner(p_phone text, p_tokens text[]) returns bigint
language sql stable security definer set search_path = public as $$
  select c.id from customers c
  where regexp_replace(c.phone, '\D', '', 'g') in (regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), '0' || regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), substr(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), 2))
    and exists (select 1 from online_orders o where o.customer_id = c.id and o.token = any((coalesce(p_tokens, '{}'))[1:50]))
  limit 1 $$;

create or replace function public.app_points(p_phone text, p_tokens text[]) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare c bigint := points_owner(p_phone, p_tokens); cfg jsonb := points_cfg(); b int; t text;
begin
  if not coalesce((cfg->>'on')::boolean, false) then return jsonb_build_object('on', false); end if;
  if c is null then return jsonb_build_object('on', true, 'known', false, 'earn_per', cfg->'earn_per', 'point_value', cfg->'point_value', 'min_redeem', cfg->'min_redeem'); end if;
  b := points_balance(c); select tier into t from customers where id = c;
  return jsonb_build_object('on', true, 'known', true, 'balance', b, 'value', round(b * coalesce((cfg->>'point_value')::numeric, 0), 2), 'tier', t,
    'earn_per', cfg->'earn_per', 'point_value', cfg->'point_value', 'min_redeem', cfg->'min_redeem', 'max_pct', cfg->'max_pct', 'vip_mult', cfg->'vip_mult',
    'expire_months', cfg->'expire_months', 'expiring_30', points_expiring(c, now() + interval '30 days'),
    'no_points', t = 'wholesale' and not coalesce((cfg->>'wholesale')::boolean, false),
    'history', (select coalesce(jsonb_agg(jsonb_build_object('kind', kind, 'points', points, 'at', at, 'note', note) order by at desc), '[]'::jsonb)
                from (select * from points_moves where customer_id = c order by at desc limit 40) z));
end $$;

-- حساب الاستبدال على طلب
create or replace function public.points_redeem_calc(p_cust bigint, p_points int, p_base numeric) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare cfg jsonb := points_cfg(); b int; pv numeric := coalesce((cfg->>'point_value')::numeric, 0); cap numeric; use int;
begin
  if coalesce(p_points, 0) <= 0 or p_cust is null or not coalesce((cfg->>'on')::boolean, false) then return jsonb_build_object('points', 0, 'off', 0); end if;
  b := points_balance(p_cust);
  if b < coalesce((cfg->>'min_redeem')::int, 0) then return jsonb_build_object('points', 0, 'off', 0, 'msg', format('أقل استبدال %s نقطة — معاك %s', cfg->>'min_redeem', b)); end if;
  cap := round(greatest(p_base, 0) * coalesce((cfg->>'max_pct')::numeric, 100) / 100, 2);
  use := least(p_points, b, case when pv > 0 then floor(cap / pv) else 0 end)::int;
  return jsonb_build_object('points', use, 'off', round(use * pv, 2), 'balance', b);
end $$;

-- الداشبورد
create or replace function public.points_adjust(p_cust bigint, p_points int, p_note text) returns void
language plpgsql security definer set search_path = public as $$
declare lim numeric := perm_limit('loyalty.adjust'); cfg jsonb := points_cfg();
begin
  if lim = -1 then raise exception 'محتاج صلاحية تعديل النقاط'; end if;
  if lim is not null and abs(p_points) > lim then raise exception 'حدّك % نقطة', lim; end if;
  if coalesce(p_points, 0) = 0 then raise exception 'اكتب عدد النقاط'; end if;
  if coalesce(length(trim(p_note)), 0) < 3 then raise exception 'اكتب السبب'; end if;
  if p_points < 0 and points_balance(p_cust) + p_points < 0 then raise exception 'الرصيد مايكفيش'; end if;
  insert into points_moves (customer_id, kind, points, expires_at, note)
    values (p_cust, 'adjust', p_points, case when p_points > 0 then now() + make_interval(months => coalesce((cfg->>'expire_months')::int, 6)) end, trim(p_note));
end $$;
create or replace function public.customer_tier_set(p_cust bigint, p_tier text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not has_perm('loyalty.edit') then raise exception 'محتاج صلاحية النقاط'; end if;
  if p_tier not in ('normal','vip','wholesale') then raise exception 'شريحة غلط'; end if;
  update customers set tier = p_tier where id = p_cust;
end $$;
create or replace function public.loyalty_save(p jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not has_perm('loyalty.edit') then raise exception 'محتاج صلاحية النقاط'; end if;
  insert into settings (key, value, updated_at) values ('loyalty', jsonb_build_object(
    'on', coalesce((p->>'on')::boolean, true), 'earn_per', greatest(coalesce((p->>'earn_per')::numeric, 10), 0.01), 'point_value', greatest(coalesce((p->>'point_value')::numeric, 0), 0),
    'min_redeem', greatest(coalesce((p->>'min_redeem')::int, 0), 0), 'expire_months', greatest(coalesce((p->>'expire_months')::int, 6), 1),
    'vip_mult', greatest(coalesce((p->>'vip_mult')::numeric, 1), 0), 'wholesale', coalesce((p->>'wholesale')::boolean, false),
    'max_pct', least(greatest(coalesce((p->>'max_pct')::numeric, 100), 0), 100), 'channels', coalesce(p->'channels', '["app"]'::jsonb)), now())
  on conflict (key) do update set value = excluded.value, updated_at = now();
end $$;
create or replace function public.points_list(p_q text) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(x order by (x->>'balance')::int desc), '[]'::jsonb) from (
    select jsonb_build_object('id', c.id, 'name', c.name, 'phone', c.phone, 'tier', c.tier, 'company', c.company, 'balance', points_balance(c.id),
      'earned', (select coalesce(sum(points), 0) from points_moves m where m.customer_id = c.id and m.kind = 'earn'),
      'redeemed', (select coalesce(-sum(points), 0) from points_moves m where m.customer_id = c.id and m.kind = 'redeem'),
      'expiring_30', points_expiring(c.id, now() + interval '30 days'),
      'last', (select max(at) from points_moves m where m.customer_id = c.id)) x
    from customers c
    where (has_perm('loyalty.edit') or has_perm('loyalty.adjust') or has_perm('cs.agent'))
      and (coalesce(trim(p_q), '') = '' and exists (select 1 from points_moves m where m.customer_id = c.id)
           or coalesce(trim(p_q), '') <> '' and (c.name ilike '%' || trim(p_q) || '%' or c.phone like '%' || regexp_replace(p_q, '\D', '', 'g') || '%' or c.company ilike '%' || trim(p_q) || '%'))
    limit 200) z
$$;
create or replace function public.points_history(p_cust bigint) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('kind', m.kind, 'points', m.points, 'at', m.at, 'note', m.note, 'expires_at', m.expires_at, 'who', p.name, 'order_no', o.no, 'token', o.token) order by m.at desc), '[]'::jsonb)
  from points_moves m left join profiles p on p.id = m."by" left join online_orders o on o.id = m.order_id
  where m.customer_id = p_cust and (has_perm('loyalty.edit') or has_perm('loyalty.adjust') or has_perm('cs.agent'))
$$;

-- ===================== بديل صنف الشريك =====================
alter table online_order_lines add column if not exists sub_status text;
alter table online_order_lines add column if not exists sub_item bigint references items(id);
alter table online_order_lines add column if not exists sub_qty numeric;
alter table online_order_lines add column if not exists sub_price numeric;
alter table online_order_lines add column if not exists sub_deadline timestamptz;
alter table online_order_lines add column if not exists sub_of int;   -- السطر ده بديل لسطر رقم كذا

-- اقتراحات: نفس القسم، أقرب سعر، صنف ماركت شغال
create or replace function public.partner_sub_suggest(p_order bigint, p_line int) returns jsonb
language sql stable security definer set search_path = public as $$
  with l as (select l.*, i.family_id fam, o.location_id loc from online_order_lines l join items i on i.id = l.item_id join online_orders o on o.id = l.order_id where l.order_id = p_order and l.line = p_line)
  select coalesce(jsonb_agg(jsonb_build_object('item_id', i.id, 'name', i.name, 'unit', i.unit, 'price', p.price) order by abs(p.price - l.unit_price)), '[]'::jsonb)
  from l join items i on i.family_id = l.fam and i.id <> l.item_id and i.active and i.partner_only
    join prices p on p.item_id = i.id and p.location_id = l.loc and p.channel = 'app'
  where (has_perm('partner.dispatch') or has_perm('partner.manage'))
    and i.id in (select i2.id from items i2 join prices p2 on p2.item_id = i2.id and p2.location_id = l.loc and p2.channel = 'app'
                 where i2.family_id = l.fam and i2.id <> l.item_id and i2.active and i2.partner_only order by abs(p2.price - l.unit_price) limit 3)
$$;

create or replace function public.sub_apply(p_order bigint, p_line int, p_accept boolean) returns void
language plpgsql security definer set search_path = public as $$
declare l online_order_lines%rowtype; n int;
begin
  select * into l from online_order_lines where order_id = p_order and line = p_line for update;
  if not found or l.sub_status <> 'offered' then return; end if;
  if p_accept then
    select coalesce(max(line), 0) + 1 into n from online_order_lines where order_id = p_order;
    insert into online_order_lines (order_id, line, item_id, qty, unit_price, prepared, sub_of) values (p_order, n, l.sub_item, l.sub_qty, l.sub_price, l.sub_qty, l.line);
    update online_order_lines set sub_status = 'accepted', prepared = 0 where order_id = p_order and line = p_line;
  else
    update online_order_lines set sub_status = 'rejected', prepared = 0 where order_id = p_order and line = p_line;
  end if;
  update online_orders o set est_total = (select coalesce(sum(round(qty * unit_price, 2)), 0) from online_order_lines x where x.order_id = p_order and coalesce(x.sub_status, '') not in ('accepted','rejected','removed')) where o.id = p_order;
  insert into order_changes (order_id, "by", by_customer, kind, before, after, reason)
    values (p_order, auth.uid(), auth.uid() is null, 'substitute', jsonb_build_object('line', p_line, 'item', l.item_id), jsonb_build_object('item', l.sub_item, 'accepted', p_accept), 'بديل صنف ماركت');
end $$;
-- لو العميل ماردّش في المهلة: بيتنفّذ اختياره الأصلي (بدّله = يتقبل، غير كده = يتشال)
create or replace function public.sub_resolve_expired(p_order bigint) returns void
language plpgsql security definer set search_path = public as $$
declare r record;
begin
  for r in select l.order_id, l.line, o.sub_pref from online_order_lines l join online_orders o on o.id = l.order_id
           where (p_order is null or l.order_id = p_order) and l.sub_status = 'offered' and l.sub_deadline < now() loop
    perform sub_apply(r.order_id, r.line, r.sub_pref = 'replace');
  end loop;
end $$;

create or replace function public.partner_offer_sub(p_order bigint, p_line int, p_item bigint, p_qty numeric) returns text
language plpgsql security definer set search_path = public as $$
declare o online_orders%rowtype; pr numeric; c customers%rowtype; nm text; w int := coalesce((select value::text::int from settings where key = 'partner.sub_wait_min'), 3);
begin
  if not (has_perm('partner.dispatch') or has_perm('partner.manage')) then raise exception 'محتاج صلاحية الديسباتشر'; end if;
  select * into o from online_orders where id = p_order;
  if o.status not in ('new','accepted','preparing') then raise exception 'الطلب مش في التجهيز'; end if;
  select price into pr from prices where item_id = p_item and location_id = o.location_id and channel = 'app';
  if pr is null then raise exception 'البديل مالوش سعر في التطبيق للفرع ده'; end if;
  select name into nm from items where id = p_item;
  if o.sub_pref = 'remove' then
    update online_order_lines set prepared = 0, sub_status = 'removed' where order_id = p_order and line = p_line;
    return 'العميل مختار "شيله لو مش موجود" — اتشال';
  end if;
  update online_order_lines set sub_status = 'offered', sub_item = p_item, sub_qty = coalesce(p_qty, qty), sub_price = round(pr * (1 - item_pct(p_item) / 100)), sub_deadline = now() + make_interval(mins => w)
    where order_id = p_order and line = p_line and item_id in (select id from items where partner_only);
  if not found then raise exception 'السطر ده مش صنف ماركت'; end if;
  insert into partner_preps (order_id, location_id) select p_order, pb.location_id from partner_branches pb where pb.branch_id = o.location_id on conflict (order_id) do nothing;
  if o.sub_pref = 'replace' then perform sub_apply(p_order, p_line, true); return 'العميل مختار "بدّله" — البديل اتسجّل'; end if;
  select * into c from customers where id = o.customer_id;
  begin
    perform cs_push_customer(regexp_replace(c.phone, '\D', '', 'g'), 'صنف مش موجود — فيه بديل 🔄', format('طلب #%s: عندنا %s بدل اللي طلبته. وافق أو ارفض في خلال %s دقايق.', o.no, nm, w), o.token);
  exception when others then null; end;
  return format('البديل اتبعت للعميل — مستنيين رده %s دقايق', w);
end $$;

-- العميل بيرد من التطبيق برقم تتبّع الطلب
create or replace function public.app_sub_answer(p_token text, p_line int, p_accept boolean) returns void
language plpgsql security definer set search_path = public as $$
declare o bigint;
begin
  select id into o from online_orders where token = p_token;
  if o is null then raise exception 'الطلب مش موجود'; end if;
  if not exists (select 1 from online_order_lines where order_id = o and line = p_line and sub_status = 'offered') then raise exception 'العرض ده خلص'; end if;
  perform sub_apply(o, p_line, p_accept);
end $$;

-- ===================== كود الأمان بين المحضّر والكابتن =====================
alter table partner_preps add column if not exists code text;
alter table partner_preps add column if not exists handed_at timestamptz;
alter table partner_preps add column if not exists handed_by uuid;
alter table partner_preps add column if not exists tries int not null default 0;

create or replace function public.partner_handover(p_order bigint, p_code text) returns void
language plpgsql security definer set search_path = public as $$
declare p partner_preps%rowtype;
begin
  if not (has_perm('partner.dispatch') or has_perm('partner.manage')) then raise exception 'محتاج صلاحية الديسباتشر'; end if;
  select * into p from partner_preps where order_id = p_order for update;
  if not found or p.status <> 'ready' then raise exception 'الطلب مش جاهز'; end if;
  if p.tries >= 5 then raise exception 'الكود اتكتب غلط 5 مرات — كلّم مدير الحركة'; end if;
  if trim(coalesce(p_code, '')) <> p.code then
    update partner_preps set tries = tries + 1 where order_id = p_order;
    raise exception 'الكود غلط — اسأل الكابتن على كود الطلب من تطبيقه';
  end if;
  update partner_preps set status = 'handed', handed_at = now(), handed_by = auth.uid() where order_id = p_order;
end $$;
-- الكود للكابتن/مدير الحركة (تطبيق تودزي لما يتربط) — مش للمحضّر
create or replace function public.order_pickup_code(p_order bigint) returns text
language plpgsql stable security definer set search_path = public as $$
begin
  if not (has_perm('orders.handle') or has_perm('cs.agent') or has_perm('fleet.manage')) then raise exception 'محتاج صلاحية الطلبات'; end if;
  return (select code from partner_preps where order_id = p_order);
end $$;

-- ===================== ربط باركود مجهول وقت الاستلام =====================
create or replace function public.barcode_link(p_code text, p_item bigint) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not (has_perm('barcode.link') or has_perm('items.edit')) then raise exception 'محتاج صلاحية ربط الباركود'; end if;
  if coalesce(trim(p_code), '') = '' then raise exception 'الباركود فاضي'; end if;
  if exists (select 1 from item_barcodes where code = trim(p_code) and item_id <> p_item) then raise exception 'الباركود ده متسجّل على صنف تاني'; end if;
  insert into item_barcodes (code, item_id) values (trim(p_code), p_item) on conflict (code) do nothing;
  update unknown_scans set resolved_item = p_item, resolved_at = now() where code = trim(p_code) and resolved_item is null;
end $$;

-- ===================== صلاحيات الدوال =====================
revoke execute on function public.credit_state(bigint), public.credit_check(text), public.credit_open(text, text, text, text, numeric, int, text, boolean, text),
  public.credit_pay(bigint, numeric, text, text, text, text), public.credit_adjust(bigint, numeric, text), public.credit_list(), public.credit_on_order(),
  public.points_cfg(), public.points_balance(bigint), public.points_expiring(bigint, timestamptz), public.points_on_order(), public.points_expire_tick(),
  public.points_owner(text, text[]), public.app_points(text, text[]), public.points_redeem_calc(bigint, int, numeric), public.points_adjust(bigint, int, text),
  public.customer_tier_set(bigint, text), public.loyalty_save(jsonb), public.points_list(text), public.points_history(bigint),
  public.partner_sub_suggest(bigint, int), public.sub_apply(bigint, int, boolean), public.sub_resolve_expired(bigint), public.partner_offer_sub(bigint, int, bigint, numeric),
  public.app_sub_answer(text, int, boolean), public.partner_handover(bigint, text), public.order_pickup_code(bigint), public.barcode_link(text, bigint) from public;
revoke execute on function public.credit_state(bigint), public.credit_on_order(), public.points_on_order(), public.points_expire_tick(), public.points_owner(text, text[]),
  public.points_redeem_calc(bigint, int, numeric), public.sub_apply(bigint, int, boolean), public.points_balance(bigint), public.points_expiring(bigint, timestamptz) from authenticated, anon;
grant execute on function public.credit_check(text), public.credit_open(text, text, text, text, numeric, int, text, boolean, text), public.credit_pay(bigint, numeric, text, text, text, text),
  public.credit_adjust(bigint, numeric, text), public.credit_list(), public.points_cfg(), public.points_adjust(bigint, int, text), public.customer_tier_set(bigint, text),
  public.loyalty_save(jsonb), public.points_list(text), public.points_history(bigint), public.partner_sub_suggest(bigint, int), public.sub_resolve_expired(bigint),
  public.partner_offer_sub(bigint, int, bigint, numeric), public.partner_handover(bigint, text), public.order_pickup_code(bigint), public.barcode_link(text, bigint) to authenticated;
grant execute on function public.app_points(text, text[]), public.app_sub_answer(text, int, boolean) to anon, authenticated;
