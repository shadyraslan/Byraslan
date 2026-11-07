-- ============ 0045 الجرد: يبدأ بموقع (وقسم لو حابب) ← عدّ الأصناف وامسح العلب ← يتبعت ← اللي معاه صلاحية التسويات يعتمد (بحد مبلغ) ← الرصيد يتظبط ============
insert into permissions (id, grp, label) values
  ('stock.count', 'المخزون', 'عمل جرد (عدّ وإرسال)')
on conflict (id) do nothing;
update permissions set label = 'اعتماد الجرد والتسويات اليدوية (بحد مبلغ)' where id = 'stock.adjust';

-- إعدادات الجرد من الداشبورد: الجرد الأعمى (اللي بيعدّ مايشوفش رصيد السيستم)، وفرق يستاهل سبب
insert into settings (key, value) values ('stock.count', '{"blind": true, "reason_over": 0}') on conflict (key) do nothing;

create table if not exists public.stock_counts (
  id bigint generated always as identity primary key,
  no int generated always as identity (start 101),
  location_id text not null references public.locations,
  family_id bigint references public.families,
  status text not null default 'open' check (status in ('open','submitted','approved','rejected','cancelled')),
  note text,
  by uuid not null default auth.uid() references public.profiles,
  at timestamptz not null default now(),
  submitted_at timestamptz,
  decided_by uuid references public.profiles,
  decided_at timestamptz,
  decision_note text,
  value_diff numeric
);
create table if not exists public.stock_count_lines (
  count_id bigint not null references public.stock_counts,
  item_id bigint not null references public.items,
  system_qty numeric not null default 0,
  counted_qty numeric,
  unit_cost numeric,
  reason text,
  by uuid references public.profiles,
  at timestamptz,
  primary key (count_id, item_id)
);
create table if not exists public.stock_count_boxes (
  count_id bigint not null references public.stock_counts,
  box_sn bigint not null references public.boxes(sn),
  was_status text, was_location text,
  by uuid default auth.uid(), at timestamptz not null default now(),
  primary key (count_id, box_sn)
);
alter table public.stock_counts enable row level security;
alter table public.stock_count_lines enable row level security;
alter table public.stock_count_boxes enable row level security;
create policy staff_only on public.stock_counts as restrictive for all to authenticated using (is_staff()) with check (is_staff());
create policy staff_only on public.stock_count_lines as restrictive for all to authenticated using (is_staff()) with check (is_staff());
create policy staff_only on public.stock_count_boxes as restrictive for all to authenticated using (is_staff()) with check (is_staff());
create policy sc_read on public.stock_counts for select to authenticated using (has_perm('stock.count') or has_perm('stock.adjust') or has_perm('stock.view'));
create index if not exists idx_stock_counts_status on public.stock_counts (status, location_id);

-- الأصناف اللي بتتعدّ بالعلب (منتجات روستوز) والباقي بالكمية/الوزن
create or replace function public.item_boxed(p_item bigint) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select arm = 'rostos' and kind = 'product' from items where id = p_item), false)
$$;

-- بداية الجرد: لقطة من رصيد السيستم لكل صنف بالكمية في الموقع (وفي القسم لو اتحدد)
create or replace function public.count_start(p_loc text, p_family bigint default null, p_note text default null) returns bigint
language plpgsql security definer set search_path = public as $$
declare v_id bigint;
begin
  if not is_staff() or not (has_perm('stock.count') or has_perm('stock.adjust')) then raise exception 'محتاج صلاحية الجرد'; end if;
  if exists (select 1 from stock_counts where location_id = p_loc and status = 'open' and coalesce(family_id, 0) = coalesce(p_family, 0)) then
    raise exception 'فيه جرد مفتوح لنفس الموقع — كمّله الأول';
  end if;
  insert into stock_counts (location_id, family_id, note) values (p_loc, p_family, nullif(trim(p_note), '')) returning id into v_id;
  insert into stock_count_lines (count_id, item_id, system_qty, unit_cost)
    select v_id, i.id, coalesce((select sum(m.qty) from stock_moves m where m.item_id = i.id and m.location_id = p_loc), 0), i.cost
    from items i
    where i.active and not item_boxed(i.id) and coalesce(i.partner_only, false) = false
      and (p_family is null or i.family_id = p_family or p_family = any(coalesce(i.also_families, '{}')))
      and exists (select 1 from stock_moves m where m.item_id = i.id and m.location_id = p_loc);
  return v_id;
