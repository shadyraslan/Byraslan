-- ============ 0006 كارت الصنف: المواصفة + النوع/البراند + المورد الأساسي وبديلين + براندات بديلة ============

create table public.suppliers (
  id bigint generated always as identity primary key,
  name text not null,
  phone text,
  terms text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.item_specs (
  item_id bigint primary key references public.items on delete cascade,
  brand text,                    -- النوع / البراند المعتمد
  description text,
  size text,                     -- الحجم / الوزن المقبول
  temp_max numeric,              -- أقصى حرارة عند الاستلام (null = مش مبرّد)
  min_shelf_days int not null default 0,
  waste_pct numeric not null default 0,
  checks text[] not null default '{}',   -- بنود الفحص
  updated_by uuid default auth.uid(),
  updated_at timestamptz not null default now()
);

-- 1 = الأساسي، 2 = البديل 1، 3 = البديل 2
create table public.item_suppliers (
  item_id bigint not null references public.items on delete cascade,
  rank smallint not null check (rank between 1 and 3),
  supplier_id bigint not null references public.suppliers,
  brand text,                    -- النوع اللي المورد ده بيورّده لو مختلف
  price numeric,
  primary key (item_id, rank),
  unique (item_id, supplier_id)
);

create table public.item_alt_brands (
  id bigint generated always as identity primary key,
  item_id bigint not null references public.items on delete cascade,
  brand text not null,
  note text
);

alter table public.suppliers enable row level security;
alter table public.item_specs enable row level security;
alter table public.item_suppliers enable row level security;
alter table public.item_alt_brands enable row level security;

insert into public.permissions (id, grp, label) values ('purchase.edit','المشتريات','الموردين ومواصفات الأصناف') on conflict do nothing;

create policy sup_read on public.suppliers for select to authenticated using (true);
create policy sup_write on public.suppliers for all to authenticated using (has_perm('purchase.edit')) with check (has_perm('purchase.edit'));
create policy spec_read on public.item_specs for select to authenticated using (true);
create policy spec_write on public.item_specs for all to authenticated using (has_perm('purchase.edit')) with check (has_perm('purchase.edit'));
create policy isup_read on public.item_suppliers for select to authenticated using (true);
create policy isup_write on public.item_suppliers for all to authenticated using (has_perm('purchase.edit')) with check (has_perm('purchase.edit'));
create policy alt_read on public.item_alt_brands for select to authenticated using (true);
create policy alt_write on public.item_alt_brands for all to authenticated using (has_perm('purchase.edit')) with check (has_perm('purchase.edit'));
create trigger audit_item_specs after insert or update or delete on public.item_specs for each row execute function public.audit();
