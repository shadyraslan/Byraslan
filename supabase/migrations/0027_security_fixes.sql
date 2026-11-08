-- ============ 0027 Phase 1: إصلاح ثغرات الأمان الحرجة (P1) ============
--
-- BUG-005: Privilege Escalation Through grant()
-- BUG-004: Missing POS Discount Maximum Enforcement
-- BUG-001: In-Memory Login Rate Limiting
--
-- الملف مقصود يكون idempotent قدر الإمكان.

-- ============================================================
-- 1) BUG-005: حماية منح الصلاحيات من الترقية الذاتية والتفويض غير المصرح
-- ============================================================
--
-- المشكلة:
--   grant() في users/actions.ts بتتحقق من can(me, 'users.manage') بس.
--   المستخدم اللي عنده users.manage ممكن يمنح أي صلاحية لنفسه.
--   RLS policy grants_write بتتحقق من has_perm('users.manage') بس.
--
-- الحل:
--   دالة secure_grant() SECURITY DEFINER بتتحقق من:
--   1. المانح لازم يكون عنده users.manage.
--   2. المانح ممنوع يمنح صلاحية لنفسه (target ≠ actor).
--   3. المانح ممنوع يمنح users.manage لأي حد (فقط owner يقدر).
--   4. المانح ممنوع يمنح صلاحية مش عنده هو نفسه (delegation ceiling).
--      الاستثناء: owner عنده كل الصلاحيات.
--   5. التحقق من إن الصلاحية موجودة في permissions catalog.
--   6. التحقق من إن المستخدم الهدف موجود في profiles.
--
-- المانح يقدر يمنح صلاحية X لمستخدم تاني بس لو عنده هو نفسه صلاحية X.
-- ده بيمنع privilege escalation عبر التفويض.

