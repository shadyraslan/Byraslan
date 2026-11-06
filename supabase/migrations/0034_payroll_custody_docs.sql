-- ============ 0034 خدمة الموظف: العهدة، المرتبات (حساب لوحده من الحضور واللايحة)، الاعتراض على بند، السلف بأقساط، طلب الأوراق والشهادات ============
-- الربط: الحضور + الإجازات + السلف + عجز العهدة + المكافآت والخصومات ← المرتب. الاعتماد ← مصروف "مرتبات" على مكان كل موظف + قفل الأقساط والعجز + إشعار.
-- الاعتراض المقبول ← تسوية في الشهر اللي بعده. مصروف العهدة المعتمد ← المصروفات على مكانه. شهادة المرتب ← من آخر مرتب معتمد + كود تحقق عام.

insert into public.permissions (id, grp, label) values
  ('col.adv','الحسابات','إعطاء عهدة لأي حد في الشركة (بحد مبلغ)'),
  ('col.approve','الحسابات','الموافقة على مصروف العهدة واستلام باقيها (بحد مبلغ)'),
  ('hr.docs','الموارد البشرية','طلبات الأوراق والشهادات للموظفين')
on conflict do nothing;

insert into public.settings (key, value) values
  ('hr.payroll', '{"divisor":30,"day_hours":8,"grace_min":15,
    "late_tiers":[{"from":16,"to":30,"days":0.25},{"from":31,"to":60,"days":0.5},{"from":61,"to":1440,"days":1}],
    "absence_days":1,"ot_rate":1.35,"ot_min":30,"ins_pct":11,
    "tax_exempt":20000,"tax_brackets":[[40000,0],[55000,10],[70000,15],[200000,20],[400000,22.5],[1200000,25],[null,27.5]],
    "tax_lose":[[600000,1],[700000,2],[800000,3],[900000,4],[1200000,5]],
    "shortage_to_payroll":true}'),
  ('hr.leave', '{"annual":21,"first_year":15,"casual":7,"sick_pay_pct":75}'),
  ('hr.custody', '{"spend_limit":150}'),
  ('hr.advance', '{"max_salaries":1,"max_installments":6}')
on conflict do nothing;

-- بيانات القبض لكل موظف (جدول منفصل عشان المرتب مايبانش لباقي الموظفين)
create table public.employee_pay (
  user_id uuid primary key references public.profiles,
  pay_type text not null default 'monthly' check (pay_type in ('monthly','daily')),
  base numeric not null default 0,          -- شهري: المرتب · يومية: سعر اليوم
  allowances numeric not null default 0,    -- بدلات شهرية ثابتة
  insurance_wage numeric not null default 0,-- أجر التأمينات
  shift_start time not null default '09:00',
  rest_day int not null default 5 check (rest_day between 0 and 6), -- 0 الحد … 5 الجمعة
  hire_date date not null default current_date,
  custody_max numeric,                      -- أقصى عهدة (اختياري)
  updated_at timestamptz not null default now()
);

alter table public.leave_requests add column if not exists installments int not null default 1;
alter table public.leave_requests add column if not exists first_month date;

create table public.advance_installments (
  id bigint generated always as identity primary key,
  request_id bigint not null references public.leave_requests,
  user_id uuid not null references public.profiles,
  month date not null,
  amount numeric not null,
  payslip_id bigint
);

create table public.payroll_runs (
  id bigint generated always as identity primary key,
  month date not null unique,
  status text not null default 'draft' check (status in ('draft','sent','approved')),
  ver int not null default 0,
  calc_at timestamptz, calc_by uuid,
  sent_by uuid, sent_at timestamptz,
  approved_by uuid, approved_at timestamptz,
  note text
);
create table public.payslips (
  id bigint generated always as identity primary key,
  run_id bigint not null references public.payroll_runs,
  ver int not null,
  user_id uuid not null references public.profiles,
  location_id text references public.locations,
  gross numeric not null default 0,
  deductions numeric not null default 0,
  net numeric not null default 0,
  summary jsonb not null default '{}',
  received_at timestamptz,
  unique (run_id, ver, user_id)
);
create table public.payslip_lines (
  id bigint generated always as identity primary key,
  payslip_id bigint not null references public.payslips,
  kind text not null check (kind in ('earn','deduct')),
  code text not null,
  label text not null,
  amount numeric not null,
  reason text
);
create table public.payroll_adjustments (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles,
  month date not null,
  kind text not null check (kind in ('earn','deduct')),
  label text not null,
  amount numeric not null check (amount > 0),
  reason text not null,
  source text not null default 'manual' check (source in ('manual','dispute','penalty','performance')),
  ref_id bigint,
  cancelled boolean not null default false,
  payslip_id bigint,
  by uuid not null default auth.uid(),
  at timestamptz not null default now()
);
create table public.payslip_disputes (
  id bigint generated always as identity primary key,
  payslip_id bigint not null references public.payslips,
  line_id bigint references public.payslip_lines,
  user_id uuid not null default auth.uid() references public.profiles,
  text text not null,
  status text not null default 'open' check (status in ('open','accepted','rejected')),
  amount numeric,
  reply text,
  decided_by uuid, decided_at timestamptz,
  at timestamptz not null default now()
);

-- العهدة: إعطاء / صرف / تسليم الباقي / عجز
create table public.custody_moves (
  id bigint generated always as identity primary key,
  no bigint generated always as identity (start with 4001),
  user_id uuid not null references public.profiles,
  kind text not null check (kind in ('give','spend','return','shortage')),
  amount numeric not null check (amount > 0),
  category_id bigint references public.expense_categories,
  location_id text references public.locations,
  note text,
  photo text,
  status text not null default 'ok' check (status in ('ok','pending','rejected')),
  received numeric,               -- تسليم الباقي: المبلغ اللي المستلم أكّده
  expense_id bigint,
  payroll_month date,             -- العجز اتخصم في مرتب الشهر ده
  by uuid not null default auth.uid(),
  at timestamptz not null default now(),
  decided_by uuid, decided_at timestamptz, decision_note text
);
alter table public.expenses add column if not exists custody_move_id bigint;
alter table public.expenses add column if not exists payroll_run_id bigint;

