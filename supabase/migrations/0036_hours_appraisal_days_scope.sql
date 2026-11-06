-- ============ 0036 إجماليات الساعات والأيام (للموظف ومديره والإدارة) + تقييم الأداء + أيام الشركة لمواقع/أقسام/أفراد ============
-- الوردية بتتحدد بميعاد البداية بس (end_at فاضي = البداية + ساعات اليوم).

insert into public.permissions (id, grp, label) values
  ('hr.appraise','الموارد البشرية','اعتماد تقييمات الأداء ومؤشرات كل وظيفة (المدير بيقيّم موظفينه من غيرها)')
on conflict do nothing;
insert into public.settings (key, value) values
  ('hr.appraisal', '{"cap":120,"grades":[{"min":95,"name":"ممتاز","bonus_pct":10},{"min":85,"name":"جيد جداً","bonus_pct":5},{"min":70,"name":"جيد","bonus_pct":0},{"min":0,"name":"محتاج متابعة","bonus_pct":0}]}')
on conflict do nothing;

-- أيام الشركة: أكتر من موقع/قسم (الموقع بيشمل الأقسام اللي تحته)
alter table public.company_days add column if not exists locs text[] not null default '{}';
update public.company_days set locs = array[location_id] where scope = 'loc' and location_id is not null and locs = '{}';

create or replace function public.day_applies(c company_days, p_user uuid, p_loc text) returns boolean
language sql stable security definer set search_path = public as $$
  select not c.cancelled and (c.scope = 'all'
    or (c.scope = 'loc' and (p_loc = any(c.locs) or (select parent from locations where id = p_loc) = any(c.locs)))
    or (c.scope = 'users' and p_user = any(c.users)))
$$;
create or replace function public.company_day_for(p_user uuid, p_loc text, p_day date) returns company_days
language sql stable security definer set search_path = public as $$
  select * from company_days c where c.day = p_day and day_applies(c, p_user, p_loc)
  order by case c.kind when 'holiday' then 0 else 1 end limit 1
$$;
create or replace function public.has_substitute(p_user uuid, p_loc text, p_day date) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from company_days s where s.kind = 'substitute' and s.for_day = p_day and day_applies(s, p_user, p_loc))
$$;
revoke execute on function public.day_applies(company_days, uuid, text), public.company_day_for(uuid, text, date), public.has_substitute(uuid, text, date) from anon, public, authenticated;