end $$;

-- تسجيل المعدود لصنف (ولو مش في القايمة بيتضاف)
create or replace function public.count_set(p_count bigint, p_item bigint, p_qty numeric, p_reason text default null) returns void
language plpgsql security definer set search_path = public as $$
declare c stock_counts%rowtype;
begin
  select * into c from stock_counts where id = p_count;
  if not found or c.status <> 'open' then raise exception 'الجرد ده مش مفتوح'; end if;
  if not (has_perm('stock.count') or has_perm('stock.adjust')) then raise exception 'محتاج صلاحية الجرد'; end if;
  if item_boxed(p_item) then raise exception 'الصنف ده بيتعدّ بمسح العلب'; end if;
  if p_qty is not null and p_qty < 0 then raise exception 'الكمية مينفعش تبقى بالسالب'; end if;
  insert into stock_count_lines (count_id, item_id, system_qty, counted_qty, unit_cost, reason, by, at)
    values (p_count, p_item, coalesce((select sum(m.qty) from stock_moves m where m.item_id = p_item and m.location_id = c.location_id), 0),
            p_qty, (select cost from items where id = p_item), nullif(trim(p_reason), ''), auth.uid(), now())
    on conflict (count_id, item_id) do update set counted_qty = excluded.counted_qty,
      reason = coalesce(excluded.reason, stock_count_lines.reason), by = auth.uid(), at = now();
end $$;

-- مسح علبة أثناء الجرد
create or replace function public.count_scan(p_count bigint, p_sn bigint) returns jsonb
language plpgsql security definer set search_path = public as $$
declare c stock_counts%rowtype; b boxes%rowtype; msg text := null;
begin
  select * into c from stock_counts where id = p_count;
  if not found or c.status <> 'open' then raise exception 'الجرد ده مش مفتوح'; end if;
  if not (has_perm('stock.count') or has_perm('stock.adjust')) then raise exception 'محتاج صلاحية الجرد'; end if;
  select * into b from boxes where sn = p_sn;
  if not found then raise exception 'علبة #% مش متسجّلة', p_sn; end if;
  if c.family_id is not null and not exists (select 1 from items i where i.id = b.item_id and (i.family_id = c.family_id or c.family_id = any(coalesce(i.also_families, '{}')))) then
    raise exception 'العلبة دي مش من القسم اللي بتجرده';
  end if;
  if exists (select 1 from stock_count_boxes where count_id = p_count and box_sn = p_sn) then
    return jsonb_build_object('dup', true, 'sn', p_sn);
  end if;
  insert into stock_count_boxes (count_id, box_sn, was_status, was_location) values (p_count, p_sn, b.status, b.location_id);
  if b.status <> 'stock' then msg := 'العلبة دي مسجّلة "' || b.status || '" — هتتعلّم في المراجعة';
  elsif b.location_id <> c.location_id then msg := 'العلبة دي مسجّلة في موقع تاني — هتتنقل هنا بعد الاعتماد';
  end if;
  return jsonb_build_object('sn', p_sn, 'item', (select name from items where id = b.item_id), 'weight', b.weight, 'warn', msg);
end $$;

