-- ============ 0018 المشتريات: أوامر توريد، استلام بالفحص على آخر مواصفة معتمدة، لوتات خامات بـ QR، والتجاوز ============

create table public.purchase_orders (
  id bigint generated always as identity primary key,
  no bigint generated always as identity (start with 301),
  supplier_id bigint not null references public.suppliers,
  status text not null default 'open' check (status in ('open','partial','done','cancelled')),
  expected date,
  note text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create table public.po_lines (
  po_id bigint not null references public.purchase_orders,
  line int not null,
  item_id bigint not null references public.items,
  qty numeric not null check (qty > 0),
  price numeric not null default 0,
  received numeric not null default 0,
  primary key (po_id, line)
);

create table public.receipts (
  id bigint generated always as identity primary key,
  no bigint generated always as identity (start with 1101),
  po_id bigint not null references public.purchase_orders,
  supplier_id bigint not null references public.suppliers,
  result text not null,
  flags text[] not null default '{}',
  override_id bigint references public.override_requests,
  invoice_no text,
  by uuid default auth.uid(),
  at timestamptz not null default now()
);
create table public.receipt_lines (
  receipt_id bigint not null references public.receipts,
  line int not null,
  item_id bigint not null references public.items,
  weighed numeric not null,
  rejected numeric not null default 0,
  accepted numeric not null,
  price numeric not null,
  temp numeric,
  expires date,
  spec_version int,
  lot_code text,
  note text,
  primary key (receipt_id, line)
);

create table public.lots (
  code text primary key,
  item_id bigint not null references public.items,
  receipt_id bigint references public.receipts,
  supplier_id bigint references public.suppliers,
  qty numeric not null,
  cost numeric not null default 0,
  expires date,
  location_id text not null default 'main' references public.locations,
  at timestamptz not null default now()
);

-- آخر مواصفة معتمدة للصنف
create or replace view public.spec_current with (security_invoker = true) as
  select distinct on (item_id) item_id, version, snapshot, approved_at from item_spec_versions order by item_id, version desc;

-- p_lines: [{"line":1,"weighed":300,"rejected":0,"price":88,"temp":3,"expires":"2026-11-09","note":"",
--            "checks":[{"t":"اللون طبيعي","ok":true}], "docs":[{"n":"شهادة صحية","photo":"receipts/..jpg"},{"n":"شهادة ذبح","missing":true}]}]
create or replace function public.receive_po(p_po bigint, p_lines jsonb, p_override bigint default null, p_reason text default null, p_invoice text default null)
returns table (receipt_no bigint, lot_codes text[], violations text[])
language plpgsql security invoker set search_path = public as $$
declare po purchase_orders%rowtype; l jsonb; pl po_lines%rowtype; sp record; it items%rowtype;
        v text[] := '{}'; v_flags text[] := '{}'; val numeric := 0; acc numeric; rid bigint; rno bigint; lc text; lots_out text[] := '{}';
        c jsonb; d jsonb; n_ok int := 0; n_rej int := 0; ov override_requests%rowtype; days int; seq int := 0;
begin
  if not (has_perm('purchase.edit') or has_perm('stock.edit')) then raise exception 'محتاج صلاحية الاستلام'; end if;
  select * into po from purchase_orders where id = p_po for update;
  if not found or po.status not in ('open','partial') then raise exception 'أمر التوريد ده مش مفتوح'; end if;

  -- 1) الفحص قبل أي تسجيل
  for l in select * from jsonb_array_elements(p_lines) loop
    select * into pl from po_lines where po_id = p_po and line = (l->>'line')::int;
    if not found then raise exception 'سطر مش في أمر التوريد'; end if;
    select * into it from items where id = pl.item_id;
    if coalesce((l->>'weighed')::numeric, 0) <= 0 then continue; end if;
    if coalesce((l->>'rejected')::numeric, 0) > (l->>'weighed')::numeric then raise exception '%: المرفوض أكتر من اللي اتوزن', it.name; end if;
    select * into sp from spec_current where item_id = pl.item_id;
    acc := (l->>'weighed')::numeric - coalesce((l->>'rejected')::numeric, 0);
    if not found then
      if acc > 0 then v := v || (it.name || ' — المواصفة مش معتمدة من الجودة'); val := val + acc * coalesce((l->>'price')::numeric, pl.price); end if;
      continue;
    end if;
    -- كل بند فحص لازم يتجاوب
    if jsonb_array_length(coalesce(sp.snapshot->'checks', '[]')) > jsonb_array_length(coalesce(l->'checks', '[]')) then raise exception '%: جاوب على كل بنود الفحص', it.name; end if;
    if jsonb_array_length(coalesce(sp.snapshot->'certs', '[]')) > jsonb_array_length(coalesce(l->'docs', '[]')) then raise exception '%: صوّر كل مستند أو علّم إنه مش موجود', it.name; end if;
    if (sp.snapshot->>'temp_max') is not null and (l->>'temp') is null then raise exception '%: اكتب الحرارة', it.name; end if;
    if acc > 0 then
      if (sp.snapshot->>'temp_max') is not null and (l->>'temp')::numeric > (sp.snapshot->>'temp_max')::numeric then v := v || format('%s — الحرارة %s° والحد %s°', it.name, l->>'temp', sp.snapshot->>'temp_max'); end if;
      if coalesce((sp.snapshot->>'min_shelf_days')::int, 0) > 0 and (l->>'expires') is not null then
        days := (l->>'expires')::date - current_date;
        if days < (sp.snapshot->>'min_shelf_days')::int then v := v || format('%s — الصلاحية %s يوم والمطلوب %s', it.name, days, sp.snapshot->>'min_shelf_days'); end if;
      end if;
      for c in select * from jsonb_array_elements(coalesce(l->'checks', '[]')) loop
        if not (c->>'ok')::boolean then v := v || (it.name || ' — مش مطابق: ' || (c->>'t')); end if;
      end loop;
      for d in select * from jsonb_array_elements(coalesce(l->'docs', '[]')) loop
        if coalesce((d->>'missing')::boolean, false) then v := v || (it.name || ' — من غير ' || (d->>'n')); end if;
      end loop;
      if exists (select 1 from unnest(v) x where x like it.name || ' — %') then val := val + acc * coalesce((l->>'price')::numeric, pl.price); end if;
    end if;
  end loop;

  -- 2) التجاوز
  if array_length(v, 1) > 0 then
    if p_override is not null then
      select * into ov from override_requests where id = p_override and kind = 'recv' and ref = 'PO-' || po.no and status = 'approved';
      if not found then raise exception 'التجاوز ده مش متوافق عليه'; end if;
      update override_requests set status = 'used' where id = p_override;
    elsif can_override('recv', val) and coalesce(length(trim(p_reason)), 0) >= 5 then
      insert into override_requests (kind, ref, violations, value, reason, status, decided_by, decided_at, decision_note)
        values ('recv', 'PO-' || po.no, to_jsonb(v), val, p_reason, 'used', auth.uid(), now(), 'تجاوز مباشر وقت الاستلام') returning * into ov;
    else
      return query select null::bigint, null::text[], v;
      return;
    end if;
    v_flags := v_flags || ('استلام بتجاوز: ' || ov.reason);
  end if;

  -- 3) التسجيل
  insert into receipts (po_id, supplier_id, result, override_id, invoice_no) values (p_po, po.supplier_id, 'مقبول', ov.id, p_invoice) returning id, no into rid, rno;
  for l in select * from jsonb_array_elements(p_lines) loop
    if coalesce((l->>'weighed')::numeric, 0) <= 0 then continue; end if;
    select * into pl from po_lines where po_id = p_po and line = (l->>'line')::int;
    select * into it from items where id = pl.item_id;
    select * into sp from spec_current where item_id = pl.item_id;
    acc := (l->>'weighed')::numeric - coalesce((l->>'rejected')::numeric, 0);
    lc := null;
    if acc > 0 then
      seq := seq + 1;
      lc := 'RM-' || it.id || '-' || to_char(now() at time zone 'Africa/Cairo', 'YYMMDD') || '-' || rno || '-' || seq;
      insert into lots (code, item_id, receipt_id, supplier_id, qty, cost, expires) values (lc, it.id, rid, po.supplier_id, acc, coalesce((l->>'price')::numeric, pl.price), (l->>'expires')::date);
      insert into stock_moves (item_id, location_id, qty, kind, reason, ref, unit_cost) values (it.id, 'main', acc, 'receive', 'استلام PO-' || po.no, 'GRN-' || rno, coalesce((l->>'price')::numeric, pl.price));
      lots_out := lots_out || lc; n_ok := n_ok + 1;
    end if;
    if coalesce((l->>'rejected')::numeric, 0) > 0 then n_rej := n_rej + 1; v_flags := v_flags || format('%s: مرفوض %s رجع للمورد', it.name, l->>'rejected'); end if;
    insert into receipt_lines (receipt_id, line, item_id, weighed, rejected, accepted, price, temp, expires, spec_version, lot_code, note)
      values (rid, pl.line, it.id, (l->>'weighed')::numeric, coalesce((l->>'rejected')::numeric, 0), acc, coalesce((l->>'price')::numeric, pl.price), (l->>'temp')::numeric, (l->>'expires')::date, sp.version, lc, l->>'note');
    for c in select * from jsonb_array_elements(coalesce(l->'checks', '[]')) loop
      insert into receipt_checks (receipt_ref, item_id, spec_version, check_text, passed) values ('GRN-' || rno, it.id, coalesce(sp.version, 0), c->>'t', (c->>'ok')::boolean);
    end loop;
    for d in select * from jsonb_array_elements(coalesce(l->'docs', '[]')) loop
      insert into receipt_docs (receipt_ref, item_id, doc_name, photo, missing) values ('GRN-' || rno, it.id, d->>'n', d->>'photo', coalesce((d->>'missing')::boolean, false));
    end loop;
    if coalesce((l->>'price')::numeric, pl.price) <> pl.price then v_flags := v_flags || format('%s: سعر الفاتورة %s بدل %s', it.name, l->>'price', pl.price); end if;
    update po_lines set received = received + (l->>'weighed')::numeric - coalesce((l->>'rejected')::numeric, 0) where po_id = p_po and line = pl.line;
  end loop;
  update receipts set result = case when n_ok = 0 then 'مرفوض' when n_rej > 0 or array_length(v, 1) > 0 then 'مقبول جزئي' else 'مقبول' end, flags = v_flags where id = rid;
  update purchase_orders set status = case when not exists (select 1 from po_lines where po_id = p_po and received < qty * 0.99) then 'done' else 'partial' end where id = p_po;
  return query select rno, lots_out, v;