-- طلبات الأوراق
create table public.doc_requests (
  id bigint generated always as identity primary key,
  no bigint generated always as identity (start with 3001),
  user_id uuid not null default auth.uid() references public.profiles,
  kind text not null check (kind in ('salary_cert','employment_cert','salary_details','insurance','experience','other')),
  addressed_to text,
  purpose text,
  note text,
  status text not null default 'pending' check (status in ('pending','ready','delivered','rejected')),
  reply text,
  file text,
  code text not null unique default substr(md5(random()::text || clock_timestamp()::text), 1, 12),
  issued jsonb,
  at timestamptz not null default now(),
  decided_by uuid, decided_at timestamptz
);

do $$ declare t text; begin
  foreach t in array array['employee_pay','advance_installments','payroll_runs','payslips','payslip_lines','payroll_adjustments','payslip_disputes','custody_moves','doc_requests'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy staff_only on public.%I as restrictive for all to authenticated using (public.is_staff()) with check (public.is_staff())', t);
  end loop;
end $$;
create policy ep_read on public.employee_pay for select to authenticated using (user_id = auth.uid() or has_perm('hr.pay') or has_perm('hr.view'));
create policy ep_write on public.employee_pay for all to authenticated using (has_perm('hr.pay')) with check (has_perm('hr.pay'));
create policy ai_read on public.advance_installments for select to authenticated using (user_id = auth.uid() or has_perm('hr.pay') or has_perm('hr.leaves'));
create policy pr_read on public.payroll_runs for select to authenticated using (has_perm('hr.pay') or has_perm('hr.view'));
create policy ps_read on public.payslips for select to authenticated using (has_perm('hr.pay') or has_perm('hr.view'));
create policy pl_read on public.payslip_lines for select to authenticated using (has_perm('hr.pay') or has_perm('hr.view'));
create policy pa_read on public.payroll_adjustments for select to authenticated using (has_perm('hr.pay') or has_perm('hr.view'));
create policy pd_read on public.payslip_disputes for select to authenticated using (user_id = auth.uid() or has_perm('hr.pay'));
create policy cm_read on public.custody_moves for select to authenticated using (user_id = auth.uid() or has_perm('col.adv') or has_perm('col.approve') or has_perm('acc.view'));
create policy dr_read on public.doc_requests for select to authenticated using (user_id = auth.uid() or has_perm('hr.docs'));
-- الإدارة بترفع الورقة الجاهزة في فولدر الموظف، واللي بيوافق على العهدة بيشوف صورة الفاتورة
create policy hr_ins_docs on storage.objects for insert to authenticated with check (bucket_id = 'hr' and has_perm('hr.docs'));
create policy hr_read2 on storage.objects for select to authenticated using (bucket_id = 'hr' and (has_perm('hr.docs') or has_perm('col.approve') or has_perm('acc.view')));

create trigger audit_employee_pay after insert or update or delete on public.employee_pay for each row execute function public.audit();
create trigger audit_payroll_adjustments after insert or update or delete on public.payroll_adjustments for each row execute function public.audit();
create trigger audit_custody_moves after insert or update or delete on public.custody_moves for each row execute function public.audit();
create trigger audit_payroll_runs after insert or update or delete on public.payroll_runs for each row execute function public.audit();

-- رسالة لموظف واحد (بتوصل إشعار وبتظهر في رسايله)
create or replace function public.staff_note(p_user uuid, p_title text, p_body text) returns void
language sql security definer set search_path = public as $$
  insert into staff_messages (title, body, target, user_id) values (p_title, p_body, 'user', p_user)
$$;
revoke execute on function public.staff_note(uuid, text, text) from anon, public, authenticated;

create or replace function public.month_name(m date) returns text language sql immutable as $$
  select (array['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'])[extract(month from m)::int] || ' ' || extract(year from m)::int
$$;

-- ================= العهدة =================
create or replace function public.custody_balance(p_user uuid) returns numeric
language sql stable security definer set search_path = public as $$
  select coalesce(sum(case when kind = 'give' then amount when kind = 'spend' then -amount when kind = 'return' then -coalesce(received, amount) when kind = 'shortage' then -amount end), 0)
  from custody_moves where user_id = p_user and (status = 'ok' or (kind = 'spend' and status = 'pending'))
$$;

create or replace function public.custody_give(p_user uuid, p_amount numeric, p_note text) returns bigint
language plpgsql security definer set search_path = public as $$
declare lim numeric := perm_limit('col.adv'); mx numeric; v_no bigint;
begin
  if not is_staff() or lim = -1 then raise exception 'محتاج صلاحية إعطاء العهدة'; end if;
  if coalesce(p_amount, 0) <= 0 then raise exception 'اكتب المبلغ'; end if;
  if lim is not null and p_amount > lim then raise exception 'المبلغ أكبر من حدّك (% ج)', lim; end if;
  select custody_max into mx from employee_pay where user_id = p_user;
  if mx is not null and custody_balance(p_user) + p_amount > mx and perm_limit('col.approve') = -1 then
    raise exception 'كده عهدته هتعدّي الحد بتاعه (% ج) — محتاج صلاحية الموافقة على العهد', mx; end if;
  insert into custody_moves (user_id, kind, amount, note) values (p_user, 'give', p_amount, nullif(trim(p_note), '')) returning no into v_no;
  perform staff_note(p_user, 'استلمت عهدة', format('اتسجّل عليك عهدة %s ج. معاك دلوقتي %s ج.', p_amount, custody_balance(p_user)));
  return v_no;
end $$;

-- المصروف المعتمد بيتسجّل في المصروفات على مكانه
create or replace function public.custody_post_expense(p_id bigint) returns void
language plpgsql security definer set search_path = public as $$
declare m custody_moves%rowtype; v_e bigint;
begin
  select * into m from custody_moves where id = p_id;
  insert into expenses (day, location_id, category_id, amount, paid_from, note, photo, status, by, custody_move_id)
    values ((m.at at time zone 'Africa/Cairo')::date, coalesce(m.location_id, 'main'), m.category_id, m.amount, 'cash',
            'من عهدة ' || (select name from profiles where id = m.user_id) || coalesce(' — ' || m.note, ''), m.photo, 'ok', m.user_id, m.id)
    returning id into v_e;
  update custody_moves set expense_id = v_e where id = p_id;
end $$;
revoke execute on function public.custody_post_expense(bigint) from anon, public, authenticated;

create or replace function public.custody_spend(p_amount numeric, p_cat bigint, p_loc text, p_note text, p_photo text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare lim numeric := coalesce((select (value->>'spend_limit')::numeric from settings where key = 'hr.custody'), 150); st text := 'ok'; v_id bigint; v_no bigint;
begin
  if not is_staff() then raise exception 'الحساب ده مش شغال'; end if;
  if coalesce(p_amount, 0) <= 0 then raise exception 'اكتب المبلغ'; end if;
  if p_cat is null then raise exception 'اختار نوع المصروف'; end if;
  if coalesce(p_photo, '') = '' then raise exception 'صوّر الفاتورة أو الإيصال'; end if;
  if p_amount > lim then st := 'pending'; end if;
  insert into custody_moves (user_id, kind, amount, category_id, location_id, note, photo, status)
    values (auth.uid(), 'spend', p_amount, p_cat, coalesce(p_loc, (select home_loc from profiles where id = auth.uid())), nullif(trim(p_note), ''), p_photo, st)
    returning id, no into v_id, v_no;
  if st = 'ok' then perform custody_post_expense(v_id); end if;
  return jsonb_build_object('no', v_no, 'status', st, 'balance', custody_balance(auth.uid()));
end $$;

create or replace function public.custody_decide(p_id bigint, p_ok boolean, p_note text) returns void
language plpgsql security definer set search_path = public as $$
declare m custody_moves%rowtype; lim numeric := perm_limit('col.approve');
begin
  select * into m from custody_moves where id = p_id and kind = 'spend' and status = 'pending' for update;
  if not found then raise exception 'المصروف ده مش مستني موافقة'; end if;
  if not is_staff() or lim = -1 then raise exception 'محتاج صلاحية الموافقة على العهد'; end if;
  if p_ok and lim is not null and m.amount > lim then raise exception 'المبلغ أكبر من حد موافقتك (% ج)', lim; end if;
  update custody_moves set status = case when p_ok then 'ok' else 'rejected' end, decided_by = auth.uid(), decided_at = now(), decision_note = nullif(trim(p_note), '') where id = p_id;
  if p_ok then perform custody_post_expense(p_id); end if;
  perform staff_note(m.user_id, case when p_ok then 'اتوافق على مصروف العهدة' else 'اترفض مصروف العهدة' end,
    format('مصروف رقم %s بمبلغ %s ج%s. معاك دلوقتي %s ج.', m.no, m.amount, coalesce(' — ' || nullif(trim(p_note), ''), ''), custody_balance(m.user_id)));
end $$;

-- الموظف بيسجّل إنه سلّم الباقي، والمستلم بيأكّد المبلغ الفعلي
create or replace function public.custody_return(p_amount numeric, p_note text) returns bigint
language plpgsql security definer set search_path = public as $$
declare v_no bigint;
begin
  if not is_staff() then raise exception 'الحساب ده مش شغال'; end if;
  if coalesce(p_amount, 0) <= 0 then raise exception 'اكتب المبلغ'; end if;
  insert into custody_moves (user_id, kind, amount, note, status) values (auth.uid(), 'return', p_amount, nullif(trim(p_note), ''), 'pending') returning no into v_no;
  return v_no;
end $$;

create or replace function public.custody_confirm_return(p_id bigint, p_received numeric, p_note text) returns void
language plpgsql security definer set search_path = public as $$
declare m custody_moves%rowtype; v_short numeric;
begin
  select * into m from custody_moves where id = p_id and kind = 'return' and status = 'pending' for update;
  if not found then raise exception 'التسليم ده مش مستني تأكيد'; end if;
  if not is_staff() or (perm_limit('col.approve') = -1 and perm_limit('col.adv') = -1) then raise exception 'محتاج صلاحية العهد'; end if;
  if m.user_id = auth.uid() then raise exception 'مينفعش تأكّد تسليم نفسك'; end if;
  if coalesce(p_received, -1) < 0 then raise exception 'اكتب المبلغ اللي استلمته'; end if;
  update custody_moves set status = 'ok', received = p_received, decided_by = auth.uid(), decided_at = now(), decision_note = nullif(trim(p_note), '') where id = p_id;
  v_short := m.amount - p_received;
  if v_short > 0 then
    insert into custody_moves (user_id, kind, amount, note, status, decided_by, decided_at)
      values (m.user_id, 'shortage', v_short, format('عجز في تسليم رقم %s (قال %s واستلمنا %s)', m.no, m.amount, p_received), 'ok', auth.uid(), now());
  end if;
  perform staff_note(m.user_id, 'اتأكّد استلام العهدة',
    format('اتستلم منك %s ج%s. معاك دلوقتي %s ج.', p_received, case when v_short > 0 then format(' — وفيه عجز %s ج', v_short) else '' end, custody_balance(m.user_id)));
end $$;

create or replace function public.my_custody() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('balance', custody_balance(auth.uid()),
    'limit', coalesce((select (value->>'spend_limit')::numeric from settings where key = 'hr.custody'), 150),
    'moves', coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'no', m.no, 'kind', m.kind, 'amount', m.amount, 'received', m.received, 'status', m.status,
        'cat', c.name, 'loc', l.name, 'note', m.note, 'reply', m.decision_note, 'at', m.at, 'payroll_month', m.payroll_month) order by m.id desc)
      from (select * from custody_moves where user_id = auth.uid() order by id desc limit 60) m
      left join expense_categories c on c.id = m.category_id left join locations l on l.id = m.location_id), '[]'::jsonb))
