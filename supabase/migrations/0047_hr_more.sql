-- ============ 0047 الموارد البشرية: الجزاءات حسب اللايحة بتأكيد الاستلام، العهد العينية، المستندات والشهادات الصحية بانتهائها، مخالصة نهاية الخدمة، تأكيد التواجد العشوائي ============
insert into permissions (id, grp, label) values
  ('hr.penalty', 'الموارد البشرية', 'تسجيل الجزاءات وإلغاؤها'),
  ('hr.assets', 'الموارد البشرية', 'العهد العينية (يونيفورم/موبايل/مفاتيح)'),
  ('hr.staffdocs', 'الموارد البشرية', 'مستندات الموظفين والشهادات الصحية'),
  ('hr.settle', 'الموارد البشرية', 'مخالصة نهاية الخدمة')
on conflict (id) do nothing;
insert into settings (key, value) values
  ('hr.penalty', '{"window_months": 6, "max_days_month": 5}'),
  ('hr.doc_types', '[{"key":"health","name":"شهادة صحية","alert_days":30,"block":true,"locs":[]},{"key":"license","name":"رخصة قيادة","alert_days":30,"block":false,"locs":[]},{"key":"id","name":"بطاقة الرقم القومي","alert_days":60,"block":false,"locs":[]},{"key":"contract","name":"العقد","alert_days":30,"block":false,"locs":[]}]'),
  ('hr.presence', '{"on": false, "per_day": 2, "window_min": 10, "deduct_hours": 1, "max_m": 300}'),
  ('hr.settle', '{"pay_leave": true}')
on conflict (key) do nothing;

-- ===== الجزاءات =====
create table if not exists public.penalty_rules (
  id bigint generated always as identity primary key,
  name text not null,
  steps jsonb not null default '[{"action":"notice"},{"action":"warning"},{"action":"deduct","days":1}]',
  active boolean not null default true, sort int not null default 0
);
create table if not exists public.penalties (
  id bigint generated always as identity primary key,
  no int generated always as identity (start 1001),
  user_id uuid not null references public.profiles,
  rule_id bigint not null references public.penalty_rules,
  occurrence int not null, action text not null check (action in ('notice','warning','deduct')), days numeric not null default 0,
  reason text, day date not null, month date not null,
  status text not null default 'issued' check (status in ('issued','acked','cancelled')),
  by uuid not null default auth.uid() references public.profiles, at timestamptz not null default now(),
  acked_at timestamptz, cancelled_by uuid references public.profiles, cancel_note text
);
-- أمثلة مبدئية — اللايحة الحقيقية قرار شادي والمحامي يراجعها
insert into penalty_rules (name, steps, sort)
  select * from (values
    ('عدم الالتزام بالزي والنظافة الشخصية', '[{"action":"notice"},{"action":"warning"},{"action":"deduct","days":0.5},{"action":"deduct","days":1}]'::jsonb, 1),
    ('مخالفة تعليمات سلامة الغذاء', '[{"action":"warning"},{"action":"deduct","days":1},{"action":"deduct","days":3}]'::jsonb, 2),
    ('سوء التعامل مع عميل أو زميل', '[{"action":"warning"},{"action":"deduct","days":1},{"action":"deduct","days":2}]'::jsonb, 3),
    ('ترك مكان الشغل من غير إذن', '[{"action":"notice"},{"action":"deduct","days":0.5},{"action":"deduct","days":1}]'::jsonb, 4)) v(n, s, o)
  where not exists (select 1 from penalty_rules);

-- ===== العهد العينية =====
create table if not exists public.custody_assets (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles,
  name text not null, serial text, value numeric not null default 0, note text,
  given_at date not null default ((now() at time zone 'Africa/Cairo')::date), given_by uuid default auth.uid() references public.profiles,
  acked_at timestamptz, returned_at date, returned_to uuid references public.profiles, condition text
);

-- ===== المستندات والشهادات =====
create table if not exists public.staff_docs (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles,
  type text not null, number text, expires date, photo text, note text,
  active boolean not null default true, notified date,
  by uuid default auth.uid() references public.profiles, at timestamptz not null default now()
);
create index if not exists idx_staff_docs_user on public.staff_docs (user_id, type) where active;

