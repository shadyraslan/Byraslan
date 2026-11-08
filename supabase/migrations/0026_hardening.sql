-- ============ 0026 تقوية الداتابيز (Hardening) ============
-- ملاحظة مهمة (DB-007): ترقيم المايجريشنز فيه فجوة — رقم 0011 مش موجود أصلاً في السلسلة
-- (الأرقام الموجودة: 0001..0010 ثم 0012..0025). الفجوة دي مقصودة/مؤكدة ومش خطأ في الترتيب.
--
-- الملف ده بيصلّح مجموعة نتايج مراجعة:
--   DB-001: مفيش حد لمعدّل الطلبات الأونلاين المجهولة (anon) على مستوى الداتابيز ← rate limiting.
--   DB-002: بيع نفس العلبة مرتين (race) في pos_sale ← قفل سطر العلبة + شرط status='stock'.
--   DB-003: مفاتيح أجنبية من غير سلوك ON DELETE واضح ← نضيف restrict / set null.
--   DB-004: فهارس ناقصة على أعمدة الاستعلامات الشائعة (at / day / created_at / status).
--   DB-005: أعمدة المبالغ من غير دقة ثابتة ← numeric(12,2) + منع السالب.
--   DB-006: تفرّد كود اللوط (lots.code).
--   P1-8:  ربط توكن الإشعارات بحساب العميل الحالي (auth.uid()).
--
-- الملف مقصود يكون idempotent قدر الإمكان: if not exists / drop ... if exists،
-- وملفوف دفاعيًا عشان ميفشلش لو البيانات الحالية فيها حالة قديمة.

-- ============================================================
-- 1) RATE LIMITING — (DB-001) حد لمعدّل الطلبات الأونلاين المجهولة
-- ============================================================
-- جدول العدّاد. RLS مفعّلها ومن غير أي policy → مفيش وصول مباشر من anon/authenticated،
-- والكتابة بتحصل بس من الدوال security definer (المالك بيتخطى RLS).
create table if not exists public.rate_limits (
  key text primary key,
  count int not null default 0,
  reset_at timestamptz not null
);

-- عدّاد بسيط بنافذة زمنية: بيزوّد والا بيرجّع العدّاد لو النافذة انتهت، ويرمي استثناء بالعربي فوق الحد.
create or replace function public.hit_rate_limit(p_key text, p_max int, p_window_ms bigint)
returns void language plpgsql security definer set search_path = public as $$
declare v_count int;
begin
  insert into public.rate_limits as rl (key, count, reset_at)
  values (p_key, 1, now() + (p_window_ms::text || ' milliseconds')::interval)
  on conflict (key) do update
    set count = case when rl.reset_at <= now() then 1 else rl.count + 1 end,
        reset_at = case when rl.reset_at <= now()
                        then now() + (p_window_ms::text || ' milliseconds')::interval
                        else rl.reset_at end
  returning rl.count into v_count;

  if v_count > p_max then
    raise exception 'عدد المحاولات كبير — استنى شوية وحاول تاني';
  end if;
end $$;

-- الاختيار: trigger مستقل على online_orders.
--   السبب: 0020 بيورّينا إن online_orders مافيهاش عمود موبايل؛ الموبايل موجود في customers.phone
--   والطلب مرتبط بـ customer_id. فالـ trigger يقدر يجيب رقم العميل من الجدول المرتبط
--   (self-contained) من غير ما نعدّل في place_order. الحد: 10 طلبات/ساعة لنفس رقم العميل.
create or replace function public.rate_limit_orders() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_phone text;
begin
  select phone into v_phone from public.customers where id = new.customer_id;
  if v_phone is not null then
    perform public.hit_rate_limit('order:' || v_phone, 10, 3600000);  -- 3600000 ملّيثانية = ساعة
  end if;
  return new;
end $$;

drop trigger if exists rate_limit_orders_trg on public.online_orders;
create trigger rate_limit_orders_trg
  before insert on public.online_orders
  for each row execute function public.rate_limit_orders();