$$;

-- ================= السلف بأقساط =================
create or replace function public.decide_leave(p_id bigint, p_ok boolean, p_note text) returns void
language plpgsql security definer set search_path = public as $$
declare r leave_requests%rowtype; lim numeric := perm_limit('hr.leaves'); cfg jsonb := (select value from settings where key = 'hr.advance');
        v_base numeric; v_n int; v_first date; i int;
begin
  select * into r from leave_requests where id = p_id and status = 'pending';
  if not found then raise exception 'الطلب ده مش مستني'; end if;
  if not is_staff() or lim = -1 then raise exception 'محتاج صلاحية الإجازات والسلف'; end if;
  if p_ok and r.kind = 'advance' then
    if lim is not null and r.amount > lim then raise exception 'السلفة أكبر من حدّك (% ج)', lim; end if;
    select base into v_base from employee_pay where user_id = r.user_id;
    if v_base > 0 and r.amount > v_base * coalesce((cfg->>'max_salaries')::numeric, 1) and not is_owner() then
      raise exception 'السلفة أكبر من % مرتب — محتاجة المالك', coalesce(cfg->>'max_salaries', '1'); end if;
    v_n := greatest(1, least(coalesce(r.installments, 1), coalesce((cfg->>'max_installments')::int, 6)));
    v_first := coalesce(date_trunc('month', r.first_month)::date, (date_trunc('month', now() at time zone 'Africa/Cairo') + interval '1 month')::date);
    for i in 0 .. v_n - 1 loop
      insert into advance_installments (request_id, user_id, month, amount)
        values (r.id, r.user_id, (v_first + make_interval(months => i))::date, round(r.amount / v_n, 2) + case when i = v_n - 1 then r.amount - round(r.amount / v_n, 2) * v_n else 0 end);
    end loop;
  end if;
  update leave_requests set status = case when p_ok then 'approved' else 'rejected' end, decided_by = auth.uid(), decided_at = now(), decision_note = p_note where id = p_id;
  perform staff_note(r.user_id, case when p_ok then 'اتوافق على طلبك' else 'اترفض طلبك' end,
    case when r.kind = 'advance' then format('سلفة %s ج', r.amount) || case when p_ok then format(' على %s قسط', v_n) else '' end
         else format('إجازة من %s لحد %s', r.from_date, r.to_date) end || coalesce(' — ' || nullif(trim(p_note), ''), ''));
