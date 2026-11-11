-- ============ 0052 مهرجان التخفيضات: أصناف بسعر العرض ومدة ← اعتماد بحد نسبة خصم ← الأسعار بتتغيّر لوحدها في البداية وترجع في النهاية
--                ← ملف ملصقات بالألوان (قبل/بعد) ← صفحة العروض في التطبيق ← الفروع بتأكّد التعليق والشيل ← تقرير المبيعات ============
insert into permissions (id, grp, label) values
  ('promo.approve', 'التسعير', 'اعتماد مهرجان التخفيضات (الحد = أقصى نسبة خصم %)'),
  ('labels.hang', 'الفروع', 'تعليق وشيل ملصقات العروض في الفرع')
on conflict (id) do nothing;

create table if not exists public.campaigns (
  id bigint generated always as identity primary key,
  name text not null, subtitle text, color text not null default '#E11D48',
  starts_at timestamptz not null, ends_at timestamptz not null,
  locations text[],                                   -- فاضي = كل الفروع
  channels text[] not null default '{direct,app}',
  status text not null default 'draft' check (status in ('draft','pending','approved','live','ended','cancelled')),
  by uuid default auth.uid() references public.profiles, at timestamptz not null default now(),
  approved_by uuid references public.profiles, approved_at timestamptz, note text,
  check (ends_at > starts_at)
);
create table if not exists public.campaign_items (
  campaign_id bigint not null references public.campaigns, item_id bigint not null references public.items,
  price numeric not null check (price > 0), app_price numeric, max_qty numeric,
  primary key (campaign_id, item_id)
);
-- السعر الأصلي لكل فرع وقناة وقت البداية (عشان يرجع، وعشان "كان" في الملصق)
create table if not exists public.campaign_prices (
  campaign_id bigint not null references public.campaigns, item_id bigint not null references public.items,
  location_id text not null references public.locations, channel text not null, orig_price numeric, offer_price numeric not null,
  primary key (campaign_id, item_id, location_id, channel)
);
create table if not exists public.campaign_branches (
  campaign_id bigint not null references public.campaigns, location_id text not null references public.locations,
  hung_at timestamptz, hung_by uuid references public.profiles, removed_at timestamptz, removed_by uuid references public.profiles,
  primary key (campaign_id, location_id)
);
do $$ declare t text; begin
  foreach t in array array['campaigns','campaign_items','campaign_prices','campaign_branches'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy staff_only on public.%I as restrictive for all to authenticated using (is_staff()) with check (is_staff())', t);
    execute format('create policy c_read on public.%I for select to authenticated using (true)', t);
  end loop;
end $$;
create policy c_write on public.campaigns for all to authenticated using (has_perm('promo.edit') and status in ('draft','pending')) with check (has_perm('promo.edit') and status in ('draft','pending'));
create policy c_write on public.campaign_items for all to authenticated
  using (has_perm('promo.edit') and exists (select 1 from campaigns c where c.id = campaign_id and c.status in ('draft','pending')))
  with check (has_perm('promo.edit') and exists (select 1 from campaigns c where c.id = campaign_id and c.status in ('draft','pending')));

create or replace function public.campaign_locs(c campaigns) returns setof text
language sql stable security definer set search_path = public as $$
  select id from locations where active and type in ('dark','shop') and (c.locations is null or cardinality(c.locations) = 0 or id = any(c.locations))
$$;

-- أكبر نسبة خصم في العرض (بالمقارنة بسعر الكاشير الحالي)
create or replace function public.campaign_max_pct(p_id bigint) returns numeric
language sql stable security definer set search_path = public as $$
  select coalesce(max(round((1 - ci.price / nullif(p.price, 0)) * 100, 1)), 0)
  from campaign_items ci join campaigns c on c.id = ci.campaign_id
  join prices p on p.item_id = ci.item_id and p.channel = 'direct' and p.location_id in (select campaign_locs(c))
  where ci.campaign_id = p_id
$$;

create or replace function public.campaign_submit(p_id bigint) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not has_perm('promo.edit') then raise exception 'محتاج صلاحية العروض'; end if;
  if not exists (select 1 from campaign_items where campaign_id = p_id) then raise exception 'ضيف أصناف للعرض الأول'; end if;
  update campaigns set status = 'pending' where id = p_id and status = 'draft';
  if not found then raise exception 'العرض ده مش مسودة'; end if;
end $$;

-- الاعتماد: صلاحية promo.approve والحد = أقصى نسبة خصم مسموحة
create or replace function public.campaign_approve(p_id bigint, p_ok boolean, p_note text default null) returns void
language plpgsql security definer set search_path = public as $$
declare lim numeric := perm_limit('promo.approve'); mx numeric; c campaigns%rowtype;
begin
  if lim = -1 then raise exception 'محتاج صلاحية اعتماد العروض'; end if;
  select * into c from campaigns where id = p_id for update;
  if not found or c.status <> 'pending' then raise exception 'العرض ده مش مستني اعتماد'; end if;
  if not p_ok then update campaigns set status = 'draft', note = p_note where id = p_id; return; end if;
  mx := campaign_max_pct(p_id);
  if lim is not null and mx > lim then raise exception 'فيه صنف خصمه %٪ وحدك %٪', mx, lim; end if;
  update campaigns set status = 'approved', approved_by = auth.uid(), approved_at = now(), note = coalesce(p_note, note) where id = p_id;
  insert into campaign_branches (campaign_id, location_id) select p_id, l from campaign_locs(c) l on conflict do nothing;
  perform campaign_tick();
end $$;

-- كل 5 دقايق: العرض اللي جه ميعاده بيبدأ (الأسعار بتتغيّر)، واللي خلص بيرجّع الأسعار
create or replace function public.campaign_tick() returns void
language plpgsql security definer set search_path = public as $$
declare c campaigns%rowtype; r record;
begin
  for c in select * from campaigns where status = 'approved' and starts_at <= now() and ends_at > now() for update loop
    for r in select ci.*, l loc, ch from campaign_items ci cross join campaign_locs(c) l cross join unnest(c.channels) ch where ci.campaign_id = c.id loop
      insert into campaign_prices (campaign_id, item_id, location_id, channel, orig_price, offer_price)
        values (c.id, r.item_id, r.loc, r.ch, (select price from prices where item_id = r.item_id and location_id = r.loc and channel = r.ch),
                case when r.ch = 'app' then coalesce(r.app_price, r.price) else r.price end)
        on conflict do nothing;
      insert into prices (item_id, location_id, channel, price, updated_at) values (r.item_id, r.loc, r.ch, case when r.ch = 'app' then coalesce(r.app_price, r.price) else r.price end, now())
        on conflict (item_id, location_id, channel) do update set price = excluded.price, updated_at = now();
    end loop;
    update campaigns set status = 'live' where id = c.id;
  end loop;
  for c in select * from campaigns where status in ('live','approved') and ends_at <= now() for update loop
    -- يرجع السعر الأصلي بس لو محدش غيّر السعر أثناء العرض
    update prices p set price = cp.orig_price, updated_at = now() from campaign_prices cp
      where cp.campaign_id = c.id and p.item_id = cp.item_id and p.location_id = cp.location_id and p.channel = cp.channel and p.price = cp.offer_price and cp.orig_price is not null;
    update campaigns set status = 'ended' where id = c.id;
  end loop;
end $$;

create or replace function public.campaign_cancel(p_id bigint) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not (has_perm('promo.approve') or has_perm('promo.edit')) then raise exception 'محتاج صلاحية العروض'; end if;
  update campaigns set status = 'cancelled' where id = p_id and status in ('draft','pending');
  if not found then
    update campaigns set ends_at = now() where id = p_id and status in ('live','approved');
    perform campaign_tick();
  end if;
end $$;

-- الفرع: علّقنا / شيلنا
create or replace function public.campaign_branch(p_id bigint, p_loc text, p_what text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not (has_perm('labels.hang') or has_perm('pos.shift') or has_perm('promo.edit')) then raise exception 'محتاج صلاحية الملصقات'; end if;
  if p_what = 'hung' then update campaign_branches set hung_at = now(), hung_by = auth.uid() where campaign_id = p_id and location_id = p_loc;
  else update campaign_branches set removed_at = now(), removed_by = auth.uid() where campaign_id = p_id and location_id = p_loc; end if;
end $$;

-- أصناف العرض بالسعر قبل وبعد لكل فرع (للملصقات والتقرير)
create or replace function public.campaign_view(p_id bigint, p_loc text default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare c campaigns%rowtype; v_loc text;
begin
  select * into c from campaigns where id = p_id;
  if not found then raise exception 'العرض مش موجود'; end if;
  v_loc := coalesce(p_loc, (select l from campaign_locs(c) l limit 1));
  return jsonb_build_object('campaign', to_jsonb(c), 'loc', v_loc, 'max_pct', campaign_max_pct(p_id),
    'items', (select coalesce(jsonb_agg(jsonb_build_object('item_id', i.id, 'name', i.name, 'size', i.size, 'maker', i.maker, 'unit', i.unit, 'photo', i.photo,
        'price', ci.price, 'app_price', ci.app_price, 'max_qty', ci.max_qty,
        'old', coalesce((select orig_price from campaign_prices cp where cp.campaign_id = p_id and cp.item_id = i.id and cp.location_id = v_loc and cp.channel = 'direct'),
                        (select price from prices where item_id = i.id and location_id = v_loc and channel = 'direct')),
        'code', (select code from item_barcodes b where b.item_id = i.id order by (code like '20%'), code limit 1)) order by i.name), '[]'::jsonb)
      from campaign_items ci join items i on i.id = ci.item_id where ci.campaign_id = p_id),
    'branches', (select coalesce(jsonb_agg(jsonb_build_object('loc', b.location_id, 'name', l.name, 'hung_at', b.hung_at, 'removed_at', b.removed_at)), '[]'::jsonb)
      from campaign_branches b join locations l on l.id = b.location_id where b.campaign_id = p_id));
end $$;

-- تقرير: مبيعات أصناف العرض أثناءه مقارنة بنفس المدة قبله
create or replace function public.campaign_report(p_id bigint) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare c campaigns%rowtype; t1 timestamptz; d interval;
begin
  if not (has_perm('promo.edit') or has_perm('promo.approve') or has_perm('acc.view')) then raise exception 'محتاج صلاحية'; end if;
  select * into c from campaigns where id = p_id;
  t1 := least(c.ends_at, now()); d := t1 - c.starts_at;
  return (select coalesce(jsonb_agg(z order by (z->>'during_v')::numeric desc), '[]'::jsonb) from (
    select jsonb_build_object('name', i.name,
      'during_q', round(coalesce(sum(x.q) filter (where x.at >= c.starts_at and x.at < t1), 0), 2), 'during_v', round(coalesce(sum(x.v) filter (where x.at >= c.starts_at and x.at < t1), 0), 2),
      'before_q', round(coalesce(sum(x.q) filter (where x.at >= c.starts_at - d and x.at < c.starts_at), 0), 2), 'before_v', round(coalesce(sum(x.v) filter (where x.at >= c.starts_at - d and x.at < c.starts_at), 0), 2),
      'cost', i.cost, 'price', ci.price) z
    from campaign_items ci join items i on i.id = ci.item_id
    left join lateral (select s.at, sl.qty q, sl.total v from sales s join sale_lines sl on sl.sale_id = s.id where sl.item_id = ci.item_id and s.at >= c.starts_at - d and s.at < t1
                       union all select o.created_at, l.qty, round(l.qty * l.unit_price, 2) from online_orders o join online_order_lines l on l.order_id = o.id
                       where l.item_id = ci.item_id and o.status <> 'cancelled' and o.created_at >= c.starts_at - d and o.created_at < t1) x on true
    where ci.campaign_id = p_id and d > interval '0' group by i.name, i.cost, ci.price) y);
end $$;

-- صفحة العروض في التطبيق: العروض الشغالة وأصنافها بسعر قبل/بعد لفرع العميل
create or replace function public.app_campaigns(p_district bigint) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name, 'subtitle', c.subtitle, 'color', c.color, 'ends_at', c.ends_at,
    'items', (select coalesce(jsonb_agg(jsonb_build_object('item_id', i.id, 'name', i.name, 'size', i.size, 'photo', i.photo, 'unit', i.unit,
        'price', coalesce(ci.app_price, ci.price), 'old', cp.orig_price) order by i.name), '[]'::jsonb)
      from campaign_items ci join items i on i.id = ci.item_id and i.active
      left join campaign_prices cp on cp.campaign_id = c.id and cp.item_id = i.id and cp.location_id = district_branch(p_district) and cp.channel = 'app'
      where ci.campaign_id = c.id)) order by c.ends_at), '[]'::jsonb)
  from campaigns c where c.status = 'live' and 'app' = any(c.channels)
    and (c.locations is null or cardinality(c.locations) = 0 or district_branch(p_district) = any(c.locations))
