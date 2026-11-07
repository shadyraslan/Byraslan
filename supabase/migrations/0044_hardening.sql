-- ============ 0044 تقوية بعد مراجعة الأمان (مأخوذ منها اللي يناسب النسخة الحالية) ============
-- ملاحظة: المفاتيح الأجنبية على boxes/stock_moves/transfer_boxes أصلًا "no action" يعني بتمنع المسح — مفيش تغيير.

-- 1) الكاشير (حتى من غير نت): العلبة تتقفل وقت البيع، والمخزون يتخصم بس لو كانت لسه "مخزون" — غير كده تتعلّم مخالفة من غير خصم تاني
do $do$ declare src text; begin
  src := pg_get_functiondef('public.pos_sync'::regproc);
  src := replace(src, 'select * into b from boxes where sn = (l->>''box_sn'')::bigint;', 'select * into b from boxes where sn = (l->>''box_sn'')::bigint for update;');
  src := replace(src, 'update boxes set status = ''sold'' where sn = b.sn and status = ''stock'';
          insert into stock_moves (item_id, location_id, qty, kind, ref, box_sn) values (b.item_id, p_loc, -b.weight, ''sale'', ''S'' || v_no, b.sn);',
    'update boxes set status = ''sold'' where sn = b.sn and status = ''stock'';
          if found then insert into stock_moves (item_id, location_id, qty, kind, ref, box_sn) values (b.item_id, b.location_id, -b.weight, ''sale'', ''S'' || v_no, b.sn); end if;');
  if src !~ 'for update;' or src !~ 'if found then insert into stock_moves' then raise exception 'pos_sync patch failed'; end if;
  execute src;
end $do$;

-- 2) حد عدد الطلبات من نفس الرقم في الساعة (الرقم من الداشبورد: limits.orders_per_hour، صفر = مقفول). طلبات الموظفين مش بتتحسب.
insert into settings (key, value) values ('limits.orders_per_hour', '10'), ('auth.pin_min', '6') on conflict (key) do nothing;

create table if not exists public.rate_limits (key text primary key, count int not null default 0, reset_at timestamptz not null);
alter table public.rate_limits enable row level security;
create policy staff_only on public.rate_limits as restrictive for all to authenticated using (is_staff()) with check (is_staff());

create or replace function public.hit_rate_limit(p_key text, p_max int, p_window interval) returns void
language plpgsql security definer set search_path = public as $$
declare v int;
begin
  insert into rate_limits as r (key, count, reset_at) values (p_key, 1, now() + p_window)
    on conflict (key) do update set
      count = case when r.reset_at <= now() then 1 else r.count + 1 end,
      reset_at = case when r.reset_at <= now() then now() + p_window else r.reset_at end
    returning r.count into v;
  if v > p_max then raise exception 'طلبات كتير من نفس الرقم — استنى شوية وجرّب تاني، أو كلّمنا'; end if;
end $$;

create or replace function public.rate_limit_orders() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_phone text; v_max int := coalesce((select value::text::int from settings where key = 'limits.orders_per_hour'), 10);
begin
  if v_max <= 0 or is_staff() then return new; end if;
  select regexp_replace(phone, '\D', '', 'g') into v_phone from customers where id = new.customer_id;
  if v_phone is not null then perform hit_rate_limit('order:' || v_phone, v_max, interval '1 hour'); end if;
  return new;
end $$;
create trigger rate_limit_orders_trg before insert on public.online_orders for each row execute function public.rate_limit_orders();
revoke execute on function public.hit_rate_limit(text, int, interval), public.rate_limit_orders() from public, anon, authenticated;

-- 3) فهارس للتقارير
create index if not exists idx_stock_moves_at on public.stock_moves (at);
create index if not exists idx_sales_at on public.sales (at);
create index if not exists idx_expenses_day on public.expenses (day);
create index if not exists idx_online_orders_created on public.online_orders (created_at);
create index if not exists idx_online_orders_status on public.online_orders (status);
create index if not exists idx_online_orders_sched on public.online_orders (scheduled_for) where is_booking;
create index if not exists idx_boxes_status on public.boxes (status);
create index if not exists idx_attendance_user_at on public.attendance (user_id, at);
create index if not exists idx_support_tickets_status on public.support_tickets (status, last_msg_at);
create index if not exists idx_support_messages_ticket on public.support_messages (ticket_id, id);

-- 4) منع المبالغ السالبة (على الجديد بس: not valid)
do $$ declare r record; begin
  for r in select * from (values
    ('sales','subtotal'),('sales','discount'),('sales','total'),('sales','paid_cash'),('sales','paid_card'),('sales','change'),
    ('sale_lines','unit_price'),('shifts','opening_cash'),('shifts','counted_cash'),('lots','cost'),('po_lines','price'),
    ('receipt_lines','price'),('prices','price'),('items','cost'),('online_orders','est_total'),('online_orders','subtotal'),
    ('online_orders','delivery_fee'),('online_orders','total'),('online_orders','deposit'),('online_order_lines','unit_price'),
    ('employee_pay','base'),('advance_installments','amount')) v(t, c)
  loop
    begin
      if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = r.t and column_name = r.c)
         and not exists (select 1 from pg_constraint where conname = r.t || '_' || r.c || '_nonneg') then
        execute format('alter table public.%I add constraint %I check (%I >= 0) not valid', r.t, r.t || '_' || r.c || '_nonneg', r.c);
      end if;
    exception when others then raise notice 'skip %.%: %', r.t, r.c, sqlerrm;
    end;
  end loop;
end $$;

-- 5) توكن إشعارات العميل لازم يكون داخل
create or replace function public.app_register_push(p_token text, p_platform text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'سجّل دخول الأول'; end if;
  if coalesce(p_token, '') !~ '^ExponentPushToken\[' then raise exception 'token غلط'; end if;
  insert into push_tokens (token, customer_id, platform) values (p_token, app_customer(), p_platform)
    on conflict (token) do update set customer_id = excluded.customer_id, platform = excluded.platform, updated_at = now();
end $$;

-- 6) دوال داخلية مالهاش لازمة للزائر من غير دخول
revoke execute on function public.box_reserved(bigint), public.branch_up(text), public.decide_leave(bigint, boolean, text),
  public.district_branch(bigint), public.item_pct(bigint), public.perm_limit(text), public.pos_ping(text), public.staff_welcome(),
  public.notify_send(text, text, bigint, text, text, uuid, text, text, boolean) from public, anon;
revoke execute on function public.notify_order_status(), public.staff_message_push() from public, anon, authenticated;

-- 7) search_path ثابت
alter function public.dist_m set search_path = public;
alter function public.month_name set search_path = public;
alter function public.calc_tax_annual set search_path = public;