end $$;

-- ================= حساب المرتبات =================
create or replace function public.calc_tax_annual(p_taxable numeric, cfg jsonb) returns numeric
language plpgsql immutable as $$
declare b jsonb := cfg->'tax_brackets'; lose int := 0; t numeric := 0; prev numeric := 0; i int; up numeric; rt numeric; x jsonb; inc numeric;
begin
  inc := greatest(0, p_taxable - coalesce((cfg->>'tax_exempt')::numeric, 0));
  -- اللي دخله السنوي عالي بيخسر الشرايح الأقل بالترتيب
  for x in select * from jsonb_array_elements(coalesce(cfg->'tax_lose', '[]')) loop
    if p_taxable > (x->>0)::numeric then lose := (x->>1)::int; end if;
  end loop;
  for i in 0 .. jsonb_array_length(b) - 1 loop
    up := nullif(b->i->>0, '')::numeric;
    rt := (b->(greatest(i, lose))->>1)::numeric;
    if inc > prev then t := t + (least(inc, coalesce(up, inc)) - prev) * rt / 100; end if;
    exit when up is null or inc <= up;
    prev := up;
  end loop;
  return round(t, 2);
end $$;

create or replace function public.payroll_calc(p_month date) returns bigint
language plpgsql security definer set search_path = public as $$
declare cfg jsonb := (select value from settings where key = 'hr.payroll'); lv jsonb := (select value from settings where key = 'hr.leave');
        m0 date := date_trunc('month', p_month)::date; m1 date; upto date; run payroll_runs%rowtype; v_ver int;
        e record; d date; v_ps bigint; day_rate numeric; hour_rate numeric; v_gross numeric; v_ded numeric;
        n_work int; n_present int; n_absent int; n_late int; late_min int; late_days numeric; ot_min int; n_unpaid int; n_sick int; n_prehire int; n_paidleave int;
        fi timestamptz; lo timestamptz; lm int; x jsonb; lr record; v_ins numeric; v_tax numeric; amt numeric;
