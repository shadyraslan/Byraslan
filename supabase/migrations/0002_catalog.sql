-- ============ 0002 الأصناف: عائلات وفرعية، أصناف، هاشتاجز، باركود، أسعار ============

create table public.families (
  id bigint generated always as identity primary key,
  name text not null,
  arm text not null check (arm in ('rostos','market','oricci')),
  parent_id bigint references public.families on delete restrict,
  tag text,                       -- هاشتاج العائلة (أي صنف عليه الهاشتاج يظهر فيها)
  sort int not null default 100
);

create table public.items (
  id bigint generated always as identity primary key,
  name text not null,
  arm text not null check (arm in ('rostos','market','oricci')),
  unit text not null default 'كجم',
  sold_by text not null default 'weight' check (sold_by in ('weight','piece','pack')),
  family_id bigint references public.families on delete set null,
  also_families bigint[] not null default '{}',   -- عائلات إضافية يظهر فيها
  tags text[] not null default '{}',
  cost numeric,
  shelf_days int,                  -- الصلاحية بالأيام
  partner_only boolean not null default false,   -- صنف الماركت الشريك: ✓ اتجاب، من غير باركود
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index items_tags on public.items using gin (tags);
create index items_name on public.items (name);

create table public.item_barcodes (
  code text primary key,
  item_id bigint not null references public.items on delete cascade
);

-- السعر لكل صنف × موقع × قناة (فرع/تطبيق)
create table public.prices (
  item_id bigint not null references public.items on delete cascade,
  location_id text not null references public.locations on delete cascade,
  channel text not null check (channel in ('direct','app')),
  price numeric not null,
  updated_by uuid default auth.uid(),
  updated_at timestamptz not null default now(),
  primary key (item_id, location_id, channel)
);

create table public.price_log (
  id bigint generated always as identity primary key,
  item_id bigint not null,
  location_id text not null,
  channel text not null,
  old numeric,
  new numeric,
  how text,
  by uuid default auth.uid(),
  at timestamptz not null default now()
);

create or replace function public.log_price() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' or old.price is distinct from new.price then
    insert into price_log (item_id, location_id, channel, old, new)
    values (new.item_id, new.location_id, new.channel, case when tg_op = 'UPDATE' then old.price end, new.price);
  end if;
  return new;
end $$;
create trigger prices_log after insert or update on public.prices for each row execute function public.log_price();
create trigger audit_items after insert or update or delete on public.items for each row execute function public.audit();

alter table public.families enable row level security;
alter table public.items enable row level security;
alter table public.item_barcodes enable row level security;
alter table public.prices enable row level security;
alter table public.price_log enable row level security;

create policy fam_read on public.families for select to authenticated using (true);
create policy fam_write on public.families for all to authenticated using (has_perm('items.edit')) with check (has_perm('items.edit'));
create policy it_read on public.items for select to authenticated using (true);
create policy it_write on public.items for all to authenticated using (has_perm('items.edit')) with check (has_perm('items.edit'));
create policy bc_read on public.item_barcodes for select to authenticated using (true);
create policy bc_write on public.item_barcodes for all to authenticated using (has_perm('items.edit')) with check (has_perm('items.edit'));
create policy pr_read on public.prices for select to authenticated using (true);
create policy pr_write on public.prices for all to authenticated using (has_perm('prices.edit')) with check (has_perm('prices.edit'));
create policy pl_read on public.price_log for select to authenticated using (has_perm('prices.edit'));