-- عرض الجرد: اللي بيعدّ في الجرد الأعمى مابيشوفش رصيد السيستم لحد ما يتبعت
create or replace function public.count_view(p_count bigint) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare c stock_counts%rowtype; blind boolean; show boolean;
begin
  select * into c from stock_counts where id = p_count;
  if not found then raise exception 'الجرد مش موجود'; end if;
  if not is_staff() or not (has_perm('stock.count') or has_perm('stock.adjust') or has_perm('stock.view')) then raise exception 'محتاج صلاحية الجرد'; end if;
  blind := coalesce((select (value->>'blind')::boolean from settings where key = 'stock.count'), true);
  show := not blind or c.status <> 'open' or has_perm('stock.adjust');
  return jsonb_build_object(
    'id', c.id, 'no', c.no, 'status', c.status, 'location_id', c.location_id, 'location', (select name from locations where id = c.location_id),
    'family', (select name from families where id = c.family_id), 'note', c.note, 'at', c.at, 'by', (select name from profiles where id = c."by"),
    'submitted_at', c.submitted_at, 'decided_at', c.decided_at, 'decided_by', (select name from profiles where id = c.decided_by), 'decision_note', c.decision_note,
    'show_system', show, 'can_decide', has_perm('stock.adjust') and c.status = 'submitted', 'reason_over', coalesce((select (value->>'reason_over')::numeric from settings where key = 'stock.count'), 0),
    'lines', (select coalesce(jsonb_agg(jsonb_build_object('item_id', l.item_id, 'name', i.name, 'unit', i.unit, 'sold_by', i.sold_by,
        'system', case when show then l.system_qty end, 'counted', l.counted_qty, 'cost', l.unit_cost, 'reason', l.reason,
        'diff', case when show and l.counted_qty is not null then l.counted_qty - l.system_qty end,
        'value', case when show and l.counted_qty is not null then round((l.counted_qty - l.system_qty) * coalesce(l.unit_cost, 0), 2) end,
        'barcodes', (select array_agg(code) from item_barcodes b where b.item_id = l.item_id)) order by i.name), '[]'::jsonb)
      from stock_count_lines l join items i on i.id = l.item_id where l.count_id = c.id),
    'boxes', jsonb_build_object(
      'scanned', (select count(*) from stock_count_boxes where count_id = c.id),
      'expected', case when show then (select count(*) from boxes b join items i on i.id = b.item_id where b.location_id = c.location_id and b.status = 'stock'
                     and (c.family_id is null or i.family_id = c.family_id or c.family_id = any(coalesce(i.also_families, '{}')))) end,
      'missing', case when show then (select coalesce(jsonb_agg(jsonb_build_object('sn', b.sn, 'item', i.name, 'weight', b.weight, 'value', round(b.weight * coalesce(i.cost, 0), 2)) order by b.sn), '[]'::jsonb)
                   from boxes b join items i on i.id = b.item_id where b.location_id = c.location_id and b.status = 'stock'
                     and (c.family_id is null or i.family_id = c.family_id or c.family_id = any(coalesce(i.also_families, '{}')))
                     and not exists (select 1 from stock_count_boxes x where x.count_id = c.id and x.box_sn = b.sn)) end,
      'odd', (select coalesce(jsonb_agg(jsonb_build_object('sn', x.box_sn, 'item', i.name, 'weight', b.weight, 'status', x.was_status,
                     'from', (select name from locations where id = x.was_location))), '[]'::jsonb)
              from stock_count_boxes x join boxes b on b.sn = x.box_sn join items i on i.id = b.item_id
              where x.count_id = c.id and (x.was_status <> 'stock' or x.was_location <> c.location_id)),
      'by_item', (select coalesce(jsonb_agg(jsonb_build_object('item', z.name, 'n', z.n, 'kg', z.kg)), '[]'::jsonb) from (
                   select i.name, count(*) n, round(sum(b.weight), 3) kg from stock_count_boxes x join boxes b on b.sn = x.box_sn join items i on i.id = b.item_id
                   where x.count_id = c.id group by i.name order by i.name) z)),
    'value_diff', case when show then count_value(c.id) end);