begin
  if not is_staff() or not has_perm('hr.pay') then raise exception 'محتاج صلاحية المرتبات'; end if;
  m1 := (m0 + interval '1 month' - interval '1 day')::date;
  upto := least(m1, (now() at time zone 'Africa/Cairo')::date);
  if upto < m0 then raise exception 'الشهر ده لسه مابدأش'; end if;
  insert into payroll_runs (month) values (m0) on conflict (month) do nothing;
  select * into run from payroll_runs where month = m0 for update;
  if run.status <> 'draft' then raise exception 'مرتبات الشهر ده اتبعتت للاعتماد — رجّعها مسودة الأول'; end if;
  v_ver := run.ver + 1;
  update payroll_runs set ver = v_ver, calc_at = now(), calc_by = auth.uid() where id = run.id;

  for e in select ep.*, p.home_loc, p.name from employee_pay ep join profiles p on p.id = ep.user_id where p.active and not p.is_test and ep.base > 0 loop
    day_rate := case when e.pay_type = 'daily' then e.base else e.base / coalesce((cfg->>'divisor')::numeric, 30) end;
    hour_rate := day_rate / coalesce((cfg->>'day_hours')::numeric, 8);
    n_work := 0; n_present := 0; n_absent := 0; n_late := 0; late_min := 0; late_days := 0; ot_min := 0; n_unpaid := 0; n_sick := 0; n_prehire := 0; n_paidleave := 0;
    for d in select generate_series(m0, upto, interval '1 day')::date loop
      continue when extract(dow from d) = e.rest_day;
      n_work := n_work + 1;
      if d < e.hire_date then n_prehire := n_prehire + 1; continue; end if;
      select kind into lr from leave_requests where user_id = e.user_id and status = 'approved' and kind <> 'advance' and d between from_date and to_date limit 1;
      if found then
        if lr.kind = 'unpaid' then n_unpaid := n_unpaid + 1; elsif lr.kind = 'sick' then n_sick := n_sick + 1; else n_paidleave := n_paidleave + 1; end if;
        continue;
      end if;
      select min(at) filter (where kind = 'in'), max(at) filter (where kind = 'out') into fi, lo from attendance
        where user_id = e.user_id and status <> 'rejected' and (at at time zone 'Africa/Cairo')::date = d;
      if fi is null then n_absent := n_absent + 1; continue; end if;
      n_present := n_present + 1;
      lm := floor(extract(epoch from ((fi at time zone 'Africa/Cairo')::time - e.shift_start)) / 60);
      if lm > coalesce((cfg->>'grace_min')::int, 15) then
        n_late := n_late + 1; late_min := late_min + lm;
        for x in select * from jsonb_array_elements(coalesce(cfg->'late_tiers', '[]')) loop
          if lm between (x->>'from')::int and (x->>'to')::int then late_days := late_days + (x->>'days')::numeric; end if;
        end loop;
      end if;
      if lo is not null then
        lm := floor(extract(epoch from (lo - fi)) / 60) - coalesce((cfg->>'day_hours')::numeric, 8) * 60;
        if lm >= coalesce((cfg->>'ot_min')::int, 30) then ot_min := ot_min + lm; end if;
      end if;
    end loop;

    insert into payslips (run_id, ver, user_id, location_id, summary) values (run.id, v_ver, e.user_id, e.home_loc,
      jsonb_build_object('work_days', n_work, 'present', n_present, 'absent', n_absent, 'late', n_late, 'late_min', late_min, 'ot_min', ot_min,
        'paid_leave', n_paidleave, 'sick', n_sick, 'unpaid', n_unpaid, 'prehire', n_prehire, 'upto', upto, 'day_rate', round(day_rate, 2), 'pay_type', e.pay_type))
      returning id into v_ps;

    -- الإضافات
    if e.pay_type = 'daily' then
      insert into payslip_lines (payslip_id, kind, code, label, amount, reason) values (v_ps, 'earn', 'base', 'اليوميات', round((n_present + n_paidleave) * e.base, 2), format('%s يوم × %s ج', n_present + n_paidleave, e.base));
    else
      insert into payslip_lines (payslip_id, kind, code, label, amount, reason) values (v_ps, 'earn', 'base', 'المرتب الأساسي', e.base, null);
    end if;
    if e.allowances > 0 then insert into payslip_lines (payslip_id, kind, code, label, amount) values (v_ps, 'earn', 'allow', 'البدلات', e.allowances); end if;
    if ot_min > 0 then
      insert into payslip_lines (payslip_id, kind, code, label, amount, reason) values (v_ps, 'earn', 'ot', 'الإضافي', round(ot_min / 60.0 * hour_rate * coalesce((cfg->>'ot_rate')::numeric, 1.35), 2),
        format('%s ساعة و%s دقيقة × %s', ot_min / 60, ot_min % 60, coalesce(cfg->>'ot_rate', '1.35')));
    end if;
    -- الخصومات من الحضور
    if late_days > 0 then insert into payslip_lines (payslip_id, kind, code, label, amount, reason) values (v_ps, 'deduct', 'late', 'خصم التأخير', round(late_days * day_rate, 2), format('اتأخرت %s مرة (%s دقيقة) = %s يوم حسب اللايحة', n_late, late_min, late_days)); end if;
    if n_absent > 0 and e.pay_type = 'monthly' then insert into payslip_lines (payslip_id, kind, code, label, amount, reason) values (v_ps, 'deduct', 'absent', 'خصم الغياب', round(n_absent * coalesce((cfg->>'absence_days')::numeric, 1) * day_rate, 2), format('%s يوم غياب من غير إذن (كل يوم = %s يوم خصم)', n_absent, coalesce(cfg->>'absence_days', '1'))); end if;
    if n_unpaid > 0 and e.pay_type = 'monthly' then insert into payslip_lines (payslip_id, kind, code, label, amount, reason) values (v_ps, 'deduct', 'unpaid', 'إجازة بدون مرتب', round(n_unpaid * day_rate, 2), format('%s يوم', n_unpaid)); end if;
    if n_sick > 0 and e.pay_type = 'monthly' and coalesce((lv->>'sick_pay_pct')::numeric, 100) < 100 then
      insert into payslip_lines (payslip_id, kind, code, label, amount, reason) values (v_ps, 'deduct', 'sick', 'فرق الإجازة المرضي', round(n_sick * day_rate * (100 - (lv->>'sick_pay_pct')::numeric) / 100, 2), format('%s يوم مرضي بيتدفع %s%%', n_sick, lv->>'sick_pay_pct')); end if;
    if n_prehire > 0 and e.pay_type = 'monthly' then insert into payslip_lines (payslip_id, kind, code, label, amount, reason) values (v_ps, 'deduct', 'prehire', 'أيام قبل التعيين', round(n_prehire * day_rate, 2), format('اتعيّنت يوم %s', e.hire_date)); end if;
    -- المكافآت والخصومات والجزاءات والتسويات
    insert into payslip_lines (payslip_id, kind, code, label, amount, reason)
      select v_ps, a.kind, 'adj:' || a.id, a.label, a.amount, a.reason from payroll_adjustments a where a.user_id = e.user_id and a.month = m0 and not a.cancelled;
    -- أقساط السلف
    insert into payslip_lines (payslip_id, kind, code, label, amount, reason)
      select v_ps, 'deduct', 'adv:' || i.id, 'قسط سلفة', i.amount, format('سلفة %s ج — القسط %s من %s', r.amount,
        (select count(*) from advance_installments i2 where i2.request_id = i.request_id and i2.month <= i.month), r.installments)
      from advance_installments i join leave_requests r on r.id = i.request_id where i.user_id = e.user_id and i.month = m0 and i.payslip_id is null;
    -- عجز العهدة
    if coalesce((cfg->>'shortage_to_payroll')::boolean, true) then
      insert into payslip_lines (payslip_id, kind, code, label, amount, reason)
        select v_ps, 'deduct', 'short:' || c.id, 'عجز عهدة', c.amount, c.note from custody_moves c where c.user_id = e.user_id and c.kind = 'shortage' and c.status = 'ok' and c.payroll_month is null;
    end if;
    -- التأمينات والضريبة
    v_ins := round(e.insurance_wage * coalesce((cfg->>'ins_pct')::numeric, 11) / 100, 2);
    if v_ins > 0 then insert into payslip_lines (payslip_id, kind, code, label, amount, reason) values (v_ps, 'deduct', 'ins', 'التأمينات (حصة الموظف)', v_ins, format('%s%% من أجر التأمينات %s', cfg->>'ins_pct', e.insurance_wage)); end if;
    select coalesce(sum(amount) filter (where kind = 'earn'), 0) - coalesce(sum(amount) filter (where kind = 'deduct' and code in ('late','absent','unpaid','sick','prehire')), 0)
      into v_gross from payslip_lines where payslip_id = v_ps;
    v_tax := round(calc_tax_annual(greatest(0, v_gross - v_ins) * 12, cfg) / 12, 2);
    if v_tax > 0 then insert into payslip_lines (payslip_id, kind, code, label, amount, reason) values (v_ps, 'deduct', 'tax', 'ضريبة كسب العمل', v_tax, 'محسوبة على الصافي بعد التأمينات × 12 شهر بالشرايح'); end if;

    select coalesce(sum(amount) filter (where kind = 'earn'), 0), coalesce(sum(amount) filter (where kind = 'deduct'), 0) into v_gross, v_ded from payslip_lines where payslip_id = v_ps;
    update payslips set gross = v_gross, deductions = v_ded, net = v_gross - v_ded where id = v_ps;
  end loop;
  return run.id;
