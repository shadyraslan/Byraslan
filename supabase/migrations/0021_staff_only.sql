-- ============ 0021 فصل العملاء عن الموظفين ============
-- حسابات العملاء (دخول بكود SMS، من غير إيميل) مابتتعملهاش profile، ومابتشوفش أي جدول جوّه الشركة.
-- العميل بيتعامل مع الداتابيز من خلال دوال app_* بس.

create or replace function public.is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and active)
$$;

-- الموظف بيتعمل بإيميل (المالك أو <موبايل>@staff.byraslan.app). اللي بيدخل بالموبايل بس = عميل.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.email is null or new.email = '' then
    insert into customers (phone, name, auth_id)
      values (regexp_replace(new.phone, '^\+?20', '0'), coalesce(new.raw_user_meta_data->>'name', ''), new.id)
      on conflict (phone) do update set auth_id = excluded.auth_id;
    return new;
  end if;
  insert into public.profiles (id, name, is_owner)
  values (new.id, coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
          not exists (select 1 from public.profiles));
  return new;
end $$;

alter table public.customers add column if not exists auth_id uuid unique references auth.users;

-- سياسة "مقيّدة" على كل جدول: لازم تبقى موظف شغّال، فوق أي سياسة تانية
do $$
declare t record;
begin
  for t in select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relkind = 'r' loop
    execute format('alter table public.%I enable row level security', t.relname);
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = t.relname and policyname = 'staff_only') then
      execute format('create policy staff_only on public.%I as restrictive for all to authenticated using (public.is_staff()) with check (public.is_staff())', t.relname);
    end if;
  end loop;
end $$;

create policy docs_staff_only on storage.objects as restrictive for all to authenticated
  using (bucket_id <> 'docs' or public.is_staff()) with check (bucket_id <> 'docs' or public.is_staff());