create or replace function public.secure_grant(
  p_target uuid,
  p_perm text,
  p_until date,
  p_max_amount numeric
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_actor_is_owner boolean;
  v_has_manage boolean;
  v_has_perm boolean;
  v_perm_exists boolean;
  v_target_exists boolean;
  v_target_is_owner boolean;
begin
  -- 1. التحقق من إن المانح مسجل دخول
  if v_actor is null then
    raise exception 'سجّل دخول الأول';
  end if;

  -- 2. التحقق من إن المانح عنده users.manage
  v_has_manage := has_perm('users.manage');
  v_actor_is_owner := is_owner();

  if not v_has_manage and not v_actor_is_owner then
    raise exception 'محتاج صلاحية إدارة المستخدمين';
  end if;

  -- 3. ممنوع تمنح صلاحية لنفسك
  if p_target = v_actor then
    raise exception 'ممنوع تمنح صلاحية لنفسك';
  end if;

  -- 4. ممنوع تمنح users.manage — فقط owner يقدر
  --    وowner ممنوع يمنح users.manage لأن ده ممكن يسبب privilege escalation
  if p_perm = 'users.manage' then
    raise exception 'ممنوع تمنح صلاحية إدارة المستخدمين — ده مقصور على المالك';
  end if;

  -- 5. التحقق من إن الصلاحية موجودة
  select count(*) > 0 into v_perm_exists from permissions where id = p_perm;
  if not v_perm_exists then
    raise exception 'الصلاحية مش موجودة في الكتالوج';
  end if;

  -- 6. التحقق من إن المستخدم الهدف موجود
  select true, is_owner into v_target_exists, v_target_is_owner
  from profiles where id = p_target;

  if not v_target_exists then
    raise exception 'المستخدم الهدف مش موجود';
  end if;

  -- 7. ممنوع تعدل صلاحيات owner — owner عنده كل الصلاحيات عبر is_owner
  --    وإضافة grants ليه مش محتاج وممكن يسبب لبس
  if v_target_is_owner then
    raise exception 'ممنوع تعدل صلاحيات المالك — عنده كل الصلاحيات تلقائياُ';
  end if;

  -- 8. Delegation ceiling: المانح لازم يكون عنده الصلاحية اللي هيمنحها
  --    (owner مستثنى — عنده كل حاجة)
  if not v_actor_is_owner then
    v_has_perm := has_perm(p_perm);
    if not v_has_perm then
      raise exception 'ممنوع تمنح صلاحية مش عندها — لازم تكون عندها الأول';
    end if;
  end if;

  -- 9. التحقق من max_amount — لو المانح عنده حد، ممنوع يمنح أكتر من حدّه
  if not v_actor_is_owner and p_max_amount is not null then
    declare
      v_actor_limit numeric := perm_limit(p_perm);
    begin
      -- لو المانح عنده حد ومحدش بأكتر، ممنوع
      if v_actor_limit <> -1 and v_actor_limit is not null and p_max_amount > v_actor_limit then
        raise exception 'المبلغ المحدد أكبر من حدك في هذي الصلاحية (% ج)', v_actor_limit;
      end if;
    end;
  end if;

  -- 10. Insert/Update grant — بأمان
  insert into grants (user_id, perm, until, max_amount, granted_by)
  values (p_target, p_perm, p_until, p_max_amount, v_actor)
  on conflict (user_id, perm)
  do update set
    until = excluded.until,
    max_amount = excluded.max_amount,
    granted_by = excluded.granted_by,
    created_at = now();
end $$;

-- تقييد الوصول للدالة — فقط authenticated users
revoke execute on function public.secure_grant(uuid, text, date, numeric) from public, anon;
grant execute on function public.secure_grant(uuid, text, date, numeric) to authenticated;

-- ============================================================
-- 1b) تحديث RLS policies على grants لمنع الالتفاف حول secure_grant
-- ============================================================
--
-- المشكلة: grants_write policy بتسمح بـ INSERT/UPDATE/DELETE مباشر
--           من غير التحقق من قواعد delegation.
--
-- الحل: استبدال grants_write بـ policies أكثر تحديداً:
--   - grants_insert: ممنوع INSERT مباشر (يتم عبر secure_grant فقط).
--   - grants_update: ممنوع UPDATE مباشر.
--   - grants_delete: يتم عبر revoke() اللي بتتحقق من users.manage.

-- إزالة policy grants_write القديمة
drop policy if exists grants_write on public.grants;

-- INSERT: ممنوع مباشر — يتم عبر secure_grant() فقط
-- (مفيش policy insert لأن secure_grant SECURITY DEFINER بتتخطى RLS)

-- UPDATE: ممنوع مباشر
-- (مفيش policy update لأن التعديل يتم عبر secure_grant() فقط)

-- DELETE: يتم عبر revoke — نسمح بـ DELETE للمستخدمين بـ users.manage
create policy grants_delete on public.grants for delete to authenticated
  using (has_perm('users.manage') or is_owner());

-- ============================================================
-- 2) BUG-004: فرض حد الخصم الأقصى في pos_sale
-- ============================================================
--
-- المشكلة:
--   pos_sale بتتحقق من has_perm('pos.discount') بس (السطر 103 في 0015).
--   مش بتتحقق من perm_limit('pos.discount') اللي بيقرأ max_amount.
--   cashier عنده pos.discount يقدر يطبق خصم غير محدود.
--
-- الحل:
--   إضافة تحقق من perm_limit('pos.discount') في pos_sale.
--   - لو مفيش صلاحية خصم (lim = -1) و p_discount > 0 → رفض.
--   - لو عنده حد (lim is not null) و p_discount > lim → رفض.
--   - لو مفيش حد (lim is null) → مسموح.
--   - owner عنده lim = null دائماً → مسموح.
--   - p_discount < 0 → رفض (خصم سالب = زيادة سعر).
--
-- IMPORTANT: ده تعديل minimal على pos_sale — كل السلوك الأصلي محفوظ.

