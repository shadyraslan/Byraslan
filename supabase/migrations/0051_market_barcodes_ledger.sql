-- ============ 0051 السوبرماركت: الباركود (إكسل، داخلي، ملصقات، مش معروف) + كارت الحساب لكل طرف ============
alter table public.items add column if not exists maker text, add column if not exists size text, add column if not exists reorder_min numeric;
insert into permissions (id, grp, label) values ('pos.unknown', 'الكاشير', 'بيع صنف باركوده مش معروف بسعر يدوي') on conflict (id) do nothing;

-- ===== باركود داخلي (EAN-13 بيبدأ بـ 20 = للاستخدام جوه المحل) =====
create sequence if not exists public.internal_barcode_seq start 1;
create or replace function public.ean_check(p12 text) returns int
language sql immutable as $$
  select (10 - (sum(substr(p12, i, 1)::int * case when i % 2 = 0 then 3 else 1 end) % 10)) % 10 from generate_series(1, 12) i
$$;
create or replace function public.internal_ean() returns text
language plpgsql security definer set search_path = public as $$
declare b text;
begin
  loop
    b := '20' || lpad(nextval('internal_barcode_seq')::text, 10, '0');
    b := b || ean_check(b);
    exit when not exists (select 1 from item_barcodes where code = b);
  end loop;
  return b;
end $$;

