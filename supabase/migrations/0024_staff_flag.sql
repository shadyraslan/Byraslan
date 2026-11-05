-- الموظف بس هو اللي اتعمل من جوه البرنامج (app_metadata.staff = true، ومحدش يقدر يكتبها غير السيرفر) أو أول مستخدم (المالك).
-- أي حد يعمل حساب بإيميل من برّه بياخد profile موقوف، فمايشوفش حاجة حتى لو التسجيل بالإيميل اتفتح بالغلط.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare first boolean := not exists (select 1 from public.profiles);
begin
  if (new.email is null or new.email = '') and new.phone is not null then
    insert into customers (phone, name, auth_id)
      values (regexp_replace(new.phone, '^\+?20', '0'), coalesce(new.raw_user_meta_data->>'name', ''), new.id)
      on conflict (phone) do update set auth_id = excluded.auth_id;
    return new;
  end if;
  insert into public.profiles (id, name, is_owner, active)
  values (new.id, coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)), first,
          first or coalesce((new.raw_app_meta_data->>'staff')::boolean, false));
  return new;
end $$;
