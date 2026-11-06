-- ============ 0043 خدمة العملاء باب لوحده: العملاء (بحث/إضافة/تعديل)، متابعة أي طلب أو حجز من أي قناة، وأرقام القسم ============
create policy cu_read_cs on public.customers for select to authenticated using (has_perm('cs.agent'));
create policy ca_read_cs on public.customer_addresses for select to authenticated using (has_perm('cs.agent'));
create policy oo_read_cs on public.online_orders for select to authenticated using (has_perm('cs.agent'));

-- بحث العملاء: بالرقم أو الاسم
create or replace function public.cs_customers(p_q text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare q text := trim(coalesce(p_q, '')); d text := regexp_replace(coalesce(p_q, ''), '\D', '', 'g');
begin
  if not is_staff() or not (has_perm('cs.agent') or has_perm('orders.handle')) then raise exception 'محتاج صلاحية خدمة العملاء'; end if;
  return (select coalesce(jsonb_agg(x order by (x->>'last') desc nulls last), '[]'::jsonb) from (
    select jsonb_build_object('id', c.id, 'phone', c.phone, 'name', c.name, 'notes', c.notes, 'created_at', c.created_at,
      'orders', (select count(*) from online_orders o where o.customer_id = c.id and o.status <> 'cancelled'),
      'spent', (select coalesce(sum(coalesce(o.total, o.est_total + o.delivery_fee)), 0) from online_orders o where o.customer_id = c.id and o.status = 'delivered'),
      'last', (select max(o.created_at) from online_orders o where o.customer_id = c.id),
      'tickets', (select count(*) from support_tickets t where t.phone = regexp_replace(c.phone, '\D', '', 'g') and t.status in ('new','open','waiting')),
      'area', (select d2.name from customer_addresses a join districts d2 on d2.id = a.district_id where a.customer_id = c.id and a.active order by a.is_default desc limit 1)) x
    from customers c
    where q = '' or (length(d) >= 4 and regexp_replace(c.phone, '\D', '', 'g') like '%' || d || '%') or c.name ilike '%' || q || '%'
    order by c.id desc limit 100) z);
end $$;

-- إضافة / تعديل عميل وعنوانه
create or replace function public.cs_customer_save(p_phone text, p_name text, p_notes text, p_district bigint, p_address text, p_label text) returns bigint
language plpgsql security definer set search_path = public as $$
declare v_phone text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'); v_id bigint;
begin
  if not is_staff() or not (has_perm('cs.agent') or has_perm('orders.handle')) then raise exception 'محتاج صلاحية خدمة العملاء'; end if;
  if length(v_phone) < 10 or length(v_phone) > 13 then raise exception 'رقم الموبايل مش صحيح'; end if;
  if coalesce(trim(p_name), '') = '' then raise exception 'اكتب اسم العميل'; end if;
  insert into customers (phone, name, notes, address) values (v_phone, trim(p_name), nullif(trim(p_notes), ''), nullif(trim(p_address), ''))
    on conflict (phone) do update set name = excluded.name, notes = coalesce(excluded.notes, customers.notes)
    returning id into v_id;
  if p_district is not null and coalesce(trim(p_address), '') <> '' then
    insert into customer_addresses (customer_id, label, address, district_id, is_default, active)
      values (v_id, coalesce(nullif(trim(p_label), ''), 'البيت'), trim(p_address), p_district, not exists (select 1 from customer_addresses where customer_id = v_id and active), true);
  end if;
  return v_id;
end $$;

-- متابعة أي طلب أو حجز: برقم الطلب أو موبايل العميل أو اسمه
create or replace function public.cs_find_orders(p_q text, p_scope text default 'open') returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare q text := trim(coalesce(p_q, '')); d text := regexp_replace(coalesce(p_q, ''), '\D', '', 'g');
begin
  if not is_staff() or not (has_perm('cs.agent') or has_perm('orders.handle')) then raise exception 'محتاج صلاحية خدمة العملاء'; end if;
  return (select coalesce(jsonb_agg(x order by (x->>'sort') desc), '[]'::jsonb) from (
    select jsonb_build_object('id', o.id, 'no', o.no, 'token', o.token, 'status', o.status, 'channel', case when o.from_app then 'app' else o.channel end,
      'created_at', o.created_at, 'sort', coalesce(o.scheduled_for, o.created_at), 'branch', l.name, 'district', d2.name, 'customer', c.name, 'phone', c.phone,
      'total', coalesce(o.total, o.est_total + o.delivery_fee), 'booking', o.is_booking, 'scheduled_for', o.scheduled_for, 'slot', o.slot, 'deposit', o.deposit, 'deposit_paid', o.deposit_paid,
      'driver', o.driver, 'cancel_reason', o.cancel_reason, 'modified', o.modified_count,
      'lines', (select string_agg(i.name || ' × ' || ol.qty, '، ' order by ol.line) from online_order_lines ol join items i on i.id = ol.item_id where ol.order_id = o.id),
      'ticket', (select t.id from support_tickets t where t.order_id = o.id order by t.id desc limit 1),
      'complaint', (select ac.status from app_complaints ac where ac.order_id = o.id order by ac.id desc limit 1)) x
    from online_orders o join customers c on c.id = o.customer_id join locations l on l.id = o.location_id left join districts d2 on d2.id = o.district_id
    where (case when q = '' then true
                when d <> '' and length(d) <= 6 then o.no::text = d or regexp_replace(c.phone, '\D', '', 'g') like '%' || d
                when length(d) >= 7 then regexp_replace(c.phone, '\D', '', 'g') like '%' || d || '%'
                else c.name ilike '%' || q || '%' end)
      and (p_scope = 'all' or (p_scope = 'open' and o.status not in ('delivered','cancelled')) or (p_scope = 'bookings' and o.is_booking and o.status not in ('delivered','cancelled')))
    order by coalesce(o.scheduled_for, o.created_at) desc limit 150) z);
end $$;

revoke execute on function public.cs_customers(text), public.cs_customer_save(text, text, text, bigint, text, text), public.cs_find_orders(text, text) from anon, public;
grant execute on function public.cs_customers(text), public.cs_customer_save(text, text, text, bigint, text, text), public.cs_find_orders(text, text) to authenticated;

-- أرقام صفحة خدمة العملاء
do $do$ declare src text; begin
  src := pg_get_functiondef('public.section_stats'::regproc);
  src := replace(src, 'elsif p_section = ''setup'' then', 'elsif p_section = ''cs'' then
    out := jsonb_build_object(
      ''waiting'', (select count(*) from support_tickets where status in (''new'',''open'') and last_from = ''customer''),
      ''late'', (select count(*) from support_tickets where status in (''new'',''open'') and last_from = ''customer'' and last_msg_at < now() - make_interval(mins => coalesce((select value::text::int from settings where key = ''cs.sla_minutes''), 15))),
      ''open_tickets'', (select count(*) from support_tickets where status in (''new'',''open'',''waiting'')),
      ''orders_open'', (select count(*) from online_orders where status in (''new'',''accepted'',''preparing'',''ready'',''out'') and (not is_booking or release_at <= now())),
      ''bookings_today'', (select count(*) from online_orders where is_booking and (scheduled_for at time zone ''Africa/Cairo'')::date = t and status <> ''cancelled''),
      ''complaints'', (select count(*) from app_complaints where status = ''open''),
      ''rating'', (select round(avg(rating)::numeric, 1) from support_tickets where rating is not null and created_at >= m0),
      ''phone_orders'', (select count(*) from online_orders where channel in (''phone'',''whatsapp'') and (created_at at time zone ''Africa/Cairo'')::date = t),
      ''series'', (select jsonb_agg(jsonb_build_object(''d'', g::date, ''v'', (select count(*) from support_tickets x where (x.created_at at time zone ''Africa/Cairo'')::date = g::date)) order by g) from generate_series(d0, t, interval ''1 day'') g));
  elsif p_section = ''setup'' then');
  if src !~ 'phone_orders' then raise exception 'stats patch failed'; end if;
  execute src;
end $do$;