end $$;

create or replace function public.payroll_send(p_run bigint) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_staff() or not has_perm('hr.pay') then raise exception 'محتاج صلاحية المرتبات'; end if;
  update payroll_runs set status = 'sent', sent_by = auth.uid(), sent_at = now() where id = p_run and status = 'draft' and ver > 0;
  if not found then raise exception 'احسب المرتبات الأول'; end if;
end $$;

create or replace function public.payroll_back(p_run bigint, p_note text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_staff() or not has_perm('hr.pay') then raise exception 'محتاج صلاحية المرتبات'; end if;
  update payroll_runs set status = 'draft', note = nullif(trim(p_note), '') where id = p_run and status = 'sent';
  if not found then raise exception 'المرتبات دي مش مبعوتة للاعتماد'; end if;
end $$;

create or replace function public.payroll_approve(p_run bigint) returns void
language plpgsql security definer set search_path = public as $$
declare run payroll_runs%rowtype; s record; v_cat bigint;
begin
  if not is_staff() or not has_perm('hr.pay') then raise exception 'محتاج صلاحية المرتبات'; end if;
  select * into run from payroll_runs where id = p_run for update;
  if run.status <> 'sent' then raise exception 'لازم المرتبات تتبعت للاعتماد الأول'; end if;
  if run.sent_by = auth.uid() and not is_owner() then raise exception 'اللي بعت المرتبات للاعتماد مايعتمدهاش'; end if;
  update payroll_runs set status = 'approved', approved_by = auth.uid(), approved_at = now() where id = p_run;
  -- قفل الأقساط والعجز والتسويات اللي دخلت
  update advance_installments i set payslip_id = l.payslip_id from payslip_lines l join payslips p on p.id = l.payslip_id
    where p.run_id = p_run and p.ver = run.ver and l.code = 'adv:' || i.id;
  update custody_moves c set payroll_month = run.month from payslip_lines l join payslips p on p.id = l.payslip_id
    where p.run_id = p_run and p.ver = run.ver and l.code = 'short:' || c.id;
  update payroll_adjustments a set payslip_id = l.payslip_id from payslip_lines l join payslips p on p.id = l.payslip_id
    where p.run_id = p_run and p.ver = run.ver and l.code = 'adj:' || a.id;
  -- مصروف "مرتبات" على مكان كل موظف (الإجمالي قبل الاستقطاعات = تكلفة الشركة)
  select id into v_cat from expense_categories where name like 'مرتبات%' limit 1;
  for s in select coalesce(location_id, 'main') loc, sum(gross - coalesce((select sum(amount) from payslip_lines l where l.payslip_id = p.id and l.code in ('late','absent','unpaid','sick','prehire')), 0)) amt
           from payslips p where run_id = p_run and ver = run.ver group by 1 loop
    if s.amt > 0 then
      insert into expenses (day, location_id, category_id, amount, paid_from, note, status, payroll_run_id)
        values ((run.month + interval '1 month' - interval '1 day')::date, s.loc, v_cat, s.amt, 'bank', 'مرتبات ' || month_name(run.month), 'ok', p_run);
    end if;
  end loop;
  -- إشعار لكل موظف
  for s in select user_id, net from payslips where run_id = p_run and ver = run.ver loop
    perform staff_note(s.user_id, 'مرتبك نزل 💰', format('مرتب %s اتعتمد — الصافي %s ج. التفاصيل في "مرتبي".', month_name(run.month), round(s.net)));
  end loop;
end $$;

create or replace function public.payroll_adjust(p_user uuid, p_month date, p_kind text, p_label text, p_amount numeric, p_reason text) returns bigint
language plpgsql security definer set search_path = public as $$
declare lim numeric := perm_limit('hr.pay'); v_id bigint;
begin
  if not is_staff() or lim = -1 then raise exception 'محتاج صلاحية المرتبات'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'السبب إجباري'; end if;
  if coalesce(p_amount, 0) <= 0 then raise exception 'اكتب المبلغ'; end if;
  if p_kind = 'earn' and lim is not null and p_amount > lim then raise exception 'المكافأة أكبر من حدّك (% ج)', lim; end if;
  if exists (select 1 from payroll_runs where month = date_trunc('month', p_month)::date and status = 'approved') then raise exception 'مرتبات الشهر ده اتعتمدت — حطها على الشهر اللي بعده'; end if;
  insert into payroll_adjustments (user_id, month, kind, label, amount, reason)
    values (p_user, date_trunc('month', p_month)::date, p_kind, coalesce(nullif(trim(p_label), ''), case when p_kind = 'earn' then 'مكافأة' else 'خصم' end), p_amount, trim(p_reason)) returning id into v_id;
  return v_id;
end $$;

-- ================= الموظف: مرتبي =================
create or replace function public.my_payslips() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'month', r.month, 'name', month_name(r.month), 'gross', p.gross, 'deductions', p.deductions, 'net', p.net,
      'received', p.received_at is not null, 'disputes', (select count(*) from payslip_disputes d where d.payslip_id = p.id and d.status = 'open')) order by r.month desc), '[]'::jsonb)
  from payslips p join payroll_runs r on r.id = p.run_id and r.ver = p.ver and r.status = 'approved'
  where p.user_id = auth.uid()