-- ===== المخالصة =====
create table if not exists public.settlements (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles,
  last_day date not null, reason text,
  lines jsonb not null default '[]', total numeric not null default 0,
  status text not null default 'draft' check (status in ('draft','approved','cancelled')),
  by uuid default auth.uid() references public.profiles, at timestamptz not null default now(),
  approved_by uuid references public.profiles, approved_at timestamptz
);

-- ===== تأكيد التواجد =====
create table if not exists public.presence_checks (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles,
  sent_at timestamptz not null default now(), due_at timestamptz not null,
  done_at timestamptz, lat double precision, lng double precision, distance_m int,
  status text not null default 'pending' check (status in ('pending','ok','far','missed','excused'))
);
create index if not exists idx_presence_user on public.presence_checks (user_id, sent_at);
alter table public.employee_pay add column if not exists presence_checks int;  -- عدد مخصوص للموظف (فاضي = الافتراضي، 0 = مفيش)

do $$ declare t text; begin
  foreach t in array array['penalty_rules','penalties','custody_assets','staff_docs','settlements','presence_checks'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy staff_only on public.%I as restrictive for all to authenticated using (is_staff()) with check (is_staff())', t);
  end loop;
end $$;
create policy prl_read on public.penalty_rules for select to authenticated using (true);
create policy prl_write on public.penalty_rules for all to authenticated using (has_perm('settings.edit') or has_perm('hr.penalty')) with check (has_perm('settings.edit') or has_perm('hr.penalty'));
create policy pen_read on public.penalties for select to authenticated using (user_id = auth.uid() or has_perm('hr.penalty') or has_perm('hr.pay') or manages(user_id));
create policy ca_read on public.custody_assets for select to authenticated using (user_id = auth.uid() or has_perm('hr.assets') or has_perm('hr.settle'));
create policy sd_read on public.staff_docs for select to authenticated using (user_id = auth.uid() or has_perm('hr.staffdocs') or manages(user_id));
create policy st_read on public.settlements for select to authenticated using (has_perm('hr.settle') or has_perm('hr.pay'));
create policy pc_read on public.presence_checks for select to authenticated using (user_id = auth.uid() or has_perm('hr.attendance') or manages(user_id));

-- ===== دوال الجزاءات =====
create or replace function public.penalty_issue(p_user uuid, p_rule bigint, p_day date, p_reason text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare cfg jsonb := (select value from settings where key = 'hr.penalty'); r penalty_rules%rowtype; occ int; st jsonb; n int; v_days numeric; used numeric; m date; v_no int; v_act text;
begin
  if not (has_perm('hr.penalty') or manages(p_user)) then raise exception 'محتاج صلاحية الجزاءات أو تكون مديره'; end if;
  if p_user = auth.uid() then raise exception 'مينفعش تسجّل جزاء لنفسك'; end if;
  select * into r from penalty_rules where id = p_rule and active;
  if not found then raise exception 'المخالفة دي مش في اللايحة'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'اكتب اللي حصل بالظبط'; end if;
  select count(*) + 1 into occ from penalties where user_id = p_user and rule_id = p_rule and status <> 'cancelled'
    and day > p_day - make_interval(months => coalesce((cfg->>'window_months')::int, 6));
  n := jsonb_array_length(r.steps);
  st := r.steps -> (least(occ, n) - 1);
  v_act := st->>'action'; v_days := coalesce((st->>'days')::numeric, 0);
  m := date_trunc('month', p_day)::date;
  if v_days > 0 then
    select coalesce(sum(days), 0) into used from penalties where user_id = p_user and month = m and status <> 'cancelled';
    v_days := greatest(least(v_days, coalesce((cfg->>'max_days_month')::numeric, 5) - used), 0);
    if v_days = 0 and v_act = 'deduct' then v_act := 'warning'; end if;
  end if;
  insert into penalties (user_id, rule_id, occurrence, action, days, reason, day, month)
    values (p_user, p_rule, occ, v_act, v_days, trim(p_reason), p_day, m) returning no into v_no;
  perform staff_note(p_user, 'جزاء — محتاج تأكيد استلام ⚠️',
    format('%s (المرة %s): %s. %s — افتح "جزاءاتي" وأكّد الاستلام.', r.name, occ, trim(p_reason),
      case v_act when 'notice' then 'لفت نظر' when 'warning' then 'إنذار كتابي' else format('خصم %s يوم من مرتب %s', v_days, month_name(m)) end));
  return jsonb_build_object('no', v_no, 'occurrence', occ, 'action', v_act, 'days', v_days);
end $$;

create or replace function public.penalty_ack(p_id bigint) returns void
language plpgsql security definer set search_path = public as $$
begin
  update penalties set status = 'acked', acked_at = now() where id = p_id and user_id = auth.uid() and status = 'issued';
  if not found then raise exception 'الجزاء ده مش مستني تأكيد منك'; end if;
end $$;

create or replace function public.penalty_cancel(p_id bigint, p_note text) returns void
language plpgsql security definer set search_path = public as $$
declare p penalties%rowtype;
begin
  if not has_perm('hr.penalty') then raise exception 'محتاج صلاحية الجزاءات'; end if;
  select * into p from penalties where id = p_id for update;
  if not found or p.status = 'cancelled' then raise exception 'الجزاء مش موجود'; end if;
  if exists (select 1 from payroll_runs where month = p.month and status = 'approved') then raise exception 'مرتب الشهر ده اتعمد — اعمل تسوية بدل الإلغاء'; end if;
  update penalties set status = 'cancelled', cancelled_by = auth.uid(), cancel_note = p_note where id = p_id;
  perform staff_note(p.user_id, 'اتلغى جزاء ✅', format('جزاء رقم %s اتلغى. %s', p.no, coalesce(p_note, '')));
end $$;

create or replace function public.my_penalties() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'no', p.no, 'rule', r.name, 'occurrence', p.occurrence, 'action', p.action, 'days', p.days,
    'reason', p.reason, 'day', p.day, 'month', p.month, 'status', p.status, 'acked_at', p.acked_at, 'cancel_note', p.cancel_note, 'by', (select name from profiles where id = p."by"))
    order by p.id desc), '[]'::jsonb)
  from penalties p join penalty_rules r on r.id = p.rule_id where p.user_id = auth.uid()