-- ===== رفع الإكسل: المطابقة بالباركود الأول، الباركود المتسجّل على صنف تاني بيطلع غلط (مش بيتنقل)، باركود داخلي للي مالوش، والمُصنّع والحجم والمورد وحد الطلب ورصيد أول المدة =====
do $do$ declare src text; begin
  src := pg_get_functiondef('public.items_import'::regproc);
  src := replace(src, '      v_item := null;
      if coalesce(trim(r->>''code''), '''') <> '''' then', '      v_item := null;
      select ib.item_id into v_item from item_barcodes ib where ib.code in (select trim(x) from regexp_split_to_table(coalesce(r->>''barcodes'', ''''), ''[,،;\s]+'') x where trim(x) <> '''') limit 1;
      if v_item is null and coalesce(trim(r->>''code''), '''') <> '''' then');
  src := replace(src, 'insert into item_barcodes (code, item_id) values (v_bc, v_item) on conflict (code) do update set item_id = excluded.item_id;',
    'if exists (select 1 from item_barcodes where code = v_bc and item_id <> v_item) then
          raise exception ''الباركود % متسجّل على "%"'', v_bc, (select i.name from item_barcodes b join items i on i.id = b.item_id where b.code = v_bc);
        end if;
        insert into item_barcodes (code, item_id) values (v_bc, v_item) on conflict (code) do nothing;');
  src := replace(src, '      if can_price then
        if nullif(r->>''price_direct''', '      update items set maker = coalesce(nullif(trim(r->>''maker''), ''''), maker), size = coalesce(nullif(trim(r->>''size''), ''''), size),
        reorder_min = coalesce(nullif(r->>''reorder_min'', '''')::numeric, reorder_min) where id = v_item;
      if v_sold = ''piece'' and v_arm = ''market'' and coalesce((r->>''internal'')::boolean, true) and not exists (select 1 from item_barcodes where item_id = v_item) then
        insert into item_barcodes (code, item_id) values (internal_ean(), v_item); internal := internal + 1;
      end if;
      if coalesce(trim(r->>''supplier''), '''') <> '''' then
        select id into v_sup from suppliers where name = trim(r->>''supplier'') limit 1;
        if v_sup is null then insert into suppliers (name, active) values (trim(r->>''supplier''), true) returning id into v_sup; end if;
        if not exists (select 1 from item_suppliers where item_id = v_item and supplier_id = v_sup) then
          insert into item_suppliers (item_id, rank, supplier_id, price) values (v_item, coalesce((select max(rank) + 1 from item_suppliers where item_id = v_item), 1), v_sup, nullif(r->>''cost'', '''')::numeric);
        end if;
      end if;
      if has_perm(''stock.adjust'') then
        for k, v in select * from jsonb_each(coalesce(r->''stock'', ''{}'')) loop
          select coalesce(sum(qty), 0) into v_cur from stock_moves where item_id = v_item and location_id = k;
          if v::text::numeric <> v_cur then
            insert into stock_moves (item_id, location_id, qty, kind, reason, ref, unit_cost, by) values (v_item, k, v::text::numeric - v_cur, ''adjust'', ''رصيد من الإكسل'', ''XLS'', nullif(r->>''cost'', '''')::numeric, auth.uid());
            nst := nst + 1;
          end if;
        end loop;
      end if;
      if can_price then
        if nullif(r->>''price_direct''');
  src := replace(src, 'can_price boolean := has_perm(''prices.edit''); hidden int := 0;', 'can_price boolean := has_perm(''prices.edit''); hidden int := 0; internal int := 0; v_sup bigint; v_cur numeric; nst int := 0;');
  src := replace(src, '''prices_skipped'', not can_price);', '''prices_skipped'', not can_price, ''internal'', internal, ''stock'', nst);');
  if src !~ 'internal_ean' or src !~ 'متسجّل على' or src !~ '''stock'', nst' or src !~ 'ib.code in' then raise exception 'items_import patch failed'; end if;
  execute src;
end $do$;

-- ===== الملصقات: آخر سعر اتطبع لكل صنف في كل فرع، عشان نعرف أنهي ملصق محتاج يتطبع تاني =====
create table if not exists public.label_prints (
  item_id bigint not null references public.items, location_id text not null references public.locations,
  price numeric, at timestamptz not null default now(), by uuid default auth.uid(),
  primary key (item_id, location_id)
);
alter table public.label_prints enable row level security;
create policy staff_only on public.label_prints as restrictive for all to authenticated using (is_staff()) with check (is_staff());
create policy lp_all on public.label_prints for all to authenticated using (has_perm('prices.edit') or has_perm('items.edit') or has_perm('pos.shift')) with check (has_perm('prices.edit') or has_perm('items.edit') or has_perm('pos.shift'));

-- ===== باركود مش معروف في الكاشير =====
create table if not exists public.unknown_scans (
  id bigint generated always as identity primary key,
  code text not null, location_id text references public.locations, sale_id bigint references public.sales, price numeric,
  by uuid default auth.uid(), at timestamptz not null default now(),
  resolved_item bigint references public.items, resolved_at timestamptz
);
alter table public.unknown_scans enable row level security;
create policy staff_only on public.unknown_scans as restrictive for all to authenticated using (is_staff()) with check (is_staff());
create policy us_read on public.unknown_scans for select to authenticated using (has_perm('items.edit') or has_perm('pos.shift'));
insert into items (name, arm, unit, sold_by, kind, active, tags)
  select 'صنف باركوده مش معروف', 'market', 'قطعة', 'piece', 'product', true, '{unknown}' where not exists (select 1 from items where 'unknown' = any(tags));

do $do$ declare src text; begin
  src := pg_get_functiondef('public.pos_snapshot'::regproc);
  src := replace(src, '''promos'', promo_pos(', '''unknown_item'', (select id from items where ''unknown'' = any(tags) limit 1), ''can_unknown'', has_perm(''pos.unknown''), ''promos'', promo_pos(');
  if src !~ 'unknown_item' then raise exception 'snapshot patch failed'; end if;
  execute src;
  src := pg_get_functiondef('public.pos_sync'::regproc);
  src := replace(src, '      insert into sale_lines (sale_id, line, item_id, box_sn, qty, unit_price, total)', '      if coalesce(l->>''unknown_code'', '''') <> '''' then
        insert into unknown_scans (code, location_id, sale_id, price) values (l->>''unknown_code'', p_loc, v_sale, (l->>''unit_price'')::numeric);
        if not has_perm(''pos.unknown'') then flags := flags || format(''باع باركود مش معروف %s من غير صلاحية'', l->>''unknown_code''); end if;
      end if;
      insert into sale_lines (sale_id, line, item_id, box_sn, qty, unit_price, total)');
  if src !~ 'unknown_scans' then raise exception 'pos_sync patch failed'; end if;
  execute src;
end $do$;

-- ربط باركود مش معروف بصنف ← بيتضاف للصنف ويتعلّم اتحل
create or replace function public.unknown_resolve(p_code text, p_item bigint) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not has_perm('items.edit') then raise exception 'محتاج صلاحية الأصناف'; end if;
  if exists (select 1 from item_barcodes where code = p_code and item_id <> p_item) then raise exception 'الباركود ده متسجّل على صنف تاني'; end if;
  insert into item_barcodes (code, item_id) values (trim(p_code), p_item) on conflict (code) do nothing;
  update unknown_scans set resolved_item = p_item, resolved_at = now() where code = p_code and resolved_item is null;
end $$;

-- ===== كارت الحساب: كل حركة بتاريخها ومين ومنين ولينك المستند، وله/عليه والرصيد =====
-- له = حق الطرف عندنا، عليه = حقنا عند الطرف. الرصيد = له − عليه (موجب = علينا له، سالب = لينا عنده)
create or replace function public.party_ledger(p_type text, p_id text, p_from date, p_to date) returns jsonb
language plpgsql security definer set search_path = public as $$
declare t0 timestamptz := p_from::timestamp at time zone 'Africa/Cairo'; t1 timestamptz := (p_to + 1)::timestamp at time zone 'Africa/Cairo'; u uuid; s bigint;
begin
  if p_type = 'employee' then
    u := p_id::uuid;
    if not (u = auth.uid() or has_perm('hr.pay') or has_perm('acc.view') or manages(u)) then raise exception 'محتاج صلاحية'; end if;
  elsif p_type = 'supplier' then if not (has_perm('acc.view') or has_perm('purchase.edit') or has_perm('acc.pay')) then raise exception 'محتاج صلاحية الحسابات'; end if; s := p_id::bigint;
  elsif p_type = 'partner' then if not (has_perm('partner.settle') or has_perm('acc.view')) then raise exception 'محتاج صلاحية الحسابات'; end if; s := p_id::bigint;
  elsif p_type = 'customer' then if not (has_perm('cs.agent') or has_perm('orders.handle') or has_perm('acc.view')) then raise exception 'محتاج صلاحية'; end if; s := p_id::bigint;
  else raise exception 'نوع غلط'; end if;

  create temp table if not exists _lg (at timestamptz, kind text, ref text, detail text, who text, loc text, link text, lah numeric, alayh numeric, info boolean) on commit drop;
  execute 'TRUNC' || 'ATE _lg';

  if p_type = 'supplier' then
    insert into _lg select r.at, 'استلام بضاعة', 'GRN-' || r.no, coalesce('فاتورة ' || r.invoice_no || ' — ', '') || (select string_agg(i.name || ' ' || round(l.accepted, 2) || ' × ' || l.price, '، ' order by l.line) from receipt_lines l join items i on i.id = l.item_id where l.receipt_id = r.id),
      (select name from profiles where id = r."by"), null, '/purchasing/receipts/' || r.id, (select coalesce(sum(l.accepted * l.price), 0) from receipt_lines l where l.receipt_id = r.id), 0, false
      from receipts r where r.supplier_id = s;
    insert into _lg select p.at, 'دفعة', 'PAY-' || p.no, p.method || coalesce(' ' || p.ref, '') || coalesce(' — ' || p.note, ''), (select name from profiles where id = p."by"), null, null, 0, p.amount, false
      from supplier_payments p where p.supplier_id = s;
  elsif p_type = 'partner' then
    insert into _lg select l.at, case l.kind when 'take' then 'أصناف اتاخدت منه' when 'sale' then 'بضاعة اتباعتله' when 'settle' then 'تسوية' else 'تعديل' end, l.ref,
      coalesce(l.method || ' — ', '') || coalesce(l.note, ''), (select name from profiles where id = l."by"), null, case when l.order_id is not null then '/orders' end,
      greatest(l.amount, 0), greatest(-l.amount, 0), false from partner_ledger l where l.partner_id = s;
  elsif p_type = 'employee' then
    insert into _lg select coalesce(r.decided_at, r.at), 'سلفة', 'ADV-' || r.id, format('%s ج على %s قسط', r.amount, r.installments), (select name from profiles where id = r.decided_by), null, null, 0, r.amount, false
      from leave_requests r where r.user_id = u and r.kind = 'advance' and r.status = 'approved';
    insert into _lg select (i.month::timestamp at time zone 'Africa/Cairo') + interval '27 days', 'قسط سلفة اتخصم', 'ADV-' || i.request_id, 'من مرتب ' || month_name(i.month), null, null, null, i.amount, 0, false
      from advance_installments i where i.user_id = u and i.payslip_id is not null;
    insert into _lg select c.at, case c.kind when 'give' then 'عهدة نقدية استلمها' when 'spend' then 'صرف من العهدة' when 'return' then 'رجّع من العهدة' else 'عجز عهدة' end, 'C-' || c.no,
      coalesce((select name from expense_categories where id = c.category_id) || ' — ', '') || coalesce(c.note, ''), (select name from profiles where id = coalesce(c.decided_by, c."by")),
      (select name from locations where id = c.location_id), '/hr/custody', case when c.kind = 'give' then 0 else coalesce(c.received, c.amount) end, case when c.kind = 'give' then c.amount else 0 end, false
      from custody_moves c where c.user_id = u and c.status = 'ok';
    insert into _lg select sa.at, 'مشتريات آجل', 'S-' || sa.no, (select string_agg(i.name || ' ' || sl.qty, '، ') from sale_lines sl join items i on i.id = sl.item_id where sl.sale_id = sa.id),
      (select name from profiles where id = sa.cashier), (select name from locations where id = sa.location_id), null, 0, sa.paid_staff, false
      from sales sa where sa.staff_id = u and sa.paid_staff > 0;
    insert into _lg select (sa.staff_month::timestamp at time zone 'Africa/Cairo') + interval '27 days', 'مشتريات اتخصمت من المرتب', 'S-' || sa.no, month_name(sa.staff_month), null, null, null, sa.paid_staff, 0, false
      from sales sa where sa.staff_id = u and sa.paid_staff > 0 and sa.staff_month is not null;
    insert into _lg select coalesce(r.approved_at, r.calc_at), 'مرتب ' || month_name(r.month), 'PAY-' || to_char(r.month, 'YYYY-MM'), format('إجمالي %s − خصومات %s = صافي %s', ps.gross, ps.deductions, ps.net), null,
      (select name from locations where id = ps.location_id), '/hr/payroll', ps.net, 0, true
      from payroll_runs r join payslips ps on ps.run_id = r.id and ps.ver = r.ver where ps.user_id = u and r.status = 'approved';
    insert into _lg select p.at, 'جزاء', 'J-' || p.no, (select name from penalty_rules where id = p.rule_id) || ' — ' || p.reason || case when p.days > 0 then format(' (خصم %s يوم)', p.days) else '' end,
      (select name from profiles where id = p."by"), null, '/hr/penalties', 0, 0, true from penalties p where p.user_id = u and p.status <> 'cancelled';
    insert into _lg select a.given_at::timestamp at time zone 'Africa/Cairo', 'عهدة عينية', 'A-' || a.id, a.name || coalesce(' (' || a.serial || ')', '') || format(' — قيمتها %s', a.value) || case when a.returned_at is not null then ' — رجعت ' || a.returned_at else '' end,
      (select name from profiles where id = a.given_by), null, '/hr/assets', 0, 0, true from custody_assets a where a.user_id = u;
  elsif p_type = 'customer' then
    insert into _lg select coalesce(o.delivered_at, o.created_at), case when o.status = 'cancelled' then 'طلب اتلغى' when o.is_booking then 'حجز' else 'طلب' end || ' — ' || coalesce(o.channel, ''), '#' || o.no,
      (select string_agg(i.name || ' ' || l.qty, '، ' order by l.line) from online_order_lines l join items i on i.id = l.item_id where l.order_id = o.id) || case when o.discount > 0 then format(' — خصم %s', o.discount) else '' end,
      o.driver, (select name from locations where id = o.location_id), '/t/' || o.token, 0, coalesce(o.total, o.est_total + o.delivery_fee - o.discount), true
      from online_orders o where o.customer_id = s;
  end if;

  return jsonb_build_object(
    'opening', (select coalesce(sum(lah - alayh) filter (where not info), 0) from _lg where at < t0),
    'lines', (select coalesce(jsonb_agg(jsonb_build_object('at', at, 'kind', kind, 'ref', ref, 'detail', detail, 'who', who, 'loc', loc, 'link', link, 'lah', lah, 'alayh', alayh, 'info', info, 'bal', bal) order by at, ref), '[]'::jsonb)
              from (select *, (select coalesce(sum(lah - alayh) filter (where not info), 0) from _lg where at < t0) + sum(case when info then 0 else lah - alayh end) over (order by at, ref rows unbounded preceding) bal
                    from _lg where at >= t0 and at < t1) z),
    'closing', (select coalesce(sum(lah - alayh) filter (where not info), 0) from _lg where at < t1));
end $$;
create or replace function public.my_ledger(p_from date, p_to date) returns jsonb
language sql security definer set search_path = public as $$ select party_ledger('employee', auth.uid()::text, p_from, p_to) $$;

revoke execute on function public.internal_ean(), public.unknown_resolve(text, bigint), public.party_ledger(text, text, date, date), public.my_ledger(date, date) from public, anon;
revoke execute on function public.internal_ean() from authenticated;
grant execute on function public.unknown_resolve(text, bigint), public.party_ledger(text, text, date, date), public.my_ledger(date, date) to authenticated;
