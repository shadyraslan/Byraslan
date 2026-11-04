-- ============ 0007 كارت الصنف: نسخ معتمدة + صور مرجعية + مستندات مطلوبة + فحص إجباري عند الاستلام ============

alter table public.item_specs
  add column if not exists certs text[] not null default '{}',       -- المستندات المطلوبة مع كل شحنة
  add column if not exists img_ok text,                              -- مسار صورة الشكل المقبول (Storage)
  add column if not exists img_bad text,                             -- مسار صورة الشكل المرفوض
  add column if not exists dirty boolean not null default true;      -- فيه تعديلات مستنية اعتماد

-- كل اعتماد = نسخة متجمّدة؛ الاستلام بيقرا آخر نسخة معتمدة بس
create table public.item_spec_versions (
  item_id bigint not null references public.items on delete cascade,
  version int not null,
  snapshot jsonb not null,
  what text,
  approved_by uuid not null default auth.uid(),
  approved_at timestamptz not null default now(),
  primary key (item_id, version)
);

insert into public.permissions (id, grp, label) values ('qa.approve','الجودة','اعتماد مواصفات الأصناف') on conflict do nothing;

create or replace function public.approve_spec(p_item bigint, p_what text default null)
returns int language plpgsql security invoker set search_path = public as $$
declare v int; s item_specs%rowtype;
begin
  if not has_perm('qa.approve') then raise exception 'اعتماد المواصفة محتاج صلاحية الجودة'; end if;
  select * into s from item_specs where item_id = p_item;
  if not found or coalesce(s.description, '') = '' then raise exception 'اكتب وصف الصنف الأول'; end if;
  select coalesce(max(sv.version), 0) + 1 into v from item_spec_versions sv where sv.item_id = p_item;
  insert into item_spec_versions (item_id, version, snapshot, what)
    values (p_item, v, to_jsonb(s) || jsonb_build_object('alt_brands', (select coalesce(jsonb_agg(jsonb_build_object('brand', a.brand, 'note', a.note)), '[]'::jsonb) from item_alt_brands a where a.item_id = p_item)), p_what);
  update item_specs set dirty = false where item_id = p_item;
  return v;
end $$;

-- نتيجة الفحص وقت الاستلام: كل بند لازم يتجاوب، وكل مستند يا متصوّر يا متعلّم "مش موجود"
create table public.receipt_checks (
  receipt_ref text not null,
  item_id bigint not null references public.items,
  spec_version int not null,
  check_text text not null,
  passed boolean not null,
  by uuid default auth.uid(),
  at timestamptz not null default now()
);
create table public.receipt_docs (
  receipt_ref text not null,
  item_id bigint not null references public.items,
  doc_name text not null,
  photo text,
  missing boolean not null default false,
  check (missing or photo is not null),
  by uuid default auth.uid(),
  at timestamptz not null default now()
);

alter table public.item_spec_versions enable row level security;
alter table public.receipt_checks enable row level security;
alter table public.receipt_docs enable row level security;
create policy sv_read on public.item_spec_versions for select to authenticated using (true);
create policy sv_ins on public.item_spec_versions for insert to authenticated with check (has_perm('qa.approve'));
create policy rc_read on public.receipt_checks for select to authenticated using (true);
create policy rc_ins on public.receipt_checks for insert to authenticated with check (has_perm('purchase.edit') or has_perm('stock.edit'));
create policy rd_read on public.receipt_docs for select to authenticated using (true);
create policy rd_ins on public.receipt_docs for insert to authenticated with check (has_perm('purchase.edit') or has_perm('stock.edit'));