create or replace function public.pos_sale(p_shift bigint, p_lines jsonb, p_discount numeric, p_cash numeric, p_card numeric)
returns table (sale_id bigint, sale_no bigint, total numeric, change numeric)
language plpgsql security invoker set search_path = public as $func$
declare
  sh shifts%rowtype;
  l jsonb;
  i int := 0;
  r record;
  sub numeric := 0;
  tot numeric;
  sid bigint;
  sno bigint;
  seen bigint[] := '{}';
  ch numeric;
  lim numeric;
begin
  if not has_perm('pos.sell') then raise exception 'محتاج صلاحية البيع'; end if;
  select * into sh from shifts where id = p_shift and cashier = auth.uid() and status = 'open';
  if not found then raise exception 'افتح وردية الأول'; end if;
  if jsonb_array_length(coalesce(p_lines, '[]')) = 0 then raise exception 'الفاتورة فاضية'; end if;

  -- BUG-004 FIX: التحقق من حد الخصم
  if coalesce(p_discount, 0) < 0 then
    raise exception 'الخصم ما يقدرش يكون سالب';
  end if;

  if coalesce(p_discount, 0) > 0 then
    lim := perm_limit('pos.discount');
    if lim = -1 then
      raise exception 'الخصم محتاج صلاحية';
    end if;
    if lim is not null and p_discount > lim then
      raise exception 'الخصم (% ج) أكبر من حدك (% ج)', p_discount, lim;
    end if;
  end if;

  insert into sales (location_id, shift_id, subtotal, discount, total) values (sh.location_id, sh.id, 0, 0, 0) returning id, no into sid, sno;
  for l in select * from jsonb_array_elements(p_lines) loop
    i := i + 1;
    if l ? 'box_sn' then
      if (l->>'box_sn')::bigint = any(seen) then raise exception 'العلبة #% متكررة في الفاتورة', l->>'box_sn'; end if;
      seen := seen || (l->>'box_sn')::bigint;
      -- DB-002: قفل سطر العلبة FOR UPDATE قبل التحقق.
      perform 1 from boxes where sn = (l->>'box_sn')::bigint for update;
      select * into r from pos_lookup(sh.location_id, l->>'box_sn');
      -- DB-002: نعلّم العلبة "اتباعت" بس لو لسه مخزون.
      update boxes set status = 'sold' where sn = r.box_sn and status = 'stock';
      insert into stock_moves (item_id, location_id, qty, kind, ref, box_sn)
        select b.item_id, sh.location_id, -b.weight, 'sale', 'S' || sno, b.sn from boxes b where b.sn = r.box_sn;
    else
      select it.id as item_id, pos_price(it.id, sh.location_id) as unit_price, null::bigint as box_sn, greatest((l->>'qty')::numeric, 0) as qty
        into r from items it where it.id = (l->>'item_id')::bigint;
      if r.unit_price is null then raise exception 'مفيش سعر لصنف في الفاتورة'; end if;
      if r.qty <= 0 then raise exception 'الكمية لازم أكبر من صفر'; end if;
      insert into stock_moves (item_id, location_id, qty, kind, ref) values (r.item_id, sh.location_id, -r.qty, 'sale', 'S' || sno);
    end if;
    insert into sale_lines (sale_id, line, item_id, box_sn, qty, unit_price, total)
      values (sid, i, r.item_id, r.box_sn, r.qty, r.unit_price, round(r.qty * r.unit_price, 2));
    sub := sub + round(r.qty * r.unit_price, 2);
  end loop;
  tot := greatest(sub - coalesce(p_discount, 0), 0);
  if coalesce(p_cash, 0) + coalesce(p_card, 0) < tot then raise exception 'المدفوع أقل من الإجمالي (% ج)', tot; end if;
  if coalesce(p_card, 0) > tot then raise exception 'الفيزا أكتر من الإجمالي'; end if;
  ch := coalesce(p_cash, 0) + coalesce(p_card, 0) - tot;
  update sales set subtotal = sub, discount = coalesce(p_discount, 0), total = tot, paid_cash = coalesce(p_cash, 0), paid_card = coalesce(p_card, 0), change = ch where id = sid;
  return query select sid, sno, tot, ch;
