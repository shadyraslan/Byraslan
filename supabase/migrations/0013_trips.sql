-- ============ 0013 العربيات والتحميل بالصناديق: امسح الصندوق ← اختار الفرع ← امسح العلب ← "الصندوق خلص" ============
-- التحميل بيتسجّل في trip_boxes. لما العربية تخرج بيتعمل تحويل لكل فرع (في الطريق)، والفرع بيستلم بمسح الصندوق أو العلب.

create table public.crates (
  id text primary key,                 -- CR-001
  active boolean not null default true
);
insert into public.crates (id) select 'CR-' || lpad(g::text, 3, '0') from generate_series(1, 40) g;

create table public.trips (
  id bigint generated always as identity primary key,
  no bigint generated always as identity (start with 501),
  truck text not null,
  driver text,
  status text not null default 'loading' check (status in ('loading','out','done')),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  left_at timestamptz
);

create table public.trip_crates (
  trip_id bigint not null references public.trips,
  crate_id text not null references public.crates,
  to_loc text not null references public.locations,
  closed boolean not null default false,
  primary key (trip_id, crate_id)
);

create table public.trip_boxes (
  trip_id bigint not null references public.trips,
  crate_id text not null references public.crates,
  box_sn bigint not null references public.boxes,
  removed boolean not null default false,
  at timestamptz not null default now(),
  by uuid default auth.uid()
);
create index trip_boxes_trip on public.trip_boxes (trip_id) where not removed;
alter table public.transfers add column if not exists trip_id bigint references public.trips;

-- الصندوق مشغول لو فيه علب لسه في الطريق
create or replace function public.crate_busy(p_crate text, p_trip bigint)
returns bigint language sql stable security invoker set search_path = public as $$
  select tb.trip_id from trip_boxes tb join boxes b on b.sn = tb.box_sn
  where tb.crate_id = p_crate and tb.trip_id <> p_trip and not tb.removed and b.crate = p_crate and b.status in ('loaded','transit')
  limit 1
$$;

create or replace function public.crate_open(p_trip bigint, p_crate text, p_to text)
returns text language plpgsql security invoker set search_path = public as $$
declare tr trips%rowtype; busy bigint; cur text;
begin
  if not has_perm('trips.load') then raise exception 'محتاج صلاحية تحميل العربيات'; end if;
  select * into tr from trips where id = p_trip;
  if not found or tr.status <> 'loading' then raise exception 'الرحلة دي مش بتتحمّل دلوقتي'; end if;
  if not exists (select 1 from crates where id = p_crate and active) then raise exception 'الصندوق % مش متسجّل', p_crate; end if;
  busy := crate_busy(p_crate, p_trip);
  if busy is not null then raise exception 'الصندوق % لسه في رحلة تانية ومانزلش — استخدم صندوق تاني', p_crate; end if;
  select to_loc into cur from trip_crates where trip_id = p_trip and crate_id = p_crate;
  if cur is not null then
    if p_to is not null and cur <> p_to then raise exception 'الصندوق ده متحدد لفرع تاني'; end if;
    update trip_crates set closed = false where trip_id = p_trip and crate_id = p_crate;
    return cur;
  end if;
  if p_to is null then return null; end if;
  insert into trip_crates (trip_id, crate_id, to_loc) values (p_trip, p_crate, p_to);
  return p_to;
end $$;

create or replace function public.load_box(p_trip bigint, p_crate text, p_sn bigint, p_min_days int default 1)
returns text language plpgsql security invoker set search_path = public as $$
declare tc trip_crates%rowtype; b boxes%rowtype; nm text;
begin
  if not has_perm('trips.load') then raise exception 'محتاج صلاحية تحميل العربيات'; end if;
  select * into tc from trip_crates where trip_id = p_trip and crate_id = p_crate;
  if not found then raise exception 'امسح الصندوق الأول'; end if;
  select * into b from boxes where sn = p_sn;
  if not found then raise exception 'العلبة #% مش متسجّلة', p_sn; end if;
  if b.status = 'loaded' then raise exception 'العلبة #% اتحمّلت قبل كده في %', p_sn, b.crate; end if;
  if b.status <> 'stock' or b.location_id <> 'factory' then raise exception 'العلبة #% مش في مخزون المصنع', p_sn; end if;
  if b.expires_at is not null and b.expires_at < now() + make_interval(days => p_min_days) then raise exception 'العلبة #% صلاحيتها قربت تخلص — ماتتحمّلش', p_sn; end if;
  insert into trip_boxes (trip_id, crate_id, box_sn) values (p_trip, p_crate, p_sn);
  update boxes set status = 'loaded', crate = p_crate where sn = p_sn;
  select name into nm from items where id = b.item_id;
  return nm;