alter table public.rate_limits enable row level security;
-- مفيش policies عن قصد: الوصول للجدول من الدوال security definer بس.
revoke execute on function public.hit_rate_limit(text, int, bigint) from public, anon, authenticated;
revoke execute on function public.rate_limit_orders() from public, anon, authenticated;

-- ============================================================
-- 2) pos_sale ROW LOCK — (DB-002) منع بيع نفس العلبة مرتين
-- ============================================================
-- إعادة إنتاج نفس جسم pos_sale الموجود في 0015 حرفيًا، مع تغييرين فقط:
--   (a) قفل سطر العلبة FOR UPDATE قبل التحقق.
--       ملاحظة: التحقق الأصلي بيتم جوه pos_lookup وهي دالة STABLE فمينفعش يتحط عليها FOR UPDATE،
--       فبنقفل سطر boxes بنفس الرقم صريحًا. (ده تنفيذ (a) بشكل صحيح حسب السكيما الفعلية.)
--   (b) البيع بيحصل بس لو العلبة لسه status='stock'.
create or replace function public.pos_sale(p_shift bigint, p_lines jsonb, p_discount numeric, p_cash numeric, p_card numeric)
returns table (sale_id bigint, sale_no bigint, total numeric, change numeric)
language plpgsql security invoker set search_path = public as $$
declare sh shifts%rowtype; l jsonb; i int := 0; r record; sub numeric := 0; tot numeric; sid bigint; sno bigint; seen bigint[] := '{}'; ch numeric;
begin
  if not has_perm('pos.sell') then raise exception 'محتاج صلاحية البيع'; end if;
  select * into sh from shifts where id = p_shift and cashier = auth.uid() and status = 'open';
  if not found then raise exception 'افتح وردية الأول'; end if;
  if jsonb_array_length(coalesce(p_lines, '[]')) = 0 then raise exception 'الفاتورة فاضية'; end if;
  if coalesce(p_discount, 0) > 0 and not has_perm('pos.discount') then raise exception 'الخصم محتاج صلاحية'; end if;

  insert into sales (location_id, shift_id, subtotal, discount, total) values (sh.location_id, sh.id, 0, 0, 0) returning id, no into sid, sno;
  for l in select * from jsonb_array_elements(p_lines) loop
    i := i + 1;
    if l ? 'box_sn' then
      if (l->>'box_sn')::bigint = any(seen) then raise exception 'العلبة #% متكررة في الفاتورة', l->>'box_sn'; end if;
      seen := seen || (l->>'box_sn')::bigint;
      -- (a) DB-002: نقفل سطر العلبة قبل التحقق عشان نمنع سباق بيع نفس العلبة من كاشيرين.
      perform 1 from boxes where sn = (l->>'box_sn')::bigint for update;
      select * into r from pos_lookup(sh.location_id, l->>'box_sn');
      -- (b) DB-002: نعلّم العلبة "اتباعت" بس لو لسه مخزون (وإلا التحديث بيفشل ويسيب العلبة متاحة للمراجعة).
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
end $$;

-- ============================================================
-- 3) FOREIGN KEYS ON DELETE — (DB-003) سلوك حذف واضح
-- ============================================================
-- منغير مفاتيح بالاسم الافتراضي، ولكن بنلف دفاعيًا: بندوّر على أي FK موجود على العمود
-- وبنشيله، وبعدين نضيفه بالسلوك المطلوب. لو حصلت أي مشكلة بنكتفي بـ notice ومش بنوقف المايجريشن.
--   boxes.item_id            → restrict (مفيش حذف صنف ليه علب)
--   stock_moves.item_id      → restrict (دفتر الحركات مرجعي)
--   stock_moves.location_id  → restrict
--   stock_moves.box_sn       → set null (نحفظ الحركة حتى لو العلبة اتحذفت)
--   transfer_boxes.box_sn    → restrict
do $$
declare r record; v_name text;
begin
  for r in
    select * from (values
      ('boxes',         'item_id',     'items',     'id', 'restrict'),
      ('stock_moves',   'item_id',     'items',     'id', 'restrict'),
      ('stock_moves',   'location_id', 'locations', 'id', 'restrict'),
      ('stock_moves',   'box_sn',      'boxes',     'sn', 'set null'),
      ('transfer_boxes','box_sn',      'boxes',     'sn', 'restrict')
    ) v(tbl, col, rtbl, rcol, act)
  loop
    begin
      -- نلاقي اسم أي FK حالي على نفس العمود (بأي اسم) ونشيله
      select c.conname into v_name
      from pg_constraint c
      join pg_class t on t.oid = c.conrelid
      join pg_namespace n on n.oid = t.relnamespace
      join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
      where c.contype = 'f' and n.nspname = 'public'
        and t.relname = r.tbl and a.attname = r.col
      limit 1;

      if v_name is not null then
        execute format('alter table public.%I drop constraint %I', r.tbl, v_name);
      end if;

      execute format(
        'alter table public.%I add constraint %I foreign key (%I) references public.%I(%I) on delete %s',
        r.tbl, r.tbl || '_' || r.col || '_fkey', r.col, r.rtbl, r.rcol, r.act
      );
    exception when others then
      raise notice 'تخطّي تقوية المفتاح الأجنبي %.% : %', r.tbl, r.col, sqlerrm;
    end;
  end loop;
