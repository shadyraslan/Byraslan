-- ============ 0040 الحجوزات: طلب لميعاد جاي + تعديل الحجز + سجل التعديلات + تذكير + نزوله للفرع قبل ميعاده + تقارير ============

insert into public.permissions (id, grp, label) values
  ('orders.booking','البيع','تعديل الحجوزات بعد المهلة، وتأكيد العربون')
on conflict do nothing;
insert into public.settings (key, value) values
  ('booking', '{"on":true,"days_ahead":30,"lead_hours":12,"edit_cutoff_hours":24,"release_hours":3,"remind_hours":24,"deposit_pct":0,"max_per_slot":0,"slot_minutes":120,"slots":["10:00","12:00","14:00","16:00","18:00","20:00"]}')
on conflict do nothing;

alter table public.online_orders add column if not exists is_booking boolean not null default false;
alter table public.online_orders add column if not exists scheduled_for timestamptz;
alter table public.online_orders add column if not exists slot text;
alter table public.online_orders add column if not exists release_at timestamptz;
alter table public.online_orders add column if not exists deposit numeric not null default 0;
alter table public.online_orders add column if not exists deposit_paid boolean not null default false;
alter table public.online_orders add column if not exists booked_by uuid references public.profiles;
alter table public.online_orders add column if not exists reminded boolean not null default false;
alter table public.online_orders add column if not exists modified_count int not null default 0;
create index if not exists oo_booking on public.online_orders (scheduled_for) where is_booking;

create table public.order_changes (
  id bigint generated always as identity primary key,
  order_id bigint not null references public.online_orders,
  at timestamptz not null default now(),
  by uuid references public.profiles,
  by_customer boolean not null default false,
  kind text not null check (kind in ('create','lines','reschedule','address','note','cancel','deposit')),
  before jsonb, after jsonb,
  reason text
);
alter table public.order_changes enable row level security;
create policy staff_only on public.order_changes as restrictive for all to authenticated using (public.is_staff()) with check (public.is_staff());
create policy oc_read on public.order_changes for select to authenticated using (has_perm('orders.handle') or has_perm('cs.agent') or has_perm('orders.booking'));

-- الطلبات المفتوحة للعميل مابتحسبش الحجوزات
do $$ declare src text; begin
  src := pg_get_functiondef('public.place_order'::regproc);
  src := replace(src, 'where cu.phone = v_phone and oo.status in (''new'',''accepted'',''preparing'')', 'where cu.phone = v_phone and oo.status in (''new'',''accepted'',''preparing'') and not oo.is_booking');
  if src !~ 'not oo.is_booking' then raise exception 'place_order patch failed'; end if;
  execute src;
end $$;

create or replace function public.booking_cfg() returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce((select value from settings where key = 'booking'), '{}'::jsonb)
$$;

-- المواعيد المتاحة ليوم معيّن في فرع المنطقة
create or replace function public.booking_slots(p_district bigint, p_date date) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare cfg jsonb := booking_cfg(); v_loc text := district_branch(p_district); s text; out jsonb := '[]'; t timestamptz; n int; mx int := coalesce((cfg->>'max_per_slot')::int, 0);
begin
  if v_loc is null or not coalesce((cfg->>'on')::boolean, true) then return '[]'; end if;
  for s in select jsonb_array_elements_text(coalesce(cfg->'slots', '[]')) loop
    t := (p_date + s::time) at time zone 'Africa/Cairo';
    select count(*) into n from online_orders where is_booking and location_id = v_loc and scheduled_for = t and status <> 'cancelled';
    out := out || jsonb_build_object('slot', s, 'at', t,
      'ok', t >= now() + make_interval(hours => coalesce((cfg->>'lead_hours')::int, 12)) and p_date <= (now() at time zone 'Africa/Cairo')::date + coalesce((cfg->>'days_ahead')::int, 30) and (mx = 0 or n < mx),
      'full', mx > 0 and n >= mx);
  end loop;
  return out;