end $$;

-- قيمة الفرق (بالتكلفة): أصناف بالكمية + علب ناقصة
create or replace function public.count_value(p_count bigint) returns numeric
language sql stable security definer set search_path = public as $$
  select coalesce((select sum(round((l.counted_qty - l.system_qty) * coalesce(l.unit_cost, 0), 2)) from stock_count_lines l where l.count_id = p_count and l.counted_qty is not null), 0)
    - coalesce((select sum(round(b.weight * coalesce(i.cost, 0), 2)) from stock_counts c join boxes b on b.location_id = c.location_id and b.status = 'stock'
          join items i on i.id = b.item_id
        where c.id = p_count and (c.family_id is null or i.family_id = c.family_id or c.family_id = any(coalesce(i.also_families, '{}')))
          and not exists (select 1 from stock_count_boxes x where x.count_id = c.id and x.box_sn = b.sn)), 0)
$$;

create or replace function public.count_submit(p_count bigint) returns void
language plpgsql security definer set search_path = public as $$
declare c stock_counts%rowtype; v_over numeric := coalesce((select (value->>'reason_over')::numeric from settings where key = 'stock.count'), 0);
begin
  select * into c from stock_counts where id = p_count for update;
  if not found or c.status <> 'open' then raise exception 'الجرد ده مش مفتوح'; end if;
  if not (has_perm('stock.count') or has_perm('stock.adjust')) then raise exception 'محتاج صلاحية الجرد'; end if;
  if v_over > 0 and exists (select 1 from stock_count_lines where count_id = p_count and counted_qty is not null
       and abs((counted_qty - system_qty) * coalesce(unit_cost, 0)) > v_over and coalesce(reason, '') = '') then
    raise exception 'فيه أصناف فرقها كبير (أكتر من % ج) ومحتاجة سبب', v_over;
  end if;
  update stock_counts set status = 'submitted', submitted_at = now(), value_diff = count_value(p_count) where id = p_count;
end $$;