-- ===== إجماليات الحضور لفترة (نفس قواعد المرتب) =====
create or replace function public.att_summary(p_user uuid, p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare cfg jsonb := (select value from settings where key = 'hr.payroll'); e record; d date; today date := (now() at time zone 'Africa/Cairo')::date;
        dh numeric; pl shift_plans%rowtype; has_pl boolean; cd company_days%rowtype; fi timestamptz; lo timestamptz; t_start timestamptz; t_end timestamptz; lm int; lr record;
        req_days int := 0; req_min int := 0; present int := 0; absent int := 0; worked_min int := 0; late_n int := 0; late_min int := 0; early_n int := 0; early_min int := 0; ot_min int := 0;
        leave_days int := 0; hol int := 0; gift int := 0; rest_work int := 0; permits int := 0; left_days int := 0; left_min int := 0; due_days int := 0; due_min int := 0; open_day boolean := false;
begin
  if not (p_user = auth.uid() or manages(p_user) or has_perm('hr.view') or has_perm('hr.pay')) then raise exception 'مش مسموح'; end if;
  select ep.*, p.home_loc into e from profiles p left join employee_pay ep on ep.user_id = p.id where p.id = p_user;
  dh := coalesce((cfg->>'day_hours')::numeric, 8);
  for d in select generate_series(p_from, p_to, interval '1 day')::date loop
    select * into pl from shift_plans where user_id = p_user and day = d; has_pl := found;
    select min(at) filter (where kind = 'in'), max(at) filter (where kind = 'out') into fi, lo from attendance
      where user_id = p_user and status <> 'rejected' and (at at time zone 'Africa/Cairo')::date = d;
    if (has_pl and pl.off) or (not has_pl and extract(dow from d) = coalesce(e.rest_day, 5)) then
      if fi is not null then rest_work := rest_work + 1; end if;
      if fi is not null and lo is not null then worked_min := worked_min + floor(extract(epoch from (lo - fi)) / 60); end if;
      continue;
    end if;
    if e.hire_date is not null and d < e.hire_date then continue; end if;
    cd := company_day_for(p_user, e.home_loc, d);
    if cd.id is not null then if cd.kind = 'holiday' then hol := hol + 1; else gift := gift + 1; end if; continue; end if;
    select kind into lr from leave_requests where user_id = p_user and status = 'approved' and kind <> 'advance' and d between from_date and to_date limit 1;
    if found then leave_days := leave_days + 1; continue; end if;
    -- يوم شغل مطلوب
    t_start := (d + coalesce(case when has_pl then pl.start_at end, e.shift_start, '09:00')) at time zone 'Africa/Cairo';
    t_end := case when has_pl and pl.end_at is not null then (d + pl.end_at + case when pl.end_at <= pl.start_at then interval '1 day' else interval '0' end) at time zone 'Africa/Cairo'
                  else t_start + make_interval(mins => (dh * 60)::int) end;
    req_days := req_days + 1; req_min := req_min + floor(extract(epoch from (t_end - t_start)) / 60);
    if d > today then left_days := left_days + 1; left_min := left_min + floor(extract(epoch from (t_end - t_start)) / 60); continue; end if;
    due_days := due_days + 1; due_min := due_min + floor(extract(epoch from (t_end - t_start)) / 60);
    if fi is null then if d < today then absent := absent + 1; end if; continue; end if;
    present := present + 1;
    if lo is not null then worked_min := worked_min + floor(extract(epoch from (lo - fi)) / 60);
    elsif d = today then worked_min := worked_min + floor(extract(epoch from (now() - fi)) / 60); open_day := true; end if;
    lm := floor(extract(epoch from (fi - t_start)) / 60);
    if lm > coalesce((cfg->>'grace_min')::int, 15) then
      if exists (select 1 from attendance_permits where user_id = p_user and day = d and kind = 'late' and status = 'approved') then permits := permits + 1;
      else late_n := late_n + 1; late_min := late_min + lm; end if;
    end if;
    if lo is not null then
      lm := floor(extract(epoch from (t_end - lo)) / 60);
      if lm > coalesce((cfg->>'early_grace')::int, 10) then
        if exists (select 1 from attendance_permits where user_id = p_user and day = d and kind = 'early' and status = 'approved') then permits := permits + 1;
        else early_n := early_n + 1; early_min := early_min + lm; end if;
      end if;
      lm := floor(extract(epoch from (lo - t_end)) / 60);
      if lm >= coalesce((cfg->>'ot_min')::int, 30) then ot_min := ot_min + lm; end if;
    end if;
  end loop;
  return jsonb_build_object('from', p_from, 'to', p_to,
    'req_days', req_days, 'req_hours', round(req_min / 60.0, 1),
    'due_days', due_days, 'due_hours', round(due_min / 60.0, 1),
    'present', present, 'absent', absent, 'worked_hours', round(worked_min / 60.0, 1), 'open_day', open_day,
    'short_hours', round(greatest(due_min - worked_min, 0) / 60.0, 1),
    'left_days', left_days, 'left_hours', round(left_min / 60.0, 1),
    'late', late_n, 'late_min', late_min, 'early', early_n, 'early_min', early_min, 'ot_hours', round(ot_min / 60.0, 1),
    'leave_days', leave_days, 'holidays', hol, 'gift', gift, 'rest_work', rest_work, 'permits', permits);
end $$;

-- الموظف: الشهر الحالي (أو أي شهر) + الأرصدة
create or replace function public.my_hours(p_month date default null) returns jsonb
language sql stable security definer set search_path = public as $$
  select att_summary(auth.uid(), date_trunc('month', coalesce(p_month, (now() at time zone 'Africa/Cairo')::date))::date,
    (date_trunc('month', coalesce(p_month, (now() at time zone 'Africa/Cairo')::date)) + interval '1 month' - interval '1 day')::date)
$$;

-- المدير: فريقه (أو الكل لو معاه صلاحية) بإجمالياتهم + حالة النهارده + الأذون المستنية
create or replace function public.team_summary(p_month date default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare m0 date := date_trunc('month', coalesce(p_month, (now() at time zone 'Africa/Cairo')::date))::date; m1 date; all_ boolean := has_perm('hr.shifts') or has_perm('hr.view') or has_perm('hr.pay');
        out jsonb := '[]'; r record; t date := (now() at time zone 'Africa/Cairo')::date; st text;
begin
  if not is_staff() then raise exception 'الحساب ده مش شغال'; end if;
  m1 := (m0 + interval '1 month' - interval '1 day')::date;
  for r in select p.id, p.name, p.job, p.home_loc from profiles p left join employee_pay ep on ep.user_id = p.id
           where p.active and not p.is_test and p.id <> auth.uid() and (ep.manager_id = auth.uid() or all_) order by p.name loop
    st := null;
    select case when kind = 'in' then 'in' else 'out' end into st from attendance where user_id = r.id and status <> 'rejected' and (at at time zone 'Africa/Cairo')::date = t order by at desc limit 1;
    out := out || jsonb_build_object('id', r.id, 'name', r.name, 'job', r.job, 'loc', (select name from locations where id = r.home_loc), 'today', coalesce(st, 'none'),
      'shift', (select jsonb_build_object('off', off, 'start', start_at) from shift_plans where user_id = r.id and day = t),
      'sum', att_summary(r.id, m0, m1),
      'pending', (select coalesce(jsonb_agg(jsonb_build_object('id', a.id, 'day', a.day, 'kind', a.kind, 'time', a.at_time, 'reason', a.reason) order by a.day), '[]'::jsonb)
                  from attendance_permits a where a.user_id = r.id and a.status = 'pending'));
  end loop;
  return jsonb_build_object('month', m0, 'is_manager', jsonb_array_length(out) > 0, 'team', out);
end $$;

-- ===== تقييم الأداء =====
create table public.kpi_templates (
  job text primary key,
  items jsonb not null default '[]',   -- [{name, weight, target, unit, lower}]
  updated_at timestamptz not null default now()
);
create table public.appraisals (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles,
  month date not null,
  items jsonb not null default '[]',   -- [{name, weight, target, actual, unit, lower, note, pct}]
  score numeric, grade text, bonus_pct numeric, bonus numeric,
  status text not null default 'draft' check (status in ('draft','submitted','approved','returned')),
  mgr_comment text, emp_comment text,
  by uuid default auth.uid(), submitted_at timestamptz,
  approved_by uuid, approved_at timestamptz, ack_at timestamptz,
  adjustment_id bigint,
  unique (user_id, month)
);
alter table public.kpi_templates enable row level security;
alter table public.appraisals enable row level security;
create policy staff_only on public.kpi_templates as restrictive for all to authenticated using (public.is_staff()) with check (public.is_staff());
create policy staff_only on public.appraisals as restrictive for all to authenticated using (public.is_staff()) with check (public.is_staff());
create policy kt_read on public.kpi_templates for select to authenticated using (true);
create policy kt_write on public.kpi_templates for all to authenticated using (has_perm('hr.appraise')) with check (has_perm('hr.appraise'));
create policy ar_read on public.appraisals for select to authenticated using (has_perm('hr.appraise') or has_perm('hr.pay') or manages(user_id) or (user_id = auth.uid() and status = 'approved'));
create trigger audit_appraisals after insert or update or delete on public.appraisals for each row execute function public.audit();

create or replace function public.appraisal_save(p_user uuid, p_month date, p_items jsonb, p_comment text, p_submit boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
declare cfg jsonb := (select value from settings where key = 'hr.appraisal'); cap numeric; it jsonb; items jsonb := '[]'; w numeric := 0; s numeric := 0; pct numeric;
        g jsonb; v_grade text; v_bpct numeric := 0; v_score numeric; m0 date := date_trunc('month', p_month)::date; old appraisals%rowtype;
begin
  if not (manages(p_user) or has_perm('hr.appraise')) then raise exception 'مش من موظفينك'; end if;
  select * into old from appraisals where user_id = p_user and month = m0;
  if found and old.status in ('submitted','approved') and not has_perm('hr.appraise') then raise exception 'التقييم ده اتبعت — محتاج يترجعلك الأول'; end if;
  if found and old.status = 'approved' then raise exception 'التقييم ده اتعتمد خلاص'; end if;
  cap := coalesce((cfg->>'cap')::numeric, 120);
  for it in select * from jsonb_array_elements(coalesce(p_items, '[]')) loop
    pct := case when coalesce((it->>'target')::numeric, 0) = 0 or it->>'actual' is null or it->>'actual' = '' then null
                when coalesce((it->>'lower')::boolean, false) then case when (it->>'actual')::numeric = 0 then cap else (it->>'target')::numeric / (it->>'actual')::numeric * 100 end
                else (it->>'actual')::numeric / (it->>'target')::numeric * 100 end;
    if pct is not null then pct := round(least(greatest(pct, 0), cap), 1); w := w + coalesce((it->>'weight')::numeric, 1); s := s + coalesce((it->>'weight')::numeric, 1) * pct; end if;
    items := items || (it || jsonb_build_object('pct', pct));
  end loop;
  v_score := case when w > 0 then round(s / w, 1) end;
  if v_score is not null then
    for g in select * from jsonb_array_elements(cfg->'grades') loop
      if v_score >= (g->>'min')::numeric then v_grade := g->>'name'; v_bpct := (g->>'bonus_pct')::numeric; exit; end if;
    end loop;
  end if;
  if p_submit and v_score is null then raise exception 'اكتب المحقق في مؤشر واحد على الأقل'; end if;
  insert into appraisals (user_id, month, items, score, grade, bonus_pct, mgr_comment, status, by, submitted_at)
    values (p_user, m0, items, v_score, v_grade, v_bpct, nullif(trim(p_comment), ''), case when p_submit then 'submitted' else 'draft' end, auth.uid(), case when p_submit then now() end)
    on conflict (user_id, month) do update set items = excluded.items, score = excluded.score, grade = excluded.grade, bonus_pct = excluded.bonus_pct,
      mgr_comment = excluded.mgr_comment, status = excluded.status, by = excluded.by, submitted_at = excluded.submitted_at;
  return jsonb_build_object('score', v_score, 'grade', v_grade, 'bonus_pct', v_bpct);
end $$;

create or replace function public.appraisal_decide(p_id bigint, p_ok boolean, p_note text) returns void
language plpgsql security definer set search_path = public as $$
declare a appraisals%rowtype; v_base numeric; v_bonus numeric; v_month date; v_adj bigint;
begin
  if not is_staff() or not has_perm('hr.appraise') then raise exception 'محتاج صلاحية اعتماد التقييمات'; end if;
  select * into a from appraisals where id = p_id and status = 'submitted' for update;
  if not found then raise exception 'التقييم ده مش مستني اعتماد'; end if;
  if a."by" = auth.uid() and not is_owner() then raise exception 'اللي عمل التقييم مايعتمدهوش'; end if;
  if not p_ok then
    update appraisals set status = 'returned', mgr_comment = coalesce(mgr_comment, '') || case when coalesce(trim(p_note), '') <> '' then E'\nرجع: ' || trim(p_note) else '' end where id = p_id;
    return;
  end if;
  select base into v_base from employee_pay where user_id = a.user_id;
  v_bonus := round(coalesce(v_base, 0) * coalesce(a.bonus_pct, 0) / 100, 2);
  if v_bonus > 0 then
    -- المكافأة بتنزل في أول شهر لسه مااتعتمدش من شهر التقييم
    select min(x.m)::date into v_month from generate_series(a.month, a.month + interval '24 month', interval '1 month') x(m)
      where not exists (select 1 from payroll_runs r where r.month = x.m::date and r.status = 'approved');
    insert into payroll_adjustments (user_id, month, kind, label, amount, reason, source, ref_id)
      values (a.user_id, v_month, 'earn', 'مكافأة الأداء', v_bonus, format('تقييم %s: %s%% — %s (%s%% من المرتب)', month_name(a.month), a.score, a.grade, a.bonus_pct), 'performance', a.id)
      returning id into v_adj;
  end if;
  update appraisals set status = 'approved', bonus = v_bonus, approved_by = auth.uid(), approved_at = now(), adjustment_id = v_adj where id = p_id;
  perform staff_note(a.user_id, 'تقييم أدائك نزل ⭐', format('تقييم %s: %s%% — %s%s. التفاصيل في "تقييمي".', month_name(a.month), a.score, a.grade,
    case when v_bonus > 0 then format(' — مكافأة %s ج مع المرتب', v_bonus) else '' end));
end $$;

create or replace function public.my_appraisals() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'month', month, 'name', month_name(month), 'items', items, 'score', score, 'grade', grade, 'bonus', bonus,
    'mgr_comment', mgr_comment, 'emp_comment', emp_comment, 'ack_at', ack_at, 'by', (select name from profiles where id = a."by")) order by month desc), '[]'::jsonb)
  from appraisals a where user_id = auth.uid() and status = 'approved'