$$;

create or replace function public.my_payslip(p_id bigint) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id', p.id, 'month', r.month, 'name', month_name(r.month), 'gross', p.gross, 'deductions', p.deductions, 'net', p.net, 'summary', p.summary,
    'received_at', p.received_at,
    'lines', (select coalesce(jsonb_agg(jsonb_build_object('id', l.id, 'kind', l.kind, 'label', l.label, 'amount', l.amount, 'reason', l.reason) order by l.kind desc, l.id), '[]'::jsonb) from payslip_lines l where l.payslip_id = p.id),
    'disputes', (select coalesce(jsonb_agg(jsonb_build_object('id', d.id, 'line_id', d.line_id, 'text', d.text, 'status', d.status, 'reply', d.reply, 'amount', d.amount, 'at', d.at) order by d.id), '[]'::jsonb) from payslip_disputes d where d.payslip_id = p.id))
  from payslips p join payroll_runs r on r.id = p.run_id and r.ver = p.ver and r.status = 'approved'
  where p.id = p_id and p.user_id = auth.uid()
$$;

create or replace function public.payslip_received(p_id bigint) returns void
language sql security definer set search_path = public as $$
  update payslips set received_at = coalesce(received_at, now()) where id = p_id and user_id = auth.uid()
$$;

create or replace function public.payslip_dispute(p_id bigint, p_line bigint, p_text text) returns bigint
language plpgsql security definer set search_path = public as $$
declare v_id bigint;
begin
  if not exists (select 1 from payslips p join payroll_runs r on r.id = p.run_id and r.ver = p.ver and r.status = 'approved' where p.id = p_id and p.user_id = auth.uid()) then raise exception 'الكشف ده مش موجود'; end if;
  if coalesce(trim(p_text), '') = '' then raise exception 'اكتب اعتراضك'; end if;
  if p_line is not null and not exists (select 1 from payslip_lines where id = p_line and payslip_id = p_id) then raise exception 'البند ده مش في الكشف'; end if;
  insert into payslip_disputes (payslip_id, line_id, text) values (p_id, p_line, trim(p_text)) returning id into v_id;
  return v_id;
end $$;

create or replace function public.dispute_decide(p_id bigint, p_accept boolean, p_amount numeric, p_reply text) returns void
language plpgsql security definer set search_path = public as $$
declare d payslip_disputes%rowtype; m date; lbl text;
begin
  if not is_staff() or not has_perm('hr.pay') then raise exception 'محتاج صلاحية المرتبات'; end if;
  select * into d from payslip_disputes where id = p_id and status = 'open' for update;
  if not found then raise exception 'الاعتراض ده اتردّ عليه'; end if;
  if coalesce(trim(p_reply), '') = '' then raise exception 'اكتب الرد'; end if;
  select r.month into m from payslips p join payroll_runs r on r.id = p.run_id where p.id = d.payslip_id;
  lbl := coalesce((select label from payslip_lines where id = d.line_id), 'المرتب');
  update payslip_disputes set status = case when p_accept then 'accepted' else 'rejected' end, amount = case when p_accept then p_amount end,
    reply = trim(p_reply), decided_by = auth.uid(), decided_at = now() where id = p_id;
  -- الاعتراض المقبول بمبلغ ← تسوية تتصرف في أول شهر لسه مااتعتمدش
  if p_accept and coalesce(p_amount, 0) > 0 then
    insert into payroll_adjustments (user_id, month, kind, label, amount, reason, source, ref_id)
      values (d.user_id, coalesce((select min(x.m)::date from generate_series((m + interval '1 month')::date, (m + interval '24 month')::date, interval '1 month') x(m)
                                    where not exists (select 1 from payroll_runs r where r.month = x.m::date and r.status = 'approved')), (m + interval '1 month')::date),
              'earn', 'تسوية اعتراض — ' || lbl, p_amount, 'اعتراض على مرتب ' || month_name(m) || ': ' || trim(p_reply), 'dispute', d.id);
  end if;
  perform staff_note(d.user_id, case when p_accept then 'اعتراضك اتقبل ✅' else 'رد على اعتراضك' end,
    format('اعتراضك على "%s" في مرتب %s: %s%s', lbl, month_name(m), trim(p_reply), case when p_accept and p_amount > 0 then format(' — هيتصرفلك %s ج مع المرتب الجاي', p_amount) else '' end));
end $$;

-- ================= أرصدتي =================
create or replace function public.my_balances() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare lv jsonb := (select value from settings where key = 'hr.leave'); y0 date := date_trunc('year', now() at time zone 'Africa/Cairo')::date; y1 date; hd date; ent numeric;
begin
  y1 := (y0 + interval '1 year' - interval '1 day')::date;
  select hire_date into hd from employee_pay where user_id = auth.uid();
  ent := case when hd is not null and hd > (now() - interval '1 year')::date then coalesce((lv->>'first_year')::numeric, 15) else coalesce((lv->>'annual')::numeric, 21) end;
  return jsonb_build_object(
    'annual_total', ent, 'casual_total', coalesce((lv->>'casual')::numeric, 7),
    'used', (select coalesce(jsonb_object_agg(kind, n), '{}'::jsonb) from (
       select kind, sum(least(to_date, y1) - greatest(from_date, y0) + 1) n from leave_requests
       where user_id = auth.uid() and status = 'approved' and kind <> 'advance' and to_date >= y0 and from_date <= y1 group by kind) z),
    'advances', (select coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'amount', r.amount, 'installments', r.installments,
        'paid', (select coalesce(sum(i.amount), 0) from advance_installments i where i.request_id = r.id and i.payslip_id is not null),
        'next', (select min(i.month) from advance_installments i where i.request_id = r.id and i.payslip_id is null),
        'monthly', (select max(i.amount) from advance_installments i where i.request_id = r.id)) order by r.id desc), '[]'::jsonb)
       from leave_requests r where r.user_id = auth.uid() and r.kind = 'advance' and r.status = 'approved'
         and exists (select 1 from advance_installments i where i.request_id = r.id and i.payslip_id is null)),
    'custody', custody_balance(auth.uid()));
