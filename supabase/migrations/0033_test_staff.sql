-- ============ 0033 وضع التجربة لكل التطبيقات (قرار شادي: "skip لكل قصص الباسوردات والأرقام دلوقتي") ============
-- profiles.is_test: "موظف تجربة" بيتعمل من /api/staff-test-login (زرار تخطّي في تطبيق الموظفين) — بيشتغل بس طول ما app.test_mode شغال.
alter table public.profiles add column if not exists is_test boolean not null default false;
create or replace function public.is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and active
                 and (not is_test or coalesce((select value::text::boolean from settings where key = 'app.test_mode'), false)))
$$;
-- has_perm بقت كمان بتشترط is_staff (الموقوف أو حساب التجربة بعد قفل وضع التجربة مالوش صلاحيات)
create or replace function public.has_perm(p text) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_staff() and (public.is_owner() or exists (select 1 from grants g where g.user_id = auth.uid() and g.perm = p and (g.until is null or g.until >= current_date)))
$$;