$$;
do $do$ declare src text; begin
  src := pg_get_functiondef('public.app_config'::regproc);
  src := replace(src, '    ''banners'', (select', '    ''campaigns'', (select coalesce(jsonb_agg(jsonb_build_object(''id'', id, ''name'', name, ''subtitle'', subtitle, ''color'', color, ''ends_at'', ends_at) order by ends_at), ''[]''::jsonb) from campaigns where status = ''live'' and ''app'' = any(channels)),
    ''banners'', (select');
  if src !~ '''campaigns''' then raise exception 'app_config patch failed'; end if;
  execute src;
end $do$;

-- أرقام القسم والداشبورد
do $do$ declare src text; begin
  src := pg_get_functiondef('public.section_stats'::regproc);
  src := replace(src, '''promos'', (select count(*) from promos where active and (ends_at is null or ends_at > now()))', '''promos'', (select count(*) from promos where active and (ends_at is null or ends_at > now())),
      ''campaigns_live'', (select count(*) from campaigns where status = ''live''), ''campaigns_pending'', (select count(*) from campaigns where status = ''pending''),
      ''labels_todo'', (select count(*) from campaign_branches b join campaigns c on c.id = b.campaign_id where (c.status in (''approved'',''live'') and b.hung_at is null) or (c.status = ''ended'' and b.hung_at is not null and b.removed_at is null))');
  if src !~ 'campaigns_live' then raise exception 'stats patch failed'; end if;
  execute src;
end $do$;

select cron.schedule('campaign-tick', '*/5 * * * *', 'select public.campaign_tick()');
revoke execute on function public.campaign_locs(campaigns), public.campaign_max_pct(bigint), public.campaign_tick() from public, anon, authenticated;
revoke execute on function public.campaign_submit(bigint), public.campaign_approve(bigint, boolean, text), public.campaign_cancel(bigint), public.campaign_branch(bigint, text, text),
  public.campaign_view(bigint, text), public.campaign_report(bigint) from public, anon;
grant execute on function public.campaign_submit(bigint), public.campaign_approve(bigint, boolean, text), public.campaign_cancel(bigint), public.campaign_branch(bigint, text, text),
  public.campaign_view(bigint, text), public.campaign_report(bigint) to authenticated;
grant execute on function public.app_campaigns(bigint) to anon, authenticated;
