-- ============ 0049 السوبر ماركت الشريك: الشركاء وفروعهم (مخزن وهمي)، ملف الصبح بالمطابقة، التكلفة بالخصم، الحساب الجاري، شاشة الديسباتشر والمطابقة ============
insert into permissions (id, grp, label) values
  ('partner.manage', 'الشريك', 'إعداد الشركاء والخصومات وربط الأصناف'),
  ('partner.upload', 'الشريك', 'رفع ملف الصبح واعتماده'),
  ('partner.settle', 'الشريك', 'الحساب الجاري والتسويات'),
  ('partner.dispatch', 'الشريك', 'ديسباتشر الماركت (تحضير الطلبات)')
on conflict (id) do nothing;
insert into settings (key, value) values ('partner', '{"diff_alert_pct": 30}') on conflict (key) do nothing;

create table if not exists public.partners (
  id bigint generated always as identity primary key,
  name text not null, phone text, discount_pct numeric not null default 0,
  settle_cycle text not null default 'weekly' check (settle_cycle in ('daily','weekly','monthly','manual')), due_days int not null default 7,
  settle_methods text[] not null default '{offset,cash,transfer,instapay,carry}',
  file_map jsonb not null default '{}', unit text not null default 'piece',
  active boolean not null default true, created_at timestamptz not null default now()
);
create table if not exists public.partner_branches (
  location_id text primary key references public.locations,
  partner_id bigint not null references public.partners,
  branch_id text references public.locations,          -- فرع روستوز المربوط
  near boolean not null default true                    -- قريب: كابتن واحد بيعدّي
);
create table if not exists public.partner_discounts (
  id bigint generated always as identity primary key,
  partner_id bigint not null references public.partners,
  family_id bigint references public.families, item_id bigint references public.items,
  pct numeric not null
);
create table if not exists public.partner_items (
  partner_id bigint not null references public.partners,
  code text not null,                                   -- كود الصنف عند الشريك
  item_id bigint references public.items,
  name text, price numeric, cost numeric, prev_price numeric, review boolean not null default false, updated_at timestamptz,
  primary key (partner_id, code)
);
create table if not exists public.partner_uploads (
  id bigint generated always as identity primary key,
  location_id text not null references public.locations, partner_id bigint not null references public.partners,
  rows jsonb not null, status text not null default 'draft' check (status in ('draft','approved','cancelled')),
  by uuid default auth.uid() references public.profiles, at timestamptz not null default now(),
  approved_by uuid references public.profiles, approved_at timestamptz
);
create table if not exists public.partner_ledger (
  id bigint generated always as identity primary key,
  partner_id bigint not null references public.partners,
  at timestamptz not null default now(), day date not null default ((now() at time zone 'Africa/Cairo')::date),
  kind text not null check (kind in ('take','sale','settle','adjust')),
  amount numeric not null,                              -- موجب = علينا للشريك، سالب = علينا له اتسدّ/له علينا
  method text, ref text, order_id bigint references public.online_orders, note text,
  by uuid default auth.uid() references public.profiles
);
create table if not exists public.partner_preps (
  order_id bigint primary key references public.online_orders,
  location_id text not null references public.locations,
  receipt_no text, amount numeric, bags int, status text not null default 'preparing' check (status in ('preparing','ready','handed')),
  by uuid default auth.uid() references public.profiles, at timestamptz not null default now(), ready_at timestamptz
);
do $$ declare t text; begin
  foreach t in array array['partners','partner_branches','partner_discounts','partner_items','partner_uploads','partner_ledger','partner_preps'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy staff_only on public.%I as restrictive for all to authenticated using (is_staff()) with check (is_staff())', t);
    execute format('create policy p_read on public.%I for select to authenticated using (has_perm(''partner.manage'') or has_perm(''partner.upload'') or has_perm(''partner.settle'') or has_perm(''partner.dispatch'') or has_perm(''acc.view''))', t);
  end loop;
end $$;
create policy p_write on public.partners for all to authenticated using (has_perm('partner.manage')) with check (has_perm('partner.manage'));
create policy p_write on public.partner_branches for all to authenticated using (has_perm('partner.manage')) with check (has_perm('partner.manage'));
create policy p_write on public.partner_discounts for all to authenticated using (has_perm('partner.manage')) with check (has_perm('partner.manage'));
create policy p_write on public.partner_items for all to authenticated using (has_perm('partner.manage') or has_perm('partner.upload')) with check (has_perm('partner.manage') or has_perm('partner.upload'));

-- نسبة الخصم: الصنف يغلب القسم يغلب الافتراضي
create or replace function public.partner_pct(p_partner bigint, p_item bigint) returns numeric
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select pct from partner_discounts where partner_id = p_partner and item_id = p_item order by id desc limit 1),
    (select d.pct from partner_discounts d join items i on i.id = p_item where d.partner_id = p_partner and d.item_id is null and d.family_id = i.family_id order by d.id desc limit 1),
    (select discount_pct from partners where id = p_partner), 0)