$$;

create or replace function public.appraisal_ack(p_id bigint, p_comment text) returns void
language sql security definer set search_path = public as $$
  update appraisals set ack_at = coalesce(ack_at, now()), emp_comment = coalesce(nullif(trim(p_comment), ''), emp_comment) where id = p_id and user_id = auth.uid() and status = 'approved'
$$;

revoke execute on function public.att_summary(uuid, date, date), public.my_hours(date), public.team_summary(date), public.appraisal_save(uuid, date, jsonb, text, boolean),
  public.appraisal_decide(bigint, boolean, text), public.my_appraisals(), public.appraisal_ack(bigint, text) from anon, public;
grant execute on function public.att_summary(uuid, date, date), public.my_hours(date), public.team_summary(date), public.appraisal_save(uuid, date, jsonb, text, boolean),
  public.appraisal_decide(bigint, boolean, text), public.my_appraisals(), public.appraisal_ack(bigint, text) to authenticated;

-- المرتب والأرصدة بقوا يستخدموا نفس قاعدة النطاق (موقع بأقسامه / أقسام / أفراد)
do $$ declare src text; begin
  src := pg_get_functiondef('public.payroll_calc'::regproc);
  src := regexp_replace(src, 'not exists \(select 1 from company_days s where s\.kind = ''substitute''.*?e\.user_id = any\(s\.users\)\)\)\)', 'not has_substitute(e.user_id, e.home_loc, d)');
  if src !~ 'has_substitute' then raise exception 'payroll_calc patch failed'; end if;
  execute src;
  src := pg_get_functiondef('public.my_balances'::regproc);
  src := replace(src, '(c.scope = ''all'' or (c.scope = ''loc'' and c.location_id = v_loc) or (c.scope = ''users'' and auth.uid() = any(c.users)))', 'day_applies(c, auth.uid(), v_loc)');
  if src !~ 'day_applies' then raise exception 'my_balances patch failed'; end if;
  execute src;
