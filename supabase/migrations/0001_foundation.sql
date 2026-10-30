-- ============ 0001 الأساس: المستخدمين، الصلاحيات، المواقع، الإعدادات، سجل التعديلات ============

create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  name text not null default '',
  phone text,
  pin text,                       -- رقم سري للتابلت/الكاشير
  is_owner boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- أي حد يتسجّل يتعمله profile؛ أول واحد بيبقى المالك
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, name, is_owner)
  values (new.id, coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
          not exists (select 1 from public.profiles));
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- كتالوج الصلاحيات
create table public.permissions (
  id text primary key,
  grp text not null,
  label text not null
);

-- الصلاحيات الممنوحة (لمدة أو بحد مبلغ)
create table public.grants (
  user_id uuid not null references public.profiles on delete cascade,
  perm text not null references public.permissions on delete cascade,
  until date,
  max_amount numeric,
  granted_by uuid references public.profiles,
  created_at timestamptz not null default now(),
  primary key (user_id, perm)
);

create or replace function public.is_owner() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select is_owner from profiles where id = auth.uid()), false)
$$;

create or replace function public.has_perm(p text) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_owner() or exists (
    select 1 from grants g where g.user_id = auth.uid() and g.perm = p
      and (g.until is null or g.until >= current_date))
$$;

-- المواقع: مصنع وأقسامه، مخازن، دارك ستور، فروع، مخزن الشريك، مخزن التبرعات
create table public.locations (
  id text primary key,
  name text not null,
  type text not null check (type in ('factory','section','warehouse','sub','dark','shop','partner','donation')),
  parent text references public.locations,
  city text,
  active boolean not null default true,
  sort int not null default 100,
  created_at timestamptz not null default now()
);

-- كل رقم محتاج قرار = إعداد
create table public.settings (
  key text primary key,
  value jsonb not null,
  updated_by uuid references public.profiles,
  updated_at timestamptz not null default now()
);

create table public.audit_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  by uuid default auth.uid(),
  tbl text not null,
  row_id text,
  action text not null,
  old jsonb,
  new jsonb
);

create or replace function public.audit() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into audit_log (tbl, row_id, action, old, new)
  values (tg_table_name,
          coalesce((to_jsonb(new)->>'id'), (to_jsonb(old)->>'id'), (to_jsonb(new)->>'key'), (to_jsonb(old)->>'key')),
          tg_op,
          case when tg_op <> 'INSERT' then to_jsonb(old) end,
          case when tg_op <> 'DELETE' then to_jsonb(new) end);
  return coalesce(new, old);
end $$;

create trigger audit_grants after insert or update or delete on public.grants for each row execute function public.audit();
create trigger audit_locations after insert or update or delete on public.locations for each row execute function public.audit();
create trigger audit_settings after insert or update or delete on public.settings for each row execute function public.audit();

-- ===== RLS =====
alter table public.profiles enable row level security;
alter table public.permissions enable row level security;
alter table public.grants enable row level security;
alter table public.locations enable row level security;
alter table public.settings enable row level security;
alter table public.audit_log enable row level security;

create policy profiles_read on public.profiles for select to authenticated using (true);
create policy profiles_write on public.profiles for update to authenticated
  using (id = auth.uid() or has_perm('users.manage'))
  with check (has_perm('users.manage') or (id = auth.uid() and is_owner = (select p.is_owner from profiles p where p.id = auth.uid())));

create policy perms_read on public.permissions for select to authenticated using (true);

create policy grants_read on public.grants for select to authenticated using (user_id = auth.uid() or has_perm('users.manage'));
create policy grants_write on public.grants for all to authenticated using (has_perm('users.manage')) with check (has_perm('users.manage'));

create policy loc_read on public.locations for select to authenticated using (true);
create policy loc_write on public.locations for all to authenticated using (has_perm('stock.edit')) with check (has_perm('stock.edit'));

create policy set_read on public.settings for select to authenticated using (true);
create policy set_write on public.settings for all to authenticated using (has_perm('settings.edit')) with check (has_perm('settings.edit'));

create policy audit_read on public.audit_log for select to authenticated using (has_perm('audit.view'));

-- ===== بيانات أولية =====
insert into public.permissions (id, grp, label) values
  ('users.manage','الإعداد','إدارة المستخدمين والصلاحيات'),
  ('settings.edit','الإعداد','تعديل الإعدادات والأرقام'),
  ('audit.view','الإعداد','سجل التعديلات'),
  ('items.edit','الأصناف','إضافة وتعديل الأصناف والعائلات'),
  ('prices.edit','الأصناف','تعديل الأسعار'),
  ('stock.view','المخزون','عرض المخزون'),
  ('stock.edit','المخزون','المواقع والتحويلات'),
  ('stock.adjust','المخزون','إضافة/خصم يدوي من المخزون'),
  ('stock.waste','المخزون','تحويل لهالك'),
  ('stock.donate','المخزون','تحويل وخروج التبرعات'),
  ('prod.orders','الإنتاج','أوامر التشغيل'),
  ('prod.pack','الإنتاج','التغليف والطباعة'),
  ('trips.load','التوزيع','تحميل العربيات'),
  ('pos.sell','البيع','البيع في الفرع'),
  ('hr.view','الموارد البشرية','عرض الموظفين'),
  ('hr.pay','الموارد البشرية','المرتبات والبدلات والخصومات'),
  ('acc.view','الحسابات','عرض الحسابات'),
  ('acc.post','الحسابات','تسجيل قيود ومصروفات');

insert into public.locations (id, name, type, parent, city, sort) values
  ('factory','المصنع','factory',null,'إسكندرية',1),
  ('main','المخزن الرئيسي','warehouse','factory','إسكندرية',2),
  ('donate','مخزن التبرعات','donation','factory','إسكندرية',90);