end $$;

-- ================= طلبات الأوراق =================
create or replace function public.doc_request(p_kind text, p_to text, p_purpose text, p_note text) returns bigint
language plpgsql security definer set search_path = public as $$
declare v_no bigint;
begin
  if not is_staff() then raise exception 'الحساب ده مش شغال'; end if;
  if p_kind = 'other' and coalesce(trim(p_note), '') = '' then raise exception 'اكتب الورقة اللي محتاجها'; end if;
  insert into doc_requests (kind, addressed_to, purpose, note) values (p_kind, nullif(trim(p_to), ''), nullif(trim(p_purpose), ''), nullif(trim(p_note), '')) returning no into v_no;
  return v_no;
end $$;

-- بيانات الشهادة من آخر مرتب معتمد
create or replace function public.doc_snapshot(p_user uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('name', pr.name, 'job', pr.job, 'loc', (select name from locations where id = pr.home_loc), 'hire_date', ep.hire_date,
    'base', ep.base, 'allowances', ep.allowances, 'pay_type', ep.pay_type, 'insurance_wage', ep.insurance_wage,
    'last', (select jsonb_build_object('month', month_name(r.month), 'gross', p.gross, 'net', p.net)
             from payslips p join payroll_runs r on r.id = p.run_id and r.ver = p.ver and r.status = 'approved' where p.user_id = p_user order by r.month desc limit 1))
  from profiles pr left join employee_pay ep on ep.user_id = pr.id where pr.id = p_user
$$;
revoke execute on function public.doc_snapshot(uuid) from anon, public, authenticated;

create or replace function public.doc_decide(p_id bigint, p_status text, p_reply text, p_file text) returns void
language plpgsql security definer set search_path = public as $$
declare r doc_requests%rowtype; K jsonb := '{"salary_cert":"شهادة مرتب","employment_cert":"شهادة إنه شغال عندنا","salary_details":"مفردات مرتب","insurance":"برنت تأمينات","experience":"شهادة خبرة","other":"ورقة"}';
begin
  if not is_staff() or not has_perm('hr.docs') then raise exception 'محتاج صلاحية طلبات الأوراق'; end if;
  select * into r from doc_requests where id = p_id for update;
  if not found then raise exception 'الطلب مش موجود'; end if;
  if p_status not in ('ready','delivered','rejected') then raise exception 'حالة غلط'; end if;
  update doc_requests set status = p_status, reply = coalesce(nullif(trim(p_reply), ''), reply), file = coalesce(nullif(p_file, ''), file),
    issued = case when p_status = 'ready' then coalesce(issued, doc_snapshot(r.user_id)) else issued end, decided_by = auth.uid(), decided_at = now() where id = p_id;
  if p_status <> 'delivered' then
    perform staff_note(r.user_id, case when p_status = 'ready' then 'ورقتك جاهزة 📄' else 'رد على طلب الورقة' end,
      format('%s%s — %s', K->>r.kind, coalesce(' لـ ' || r.addressed_to, ''), coalesce(nullif(trim(p_reply), ''), case when p_status = 'ready' then 'استلمها من الموارد البشرية' else 'اترفض' end)));
  end if;
end $$;

create or replace function public.my_docs() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'no', no, 'kind', kind, 'to', addressed_to, 'purpose', purpose, 'note', note, 'status', status, 'reply', reply, 'file', file, 'at', at) order by id desc), '[]'::jsonb)
  from doc_requests where user_id = auth.uid()
$$;

-- أي جهة تمسح الكود على الشهادة تتأكد إنها سليمة
create or replace function public.public_doc_verify(p_code text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('no', no, 'kind', kind, 'to', addressed_to, 'at', decided_at, 'name', issued->>'name', 'job', issued->>'job', 'hire_date', issued->>'hire_date',
    'gross', case when kind in ('salary_cert','salary_details') then issued->'last'->>'gross' end, 'month', issued->'last'->>'month')
  from doc_requests where code = p_code and status in ('ready','delivered') and issued is not null
$$;

revoke execute on function public.custody_give(uuid, numeric, text), public.custody_spend(numeric, bigint, text, text, text), public.custody_decide(bigint, boolean, text),
  public.custody_return(numeric, text), public.custody_confirm_return(bigint, numeric, text), public.my_custody(), public.payroll_calc(date), public.payroll_send(bigint),
  public.payroll_back(bigint, text), public.payroll_approve(bigint), public.payroll_adjust(uuid, date, text, text, numeric, text), public.my_payslips(), public.my_payslip(bigint),
  public.payslip_received(bigint), public.payslip_dispute(bigint, bigint, text), public.dispute_decide(bigint, boolean, numeric, text), public.my_balances(),
  public.doc_request(text, text, text, text), public.doc_decide(bigint, text, text, text), public.my_docs(), public.custody_balance(uuid) from anon, public;
grant execute on function public.custody_give(uuid, numeric, text), public.custody_spend(numeric, bigint, text, text, text), public.custody_decide(bigint, boolean, text),
  public.custody_return(numeric, text), public.custody_confirm_return(bigint, numeric, text), public.my_custody(), public.payroll_calc(date), public.payroll_send(bigint),
  public.payroll_back(bigint, text), public.payroll_approve(bigint), public.payroll_adjust(uuid, date, text, text, numeric, text), public.my_payslips(), public.my_payslip(bigint),
  public.payslip_received(bigint), public.payslip_dispute(bigint, bigint, text), public.dispute_decide(bigint, boolean, numeric, text), public.my_balances(),
  public.doc_request(text, text, text, text), public.doc_decide(bigint, text, text, text), public.my_docs() to authenticated;
grant execute on function public.public_doc_verify(text) to anon, authenticated;
revoke execute on function public.custody_balance(uuid) from anon, authenticated;