end $$;

-- appraisal: "by" لازم بين علامتين جوه plpgsql (اتصلّحت فوق)
-- staff_home: is_manager + وردية النهارده وبكره
do $$ declare src text; begin
  src := pg_get_functiondef('public.staff_home'::regproc);
  src := replace(src, '''is_driver'', has_perm(''trips.load''));', '''is_driver'', has_perm(''trips.load''),
    ''is_manager'', has_perm(''hr.shifts'') or exists (select 1 from employee_pay where manager_id = auth.uid()),
    ''shift_today'', (select jsonb_build_object(''off'', off, ''start'', start_at, ''end'', end_at) from shift_plans where user_id = auth.uid() and day = (now() at time zone ''Africa/Cairo'')::date),
    ''shift_tomorrow'', (select jsonb_build_object(''off'', off, ''start'', start_at, ''end'', end_at) from shift_plans where user_id = auth.uid() and day = (now() at time zone ''Africa/Cairo'')::date + 1));');
  if src !~ 'is_manager' then raise exception 'patch failed'; end if;
  execute src;
end $$;

-- الوردية بميعاد البداية بس
do $$ declare src text; begin
  src := pg_get_functiondef('public.shift_set'::regproc);
  src := replace(src, 'if not v_off and (v_s is null or v_e is null) then raise exception ''اكتب ميعاد البداية والنهاية أو اختار راحة''; end if;', 'if not v_off and v_s is null then raise exception ''اكتب ميعاد بداية الوردية أو اختار راحة''; end if;');
  if src !~ 'اكتب ميعاد بداية الوردية' then raise exception 'patch1'; end if;
  execute src;
  src := pg_get_functiondef('public.shift_text'::regproc);
  src := replace(src, 'to_char(p.end_at, ''HH12:MI'')', 'to_char(coalesce(p.end_at, p.start_at + make_interval(mins => (coalesce((select (value->>''day_hours'')::numeric from settings where key = ''hr.payroll''), 8) * 60)::int)), ''HH12:MI'')');
  if src !~ 'day_hours' then raise exception 'patch2'; end if;
  execute src;
end $$;