$$;

-- رفع ملف الصبح: [{code, barcode, name, qty, price}] ← مسودة بالمطابقة
create or replace function public.partner_upload(p_loc text, p_rows jsonb) returns bigint
language plpgsql security definer set search_path = public as $$
declare v_p bigint; v_id bigint;
begin
  if not has_perm('partner.upload') then raise exception 'محتاج صلاحية رفع ملف الشريك'; end if;
  select partner_id into v_p from partner_branches where location_id = p_loc;
  if v_p is null then raise exception 'الموقع ده مش فرع شريك'; end if;
  if jsonb_array_length(coalesce(p_rows, '[]')) = 0 then raise exception 'الملف فاضي'; end if;
  update partner_uploads set status = 'cancelled' where location_id = p_loc and status = 'draft';
  -- ربط تلقائي بالباركود للأكواد الجديدة
  insert into partner_items (partner_id, code, item_id, name)
    select v_p, r->>'code', (select b.item_id from item_barcodes b where b.code = nullif(r->>'barcode', '') limit 1), r->>'name'
    from jsonb_array_elements(p_rows) r where coalesce(r->>'code', '') <> ''
    on conflict (partner_id, code) do update set item_id = coalesce(partner_items.item_id, excluded.item_id), name = coalesce(excluded.name, partner_items.name);
  insert into partner_uploads (location_id, partner_id, rows) values (p_loc, v_p, p_rows) returning id into v_id;
  return v_id;
end $$;

create or replace function public.partner_upload_view(p_id bigint) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare u partner_uploads%rowtype; thr numeric := coalesce((select (value->>'diff_alert_pct')::numeric from settings where key = 'partner'), 30);
begin
  if not (has_perm('partner.upload') or has_perm('partner.manage')) then raise exception 'محتاج صلاحية الشريك'; end if;
  select * into u from partner_uploads where id = p_id;
  if not found then raise exception 'الرفعة مش موجودة'; end if;
  return jsonb_build_object('id', u.id, 'status', u.status, 'loc', u.location_id, 'loc_name', (select name from locations where id = u.location_id), 'partner', (select name from partners where id = u.partner_id), 'partner_id', u.partner_id, 'at', u.at,
    'rows', (select coalesce(jsonb_agg(x order by (x->>'flag') nulls last, x->>'name'), '[]'::jsonb) from (
      select jsonb_build_object('code', r->>'code', 'name', coalesce(i.name, r->>'name'), 'item_id', pi.item_id, 'file_qty', (r->>'qty')::numeric,
        'sys_qty', s.q, 'price', (r->>'price')::numeric, 'old_price', pi.price,
        'cost', round((r->>'price')::numeric * (1 - partner_pct(u.partner_id, pi.item_id) / 100), 2), 'pct', partner_pct(u.partner_id, pi.item_id),
        'flag', case when pi.item_id is null then 'new' when pi.price is not null and (r->>'price')::numeric <> pi.price then 'price'
                     when coalesce(s.q, 0) > 0 and abs((r->>'qty')::numeric - s.q) / s.q * 100 > thr then 'diff' end) x
      from jsonb_array_elements(u.rows) r
      left join partner_items pi on pi.partner_id = u.partner_id and pi.code = r->>'code'
      left join items i on i.id = pi.item_id
      left join lateral (select sum(m.qty) q from stock_moves m where m.item_id = pi.item_id and m.location_id = u.location_id) s on true) z),
    'missing', (select coalesce(jsonb_agg(jsonb_build_object('item_id', i.id, 'name', i.name, 'sys_qty', q)), '[]'::jsonb) from (
      select m.item_id, sum(m.qty) q from stock_moves m where m.location_id = u.location_id group by 1 having sum(m.qty) > 0) s join items i on i.id = s.item_id
      where not exists (select 1 from jsonb_array_elements(u.rows) r join partner_items pi on pi.partner_id = u.partner_id and pi.code = r->>'code' where pi.item_id = s.item_id)),
    'diff_alert_pct', thr);