end $$;

alter table public.purchase_orders enable row level security;
alter table public.po_lines enable row level security;
alter table public.receipts enable row level security;
alter table public.receipt_lines enable row level security;
alter table public.lots enable row level security;
create policy pu_read on public.purchase_orders for select to authenticated using (true);
create policy pu_ins on public.purchase_orders for insert to authenticated with check (has_perm('purchase.edit'));
create policy pu_upd on public.purchase_orders for update to authenticated using (has_perm('purchase.edit') or has_perm('stock.edit'));
create policy pl_read2 on public.po_lines for select to authenticated using (true);
create policy pl_ins on public.po_lines for insert to authenticated with check (has_perm('purchase.edit'));
create policy pl_upd on public.po_lines for update to authenticated using (has_perm('purchase.edit') or has_perm('stock.edit'));
create policy rc_read2 on public.receipts for select to authenticated using (true);
create policy rc_ins2 on public.receipts for insert to authenticated with check (has_perm('purchase.edit') or has_perm('stock.edit'));
create policy rc_upd2 on public.receipts for update to authenticated using (has_perm('purchase.edit') or has_perm('stock.edit'));
create policy rl_read on public.receipt_lines for select to authenticated using (true);
create policy rl_ins on public.receipt_lines for insert to authenticated with check (has_perm('purchase.edit') or has_perm('stock.edit'));
create policy lot_read on public.lots for select to authenticated using (true);
create policy lot_ins on public.lots for insert to authenticated with check (has_perm('purchase.edit') or has_perm('stock.edit'));
create policy mv_ins_recv on public.stock_moves for insert to authenticated with check (kind = 'receive' and (has_perm('purchase.edit') or has_perm('stock.edit')));
create policy ovr_ins_used on public.override_requests for insert to authenticated with check (status = 'used' and can_override(kind, value));

-- صور المستندات والمواصفات في Storage
insert into storage.buckets (id, name, public) values ('docs', 'docs', false) on conflict (id) do nothing;
create policy docs_read on storage.objects for select to authenticated using (bucket_id = 'docs');
create policy docs_ins on storage.objects for insert to authenticated with check (bucket_id = 'docs');