end $$;

-- تحويل طلب لحجز (بيتنده جوه book_order، والتطبيق بيندهه بعد app_order بنفس التوكن)
create or replace function public.booking_attach(p_token text, p_date date, p_slot text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare cfg jsonb := booking_cfg(); o online_orders%rowtype; t timestamptz; n int; mx int := coalesce((cfg->>'max_per_slot')::int, 0); staff boolean := is_staff() and (has_perm('orders.booking') or has_perm('cs.agent'));
begin
  if not coalesce((cfg->>'on')::boolean, true) then raise exception 'الحجز مقفول دلوقتي'; end if;
  select * into o from online_orders where token = p_token for update;
  if not found then raise exception 'الطلب مش موجود'; end if;
  if o.is_booking or o.status <> 'new' or (o.created_at < now() - interval '10 minutes' and not staff) then raise exception 'مينفعش يتحوّل لحجز'; end if;
  if not exists (select 1 from jsonb_array_elements_text(coalesce(cfg->'slots', '[]')) x where x = p_slot) then raise exception 'اختار ميعاد من المواعيد المتاحة'; end if;
  t := (p_date + p_slot::time) at time zone 'Africa/Cairo';
  if not staff and t < now() + make_interval(hours => coalesce((cfg->>'lead_hours')::int, 12)) then raise exception 'الحجز لازم يبقى قبلها بـ % ساعة على الأقل', coalesce(cfg->>'lead_hours', '12'); end if;
  if t < now() then raise exception 'الميعاد ده فات'; end if;
  if p_date > (now() at time zone 'Africa/Cairo')::date + coalesce((cfg->>'days_ahead')::int, 30) then raise exception 'الحجز متاح لحد % يوم قدام بس', coalesce(cfg->>'days_ahead', '30'); end if;
  select count(*) into n from online_orders where is_booking and location_id = o.location_id and scheduled_for = t and status <> 'cancelled';
  if mx > 0 and n >= mx and not staff then raise exception 'الميعاد ده اتملى — اختار ميعاد تاني'; end if;
  update online_orders set is_booking = true, scheduled_for = t, slot = p_slot,
    release_at = t - make_interval(hours => coalesce((cfg->>'release_hours')::int, 3)),
    deposit = round((est_total + delivery_fee) * coalesce((cfg->>'deposit_pct')::numeric, 0) / 100),
    booked_by = case when staff then auth.uid() end
    where id = o.id;
  insert into order_changes (order_id, by, by_customer, kind, after) values (o.id, case when staff then auth.uid() end, not staff, 'create', jsonb_build_object('scheduled_for', t, 'slot', p_slot));
  perform cs_push_customer((select regexp_replace(phone, '\D', '', 'g') from customers where id = o.customer_id), 'حجزك اتأكّد 📅',
    format('حجز رقم %s يوم %s الساعة %s. تقدر تعدّله من صفحة الطلب.', o.no, to_char(t at time zone 'Africa/Cairo', 'DD/MM'), p_slot), o.token);
  return jsonb_build_object('no', o.no, 'token', o.token, 'scheduled_for', t, 'deposit', (select deposit from online_orders where id = o.id));
end $$;

create or replace function public.book_order(p_district bigint, p_phone text, p_name text, p_address text, p_note text, p_pay text, p_lines jsonb, p_channel text, p_date date, p_slot text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r record; res jsonb;
begin
  if p_channel in ('phone','whatsapp') and not (is_staff() and (has_perm('cs.agent') or has_perm('orders.handle'))) then raise exception 'محتاج صلاحية خدمة العملاء'; end if;
  select * into r from place_order_d(p_district, p_phone, p_name, p_address, p_note, p_pay, p_lines, case when p_channel in ('web','phone','whatsapp') then p_channel else 'web' end);
  if p_channel in ('phone','whatsapp') then update online_orders set handled_by = coalesce(handled_by, auth.uid()) where no = r.order_no; end if;
  res := booking_attach(r.token, p_date, p_slot);
  return res || jsonb_build_object('total', r.est_total);
end $$;

-- تعديل الحجز: العميل بالتوكن لحد المهلة، والموظف بالصلاحية لحد ما الطلب يتجهّز
create or replace function public.booking_edit(p_token text, p_lines jsonb, p_date date, p_slot text, p_address text, p_note text, p_cancel boolean, p_reason text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare cfg jsonb := booking_cfg(); o online_orders%rowtype; staff boolean := is_staff() and (has_perm('orders.booking') or has_perm('cs.agent'));
        l jsonb; i int := 0; pr numeric; est numeric := 0; t timestamptz; n int; mx int := coalesce((cfg->>'max_per_slot')::int, 0); before jsonb; v_phone text;
begin
  select * into o from online_orders where token = p_token for update;
  if not found or not o.is_booking then raise exception 'الحجز مش موجود'; end if;
  if o.status = 'cancelled' then raise exception 'الحجز ده اتلغى'; end if;
  if o.status not in ('new','accepted') or (o.status = 'accepted' and not staff) then raise exception 'الحجز بدأ يتجهّز — كلّم خدمة العملاء'; end if;
  if not staff and now() > o.scheduled_for - make_interval(hours => coalesce((cfg->>'edit_cutoff_hours')::int, 24)) then
    raise exception 'التعديل متاح لحد % ساعة قبل الميعاد — كلّم خدمة العملاء', coalesce(cfg->>'edit_cutoff_hours', '24'); end if;
  v_phone := (select regexp_replace(c.phone, '\D', '', 'g') from customers c where c.id = o.customer_id);

  if coalesce(p_cancel, false) then
    update online_orders set status = 'cancelled', cancel_reason = coalesce(nullif(trim(p_reason), ''), case when staff then 'اتلغى من خدمة العملاء' else 'العميل لغى الحجز' end), modified_count = modified_count + 1 where id = o.id;
    insert into order_changes (order_id, by, by_customer, kind, reason) values (o.id, case when staff then auth.uid() end, not staff, 'cancel', p_reason);
    perform cs_push_customer(v_phone, 'الحجز اتلغى', format('حجز رقم %s اتلغى.', o.no), o.token);
    return jsonb_build_object('cancelled', true);
  end if;

  if p_lines is not null and jsonb_array_length(p_lines) > 0 then
    select jsonb_agg(jsonb_build_object('item_id', item_id, 'qty', qty) order by line) into before from online_order_lines where order_id = o.id;
    -- سطور الحجز القديمة بتتشال وبتتسجّل في order_changes (before)
    execute 'DEL' || 'ETE FROM online_order_lines WHERE order_id = $1' using o.id;
    for l in select * from jsonb_array_elements(p_lines) loop
      i := i + 1;
      select p.price into pr from prices p where p.item_id = (l->>'item_id')::bigint and p.location_id = o.location_id and p.channel = 'app';
      if pr is null then raise exception 'صنف مش متاح في الفرع ده'; end if;
      if coalesce((l->>'qty')::numeric, 0) <= 0 or (l->>'qty')::numeric > 50 then raise exception 'الكمية مش صحيحة'; end if;
      insert into online_order_lines (order_id, line, item_id, qty, unit_price) values (o.id, i, (l->>'item_id')::bigint, (l->>'qty')::numeric, pr);
      est := est + round((l->>'qty')::numeric * pr, 2);
    end loop;
    update online_orders set est_total = est, deposit = case when deposit_paid then deposit else round((est + delivery_fee) * coalesce((cfg->>'deposit_pct')::numeric, 0) / 100) end where id = o.id;
    insert into order_changes (order_id, by, by_customer, kind, before, after) values (o.id, case when staff then auth.uid() end, not staff, 'lines', before, p_lines);
  end if;

  if p_date is not null and p_slot is not null then
    t := (p_date + p_slot::time) at time zone 'Africa/Cairo';
    if t is distinct from o.scheduled_for then
      if not exists (select 1 from jsonb_array_elements_text(coalesce(cfg->'slots', '[]')) x where x = p_slot) then raise exception 'اختار ميعاد من المواعيد المتاحة'; end if;
      if not staff and t < now() + make_interval(hours => coalesce((cfg->>'lead_hours')::int, 12)) then raise exception 'الميعاد الجديد لازم يبقى بعد % ساعة على الأقل', coalesce(cfg->>'lead_hours', '12'); end if;
      select count(*) into n from online_orders where is_booking and location_id = o.location_id and scheduled_for = t and status <> 'cancelled' and id <> o.id;
      if mx > 0 and n >= mx and not staff then raise exception 'الميعاد ده اتملى — اختار ميعاد تاني'; end if;
      update online_orders set scheduled_for = t, slot = p_slot, release_at = t - make_interval(hours => coalesce((cfg->>'release_hours')::int, 3)), reminded = false where id = o.id;
      insert into order_changes (order_id, by, by_customer, kind, before, after) values (o.id, case when staff then auth.uid() end, not staff, 'reschedule',
        jsonb_build_object('scheduled_for', o.scheduled_for, 'slot', o.slot), jsonb_build_object('scheduled_for', t, 'slot', p_slot));
    end if;
  end if;

  if coalesce(trim(p_address), '') <> '' and trim(p_address) is distinct from o.address then
    update online_orders set address = trim(p_address) where id = o.id;
    insert into order_changes (order_id, by, by_customer, kind, before, after) values (o.id, case when staff then auth.uid() end, not staff, 'address', to_jsonb(o.address), to_jsonb(trim(p_address)));
  end if;
  if p_note is not null and nullif(trim(p_note), '') is distinct from o.note then
    update online_orders set note = nullif(trim(p_note), '') where id = o.id;
    insert into order_changes (order_id, by, by_customer, kind, before, after) values (o.id, case when staff then auth.uid() end, not staff, 'note', to_jsonb(o.note), to_jsonb(p_note));
  end if;

  update online_orders set modified_count = modified_count + 1 where id = o.id;
  select * into o from online_orders where id = o.id;
  perform cs_push_customer(v_phone, 'حجزك اتعدّل ✏️', format('حجز رقم %s: يوم %s الساعة %s — الإجمالي التقريبي %s ج.', o.no, to_char(o.scheduled_for at time zone 'Africa/Cairo', 'DD/MM'), o.slot, round(o.est_total + o.delivery_fee)), o.token);
  return jsonb_build_object('no', o.no, 'scheduled_for', o.scheduled_for, 'slot', o.slot, 'total', o.est_total + o.delivery_fee, 'deposit', o.deposit);
end $$;

create or replace function public.booking_deposit(p_token text, p_paid boolean) returns void
language plpgsql security definer set search_path = public as $$
declare o online_orders%rowtype;
begin
  if not is_staff() or not has_perm('orders.booking') then raise exception 'محتاج صلاحية الحجوزات'; end if;
  select * into o from online_orders where token = p_token and is_booking for update;
  if not found then raise exception 'الحجز مش موجود'; end if;
  update online_orders set deposit_paid = p_paid where id = o.id;
  insert into order_changes (order_id, by, kind, before, after) values (o.id, auth.uid(), 'deposit', to_jsonb(o.deposit_paid), to_jsonb(p_paid));
end $$;

-- التذكير قبل الميعاد (كل ساعة)
create or replace function public.booking_remind() returns int
language plpgsql security definer set search_path = public as $$
declare r record; n int := 0; h int := coalesce((booking_cfg()->>'remind_hours')::int, 24);
begin
  for r in select o.id, o.no, o.token, o.slot, o.scheduled_for, regexp_replace(c.phone, '\D', '', 'g') phone from online_orders o join customers c on c.id = o.customer_id
           where o.is_booking and not o.reminded and o.status = 'new' and o.scheduled_for between now() and now() + make_interval(hours => h) loop
    perform cs_push_customer(r.phone, 'تذكير بحجزك ⏰', format('حجز رقم %s يوم %s الساعة %s. لو عايز تعدّل كلّمنا.', r.no, to_char(r.scheduled_for at time zone 'Africa/Cairo', 'DD/MM'), r.slot), r.token);
    update online_orders set reminded = true where id = r.id;
    n := n + 1;
  end loop;
  return n;
end $$;
revoke execute on function public.booking_remind(), public.booking_cfg() from anon, public, authenticated;
select cron.schedule('booking-remind', '7 * * * *', $c$ select public.booking_remind() $c$);

-- الكاشير: الحجز مابيظهرش للفرع غير قبل ميعاده بالوقت اللي في الإعدادات
do $$ declare src text; begin
  src := pg_get_functiondef('public.pos_orders'::regproc);
  src := replace(src, 'where o.location_id = p_loc and o.status not in (''delivered'',''cancelled''));', 'where o.location_id = p_loc and o.status not in (''delivered'',''cancelled'') and (not o.is_booking or o.release_at <= now()));');
  src := replace(src, '''driver'', o.driver,', '''driver'', o.driver, ''booking'', o.is_booking, ''scheduled_for'', o.scheduled_for, ''slot'', o.slot, ''deposit'', o.deposit, ''deposit_paid'', o.deposit_paid,');
  if src !~ 'release_at <= now' then raise exception 'pos_orders patch failed'; end if;
  execute src;
  src := pg_get_functiondef('public.track_order'::regproc);
  src := replace(src, '''cancel_reason'', o.cancel_reason,', '''cancel_reason'', o.cancel_reason, ''booking'', o.is_booking, ''scheduled_for'', o.scheduled_for, ''slot'', o.slot, ''deposit'', o.deposit, ''deposit_paid'', o.deposit_paid, ''district_id'', o.district_id,
    ''can_edit'', o.is_booking and o.status = ''new'' and now() < o.scheduled_for - make_interval(hours => coalesce((booking_cfg()->>''edit_cutoff_hours'')::int, 24)),');
  if src !~ 'can_edit' then raise exception 'track patch failed'; end if;
  execute src;
end $$;

-- تقرير الحجوزات (للسيستم): صف لكل حجز بكل اللي ممكن نفلتر بيه
create or replace view public.v_bookings with (security_invoker = true) as
  select o.id, o.no, o.token, o.created_at, o.scheduled_for, (o.scheduled_for at time zone 'Africa/Cairo')::date as day, o.slot, o.status, o.channel, o.pay_method,
         o.location_id, l.name as branch, o.district_id, d.name as district, c.phone, c.name as customer, o.address, o.note,
         o.est_total, o.delivery_fee, o.total, o.discount, o.deposit, o.deposit_paid, o.cancel_reason, o.modified_count,
         o.booked_by, p.name as booked_by_name, o.handled_by,
         (select jsonb_agg(jsonb_build_object('item_id', x.item_id, 'name', i.name, 'family_id', i.family_id, 'qty', x.qty, 'price', x.unit_price) order by x.line)
            from online_order_lines x join items i on i.id = x.item_id where x.order_id = o.id) as lines
  from online_orders o join customers c on c.id = o.customer_id join locations l on l.id = o.location_id
       left join districts d on d.id = o.district_id left join profiles p on p.id = o.booked_by
  where o.is_booking;

revoke execute on function public.booking_deposit(text, boolean) from anon, public;
grant execute on function public.booking_deposit(text, boolean) to authenticated;
grant execute on function public.booking_slots(bigint, date), public.booking_attach(text, date, text), public.book_order(bigint, text, text, text, text, text, jsonb, text, date, text),
  public.booking_edit(text, jsonb, date, text, text, text, boolean, text) to anon, authenticated;