end $$;

create or replace function public.partner_map(p_partner bigint, p_code text, p_item bigint) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not (has_perm('partner.upload') or has_perm('partner.manage')) then raise exception 'محتاج صلاحية الشريك'; end if;
  update partner_items set item_id = p_item where partner_id = p_partner and code = p_code;
end $$;

-- الاعتماد: رصيد الملف بيحل محل القديم بالكامل (حركة تسوية بالفرق)، والسعر والتكلفة بيتحدّثوا، وتغيّر السعر بيعلّم "راجع السعر"
create or replace function public.partner_upload_approve(p_id bigint, p_fix jsonb default '{}') returns jsonb
language plpgsql security definer set search_path = public as $$
declare u partner_uploads%rowtype; r jsonb; v_item bigint; q numeric; cur numeric; n int := 0; changed int := 0; pr numeric;
begin
  if not has_perm('partner.upload') then raise exception 'محتاج صلاحية رفع ملف الشريك'; end if;
  select * into u from partner_uploads where id = p_id and status = 'draft' for update;
  if not found then raise exception 'الرفعة دي مش مسودة'; end if;
  for r in select * from jsonb_array_elements(u.rows) loop
    select item_id into v_item from partner_items where partner_id = u.partner_id and code = r->>'code';
    if v_item is null then continue; end if;
    q := coalesce((p_fix->>(r->>'code'))::numeric, (r->>'qty')::numeric, 0);
    select coalesce(sum(qty), 0) into cur from stock_moves where item_id = v_item and location_id = u.location_id;
    if q <> cur then insert into stock_moves (item_id, location_id, qty, kind, reason, ref, by) values (v_item, u.location_id, q - cur, 'adjust', 'ملف الشريك', 'P' || u.id, auth.uid()); end if;
    pr := (r->>'price')::numeric;
    update partner_items set prev_price = price, price = pr, cost = round(pr * (1 - partner_pct(u.partner_id, v_item) / 100), 2),
      review = review or (price is not null and price <> pr), updated_at = now()
      where partner_id = u.partner_id and code = r->>'code' returning (prev_price is distinct from pr and prev_price is not null)::int into q;
    changed := changed + coalesce(q, 0)::int; n := n + 1;
  end loop;
  -- الأصناف اللي اختفت من الملف رصيدها بيبقى صفر
  insert into stock_moves (item_id, location_id, qty, kind, reason, ref, by)
    select m.item_id, u.location_id, -sum(m.qty), 'adjust', 'مش في ملف الشريك', 'P' || u.id, auth.uid() from stock_moves m
    where m.location_id = u.location_id and not exists (select 1 from jsonb_array_elements(u.rows) x join partner_items pi on pi.partner_id = u.partner_id and pi.code = x->>'code' where pi.item_id = m.item_id)
    group by m.item_id having sum(m.qty) <> 0;
  update partner_uploads set status = 'approved', approved_by = auth.uid(), approved_at = now() where id = p_id;
  return jsonb_build_object('items', n, 'price_changed', changed);
end $$;