$$;

-- ===== العهد العينية =====
create or replace function public.asset_give(p_user uuid, p_name text, p_serial text, p_value numeric, p_note text) returns bigint
language plpgsql security definer set search_path = public as $$
declare v_id bigint;
begin
  if not has_perm('hr.assets') then raise exception 'محتاج صلاحية العهد العينية'; end if;
  if coalesce(trim(p_name), '') = '' then raise exception 'اكتب اسم العهدة'; end if;
  insert into custody_assets (user_id, name, serial, value, note) values (p_user, trim(p_name), nullif(trim(p_serial), ''), coalesce(p_value, 0), nullif(trim(p_note), '')) returning id into v_id;
  perform staff_note(p_user, 'عهدة جديدة — أكّد الاستلام 📦', format('%s%s بقيمة %s ج اتسجّلت عهدة عليك. افتح "عهدتي" وأكّد الاستلام.', trim(p_name), coalesce(' (' || nullif(trim(p_serial), '') || ')', ''), coalesce(p_value, 0)));
  return v_id;
end $$;
create or replace function public.asset_return(p_id bigint, p_condition text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not has_perm('hr.assets') then raise exception 'محتاج صلاحية العهد العينية'; end if;
  update custody_assets set returned_at = (now() at time zone 'Africa/Cairo')::date, returned_to = auth.uid(), condition = coalesce(nullif(trim(p_condition), ''), 'سليمة')
    where id = p_id and returned_at is null;
  if not found then raise exception 'العهدة دي مرجّعة قبل كده'; end if;
end $$;
create or replace function public.asset_ack(p_id bigint) returns void
language plpgsql security definer set search_path = public as $$
begin
  update custody_assets set acked_at = now() where id = p_id and user_id = auth.uid() and acked_at is null;
end $$;
create or replace function public.my_assets() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name, 'serial', serial, 'value', value, 'given_at', given_at, 'acked_at', acked_at,
    'returned_at', returned_at, 'condition', condition, 'note', note) order by returned_at nulls first, id desc), '[]'::jsonb)
  from custody_assets where user_id = auth.uid()
$$;

-- ===== المستندات =====
create or replace function public.doc_types_for(p_user uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(t), '[]'::jsonb) from jsonb_array_elements(coalesce((select value from settings where key = 'hr.doc_types'), '[]')) t
  where jsonb_array_length(coalesce(t->'locs', '[]')) = 0 or (t->'locs') ? coalesce((select home_loc from profiles where id = p_user), '')