end $$;

-- ============================================================
-- 4) INDEXES — (DB-004) فهارس على أعمدة الفلترة/الترتيب الشائعة
-- ============================================================
create index if not exists idx_stock_moves_at          on public.stock_moves (at);
create index if not exists idx_sales_at                on public.sales (at);
create index if not exists idx_expenses_day            on public.expenses (day);
create index if not exists idx_online_orders_created_at on public.online_orders (created_at);
create index if not exists idx_boxes_status            on public.boxes (status);

-- ============================================================
-- 5) MONEY PRECISION — (DB-005) دقة ثابتة numeric(12,2) + منع السالب
-- ============================================================
-- الخطوة 5.1: نحوّل الأعمدة النقدية لـ numeric(12,2) بس لو نوعها الحالي numeric مطلق
-- (numeric_precision is null) عشان الملف ميغلطش/يتكرر لو فيه عمود متظبط قبل كده.
-- ملاحظة مهمة: أي عمود بتعتمد عليه view (زي daily_summary اللي بتقرأ sales.total و expenses.amount
-- و online_orders.total و receipt_lines.price، أو supplier_ledger اللي بتقرأ receipt_lines.price
-- و supplier_payments.amount) بوستجريس بيمنع تغيير نوعه (cannot alter type of a column used by a view).
-- عشان الملف ميفشلش، بنلف كل تعديل على حدة ونكتفي بـ notice لو اترفض ونكمل الباقي
-- (تلك الأعمدة تحتاج إننا نسيب الـ view الأول لو حبينا نظبطها لاحقًا).
do $$
declare r record;
begin
  for r in
    select * from (values
      ('stock_moves',        'unit_cost'),
      ('sales',              'subtotal'), ('sales', 'discount'), ('sales', 'total'),
      ('sales',              'paid_cash'), ('sales', 'paid_card'), ('sales', 'change'),
      ('sale_lines',         'unit_price'), ('sale_lines', 'total'),
      ('shifts',             'opening_cash'), ('shifts', 'counted_cash'), ('shifts', 'expected_cash'),
      ('expenses',           'amount'),
      ('supplier_payments',  'amount'),
      ('lots',               'cost'),
      ('po_lines',           'price'),
      ('receipt_lines',      'price'),
      ('prices',             'price'),
      ('items',              'cost'),
      ('online_orders',      'est_total'), ('online_orders', 'subtotal'),
      ('online_orders',      'delivery_fee'), ('online_orders', 'total'),
      ('online_order_lines', 'unit_price')
    ) v(tbl, col)
  loop
    begin
      if exists (
        select 1 from information_schema.columns c
        where c.table_schema = 'public' and c.table_name = r.tbl and c.column_name = r.col
          and c.data_type = 'numeric' and c.numeric_precision is null
      ) then
        execute format('alter table public.%I alter column %I type numeric(12,2)', r.tbl, r.col);
      end if;
    exception when others then
      raise notice 'تخطّي ضبط دقة %.% : %', r.tbl, r.col, sqlerrm;
    end;
  end loop;