-- الحساب الجاري: أصناف اتاخدت (له)، بضاعة اتباعتله (عليه)، تسويات
create or replace function public.partner_entry(p_partner bigint, p_kind text, p_amount numeric, p_method text, p_note text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not has_perm('partner.settle') then raise exception 'محتاج صلاحية الحساب الجاري'; end if;
  if p_kind not in ('sale','settle','adjust') or coalesce(p_amount, 0) = 0 then raise exception 'البيانات ناقصة'; end if;
  insert into partner_ledger (partner_id, kind, amount, method, note)
    values (p_partner, p_kind, case when p_kind in ('sale','settle') then -abs(p_amount) else p_amount end, p_method, nullif(trim(p_note), ''));
end $$;
create or replace function public.partner_statement(p_partner bigint, p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not (has_perm('partner.settle') or has_perm('acc.view')) then raise exception 'محتاج صلاحية الحساب الجاري'; end if;
  return jsonb_build_object(
    'opening', (select coalesce(sum(amount), 0) from partner_ledger where partner_id = p_partner and day < p_from),
    'lines', (select coalesce(jsonb_agg(jsonb_build_object('day', day, 'kind', kind, 'amount', amount, 'method', method, 'ref', ref, 'note', note,
                 'bal', b) order by day, id), '[]'::jsonb)
              from (select *, sum(amount) over (order by day, id) + (select coalesce(sum(amount), 0) from partner_ledger x where x.partner_id = p_partner and x.day < p_from) b
                    from partner_ledger where partner_id = p_partner and day between p_from and p_to) z),
    'closing', (select coalesce(sum(amount), 0) from partner_ledger where partner_id = p_partner and day <= p_to));
end $$;

-- الطلب اتسلّم ← أصناف الشريك فيه بتتسجّل "له" بتكلفتها، ورصيد المخزن الوهمي بيتخصم
create or replace function public.partner_on_deliver() returns trigger
language plpgsql security definer set search_path = public as $$
declare pb partner_branches%rowtype; v numeric;
begin
  if new.status <> 'delivered' or old.status = 'delivered' then return new; end if;
  select * into pb from partner_branches where branch_id = new.location_id limit 1;
  if not found then return new; end if;
  select sum(round(coalesce(l.prepared, l.qty) * coalesce(pi.cost, 0), 2)) into v
    from online_order_lines l join items i on i.id = l.item_id and i.partner_only
    left join lateral (select cost from partner_items where partner_id = pb.partner_id and item_id = l.item_id order by updated_at desc nulls last limit 1) pi on true
    where l.order_id = new.id;
  if coalesce(v, 0) > 0 then
    insert into partner_ledger (partner_id, kind, amount, ref, order_id, note) values (pb.partner_id, 'take', v, 'O' || new.no, new.id, 'أصناف طلب ' || new.no);
    insert into stock_moves (item_id, location_id, qty, kind, reason, ref)
      select l.item_id, pb.location_id, -coalesce(l.prepared, l.qty), 'sale', 'طلب أونلاين', 'O' || new.no
      from online_order_lines l join items i on i.id = l.item_id and i.partner_only where l.order_id = new.id;
    update partner_preps set status = 'handed' where order_id = new.id;
  end if;
  return new;
end $$;
create trigger partner_on_deliver_trg after update of status on public.online_orders for each row execute function public.partner_on_deliver();

-- الديسباتشر: طلبات الفرع المربوط اللي فيها أصناف شريك
create or replace function public.partner_queue(p_loc text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare pb partner_branches%rowtype;
begin
  if not (has_perm('partner.dispatch') or has_perm('partner.manage')) then raise exception 'محتاج صلاحية الديسباتشر'; end if;
  select * into pb from partner_branches where location_id = p_loc;
  if not found then raise exception 'الموقع ده مش فرع شريك'; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('id', o.id, 'no', o.no, 'status', o.status, 'at', o.created_at, 'customer', c.name, 'near', pb.near,
      'prep', (select to_jsonb(p) from partner_preps p where p.order_id = o.id),
      'lines', (select jsonb_agg(jsonb_build_object('line', l.line, 'item_id', l.item_id, 'name', i.name, 'unit', i.unit, 'qty', l.qty, 'prepared', l.prepared,
                  'barcodes', (select array_agg(code) from item_barcodes b where b.item_id = l.item_id)) order by l.line)
                from online_order_lines l join items i on i.id = l.item_id and i.partner_only where l.order_id = o.id)) order by o.created_at), '[]'::jsonb)
    from online_orders o join customers c on c.id = o.customer_id
    where o.location_id = pb.branch_id and o.status in ('new','accepted','preparing','ready')
      and (not o.is_booking or o.release_at <= now())
      and exists (select 1 from online_order_lines l join items i on i.id = l.item_id and i.partner_only where l.order_id = o.id)
      and not exists (select 1 from partner_preps p where p.order_id = o.id and p.status = 'handed'));
