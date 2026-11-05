-- وضع التجربة: العميل يدخل بأي رقم من غير كود SMS (دخول مجهول + ربط بالرقم). لازم يتقفل من الإعدادات قبل النزول للناس.
-- (نفس اللي اتشغّل على الداتابيز: إعداد app.test_mode، handle_new_user بيتجاهل الحساب المجهول، app_test_login، app_config فيه test_mode)
insert into public.settings (key, value) values ('app.test_mode', 'true') on conflict (key) do update set value = 'true';

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare first boolean := not exists (select 1 from public.profiles);
begin
  if new.email is null or new.email = '' then
    if new.phone is not null and new.phone <> '' then
      insert into customers (phone, name, auth_id)
        values (regexp_replace(new.phone, '^\+?20', '0'), coalesce(new.raw_user_meta_data->>'name', ''), new.id)
        on conflict (phone) do update set auth_id = excluded.auth_id;
    end if;
    return new;
  end if;
  insert into public.profiles (id, name, is_owner, active)
  values (new.id, coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)), first,
          first or coalesce((new.raw_app_meta_data->>'staff')::boolean, false));
  return new;
end $$;

create or replace function public.app_test_login(p_phone text) returns void
language plpgsql security definer set search_path = public as $$
declare v text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'); u auth.users%rowtype;
begin
  if not coalesce((select value::text::boolean from settings where key = 'app.test_mode'), false) then raise exception 'وضع التجربة مقفول — ادخل بكود SMS'; end if;
  select * into u from auth.users where id = auth.uid();
  if not found or coalesce(u.email, '') <> '' then raise exception 'مش مسموح'; end if;
  if v ~ '^20' then v := '0' || substr(v, 3); end if;
  if v !~ '^01[0125][0-9]{8}$' then raise exception 'اكتب رقم موبايل مصري صحيح'; end if;
  update customers set auth_id = null where auth_id = auth.uid() and phone <> v;
  insert into customers (phone, name, auth_id) values (v, '', auth.uid())
    on conflict (phone) do update set auth_id = excluded.auth_id;
end $$;
revoke execute on function public.app_test_login(text) from anon, public;
grant execute on function public.app_test_login(text) to authenticated;

create or replace function public.app_config() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'brands', coalesce((select value from settings where key = 'app.brands'), '{}'::jsonb),
    'note', (select value from settings where key = 'online.weight_note'),
    'test_mode', coalesce((select value::text::boolean from settings where key = 'app.test_mode'), false),
    'branches', (select coalesce(jsonb_agg(to_jsonb(b)), '[]'::jsonb) from public_branches() b))
$$;
