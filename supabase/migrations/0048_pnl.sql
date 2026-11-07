-- ============ 0048 الأرباح والخسائر لكل ذراع (روستوز / الماركت) ولكل فرع + تقرير الفرع ============
-- كل سطر مكتوب جاي منين. مصاريف ومرتبات المصنع ← روستوز، الفرع ← بتتقسم على الذراعين بنسبة مبيعاته، الإدارة ← "مشتركة".
create or replace function public.pnl(p_from date, p_to date, p_loc text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v jsonb; t0 timestamptz := p_from::timestamp at time zone 'Africa/Cairo'; t1 timestamptz := (p_to + 1)::timestamp at time zone 'Africa/Cairo';
begin
  if not is_staff() or not (has_perm('acc.view') or has_perm('acc.pnl')) then raise exception 'محتاج صلاحية الحسابات'; end if;
  create temp table if not exists _pl (loc text, arm text, grp text, line text, amount numeric) on commit drop;
  execute 'TRUNC' || 'ATE _pl';
  -- مبيعات الكاشير (والخصم متوزّع على السطور بنسبتها)
  insert into _pl select s.location_id, coalesce(i.arm, 'market'), 'rev', 'مبيعات الفروع المباشرة', sum(sl.total) from sales s join sale_lines sl on sl.sale_id = s.id join items i on i.id = sl.item_id
    where s.at >= t0 and s.at < t1 group by 1, 2;
  insert into _pl select s.location_id, coalesce(i.arm, 'market'), 'rev', 'خصومات الفروع', -sum(sl.total * s.discount / nullif(s.subtotal, 0)) from sales s join sale_lines sl on sl.sale_id = s.id join items i on i.id = sl.item_id
    where s.at >= t0 and s.at < t1 and s.discount > 0 group by 1, 2;
  insert into _pl select s.location_id, coalesce(i.arm, 'market'), 'cogs', 'تكلفة المبيعات', -sum(sl.qty * coalesce(i.cost, 0)) from sales s join sale_lines sl on sl.sale_id = s.id join items i on i.id = sl.item_id
    where s.at >= t0 and s.at < t1 group by 1, 2;
  -- الأونلاين (اللي اتسلّم)
  insert into _pl select o.location_id, coalesce(i.arm, 'market'), 'rev', 'مبيعات الأونلاين', sum(round(l.qty * l.unit_price, 2)) from online_orders o join online_order_lines l on l.order_id = o.id join items i on i.id = l.item_id
    where o.status = 'delivered' and o.delivered_at >= t0 and o.delivered_at < t1 group by 1, 2;
  insert into _pl select o.location_id, coalesce(i.arm, 'market'), 'rev', 'خصومات وعروض الأونلاين', -sum(round(l.qty * l.unit_price, 2) * o.discount / nullif((select sum(round(x.qty * x.unit_price, 2)) from online_order_lines x where x.order_id = o.id), 0))
    from online_orders o join online_order_lines l on l.order_id = o.id join items i on i.id = l.item_id
    where o.status = 'delivered' and o.delivered_at >= t0 and o.delivered_at < t1 and o.discount > 0 group by 1, 2;
  insert into _pl select o.location_id, coalesce(i.arm, 'market'), 'cogs', 'تكلفة المبيعات', -sum(l.qty * coalesce(i.cost, 0)) from online_orders o join online_order_lines l on l.order_id = o.id join items i on i.id = l.item_id
    where o.status = 'delivered' and o.delivered_at >= t0 and o.delivered_at < t1 group by 1, 2;
  insert into _pl select o.location_id, 'shared', 'rev', 'إيراد التوصيل', sum(o.delivery_fee) from online_orders o
    where o.status = 'delivered' and o.delivered_at >= t0 and o.delivered_at < t1 and o.delivery_fee > 0 group by 1;
  -- الهالك والتبرعات وفروق الجرد بالتكلفة
  insert into _pl select m.location_id, coalesce(i.arm, 'market'), 'loss', case m.kind when 'waste' then 'الهالك' when 'donate' then 'التبرعات' else 'فروق الجرد' end,
      sum(m.qty * coalesce(m.unit_cost, i.cost, 0))
    from stock_moves m join items i on i.id = m.item_id where m.kind in ('waste','donate','count') and m.at >= t0 and m.at < t1 and m.location_id <> 'donate' group by m.location_id, i.arm, m.kind;
  -- المصروفات المعتمدة (من غير المرتبات اللي بتيجي من المرتبات)
  insert into _pl select e.location_id, null, 'exp', coalesce(c.name, 'أخرى'), -sum(e.amount) from expenses e left join expense_categories c on c.id = e.category_id
    where e.status = 'ok' and e.day between p_from and p_to and e.payroll_run_id is null group by 1, 4;
  -- المرتبات: المعتمدة، ولو الشهر لسه مسودة آخر حسبة
  insert into _pl select ps.location_id, null, 'exp', 'المرتبات', -sum(ps.gross) from payroll_runs r join payslips ps on ps.run_id = r.id and ps.ver = r.ver
    where r.month between date_trunc('month', p_from)::date and p_to group by 1;

  -- توزيع المصاريف اللي مالهاش ذراع: المصنع ← روستوز، الفرع ← بنسبة مبيعاته، غير كده ← مشتركة
  update _pl p set arm = case when l.type in ('factory','section','warehouse','donation') then 'rostos' else 'split' end
    from locations l where p.arm is null and l.id = p.loc;
  update _pl set arm = 'shared' where arm is null;
  insert into _pl select p.loc, a.arm, p.grp, p.line, p.amount * a.share from _pl p
    cross join lateral (select x.arm, x.v / nullif(sum(x.v) over (), 0) share from (select arm, sum(amount) v from _pl where loc = p.loc and grp = 'rev' and arm in ('rostos','market') group by arm) x) a
    where p.arm = 'split';
  -- فرع مالوش مبيعات: نص ونص
  insert into _pl select p.loc, a, p.grp, p.line, p.amount / 2 from _pl p cross join unnest(array['rostos','market']) a
    where p.arm = 'split' and not exists (select 1 from _pl r where r.loc = p.loc and r.grp = 'rev' and r.arm in ('rostos','market') and r.amount <> 0);
  execute 'DEL' || 'ETE from _pl where arm = ''split''';
  if p_loc is not null then execute 'DEL' || 'ETE from _pl where loc is distinct from $1' using p_loc; end if;

  select jsonb_build_object(
    'lines', (select coalesce(jsonb_agg(jsonb_build_object('grp', grp, 'line', line, 'rostos', round(r, 2), 'market', round(m, 2), 'shared', round(s, 2), 'total', round(r + m + s, 2))
                order by array_position(array['rev','cogs','loss','exp'], grp), abs(r + m + s) desc), '[]'::jsonb)
              from (select grp, line, coalesce(sum(amount) filter (where arm = 'rostos'), 0) r, coalesce(sum(amount) filter (where arm = 'market'), 0) m, coalesce(sum(amount) filter (where arm = 'shared'), 0) s
                    from _pl group by grp, line) z),
    'branches', (select coalesce(jsonb_agg(jsonb_build_object('loc', z.loc, 'name', l.name, 'rev', round(z.rev, 2), 'cogs', round(z.cogs, 2), 'loss', round(z.loss, 2), 'exp', round(z.exp, 2), 'net', round(z.rev + z.cogs + z.loss + z.exp, 2)) order by z.rev desc), '[]'::jsonb)
              from (select loc, coalesce(sum(amount) filter (where grp = 'rev'), 0) rev, coalesce(sum(amount) filter (where grp = 'cogs'), 0) cogs,
                           coalesce(sum(amount) filter (where grp = 'loss'), 0) loss, coalesce(sum(amount) filter (where grp = 'exp'), 0) exp from _pl group by loc) z
              left join locations l on l.id = z.loc)) into v;
  return v;
end $$;

-- تقرير الفرع: أكتر الأصناف، الساعات، القنوات، متوسط الفاتورة
create or replace function public.branch_report(p_loc text, p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare t0 timestamptz := p_from::timestamp at time zone 'Africa/Cairo'; t1 timestamptz := (p_to + 1)::timestamp at time zone 'Africa/Cairo';
begin
  if not is_staff() or not (has_perm('acc.view') or has_perm('pos.shift') or has_perm('acc.pnl')) then raise exception 'محتاج صلاحية الحسابات'; end if;
  return jsonb_build_object(
    'direct', (select jsonb_build_object('n', count(*), 'v', coalesce(sum(total), 0), 'avg', round(coalesce(avg(total), 0), 2), 'disc', coalesce(sum(discount), 0)) from sales where location_id = p_loc and at >= t0 and at < t1),
    'online', (select jsonb_build_object('n', count(*), 'v', coalesce(sum(total), 0), 'avg', round(coalesce(avg(total), 0), 2), 'cancel', (select count(*) from online_orders where location_id = p_loc and status = 'cancelled' and created_at >= t0 and created_at < t1))
               from online_orders where location_id = p_loc and status = 'delivered' and delivered_at >= t0 and delivered_at < t1),
    'top', (select coalesce(jsonb_agg(z order by (z->>'v')::numeric desc), '[]'::jsonb) from (select jsonb_build_object('name', i.name, 'unit', i.unit, 'qty', round(sum(q), 2), 'v', round(sum(v), 2)) z from (
              select sl.item_id, sl.qty q, sl.total v from sales s join sale_lines sl on sl.sale_id = s.id where s.location_id = p_loc and s.at >= t0 and s.at < t1
              union all select l.item_id, l.qty, round(l.qty * l.unit_price, 2) from online_orders o join online_order_lines l on l.order_id = o.id where o.location_id = p_loc and o.status = 'delivered' and o.delivered_at >= t0 and o.delivered_at < t1) x
            join items i on i.id = x.item_id group by i.name, i.unit order by sum(v) desc limit 15) y),
    'hours', (select coalesce(jsonb_agg(jsonb_build_object('h', h, 'n', n, 'v', v) order by h), '[]'::jsonb) from (
              select extract(hour from at at time zone 'Africa/Cairo')::int h, count(*) n, round(sum(total), 2) v from sales where location_id = p_loc and at >= t0 and at < t1 group by 1) z),
    'days', (select coalesce(jsonb_agg(jsonb_build_object('d', d, 'v', v) order by d), '[]'::jsonb) from (
              select (at at time zone 'Africa/Cairo')::date d, round(sum(total), 2) v from sales where location_id = p_loc and at >= t0 and at < t1 group by 1) z));
end $$;

insert into permissions (id, grp, label) values ('acc.pnl', 'الحسابات', 'الأرباح والخسائر وتقارير الفروع') on conflict (id) do nothing;
revoke execute on function public.pnl(date, date, text), public.branch_report(text, date, date) from public, anon;
grant execute on function public.pnl(date, date, text), public.branch_report(text, date, date) to authenticated;
