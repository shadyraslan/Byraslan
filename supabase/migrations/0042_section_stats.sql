-- ============ 0042 أرقام ورسوم الصفحة الرئيسية لكل قسم (بصلاحيات اللي فاتح: security invoker) ============
create or replace function public.section_stats(p_section text) returns jsonb
language plpgsql stable security invoker set search_path = public as $$
declare t date := (now() at time zone 'Africa/Cairo')::date; d0 date := t - 13; m0 date := date_trunc('month', t)::date; out jsonb := '{}';
begin
  if p_section = 'orders' then
    out := jsonb_build_object(
      'open', (select count(*) from online_orders where status in ('new','accepted','preparing','ready','out') and (not is_booking or release_at <= now())),
      'today', (select count(*) from online_orders where (created_at at time zone 'Africa/Cairo')::date = t and not is_booking),
      'today_value', (select coalesce(sum(coalesce(total, est_total + delivery_fee)), 0) from online_orders where (created_at at time zone 'Africa/Cairo')::date = t and status <> 'cancelled'),
      'bookings_today', (select count(*) from online_orders where is_booking and (scheduled_for at time zone 'Africa/Cairo')::date = t and status <> 'cancelled'),
      'bookings_next', (select count(*) from online_orders where is_booking and scheduled_for > now() and status <> 'cancelled'),
      'tickets', (select count(*) from support_tickets where status in ('new','open') and last_from = 'customer'),
      'complaints', (select count(*) from app_complaints where status = 'open'),
      'series', (select jsonb_agg(jsonb_build_object('d', g::date, 'v', (select count(*) from online_orders o where (o.created_at at time zone 'Africa/Cairo')::date = g::date and o.status <> 'cancelled')) order by g) from generate_series(d0, t, interval '1 day') g),
      'by_channel', (select coalesce(jsonb_object_agg(channel, n), '{}') from (select coalesce(case when from_app then 'app' end, channel) channel, count(*) n from online_orders where created_at >= m0 and status <> 'cancelled' group by 1) z));
  elsif p_section = 'branches' then
    out := jsonb_build_object(
      'today', (select coalesce(sum(total), 0) from sales where (at at time zone 'Africa/Cairo')::date = t),
      'invoices', (select count(*) from sales where (at at time zone 'Africa/Cairo')::date = t),
      'month', (select coalesce(sum(total), 0) from sales where at >= m0),
      'open_shifts', (select count(*) from shifts where status = 'open'),
      'series', (select jsonb_agg(jsonb_build_object('d', g::date, 'v', (select coalesce(sum(s.total), 0) from sales s where (s.at at time zone 'Africa/Cairo')::date = g::date)) order by g) from generate_series(d0, t, interval '1 day') g),
      'by_branch', (select coalesce(jsonb_agg(jsonb_build_object('name', l.name, 'v', x.v, 'n', x.n) order by x.v desc), '[]') from (select location_id, sum(total) v, count(*) n from sales where (at at time zone 'Africa/Cairo')::date = t group by 1) x join locations l on l.id = x.location_id));
  elsif p_section = 'factory' then
    out := jsonb_build_object(
      'packed', (select count(*) from boxes where (packed_at at time zone 'Africa/Cairo')::date = t),
      'prod_open', (select count(*) from prod_orders where status in ('planned','running')),
      'transit', (select count(*) from transfers where status = 'transit'),
      'trips', (select count(*) from trips where status <> 'done'),
      'series', (select jsonb_agg(jsonb_build_object('d', g::date, 'v', (select count(*) from boxes b where (b.packed_at at time zone 'Africa/Cairo')::date = g::date)) order by g) from generate_series(d0, t, interval '1 day') g));
  elsif p_section = 'purchasing' then
    out := jsonb_build_object(
      'po_open', (select count(*) from purchase_orders where status not in ('closed','cancelled','received')),
      'receipts_week', (select count(*) from receipts where at >= now() - interval '7 days'),
      'overrides', (select count(*) from override_requests where status = 'pending'),
      'suppliers', (select count(*) from suppliers),
      'series', (select jsonb_agg(jsonb_build_object('d', g::date, 'v', (select coalesce(sum(l.accepted * l.price), 0) from receipts r join receipt_lines l on l.receipt_id = r.id where (r.at at time zone 'Africa/Cairo')::date = g::date)) order by g) from generate_series(d0, t, interval '1 day') g));
  elsif p_section = 'accounts' then
    out := jsonb_build_object(
      'exp_month', (select coalesce(sum(amount), 0) from expenses where status = 'ok' and day >= m0),
      'exp_pending', (select count(*) from expenses where status = 'pending'),
      'sales_month', (select coalesce(sum(total), 0) from sales where at >= m0),
      'payables', (select coalesce(sum(balance), 0) from supplier_balances),
      'series', (select jsonb_agg(jsonb_build_object('d', g::date, 'v', (select coalesce(sum(e.amount), 0) from expenses e where e.status = 'ok' and e.day = g::date)) order by g) from generate_series(d0, t, interval '1 day') g),
      'by_cat', (select coalesce(jsonb_agg(jsonb_build_object('name', c.name, 'v', x.v) order by x.v desc), '[]') from (select category_id, sum(amount) v from expenses where status = 'ok' and day >= m0 group by 1) x join expense_categories c on c.id = x.category_id));
  elsif p_section = 'items' then
    out := jsonb_build_object(
      'items', (select count(*) from items where active),
      'families', (select count(*) from families),
      'no_price', (select count(*) from items i where i.active and i.kind = 'product' and not exists (select 1 from prices p where p.item_id = i.id)),
      'no_barcode', (select count(*) from items i where i.active and i.arm = 'market' and not exists (select 1 from item_barcodes b where b.item_id = i.id)));
  elsif p_section = 'hr' then
    out := jsonb_build_object(
      'staff', (select count(*) from profiles where active and not is_test),
      'present', (select count(distinct a.user_id) from attendance a where a.status <> 'rejected' and (a.at at time zone 'Africa/Cairo')::date = t and a.kind = 'in'
                    and not exists (select 1 from attendance b where b.user_id = a.user_id and b.kind = 'out' and b.at > a.at and b.status <> 'rejected')),
      'came_today', (select count(distinct user_id) from attendance where status <> 'rejected' and kind = 'in' and (at at time zone 'Africa/Cairo')::date = t),
      'att_pending', (select count(*) from attendance where status = 'pending'),
      'leaves_pending', (select count(*) from leave_requests where status = 'pending'),
      'permits_pending', (select count(*) from attendance_permits where status = 'pending'),
      'docs_pending', (select count(*) from doc_requests where status = 'pending'),
      'disputes', (select count(*) from payslip_disputes where status = 'open'),
      'series', (select jsonb_agg(jsonb_build_object('d', g::date, 'v', (select count(distinct a.user_id) from attendance a where a.status <> 'rejected' and a.kind = 'in' and (a.at at time zone 'Africa/Cairo')::date = g::date)) order by g) from generate_series(d0, t, interval '1 day') g));
  elsif p_section = 'setup' then
    out := jsonb_build_object(
      'locations', (select count(*) from locations where active),
      'no_geo', (select count(*) from locations where active and lat is null and type in ('dark','shop','factory','section','warehouse')),
      'users', (select count(*) from profiles where active and not is_test),
      'districts', (select count(*) from districts where active));
  end if;
  return out;
end $$;
grant execute on function public.section_stats(text) to authenticated;