end $$;
create or replace function public.partner_pick(p_order bigint, p_line int, p_qty numeric) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not (has_perm('partner.dispatch') or has_perm('partner.manage')) then raise exception 'محتاج صلاحية الديسباتشر'; end if;
  update online_order_lines set prepared = greatest(p_qty, 0) where order_id = p_order and line = p_line
    and item_id in (select id from items where partner_only);
  insert into partner_preps (order_id, location_id) select p_order, pb.location_id from online_orders o join partner_branches pb on pb.branch_id = o.location_id where o.id = p_order
    on conflict (order_id) do nothing;
end $$;
create or replace function public.partner_ready(p_order bigint, p_receipt text, p_amount numeric, p_bags int) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not (has_perm('partner.dispatch') or has_perm('partner.manage')) then raise exception 'محتاج صلاحية الديسباتشر'; end if;
  if coalesce(trim(p_receipt), '') = '' or coalesce(p_amount, 0) <= 0 then raise exception 'اكتب رقم إيصال الكاشير والمبلغ'; end if;
  if exists (select 1 from online_order_lines l join items i on i.id = l.item_id and i.partner_only where l.order_id = p_order and l.prepared is null) then
    raise exception 'فيه أصناف لسه ماتحضّرتش — علّم "اتجاب" أو "مش موجود"';
  end if;
  insert into partner_preps (order_id, location_id, receipt_no, amount, bags, status, ready_at)
    select p_order, pb.location_id, trim(p_receipt), p_amount, coalesce(p_bags, 1), 'ready', now() from online_orders o join partner_branches pb on pb.branch_id = o.location_id where o.id = p_order
    on conflict (order_id) do update set receipt_no = excluded.receipt_no, amount = excluded.amount, bags = excluded.bags, status = 'ready', ready_at = now();
end $$;
-- مطابقة المحضّرين: سحبنا في السيستم × إيصالات الشريك لكل يوم وفرع
create or replace function public.partner_recon(p_loc text, p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare pb partner_branches%rowtype;
begin
  if not (has_perm('partner.settle') or has_perm('partner.manage') or has_perm('acc.view')) then raise exception 'محتاج صلاحية الشريك'; end if;
  select * into pb from partner_branches where location_id = p_loc;
  return (select coalesce(jsonb_agg(jsonb_build_object('day', d, 'orders', n, 'receipts', rc, 'system', sy, 'diff', rc - sy) order by d), '[]'::jsonb) from (
    select (p.ready_at at time zone 'Africa/Cairo')::date d, count(*) n, sum(p.amount) rc,
      sum((select sum(round(coalesce(l.prepared, 0) * coalesce(pi.price, l.unit_price), 2)) from online_order_lines l join items i on i.id = l.item_id and i.partner_only
           left join lateral (select price from partner_items where partner_id = pb.partner_id and item_id = l.item_id order by updated_at desc nulls last limit 1) pi on true
           where l.order_id = p.order_id)) sy
    from partner_preps p where p.location_id = p_loc and p.ready_at is not null and (p.ready_at at time zone 'Africa/Cairo')::date between p_from and p_to group by 1) z);
end $$;

revoke execute on function public.partner_pct(bigint, bigint), public.partner_upload(text, jsonb), public.partner_upload_view(bigint), public.partner_map(bigint, text, bigint),
  public.partner_upload_approve(bigint, jsonb), public.partner_entry(bigint, text, numeric, text, text), public.partner_statement(bigint, date, date), public.partner_on_deliver(),
  public.partner_queue(text), public.partner_pick(bigint, int, numeric), public.partner_ready(bigint, text, numeric, int), public.partner_recon(text, date, date) from public, anon;
revoke execute on function public.partner_on_deliver(), public.partner_pct(bigint, bigint) from authenticated;
grant execute on function public.partner_upload(text, jsonb), public.partner_upload_view(bigint), public.partner_map(bigint, text, bigint),
  public.partner_upload_approve(bigint, jsonb), public.partner_entry(bigint, text, numeric, text, text), public.partner_statement(bigint, date, date),
  public.partner_queue(text), public.partner_pick(bigint, int, numeric), public.partner_ready(bigint, text, numeric, int), public.partner_recon(text, date, date) to authenticated;
