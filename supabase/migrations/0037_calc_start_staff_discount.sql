-- ============ 0037 الحساب بيبدأ من أول يوم للموظف على السيستم (كأنه يوم التعيين) + خصم مشتريات الموظفين من الداشبورد ============

-- بداية الحساب = الأكبر من (تاريخ التعيين) و(تاريخ بداية السيستم لو متحدد في الإعدادات، وإلا أول حضور للموظف على التطبيق)
create or replace function public.calc_start(p_user uuid, p_hire date) returns date
language sql stable security definer set search_path = public as $$
  select greatest(coalesce(p_hire, '2000-01-01'::date),
    coalesce(nullif((select value->>'go_live' from settings where key = 'hr.payroll'), '')::date,
             (select min((at at time zone 'Africa/Cairo')::date) from attendance where user_id = p_user and status <> 'rejected'),
             '9999-12-31'::date))
$$;
revoke execute on function public.calc_start(uuid, date) from anon, public, authenticated;

update public.settings set value = value || '{"discount_pct":0}'::jsonb where key = 'hr.staff_credit' and not value ? 'discount_pct';

do $$ declare src text; begin
  -- المرتب
  src := pg_get_functiondef('public.payroll_calc'::regproc);
  src := replace(src, 'pm attendance_permits%rowtype; worked boolean;', 'pm attendance_permits%rowtype; worked boolean; v_start date;');
  src := replace(src, 'hour_rate := day_rate / dh;', 'hour_rate := day_rate / dh; v_start := calc_start(e.user_id, e.hire_date);');
  src := replace(src, 'if d < e.hire_date then n_prehire', 'if d < v_start then n_prehire');
  src := replace(src, 'if worked and d >= e.hire_date then', 'if worked and d >= v_start then');
  src := replace(src, '''أيام قبل التعيين''', '''أيام قبل بداية الحساب''');
  src := replace(src, 'format(''اتعيّنت يوم %s'', e.hire_date)', 'case when v_start > current_date then ''لسه ماسجّلش حضور على السيستم'' else format(''الحساب بيبدأ من %s (التعيين أو أول حضور على السيستم)'', v_start) end');
  if src !~ 'v_start := calc_start' or src ~ 'd < e.hire_date' then raise exception 'payroll patch failed'; end if;
  execute src;
  -- الإجماليات
  src := pg_get_functiondef('public.att_summary'::regproc);
  src := replace(src, 'if e.hire_date is not null and d < e.hire_date then continue; end if;', 'if d < calc_start(p_user, e.hire_date) then continue; end if;');
  if src !~ 'calc_start' then raise exception 'att patch failed'; end if;
  execute src;
  -- الكاشير: الموظف بيتعرف برقمه حتى لو دفع كاش، وخصم الموظفين مايتعلّمش "من غير صلاحية" طالما في حدود النسبة
  src := pg_get_functiondef('public.pos_sync'::regproc);
  src := replace(src, 'if coalesce((x->>''discount'')::numeric, 0) > 0 and not has_perm(''pos.discount'') then flags := flags || ''خصم من غير صلاحية''; end if;', '');
  src := replace(src, 'if v_staff > 0 then
      if v_sid is null or not exists', 'if v_sid is not null and not exists (select 1 from profiles where id = v_sid and active and not is_test) then raise exception ''الموظف ده مش شغال''; end if;
    if v_staff > 0 then
      if v_sid is null or not exists');
  src := replace(src, 'case when v_staff > 0 then v_sid end', 'v_sid');
  src := replace(src, 'tot := greatest(sub - coalesce((x->>''discount'')::numeric, 0), 0);', 'tot := greatest(sub - coalesce((x->>''discount'')::numeric, 0), 0);
    if coalesce((x->>''discount'')::numeric, 0) > 0 and not has_perm(''pos.discount'')
       and not (v_sid is not null and (x->>''discount'')::numeric <= round(sub * coalesce((select (value->>''discount_pct'')::numeric from settings where key = ''hr.staff_credit''), 0) / 100, 2) + 0.01) then
      flags := flags || ''خصم من غير صلاحية''::text;
    end if;');
  if src !~ 'discount_pct' or src ~ 'case when v_staff > 0 then v_sid end' then raise exception 'pos patch failed'; end if;
  execute src;
  -- staff_credit_check بيرجّع نسبة الخصم
  src := pg_get_functiondef('public.staff_credit_check'::regproc);
  src := replace(src, '''available'', greatest(', '''discount_pct'', coalesce((cfg->>''discount_pct'')::numeric, 0), ''available'', greatest(');
  if src !~ 'discount_pct' then raise exception 'check patch failed'; end if;
  execute src;
end $$;