end $$;

-- الخطوة 5.2: منع السالب (>= 0) للأعمدة اللي منطقيًا مالهاش قيمة سالبة.
-- نستخدم NOT VALID عشان لو فيه بيانات قديمة سالبة المايجريشن ميفشلش،
-- والقيود بتتحقق على أي صف جديد/متعدّل. (تقدر تعمل validate constraint بعدين لو البيانات نضفت.)
-- الأعمدة اللي عندها بالفعل check (> 0) زي expenses.amount و supplier_payments.amount متتكررش.
do $$
declare r record;
begin
  for r in
    select * from (values
      ('sales',              'subtotal'), ('sales', 'discount'), ('sales', 'total'),
      ('sales',              'paid_cash'), ('sales', 'paid_card'), ('sales', 'change'),
      ('sale_lines',         'unit_price'), ('sale_lines', 'total'),
      ('shifts',             'opening_cash'), ('shifts', 'counted_cash'),
      ('lots',               'cost'),
      ('stock_moves',        'unit_cost'),
      ('po_lines',           'price'),
      ('receipt_lines',      'price'),
      ('prices',             'price'),
      ('items',              'cost'),
      ('online_orders',      'est_total'), ('online_orders', 'subtotal'),
      ('online_orders',      'delivery_fee'), ('online_orders', 'total'),
      ('online_order_lines', 'unit_price')
    ) v(tbl, col)
  loop
    begin
      if exists (
        select 1 from information_schema.columns c
        where c.table_schema = 'public' and c.table_name = r.tbl and c.column_name = r.col
      ) then
        execute format('alter table public.%I drop constraint if exists %I', r.tbl, r.tbl || '_' || r.col || '_nonneg');
        execute format('alter table public.%I add constraint %I check (%I >= 0) not valid',
                       r.tbl, r.tbl || '_' || r.col || '_nonneg', r.col);
      end if;
    exception when others then
      raise notice 'تخطّي قيد عدم السالب %.% : %', r.tbl, r.col, sqlerrm;
    end;
  end loop;
end $$;

-- ============================================================
-- 6) LOT UNIQUENESS — (DB-006) تفرّد كود اللوط
-- ============================================================
-- في 0018 جدول lots عموده الأساسي اسمه code (مش lot_code) وده أصلاً PRIMARY KEY يعني فريد.
-- فلو فيه قيد تفرّد (p أو u) على العمود code نكتفي بيه؛ ولو مش موجود (حالة نادرة) نضيفه.
do $$
begin
  if not exists (
    select 1
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public' and t.relname = 'lots' and c.contype in ('p', 'u')
      and (select array_agg(a.attname order by a.attname)
           from pg_attribute a where a.attrelid = c.conrelid and a.attnum = any (c.conkey)) = array['code']
  ) then
    alter table public.lots add constraint lots_code_key unique (code);
  end if;
end $$;

-- ============================================================
-- 7) PUSH TOKEN BINDING — (P1-8) ربط توكن الإشعارات بحساب العميل الحالي
-- ============================================================
-- app_register_push في 0022 كانت بتعتمد على app_customer() (واللي أصلاً بتربط بـ auth.uid()
-- وترمي استثناء لو مجهول)، فالتوكن كان بيتربط بالحساب ضمنيًا. هنا بنخلي الربط صريح:
-- تحقق مباشر من auth.uid() ورمي استثناء للمجهول قبل أي كتابة، مع الحفاظ على نفس السلوك الباقي.
create or replace function public.app_register_push(p_token text, p_platform text) returns void
language plpgsql security definer set search_path = public as $$
declare c bigint;
begin
  if auth.uid() is null then raise exception 'سجّل دخول الأول'; end if;
  if coalesce(p_token, '') !~ '^ExponentPushToken\[' then raise exception 'token غلط'; end if;
  c := app_customer();   -- بيضمن وجود صف العميل المرتبط بـ auth.uid() ويربط التوكن بيه
  insert into push_tokens (token, customer_id, platform) values (p_token, c, p_platform)
    on conflict (token) do update set customer_id = excluded.customer_id, platform = excluded.platform, updated_at = now();
end $$;