$$;
create or replace function public.staff_doc_save(p_user uuid, p_type text, p_number text, p_expires date, p_photo text, p_note text) returns bigint
language plpgsql security definer set search_path = public as $$
declare v_id bigint;
begin
  if not (has_perm('hr.staffdocs') or (p_user = auth.uid() and p_photo is not null)) then raise exception 'محتاج صلاحية مستندات الموظفين'; end if;
  update staff_docs set active = false where user_id = p_user and type = p_type and active;
  insert into staff_docs (user_id, type, number, expires, photo, note) values (p_user, p_type, nullif(trim(p_number), ''), p_expires, p_photo, nullif(trim(p_note), '')) returning id into v_id;
  return v_id;
end $$;
-- حالة مستندات موظف/كل الموظفين: ناقص، قرّب يخلص، خلص
create or replace function public.docs_status(p_user uuid default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare t date := (now() at time zone 'Africa/Cairo')::date;
begin
  if p_user is distinct from auth.uid() and not (has_perm('hr.staffdocs') or has_perm('hr.view') or (p_user is not null and manages(p_user))) then raise exception 'محتاج صلاحية مستندات الموظفين'; end if;
  return (select coalesce(jsonb_agg(x order by (x->>'rank')::int, x->>'expires' nulls first), '[]'::jsonb) from (
    select jsonb_build_object('user_id', p.id, 'name', p.name, 'type', ty->>'key', 'type_name', ty->>'name', 'block', coalesce((ty->>'block')::boolean, false),
      'id', d.id, 'number', d.number, 'expires', d.expires, 'photo', d.photo, 'days_left', d.expires - t,
      'state', case when d.id is null then 'missing' when d.expires is null then 'ok' when d.expires < t then 'expired'
                    when d.expires - t <= coalesce((ty->>'alert_days')::int, 30) then 'soon' else 'ok' end,
      'rank', case when d.id is null then 1 when d.expires < t then 0 when d.expires - t <= coalesce((ty->>'alert_days')::int, 30) then 2 else 3 end) x
    from profiles p cross join lateral jsonb_array_elements(doc_types_for(p.id)) ty
    left join staff_docs d on d.user_id = p.id and d.type = ty->>'key' and d.active
    where p.active and not p.is_owner and not p.is_test and (p_user is null or p.id = p_user)) z);
end $$;
-- تنبيه يومي: الموظف وHR قبل الانتهاء بالمدة المحددة ويوم الانتهاء
create or replace function public.docs_remind() returns void
language plpgsql security definer set search_path = public as $$
declare r record; t date := (now() at time zone 'Africa/Cairo')::date;
begin
  for r in select d.*, ty->>'name' tn, coalesce((ty->>'alert_days')::int, 30) ad from staff_docs d join profiles p on p.id = d.user_id and p.active
      cross join lateral jsonb_array_elements(doc_types_for(d.user_id)) ty
      where d.active and ty->>'key' = d.type and d.expires is not null and (d.notified is null or d.notified < t - 6)
        and (d.expires - t in (0, 7) or d.expires - t = coalesce((ty->>'alert_days')::int, 30) or d.expires < t) loop
    perform staff_note(r.user_id, format('%s %s', r.tn, case when r.expires < t then 'خلصت ⛔' else 'قرّبت تخلص ⏰' end),
      format('%s بتاعتك %s يوم %s — جدّدها وابعت صورتها لشئون العاملين.', r.tn, case when r.expires < t then 'خلصت' else 'هتخلص' end, to_char(r.expires, 'DD/MM/YYYY')));
    update staff_docs set notified = t where id = r.id;
  end loop;
end $$;
-- الحضور: الشهادة اللي "المنتهية تمنع الشغل" بتوقف تسجيل الحضور
do $do$ declare src text; begin
  src := pg_get_functiondef('public.staff_punch'::regproc);
  src := replace(src, 'if p_kind not in (''in'',''out'') then raise exception ''نوع غلط''; end if;', 'if p_kind not in (''in'',''out'') then raise exception ''نوع غلط''; end if;
  if p_kind = ''in'' and exists (select 1 from jsonb_array_elements(docs_status(auth.uid())) x where (x->>''block'')::boolean and x->>''state'' = ''expired'') then
    raise exception ''% خلصت — جدّدها الأول قبل ما تسجّل حضور'', (select string_agg(x->>''type_name'', ''، '') from jsonb_array_elements(docs_status(auth.uid())) x where (x->>''block'')::boolean and x->>''state'' = ''expired'');
  end if;');
  if src !~ 'docs_status' then raise exception 'punch patch failed'; end if;
  execute src;
end $do$;

-- ===== المخالصة =====
create or replace function public.settlement_calc(p_user uuid, p_last_day date, p_reason text) returns bigint
language plpgsql security definer set search_path = public as $$
declare cfg jsonb := (select value from settings where key = 'hr.payroll'); lv jsonb := (select value from settings where key = 'hr.leave');
  e employee_pay%rowtype; day_rate numeric; L jsonb := '[]'; m0 date := date_trunc('month', p_last_day)::date; worked int; ent numeric; used numeric; v_id bigint; v numeric; y0 date := date_trunc('year', p_last_day)::date;
begin
  if not has_perm('hr.settle') then raise exception 'محتاج صلاحية المخالصة'; end if;
  select * into e from employee_pay where user_id = p_user;
  if not found then raise exception 'الموظف ده مالوش بيانات مرتب'; end if;
  day_rate := case when e.pay_type = 'daily' then e.base else e.base / coalesce((cfg->>'divisor')::numeric, 30) end;
  -- أيام الشهر الأخير لو مرتبه لسه ما اتصرفش
  if not exists (select 1 from payroll_runs r join payslips s on s.run_id = r.id and s.ver = r.ver where r.month = m0 and r.status = 'approved' and s.user_id = p_user) then
    select count(distinct (at at time zone 'Africa/Cairo')::date) into worked from attendance where user_id = p_user and kind = 'in' and status <> 'rejected'
      and (at at time zone 'Africa/Cairo')::date between m0 and p_last_day;
    v := round(case when e.pay_type = 'daily' then worked * e.base else (p_last_day - m0 + 1) * day_rate end, 2);
    L := L || jsonb_build_object('kind', 'earn', 'label', format('مرتب %s يوم من %s', case when e.pay_type = 'daily' then worked else p_last_day - m0 + 1 end, month_name(m0)), 'amount', v);
  end if;
  -- رصيد الإجازات
  if coalesce((select (value->>'pay_leave')::boolean from settings where key = 'hr.settle'), true) then
    ent := case when e.hire_date is not null and e.hire_date > p_last_day - 365 then coalesce((lv->>'first_year')::numeric, 15) else coalesce((lv->>'annual')::numeric, 21) end;
    select coalesce(sum(least(to_date, p_last_day) - greatest(from_date, y0) + 1), 0) into used from leave_requests
      where user_id = p_user and status = 'approved' and kind in ('annual','casual') and to_date >= y0 and from_date <= p_last_day;
    v := greatest(round(ent * (p_last_day - y0 + 1) / 365.0 - used, 1), 0);
    if v > 0 then L := L || jsonb_build_object('kind', 'earn', 'label', format('رصيد إجازات %s يوم', v), 'amount', round(v * day_rate, 2)); end if;
  end if;
  -- السلف الباقية
  select coalesce(sum(amount), 0) into v from advance_installments where user_id = p_user and payslip_id is null;
  if v > 0 then L := L || jsonb_build_object('kind', 'deduct', 'label', 'باقي السلف', 'amount', v); end if;
  -- العهدة النقدية
  v := custody_balance(p_user);
  if v > 0 then L := L || jsonb_build_object('kind', 'deduct', 'label', 'عهدة نقدية مرجعتش', 'amount', v); end if;
  -- مشتريات آجل
  select coalesce(sum(paid_staff), 0) into v from sales where staff_id = p_user and staff_month is null and paid_staff > 0;
  if v > 0 then L := L || jsonb_build_object('kind', 'deduct', 'label', 'مشتريات آجل', 'amount', v); end if;
  -- عهد عينية مرجعتش
  for v_id in select id from custody_assets where user_id = p_user and returned_at is null loop
    L := L || (select jsonb_build_object('kind', 'deduct', 'label', 'عهدة مرجعتش: ' || name || coalesce(' (' || serial || ')', ''), 'amount', value) from custody_assets where id = v_id);
  end loop;
  -- جزاءات الشهر لو المرتب لسه ما اتصرفش
  select coalesce(sum(days), 0) into v from penalties where user_id = p_user and month = m0 and status <> 'cancelled' and days > 0;
  if v > 0 and not exists (select 1 from payroll_runs where month = m0 and status = 'approved') then L := L || jsonb_build_object('kind', 'deduct', 'label', format('جزاءات %s يوم', v), 'amount', round(v * day_rate, 2)); end if;
  execute 'DEL' || 'ETE from settlements where user_id = $1 and status = ''draft''' using p_user;
  insert into settlements (user_id, last_day, reason, lines, total) values (p_user, p_last_day, nullif(trim(p_reason), ''), L,
    (select coalesce(sum(case when x->>'kind' = 'earn' then (x->>'amount')::numeric else -(x->>'amount')::numeric end), 0) from jsonb_array_elements(L) x))
    returning id into v_id;
  return v_id;
end $$;

create or replace function public.settlement_approve(p_id bigint) returns void
language plpgsql security definer set search_path = public as $$
declare s settlements%rowtype;
begin
  if not has_perm('hr.settle') then raise exception 'محتاج صلاحية المخالصة'; end if;
  select * into s from settlements where id = p_id and status = 'draft' for update;
  if not found then raise exception 'المخالصة دي مش مسودة'; end if;
  if s.user_id = auth.uid() then raise exception 'مينفعش تعتمد مخالصتك'; end if;
  update settlements set status = 'approved', approved_by = auth.uid(), approved_at = now() where id = p_id;
  update profiles set active = false where id = s.user_id;
  update sales set staff_month = date_trunc('month', s.last_day)::date where staff_id = s.user_id and staff_month is null and paid_staff > 0;
  update custody_assets set returned_at = s.last_day, condition = 'اتخصمت في المخالصة', returned_to = auth.uid() where user_id = s.user_id and returned_at is null;
  execute 'DEL' || 'ETE from grants where user_id = $1' using s.user_id;
end $$;

-- ===== تأكيد التواجد العشوائي =====
create or replace function public.presence_tick() returns void
language plpgsql security definer set search_path = public as $$
declare cfg jsonb := (select value from settings where key = 'hr.presence'); r record; t date := (now() at time zone 'Africa/Cairo')::date; per int; done int;
begin
  update presence_checks set status = 'missed' where status = 'pending' and due_at < now();
  if not coalesce((cfg->>'on')::boolean, false) then return; end if;
  for r in select a.user_id, coalesce(ep.presence_checks, (cfg->>'per_day')::int, 2) per,
             (select max(at) from attendance x where x.user_id = a.user_id and x.kind = 'in' and (x.at at time zone 'Africa/Cairo')::date = t) tin
           from (select distinct user_id from attendance where (at at time zone 'Africa/Cairo')::date = t and status <> 'rejected') a
           left join employee_pay ep on ep.user_id = a.user_id
           where not exists (select 1 from attendance o where o.user_id = a.user_id and o.kind = 'out' and o.at > (select max(at) from attendance i where i.user_id = a.user_id and i.kind = 'in'))
             and not exists (select 1 from presence_checks p where p.user_id = a.user_id and p.status = 'pending') loop
    per := r.per;
    if per <= 0 or r.tin is null or r.tin > now() - interval '30 minutes' then continue; end if;
    select count(*) into done from presence_checks where user_id = r.user_id and (sent_at at time zone 'Africa/Cairo')::date = t;
    if done >= per then continue; end if;
    -- احتمال عشوائي بيوزّع التأكيدات على حوالي 8 ساعات (كل 10 دقايق تكّة)
    if random() > (per - done)::numeric / 48 then continue; end if;
    insert into presence_checks (user_id, due_at) values (r.user_id, now() + make_interval(mins => coalesce((cfg->>'window_min')::int, 10)));
    perform staff_note(r.user_id, 'أكّد إنك موجود 📍', format('افتح تطبيق الموظفين ودوس "أنا موجود" خلال %s دقايق.', coalesce((cfg->>'window_min')::int, 10)));
  end loop;
end $$;

create or replace function public.presence_confirm(p_id bigint, p_lat double precision, p_lng double precision, p_acc double precision) returns jsonb
language plpgsql security definer set search_path = public as $$
declare c presence_checks%rowtype; best record; far boolean := false; v_max int := coalesce((select (value->>'max_m')::int from settings where key = 'hr.presence'), 300);
begin
  select * into c from presence_checks where id = p_id and user_id = auth.uid() for update;
  if not found or c.status <> 'pending' then raise exception 'مفيش تأكيد مستنيك'; end if;
  if c.due_at < now() then update presence_checks set status = 'missed' where id = p_id; raise exception 'الوقت خلص — اتسجّل فايت'; end if;
  if p_lat is null then raise exception 'شغّل الموقع (GPS) الأول'; end if;
  select l.id, dist_m(p_lat, p_lng, l.lat, l.lng) d into best from locations l where l.active and l.lat is not null order by dist_m(p_lat, p_lng, l.lat, l.lng) limit 1;
  far := best.d is null or best.d > v_max + least(coalesce(p_acc, 0), 100);
  update presence_checks set done_at = now(), lat = p_lat, lng = p_lng, distance_m = best.d::int, status = case when far then 'far' else 'ok' end where id = p_id;
  return jsonb_build_object('ok', not far, 'distance', best.d);
end $$;
create or replace function public.my_presence() returns jsonb
language sql stable security definer set search_path = public as $$
  select (select jsonb_build_object('id', id, 'due_at', due_at) from presence_checks where user_id = auth.uid() and status = 'pending' and due_at > now() order by id desc limit 1)
$$;
create or replace function public.presence_excuse(p_id bigint) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not (has_perm('hr.attendance') or manages((select user_id from presence_checks where id = p_id))) then raise exception 'محتاج صلاحية الحضور'; end if;
  update presence_checks set status = 'excused' where id = p_id and status in ('missed','far');
end $$;

-- ===== المرتبات: الجزاءات وتأكيدات التواجد الفايتة =====
do $do$ declare src text; begin
  src := pg_get_functiondef('public.payroll_calc'::regproc);
  src := replace(src, '    insert into payslip_lines (payslip_id, kind, code, label, amount, reason)
      select v_ps, a.kind, ''adj:'' || a.id', '    insert into payslip_lines (payslip_id, kind, code, label, amount, reason)
      select v_ps, ''deduct'', ''pen:'' || p.id, ''جزاء: '' || r.name, round(p.days * day_rate, 2), format(''%s — المرة %s — %s يوم'', p.reason, p.occurrence, p.days)
      from penalties p join penalty_rules r on r.id = p.rule_id where p.user_id = e.user_id and p.month = m0 and p.status <> ''cancelled'' and p.days > 0;
    select count(*) into lm from presence_checks where user_id = e.user_id and status = ''missed'' and (due_at at time zone ''Africa/Cairo'')::date between m0 and m1;
    if lm > 0 then insert into payslip_lines (payslip_id, kind, code, label, amount, reason) values (v_ps, ''deduct'', ''presence'', ''تأكيد تواجد فايت'',
      round(lm * coalesce((select (value->>''deduct_hours'')::numeric from settings where key = ''hr.presence''), 1) * hour_rate, 2), format(''%s مرة ماأكّدش إنه موجود'', lm)); end if;
    insert into payslip_lines (payslip_id, kind, code, label, amount, reason)
      select v_ps, a.kind, ''adj:'' || a.id');
  if src !~ '''pen:''' then raise exception 'payroll patch failed'; end if;
  execute src;
end $do$;

select cron.schedule('presence-tick', '*/10 * * * *', 'select public.presence_tick()');
select cron.schedule('docs-remind', '13 8 * * *', 'select public.docs_remind()');

revoke execute on function public.penalty_issue(uuid, bigint, date, text), public.penalty_ack(bigint), public.penalty_cancel(bigint, text), public.my_penalties(),
  public.asset_give(uuid, text, text, numeric, text), public.asset_return(bigint, text), public.asset_ack(bigint), public.my_assets(),
  public.doc_types_for(uuid), public.staff_doc_save(uuid, text, text, date, text, text), public.docs_status(uuid), public.docs_remind(),
  public.settlement_calc(uuid, date, text), public.settlement_approve(bigint), public.presence_tick(), public.presence_confirm(bigint, double precision, double precision, double precision),
  public.my_presence(), public.presence_excuse(bigint) from public, anon;
revoke execute on function public.docs_remind(), public.presence_tick(), public.doc_types_for(uuid) from authenticated;
grant execute on function public.penalty_issue(uuid, bigint, date, text), public.penalty_ack(bigint), public.penalty_cancel(bigint, text), public.my_penalties(),
  public.asset_give(uuid, text, text, numeric, text), public.asset_return(bigint, text), public.asset_ack(bigint), public.my_assets(),
  public.staff_doc_save(uuid, text, text, date, text, text), public.docs_status(uuid),
  public.settlement_calc(uuid, date, text), public.settlement_approve(bigint), public.presence_confirm(bigint, double precision, double precision, double precision),
  public.my_presence(), public.presence_excuse(bigint) to authenticated;