-- الاعتماد: كل فرق بيبقى حركة "جرد" بالتكلفة، العلب الناقصة "مفقودة"، والعلب اللي في مكان تاني بتتنقل هنا
create or replace function public.count_decide(p_count bigint, p_ok boolean, p_note text default null) returns void
language plpgsql security definer set search_path = public as $$
declare c stock_counts%rowtype; lim numeric := perm_limit('stock.adjust'); v_val numeric; l record; b record; ref text;
begin
  select * into c from stock_counts where id = p_count for update;
  if not found or c.status not in ('submitted','open') then raise exception 'الجرد ده مش مستني اعتماد'; end if;
  if lim = -1 then raise exception 'محتاج صلاحية اعتماد الجرد'; end if;
  if not p_ok then
    update stock_counts set status = case when c.status = 'open' then 'cancelled' else 'rejected' end, decided_by = auth.uid(), decided_at = now(), decision_note = p_note where id = p_count;
    return;
  end if;
  if c.status = 'open' then raise exception 'ابعت الجرد الأول'; end if;
  v_val := count_value(p_count);
  if lim is not null and abs(v_val) > lim then raise exception 'قيمة الفرق (% ج) أكبر من حد اعتمادك (% ج)', abs(v_val), lim; end if;
  ref := 'C' || c.no;
  for l in select * from stock_count_lines where count_id = p_count and counted_qty is not null and counted_qty <> system_qty loop
    insert into stock_moves (item_id, location_id, qty, kind, reason, ref, unit_cost, by)
      values (l.item_id, c.location_id, l.counted_qty - l.system_qty, 'count', coalesce(l.reason, 'فرق جرد'), ref, l.unit_cost, auth.uid());
  end loop;
  -- العلب الناقصة
  for b in select bx.* from boxes bx join items i on i.id = bx.item_id where bx.location_id = c.location_id and bx.status = 'stock'
      and (c.family_id is null or i.family_id = c.family_id or c.family_id = any(coalesce(i.also_families, '{}')))
      and not exists (select 1 from stock_count_boxes x where x.count_id = c.id and x.box_sn = bx.sn) for update of bx loop
    update boxes set status = 'missing' where sn = b.sn;
    insert into stock_moves (item_id, location_id, qty, kind, reason, ref, box_sn, unit_cost, by)
      values (b.item_id, c.location_id, -b.weight, 'count', 'علبة مش موجودة في الجرد', ref, b.sn, (select cost from items where id = b.item_id), auth.uid());
  end loop;
  -- علب اتلقت هنا وهي مسجّلة في موقع تاني (في المخزون)
  for b in select bx.* from stock_count_boxes x join boxes bx on bx.sn = x.box_sn where x.count_id = c.id and bx.status = 'stock' and bx.location_id <> c.location_id for update of bx loop
    insert into stock_moves (item_id, location_id, qty, kind, reason, ref, box_sn, unit_cost, by) values
      (b.item_id, b.location_id, -b.weight, 'count', 'العلبة اتلقت في ' || (select name from locations where id = c.location_id), ref, b.sn, (select cost from items where id = b.item_id), auth.uid()),
      (b.item_id, c.location_id, b.weight, 'count', 'العلبة اتلقت في الجرد', ref, b.sn, (select cost from items where id = b.item_id), auth.uid());
    update boxes set location_id = c.location_id where sn = b.sn;
  end loop;
  -- علب كانت متعلّمة مفقودة واتلقت
  for b in select bx.* from stock_count_boxes x join boxes bx on bx.sn = x.box_sn where x.count_id = c.id and bx.status = 'missing' for update of bx loop
    update boxes set status = 'stock', location_id = c.location_id where sn = b.sn;
    insert into stock_moves (item_id, location_id, qty, kind, reason, ref, box_sn, unit_cost, by)
      values (b.item_id, c.location_id, b.weight, 'count', 'علبة مفقودة اتلقت في الجرد', ref, b.sn, (select cost from items where id = b.item_id), auth.uid());
  end loop;
  update stock_counts set status = 'approved', decided_by = auth.uid(), decided_at = now(), decision_note = p_note, value_diff = v_val where id = p_count;
end $$;

-- قايمة الجرد
create or replace function public.count_list(p_status text default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_staff() or not (has_perm('stock.count') or has_perm('stock.adjust') or has_perm('stock.view')) then raise exception 'محتاج صلاحية الجرد'; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'no', c.no, 'status', c.status, 'location', l.name, 'family', f.name, 'at', c.at,
      'by', p.name, 'decided_by', d.name, 'value', c.value_diff,
      'lines', (select count(*) filter (where counted_qty is not null) || '/' || count(*) from stock_count_lines where count_id = c.id),
      'boxes', (select count(*) from stock_count_boxes where count_id = c.id)) order by c.id desc), '[]'::jsonb)
    from (select * from stock_counts where p_status is null or status = p_status order by id desc limit 200) c
    join locations l on l.id = c.location_id left join families f on f.id = c.family_id
    left join profiles p on p.id = c."by" left join profiles d on d.id = c.decided_by);
end $$;

revoke execute on function public.item_boxed(bigint), public.count_start(text, bigint, text), public.count_set(bigint, bigint, numeric, text),
  public.count_scan(bigint, bigint), public.count_view(bigint), public.count_value(bigint), public.count_submit(bigint),
  public.count_decide(bigint, boolean, text), public.count_list(text) from public, anon;
grant execute on function public.count_start(text, bigint, text), public.count_set(bigint, bigint, numeric, text),
  public.count_scan(bigint, bigint), public.count_view(bigint), public.count_submit(bigint),
  public.count_decide(bigint, boolean, text), public.count_list(text) to authenticated;