end $$;

create or replace function public.unload_box(p_trip bigint, p_sn bigint)
returns void language plpgsql security invoker set search_path = public as $$
begin
  if not has_perm('trips.load') then raise exception 'محتاج صلاحية تحميل العربيات'; end if;
  if not exists (select 1 from trips where id = p_trip and status = 'loading') then raise exception 'العربية خرجت خلاص'; end if;
  update trip_boxes set removed = true where trip_id = p_trip and box_sn = p_sn and not removed;
  if not found then raise exception 'العلبة دي مش على الرحلة دي'; end if;
  update boxes set status = 'stock', crate = null where sn = p_sn and status = 'loaded';
end $$;

-- العربية خرجت: تحويل لكل فرع (في الطريق) بالعلب اللي اتحمّلت
create or replace function public.trip_depart(p_trip bigint)
returns int language plpgsql security invoker set search_path = public as $$
declare tr trips%rowtype; d record; tid bigint; n int := 0;
begin
  if not has_perm('trips.load') then raise exception 'محتاج صلاحية تحميل العربيات'; end if;
  select * into tr from trips where id = p_trip for update;
  if tr.status <> 'loading' then raise exception 'العربية خرجت قبل كده'; end if;
  for d in select tc.to_loc from trip_crates tc where tc.trip_id = p_trip
             and exists (select 1 from trip_boxes tb where tb.trip_id = p_trip and tb.crate_id = tc.crate_id and not tb.removed)
           group by tc.to_loc loop
    insert into transfers (from_loc, to_loc, status, reason, trip_id) values ('factory', d.to_loc, 'transit', 'رحلة #' || tr.no || ' · ' || tr.truck, p_trip) returning id into tid;
    insert into transfer_boxes (transfer_id, box_sn)
      select tid, tb.box_sn from trip_boxes tb join trip_crates tc on tc.trip_id = tb.trip_id and tc.crate_id = tb.crate_id
      where tb.trip_id = p_trip and not tb.removed and tc.to_loc = d.to_loc;
    insert into stock_moves (item_id, location_id, qty, kind, reason, ref, box_sn)
      select b.item_id, 'factory', -b.weight, 'transfer', 'رحلة #' || tr.no, 'T' || tid, b.sn
      from transfer_boxes x join boxes b on b.sn = x.box_sn where x.transfer_id = tid;
    n := n + 1;
  end loop;
  if n = 0 then raise exception 'العربية فاضية — حمّل علب الأول'; end if;
  update boxes set status = 'transit' where sn in (select box_sn from trip_boxes where trip_id = p_trip and not removed);
  update trips set status = 'out', left_at = now() where id = p_trip;
  return n;
end $$;

alter table public.crates enable row level security;
alter table public.trips enable row level security;
alter table public.trip_crates enable row level security;
alter table public.trip_boxes enable row level security;
create policy cr_read on public.crates for select to authenticated using (true);
create policy cr_write on public.crates for all to authenticated using (has_perm('settings.edit')) with check (has_perm('settings.edit'));
create policy trip_read on public.trips for select to authenticated using (true);
create policy trip_ins on public.trips for insert to authenticated with check (has_perm('trips.load'));
create policy trip_upd on public.trips for update to authenticated using (has_perm('trips.load'));
create policy tc_read on public.trip_crates for select to authenticated using (true);
create policy tc_ins on public.trip_crates for insert to authenticated with check (has_perm('trips.load'));
create policy tc_upd on public.trip_crates for update to authenticated using (has_perm('trips.load'));
create policy tbx_read on public.trip_boxes for select to authenticated using (true);
create policy tbx_ins on public.trip_boxes for insert to authenticated with check (has_perm('trips.load'));
create policy tbx_upd on public.trip_boxes for update to authenticated using (has_perm('trips.load'));
create policy tr_ins_load on public.transfers for insert to authenticated with check (has_perm('trips.load'));
create policy tb_ins_load on public.transfer_boxes for insert to authenticated with check (has_perm('trips.load'));
create policy mv_ins_load on public.stock_moves for insert to authenticated with check (kind = 'transfer' and has_perm('trips.load'));