end $func$;

-- ============================================================
-- 3) BUG-001: تحسين hit_rate_limit لتسجيل الدخول
-- ============================================================
--
-- المشكلة:
--   rate-limit.ts بيستخدم in-memory Map — مش شغال على Vercel (multi-instance).
--   hit_rate_limit() موجودة في 0026 لكن مش مستخدمة في login-action.ts.
--
-- الحل:
--   تحديث hit_rate_limit() عشان:
--   1. تطبع المفتاح قبل الاستخدام (lowercase trim) عشان تمنع bypass عبر case variations.
--   2. ترجع boolean (true = مسموح، false = مرفوض) بدل رمي استثناء.
--      الاستثناء مش مناسب هنا لأننا محتاجين نتعامل مع الرفض بشكل هادئ.
--   3. نضيف دالة login_rate_check() مخصصة لتسجيل الدخول.
--
-- دالة جديدة: login_rate_check()
--   بتتحقق من حد تسجيل الدخول وتزيد العداد.
--   ترجع true = مسموح، false = مرفوض.
--   الحد: 10 محاولات فاشلة كل 15 دقيقة.
--   المفتاح بيتنظم (lowercase + trim) عشان يمنع bypass.

create or replace function public.login_rate_check(p_identifier text)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_key text;
  v_count int;
  v_max int := 10;
  v_window_ms bigint := 900000;  -- 15 دقيقة
begin
  -- تطبيع المفتاح: lowercase + trim عشان تمنع bypass عبر case variations
  v_key := 'login:' || lower(trim(coalesce(p_identifier, '')));

  -- زيادة العداد والتحقق من الحد
  insert into public.rate_limits as rl (key, count, reset_at)
  values (v_key, 1, now() + (v_window_ms::text || ' milliseconds')::interval)
  on conflict (key) do update
    set count = case when rl.reset_at <= now() then 1 else rl.count + 1 end,
        reset_at = case when rl.reset_at <= now()
                        then now() + (v_window_ms::text || ' milliseconds')::interval
                        else rl.reset_at end
  returning rl.count into v_count;

  -- لو فوق الحد، ارجع false
  if v_count > v_max then
    return false;
  end if;

  return true;
end $$;

-- دالة لمسح العداد بعد تسجيل دخول ناجح
create or replace function public.login_rate_clear(p_identifier text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_key text;
begin
  v_key := 'login:' || lower(trim(coalesce(p_identifier, '')));
  delete from public.rate_limits where key = v_key;
end $$;

-- تقييد الوصول — فقط authenticated يمكنهم استدعاء الدوال
-- لكن بما إن تسجيل الدخول بيتم من anon، هنسمح بـ anon للدوال دي بس
-- ونمنع التعديل المباشر على rate_limits
revoke execute on function public.login_rate_check(text) from public, anon, authenticated;
-- نسمح بـ anon عشان تسجيل الدخول بيتم قبل auth
grant execute on function public.login_rate_check(text) to anon, authenticated;

revoke execute on function public.login_rate_clear(text) from public, anon;
grant execute on function public.login_rate_clear(text) to authenticated;

-- ============================================================
-- 4) CHECK constraint على grants.max_amount >= 0
-- ============================================================
-- DB-004: منع max_amount سالب

do $$
begin
  if not exists (
    select 1 from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public' and t.relname = 'grants' and c.conname = 'grants_max_amount_nonneg'
  ) then
    alter table public.grants add constraint grants_max_amount_nonneg check (max_amount is null or max_amount >= 0);
  end if;
end $$;
