-- ============ 0035 الورديات بالمدير + الأذون (انصراف بدري/تأخير مدفوع) + أيام الشركة والإجازات الرسمية + مشتريات الموظفين آجل ============
-- كله داخل في payroll_calc: ميعاد الوردية لكل يوم، الراحة، الإذن، الإجازة الرسمية والشغل فيها، يوم الراحة اللي اشتغله، أيام الشركة، المشتريات.

insert into public.permissions (id, grp, label) values
  ('hr.shifts','الموارد البشرية','الورديات والأذون لكل الموظفين (المدير بيعمل لموظفينه من غيرها)'),
  ('hr.days','الموارد البشرية','الإجازات الرسمية وأيام الإجازة اللي الشركة بتمنحها')
on conflict do nothing;

insert into public.settings (key, value) values
  ('hr.shifts', '{"cutoff":"20:00","notify":true}'),
  ('hr.permits', '{"max_paid_month":0}'),
  ('hr.staff_credit', '{"on":true,"limit_month":2000}')
on conflict do nothing;
update public.settings set value = value || '{"early_grace":10,"early_tiers":[{"from":11,"to":60,"days":0.5},{"from":61,"to":1440,"days":1}],"holiday_extra_days":1,"rest_extra_days":1}'::jsonb
  where key = 'hr.payroll' and not value ? 'early_grace';
update public.settings set value = jsonb_set(value, '{max_installments}', '12') where key = 'hr.advance' and (value->>'max_installments')::int = 6;

alter table public.employee_pay add column if not exists manager_id uuid references public.profiles;

-- الوردية لكل موظف لكل يوم
create table public.shift_plans (
  user_id uuid not null references public.profiles,
  day date not null,
  start_at time, end_at time,
  off boolean not null default false,
  location_id text references public.locations,
  note text,
  late_change boolean not null default false,
  notified boolean not null default false,
  by uuid not null default auth.uid(),
  at timestamptz not null default now(),
  primary key (user_id, day)
);

-- إذن انصراف بدري / تأخير
create table public.attendance_permits (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles,
  day date not null,
  kind text not null check (kind in ('early','late')),
  at_time time,                 -- بدري: ينصرف الساعة كام · تأخير: يوصل الساعة كام
  paid boolean not null default true,
  reason text,
  status text not null default 'approved' check (status in ('pending','approved','rejected','cancelled')),
  by uuid not null default auth.uid(),
  at timestamptz not null default now(),
  decided_by uuid, decided_at timestamptz
);

-- الإجازات الرسمية وأيام الشركة
create table public.company_days (
  id bigint generated always as identity primary key,
  day date not null,
  kind text not null check (kind in ('holiday','gift','from_balance','substitute')),
  name text not null,
  scope text not null default 'all' check (scope in ('all','loc','users')),
  location_id text references public.locations,
  users uuid[] not null default '{}',
  for_day date,                 -- البديل: بدل الإجازة الرسمية بتاعة اليوم ده
  cancelled boolean not null default false,
  by uuid default auth.uid(),
  at timestamptz not null default now()
);
insert into public.company_days (day, kind, name)
select d::date, 'holiday', n from (values
  ('2026-01-07','عيد الميلاد المجيد'),('2026-01-25','عيد ثورة 25 يناير'),('2026-04-25','عيد تحرير سيناء'),('2026-05-01','عيد العمال'),('2026-06-30','ذكرى ثورة 30 يونيو'),
  ('2026-07-23','عيد ثورة 23 يوليو'),('2026-10-06','عيد القوات المسلحة'),
  ('2027-01-07','عيد الميلاد المجيد'),('2027-01-25','عيد ثورة 25 يناير'),('2027-04-25','عيد تحرير سيناء'),('2027-05-01','عيد العمال'),
  ('2027-06-30','ذكرى ثورة 30 يونيو'),('2027-07-23','عيد ثورة 23 يوليو'),('2027-10-06','عيد القوات المسلحة')) v(d, n);

-- مشتريات الموظفين آجل من الكاشير
alter table public.sales add column if not exists paid_staff numeric not null default 0;
alter table public.sales add column if not exists staff_id uuid references public.profiles;
alter table public.sales add column if not exists staff_month date;

do $$ declare t text; begin
  foreach t in array array['shift_plans','attendance_permits','company_days'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy staff_only on public.%I as restrictive for all to authenticated using (public.is_staff()) with check (public.is_staff())', t);
  end loop;
end $$;
create policy sp_read on public.shift_plans for select to authenticated using (user_id = auth.uid() or has_perm('hr.shifts') or has_perm('hr.view') or exists (select 1 from employee_pay e where e.user_id = shift_plans.user_id and e.manager_id = auth.uid()));
create policy ap_read on public.attendance_permits for select to authenticated using (user_id = auth.uid() or has_perm('hr.shifts') or has_perm('hr.view') or has_perm('hr.pay') or exists (select 1 from employee_pay e where e.user_id = attendance_permits.user_id and e.manager_id = auth.uid()));
create policy cd_read on public.company_days for select to authenticated using (true);
create policy cd_write on public.company_days for all to authenticated using (has_perm('hr.days')) with check (has_perm('hr.days'));
create trigger audit_shift_plans after insert or update or delete on public.shift_plans for each row execute function public.audit();
create trigger audit_permits after insert or update or delete on public.attendance_permits for each row execute function public.audit();
create trigger audit_company_days after insert or update or delete on public.company_days for each row execute function public.audit();

-- المدير المباشر أو صاحب صلاحية الورديات
create or replace function public.manages(p_user uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select is_staff() and (has_perm('hr.shifts') or exists (select 1 from employee_pay where user_id = p_user and manager_id = auth.uid()))
$$;

-- اليوم ده إجازة شركة للموظف ده؟
create or replace function public.company_day_for(p_user uuid, p_loc text, p_day date) returns company_days
language sql stable security definer set search_path = public as $$
  select * from company_days c where c.day = p_day and not c.cancelled
    and (c.scope = 'all' or (c.scope = 'loc' and c.location_id = p_loc) or (c.scope = 'users' and p_user = any(c.users)))
  order by case c.kind when 'holiday' then 0 else 1 end limit 1
$$;

-- ===== الورديات =====
create or replace function public.shift_set(p_rows jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare r jsonb; v_user uuid; v_day date; cutoff time := coalesce((select (value->>'cutoff')::time from settings where key = 'hr.shifts'), '20:00');
        now_c timestamp := now() at time zone 'Africa/Cairo'; late boolean; n int := 0; old shift_plans%rowtype; v_off boolean; v_s time; v_e time;
begin
  for r in select * from jsonb_array_elements(coalesce(p_rows, '[]')) loop
    v_user := (r->>'user')::uuid; v_day := (r->>'day')::date;
    if not manages(v_user) then raise exception 'مش من موظفينك'; end if;
    late := now_c >= (v_day - 1) + cutoff;
    if late and not has_perm('hr.shifts') then raise exception 'ورديات يوم % لازم تتحدد قبل الساعة % يوم قبلها — كلّم الموارد البشرية', v_day, to_char(cutoff, 'HH24:MI'); end if;
    v_off := coalesce((r->>'off')::boolean, false);
    v_s := nullif(r->>'start', '')::time; v_e := nullif(r->>'end', '')::time;
    if not v_off and (v_s is null or v_e is null) then raise exception 'اكتب ميعاد البداية والنهاية أو اختار راحة'; end if;
    select * into old from shift_plans where user_id = v_user and day = v_day;
    if found and old.off = v_off and old.start_at is not distinct from v_s and old.end_at is not distinct from v_e and old.location_id is not distinct from nullif(r->>'loc', '') then continue; end if;
    insert into shift_plans (user_id, day, start_at, end_at, off, location_id, note, late_change, notified, by, at)
      values (v_user, v_day, case when v_off then null else v_s end, case when v_off then null else v_e end, v_off, nullif(r->>'loc', ''), nullif(r->>'note', ''), late, false, auth.uid(), now())
      on conflict (user_id, day) do update set start_at = excluded.start_at, end_at = excluded.end_at, off = excluded.off, location_id = excluded.location_id,
        note = excluded.note, late_change = excluded.late_change or shift_plans.late_change, notified = false, by = excluded.by, at = excluded.at;
    -- لو الإشعار اتبعت قبل كده: التغيير بيوصل على طول
    if late or old.notified is true then
      perform staff_note(v_user, 'ورديتك اتغيرت ⚠️', shift_text(v_user, v_day));
      update shift_plans set notified = true where user_id = v_user and day = v_day;
    end if;
    n := n + 1;
  end loop;
  return n;
end $$;

create or replace function public.shift_text(p_user uuid, p_day date) returns text
language sql stable security definer set search_path = public as $$
  select case when p.off then format('يوم %s راحة', to_char(p_day, 'DD/MM'))
    else format('ورديتك يوم %s من %s لـ %s%s', to_char(p_day, 'DD/MM'), to_char(p.start_at, 'HH12:MI'), to_char(p.end_at, 'HH12:MI'), coalesce(' في ' || l.name, '')) end
  from shift_plans p left join locations l on l.id = p.location_id where p.user_id = p_user and p.day = p_day
$$;

-- كل يوم بالليل: إشعار لكل واحد بوردية بكره
create or replace function public.shift_notify_tomorrow() returns int
language plpgsql security definer set search_path = public as $$
declare r record; n int := 0; v_day date := (now() at time zone 'Africa/Cairo')::date + 1;
begin
  if not coalesce((select (value->>'notify')::boolean from settings where key = 'hr.shifts'), true) then return 0; end if;
  for r in select user_id from shift_plans where day = v_day and not notified loop
    perform staff_note(r.user_id, 'ورديتك بكره 🕘', shift_text(r.user_id, v_day));
    update shift_plans set notified = true where user_id = r.user_id and day = v_day;
    n := n + 1;
  end loop;
  return n;
end $$;
revoke execute on function public.shift_notify_tomorrow(), public.company_day_for(uuid, text, date), public.shift_text(uuid, date) from anon, public, authenticated;
create extension if not exists pg_cron;
select cron.schedule('shift-notify', '*/30 * * * *', $c$
  select public.shift_notify_tomorrow() where (now() at time zone 'Africa/Cairo')::time >= coalesce((select (value->>'cutoff')::time from public.settings where key = 'hr.shifts'), '20:00')
$c$);

-- ===== الأذون =====
create or replace function public.permit_grant(p_user uuid, p_day date, p_kind text, p_time time, p_paid boolean, p_reason text) returns bigint
language plpgsql security definer set search_path = public as $$
declare v_id bigint; mx int := coalesce((select (value->>'max_paid_month')::int from settings where key = 'hr.permits'), 0);
begin
  if not (manages(p_user) or has_perm('hr.attendance')) then raise exception 'مش من موظفينك'; end if;
  if p_kind not in ('early','late') then raise exception 'نوع غلط'; end if;
  if p_paid and mx > 0 and not has_perm('hr.shifts') and (select count(*) from attendance_permits where user_id = p_user and paid and status = 'approved'
       and date_trunc('month', day) = date_trunc('month', p_day)) >= mx then raise exception 'خلص الأذون المدفوعة للشهر ده (% إذن)', mx; end if;
  insert into attendance_permits (user_id, day, kind, at_time, paid, reason, status, decided_by, decided_at)
    values (p_user, p_day, p_kind, p_time, coalesce(p_paid, true), nullif(trim(p_reason), ''), 'approved', auth.uid(), now()) returning id into v_id;
  perform staff_note(p_user, case when p_kind = 'early' then 'إذن انصراف بدري ✅' else 'إذن تأخير ✅' end,
    format('يوم %s%s%s — %s', to_char(p_day, 'DD/MM'), case when p_time is not null then case when p_kind = 'early' then ' تنصرف الساعة ' else ' توصل الساعة ' end || to_char(p_time, 'HH12:MI') else '' end,
      coalesce(' — ' || nullif(trim(p_reason), ''), ''), case when coalesce(p_paid, true) then 'من غير خصم' else 'بيتخصم وقته' end));
  return v_id;
end $$;

create or replace function public.permit_request(p_day date, p_kind text, p_time time, p_reason text) returns bigint
language plpgsql security definer set search_path = public as $$
declare v_id bigint;
begin
  if not is_staff() then raise exception 'الحساب ده مش شغال'; end if;
  if p_kind not in ('early','late') then raise exception 'نوع غلط'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'اكتب السبب'; end if;
  insert into attendance_permits (user_id, day, kind, at_time, reason, status) values (auth.uid(), p_day, p_kind, p_time, trim(p_reason), 'pending') returning id into v_id;
  return v_id;
end $$;

create or replace function public.permit_decide(p_id bigint, p_ok boolean, p_paid boolean) returns void
language plpgsql security definer set search_path = public as $$
declare r attendance_permits%rowtype;
begin
  select * into r from attendance_permits where id = p_id and status = 'pending' for update;
  if not found then raise exception 'الإذن ده مش مستني'; end if;
  if not (manages(r.user_id) or has_perm('hr.attendance')) then raise exception 'مش من موظفينك'; end if;
  update attendance_permits set status = case when p_ok then 'approved' else 'rejected' end, paid = coalesce(p_paid, true), decided_by = auth.uid(), decided_at = now() where id = p_id;
  perform staff_note(r.user_id, case when p_ok then 'اتوافق على الإذن ✅' else 'اترفض الإذن' end,
    format('%s يوم %s%s', case when r.kind = 'early' then 'انصراف بدري' else 'تأخير' end, to_char(r.day, 'DD/MM'), case when p_ok then case when coalesce(p_paid, true) then ' — من غير خصم' else ' — بيتخصم وقته' end else '' end));
end $$;

-- ===== مشتريات الموظفين آجل =====
create or replace function public.staff_credit_check(p_phone text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare cfg jsonb := (select value from settings where key = 'hr.staff_credit'); p profiles%rowtype; used numeric;
begin
  if not has_perm('pos.sell') then raise exception 'محتاج صلاحية البيع'; end if;
  if not coalesce((cfg->>'on')::boolean, true) then raise exception 'البيع للموظفين بالآجل مقفول من الإعدادات'; end if;
  select * into p from profiles where active and not is_test and regexp_replace(coalesce(phone, ''), '\D', '', 'g') = regexp_replace(p_phone, '\D', '', 'g') and length(regexp_replace(p_phone, '\D', '', 'g')) >= 10 limit 1;
  if not found then raise exception 'مفيش موظف شغال بالرقم ده'; end if;
  select coalesce(sum(paid_staff), 0) into used from sales where staff_id = p.id and staff_month is null;
  return jsonb_build_object('id', p.id, 'name', p.name, 'used', used, 'limit', coalesce((cfg->>'limit_month')::numeric, 0), 'available', greatest(coalesce((cfg->>'limit_month')::numeric, 0) - used, 0));
end $$;

-- pos_sync: نفس اللي قبل + "على حساب موظف"
create or replace function public.pos_sync(p_loc text, p_shifts jsonb, p_sales jsonb)
 returns jsonb language plpgsql set search_path to 'public' as $function$
declare s jsonb; x jsonb; l jsonb; v_shift bigint; v_sale bigint; v_no bigint; i int; flags text[]; b boxes%rowtype; out jsonb := '[]'; sh_out jsonb := '[]';
  sub numeric; tot numeric; v_exp numeric; v_staff numeric; v_sid uuid; v_lim numeric; v_used numeric;
begin
  if not has_perm('pos.sell') then raise exception 'محتاج صلاحية البيع'; end if;

  for s in select * from jsonb_array_elements(coalesce(p_shifts, '[]')) loop
    select id into v_shift from shifts where client_id = (s->>'client_id')::uuid;
    if v_shift is null then
      select id into v_shift from shifts where cashier = auth.uid() and status = 'open' and client_id is null;
      if v_shift is not null then
        update shifts set client_id = (s->>'client_id')::uuid where id = v_shift;
      else
        insert into shifts (location_id, opening_cash, opened_at, client_id)
          values (p_loc, coalesce((s->>'opening_cash')::numeric, 0), coalesce((s->>'opened_at')::timestamptz, now()), (s->>'client_id')::uuid)
          returning id into v_shift;
      end if;
    end if;
    sh_out := sh_out || jsonb_build_object('client_id', s->>'client_id', 'id', v_shift);
  end loop;

  for x in select * from jsonb_array_elements(coalesce(p_sales, '[]')) loop
    select id, no into v_sale, v_no from sales where client_id = (x->>'client_id')::uuid;
    if v_sale is not null then
      out := out || jsonb_build_object('client_id', x->>'client_id', 'no', v_no, 'dup', true);
      continue;
    end if;
    select id into v_shift from shifts where client_id = (x->>'shift')::uuid;
    if v_shift is null then raise exception 'وردية الفاتورة مش موجودة'; end if;
    flags := '{}';
    if coalesce((x->>'discount')::numeric, 0) > 0 and not has_perm('pos.discount') then flags := flags || 'خصم من غير صلاحية'; end if;
    v_staff := coalesce((x->>'staff')::numeric, 0); v_sid := nullif(x->>'staff_id', '')::uuid;
    if v_staff > 0 then
      if v_sid is null or not exists (select 1 from profiles where id = v_sid and active and not is_test) then raise exception 'الموظف ده مش شغال'; end if;
      v_lim := coalesce((select (value->>'limit_month')::numeric from settings where key = 'hr.staff_credit'), 0);
      select coalesce(sum(paid_staff), 0) into v_used from sales where staff_id = v_sid and staff_month is null;
      if v_used + v_staff > v_lim then raise exception 'كده الموظف هيعدّي حد الآجل (% ج) — المتاح %', v_lim, greatest(v_lim - v_used, 0); end if;
    end if;
    insert into sales (location_id, shift_id, at, subtotal, discount, total, paid_cash, paid_card, paid_staff, staff_id, change, client_id, offline, local_no)
      values (p_loc, v_shift, coalesce((x->>'at')::timestamptz, now()), 0, coalesce((x->>'discount')::numeric, 0), 0,
              coalesce((x->>'cash')::numeric, 0), coalesce((x->>'card')::numeric, 0), v_staff, case when v_staff > 0 then v_sid end, 0, (x->>'client_id')::uuid, coalesce((x->>'offline')::boolean, true), x->>'local_no')
      returning id, no into v_sale, v_no;
    i := 0; sub := 0;
    for l in select * from jsonb_array_elements(x->'lines') loop
      i := i + 1;
      if l ? 'box_sn' and l->>'box_sn' is not null then
        select * into b from boxes where sn = (l->>'box_sn')::bigint;
        if not found then flags := flags || format('علبة #%s مش موجودة', l->>'box_sn');
        else
          if b.status <> 'stock' or b.location_id <> p_loc then flags := flags || format('علبة #%s كانت %s في %s', b.sn, b.status, b.location_id); end if;
          update boxes set status = 'sold' where sn = b.sn and status = 'stock';
          insert into stock_moves (item_id, location_id, qty, kind, ref, box_sn) values (b.item_id, p_loc, -b.weight, 'sale', 'S' || v_no, b.sn);
        end if;
      else
        insert into stock_moves (item_id, location_id, qty, kind, ref) values ((l->>'item_id')::bigint, p_loc, -(l->>'qty')::numeric, 'sale', 'S' || v_no);
      end if;
      insert into sale_lines (sale_id, line, item_id, box_sn, qty, unit_price, total)
        values (v_sale, i, (l->>'item_id')::bigint, nullif(l->>'box_sn', '')::bigint, (l->>'qty')::numeric, (l->>'unit_price')::numeric,
                round((l->>'qty')::numeric * (l->>'unit_price')::numeric, 2));
      sub := sub + round((l->>'qty')::numeric * (l->>'unit_price')::numeric, 2);
    end loop;
    tot := greatest(sub - coalesce((x->>'discount')::numeric, 0), 0);
    if v_staff > tot then raise exception 'المبلغ على حساب الموظف أكبر من الفاتورة'; end if;
    update sales set subtotal = sub, total = tot, change = greatest(paid_cash + paid_card + paid_staff - tot, 0), conflicts = flags where id = v_sale;
    if v_staff > 0 then
      perform staff_note(v_sid, 'مشتريات على حسابك 🛒', format('فاتورة %s بـ %s ج اتسجّلت على حسابك وهتتخصم من المرتب.', v_no, v_staff));
    end if;
    out := out || jsonb_build_object('client_id', x->>'client_id', 'no', v_no, 'conflicts', to_jsonb(flags));
  end loop;

  for s in select * from jsonb_array_elements(coalesce(p_shifts, '[]')) loop
    if s ? 'counted' and s->>'counted' is not null then
      select id into v_shift from shifts where client_id = (s->>'client_id')::uuid and status = 'open';
      if v_shift is not null then
        select sh.opening_cash + coalesce((select sum(sa.paid_cash - sa.change) from sales sa where sa.shift_id = sh.id), 0)
               - coalesce((select sum(e.amount) from expenses e where e.shift_id = sh.id and e.status <> 'rejected'), 0)
          into v_exp from shifts sh where sh.id = v_shift;
        update shifts set status = 'closed', closed_at = coalesce((s->>'closed_at')::timestamptz, now()), counted_cash = (s->>'counted')::numeric, expected_cash = v_exp where id = v_shift;
      end if;
    end if;
  end loop;

  return jsonb_build_object('shifts', sh_out, 'sales', out);
end $function$;

-- ===== حساب المرتبات (نسخة 2) =====
create or replace function public.payroll_calc(p_month date) returns bigint
language plpgsql security definer set search_path = public as $$
declare cfg jsonb := (select value from settings where key = 'hr.payroll'); lv jsonb := (select value from settings where key = 'hr.leave');
        m0 date := date_trunc('month', p_month)::date; m1 date; upto date; run payroll_runs%rowtype; v_ver int;
        e record; d date; v_ps bigint; day_rate numeric; hour_rate numeric; v_gross numeric; v_ded numeric; dh numeric;
        n_work int; n_present int; n_absent int; n_late int; late_min int; late_days numeric; n_early int; early_min int; early_days numeric; ot_min int;
        n_unpaid int; n_sick int; n_prehire int; n_paidleave int; n_hol int; n_holwork int; n_restwork int; n_gift int; n_permit int; unpaid_min int;
        fi timestamptz; lo timestamptz; lm int; x jsonb; lr record; v_ins numeric; v_tax numeric;
        pl shift_plans%rowtype; has_pl boolean; cd company_days%rowtype; t_start timestamptz; t_end timestamptz; pm attendance_permits%rowtype; worked boolean;
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
  dh := coalesce((cfg->>'day_hours')::numeric, 8);

  for e in select ep.*, p.home_loc, p.name from employee_pay ep join profiles p on p.id = ep.user_id where p.active and not p.is_test and ep.base > 0 loop
    day_rate := case when e.pay_type = 'daily' then e.base else e.base / coalesce((cfg->>'divisor')::numeric, 30) end;
    hour_rate := day_rate / dh;
    n_work := 0; n_present := 0; n_absent := 0; n_late := 0; late_min := 0; late_days := 0; n_early := 0; early_min := 0; early_days := 0; ot_min := 0;
    n_unpaid := 0; n_sick := 0; n_prehire := 0; n_paidleave := 0; n_hol := 0; n_holwork := 0; n_restwork := 0; n_gift := 0; n_permit := 0; unpaid_min := 0;
    for d in select generate_series(m0, upto, interval '1 day')::date loop
      select * into pl from shift_plans where user_id = e.user_id and day = d; has_pl := found;
      select min(at) filter (where kind = 'in'), max(at) filter (where kind = 'out') into fi, lo from attendance
        where user_id = e.user_id and status <> 'rejected' and (at at time zone 'Africa/Cairo')::date = d;
      worked := fi is not null;
      -- راحة (من الوردية أو يوم الراحة الثابت)
      if (has_pl and pl.off) or (not has_pl and extract(dow from d) = e.rest_day) then
        if worked and d >= e.hire_date then n_restwork := n_restwork + 1; end if;
        continue;
      end if;
      n_work := n_work + 1;
      if d < e.hire_date then n_prehire := n_prehire + 1; continue; end if;
      -- إجازة رسمية / يوم من الشركة
      cd := company_day_for(e.user_id, e.home_loc, d);
      if cd.id is not null then
        if cd.kind = 'holiday' then
          n_hol := n_hol + 1;
          if worked and not exists (select 1 from company_days s where s.kind = 'substitute' and s.for_day = d and not s.cancelled
                                     and (s.scope = 'all' or (s.scope = 'loc' and s.location_id = e.home_loc) or (s.scope = 'users' and e.user_id = any(s.users)))) then
            n_holwork := n_holwork + 1; end if;
        else n_gift := n_gift + 1; end if;
        continue;
      end if;
      select kind into lr from leave_requests where user_id = e.user_id and status = 'approved' and kind <> 'advance' and d between from_date and to_date limit 1;
      if found then
        if lr.kind = 'unpaid' then n_unpaid := n_unpaid + 1; elsif lr.kind = 'sick' then n_sick := n_sick + 1; else n_paidleave := n_paidleave + 1; end if;
        continue;
      end if;
      if not worked then n_absent := n_absent + 1; continue; end if;
      n_present := n_present + 1;
      t_start := (d + coalesce(case when has_pl then pl.start_at end, e.shift_start)) at time zone 'Africa/Cairo';
      t_end := case when has_pl and pl.end_at is not null then (d + pl.end_at + case when pl.end_at <= pl.start_at then interval '1 day' else interval '0' end) at time zone 'Africa/Cairo'
                    else t_start + make_interval(mins => (dh * 60)::int) end;
      -- التأخير (إلا لو فيه إذن)
      lm := floor(extract(epoch from (fi - t_start)) / 60);
      if lm > coalesce((cfg->>'grace_min')::int, 15) then
        select * into pm from attendance_permits where user_id = e.user_id and day = d and kind = 'late' and status = 'approved' order by id desc limit 1;
        if found then
          n_permit := n_permit + 1;
          if not pm.paid then unpaid_min := unpaid_min + lm; end if;
        else
          n_late := n_late + 1; late_min := late_min + lm;
          for x in select * from jsonb_array_elements(coalesce(cfg->'late_tiers', '[]')) loop
            if lm between (x->>'from')::int and (x->>'to')::int then late_days := late_days + (x->>'days')::numeric; end if;
          end loop;
        end if;
      end if;
      if lo is not null then
        -- الانصراف البدري (إلا لو فيه إذن)
        lm := floor(extract(epoch from (t_end - lo)) / 60);
        if lm > coalesce((cfg->>'early_grace')::int, 10) then
          select * into pm from attendance_permits where user_id = e.user_id and day = d and kind = 'early' and status = 'approved' order by id desc limit 1;
          if found then
            n_permit := n_permit + 1;
            if not pm.paid then unpaid_min := unpaid_min + lm; end if;
          else
            n_early := n_early + 1; early_min := early_min + lm;
            for x in select * from jsonb_array_elements(coalesce(cfg->'early_tiers', '[]')) loop
              if lm between (x->>'from')::int and (x->>'to')::int then early_days := early_days + (x->>'days')::numeric; end if;
            end loop;
          end if;
        end if;
        -- الإضافي بعد ميعاد نهاية الوردية
        lm := floor(extract(epoch from (lo - t_end)) / 60);
        if lm >= coalesce((cfg->>'ot_min')::int, 30) then ot_min := ot_min + lm; end if;
      end if;
    end loop;

    insert into payslips (run_id, ver, user_id, location_id, summary) values (run.id, v_ver, e.user_id, e.home_loc,
      jsonb_build_object('work_days', n_work, 'present', n_present, 'absent', n_absent, 'late', n_late, 'late_min', late_min, 'early', n_early, 'early_min', early_min, 'ot_min', ot_min,
        'paid_leave', n_paidleave, 'sick', n_sick, 'unpaid', n_unpaid, 'prehire', n_prehire, 'holidays', n_hol, 'holiday_work', n_holwork, 'rest_work', n_restwork, 'gift', n_gift, 'permits', n_permit,
        'upto', upto, 'day_rate', round(day_rate, 2), 'pay_type', e.pay_type))
      returning id into v_ps;

    if e.pay_type = 'daily' then
      insert into payslip_lines (payslip_id, kind, code, label, amount, reason) values (v_ps, 'earn', 'base', 'اليوميات', round((n_present + n_paidleave + n_hol + n_gift) * e.base, 2),
        format('%s يوم × %s ج (حضور %s + إجازات مدفوعة %s)', n_present + n_paidleave + n_hol + n_gift, e.base, n_present, n_paidleave + n_hol + n_gift));
    else
      insert into payslip_lines (payslip_id, kind, code, label, amount, reason) values (v_ps, 'earn', 'base', 'المرتب الأساسي', e.base, null);
    end if;
    if e.allowances > 0 then insert into payslip_lines (payslip_id, kind, code, label, amount) values (v_ps, 'earn', 'allow', 'البدلات', e.allowances); end if;
    if ot_min > 0 then
      insert into payslip_lines (payslip_id, kind, code, label, amount, reason) values (v_ps, 'earn', 'ot', 'الإضافي', round(ot_min / 60.0 * hour_rate * coalesce((cfg->>'ot_rate')::numeric, 1.35), 2),
        format('%s ساعة و%s دقيقة بعد ميعاد الوردية × %s', ot_min / 60, ot_min % 60, coalesce(cfg->>'ot_rate', '1.35')));
    end if;
    if n_holwork > 0 then insert into payslip_lines (payslip_id, kind, code, label, amount, reason) values (v_ps, 'earn', 'holwork', 'شغل في إجازة رسمية', round(n_holwork * day_rate * coalesce((cfg->>'holiday_extra_days')::numeric, 1), 2), format('%s يوم من غير يوم بديل', n_holwork)); end if;
    if n_restwork > 0 then insert into payslip_lines (payslip_id, kind, code, label, amount, reason) values (v_ps, 'earn', 'restwork', 'شغل في يوم الراحة', round(n_restwork * day_rate * coalesce((cfg->>'rest_extra_days')::numeric, 1), 2), format('%s يوم', n_restwork)); end if;
    if late_days > 0 then insert into payslip_lines (payslip_id, kind, code, label, amount, reason) values (v_ps, 'deduct', 'late', 'خصم التأخير', round(late_days * day_rate, 2), format('اتأخرت %s مرة (%s دقيقة) = %s يوم حسب اللايحة', n_late, late_min, late_days)); end if;
    if early_days > 0 then insert into payslip_lines (payslip_id, kind, code, label, amount, reason) values (v_ps, 'deduct', 'early', 'خصم الانصراف البدري', round(early_days * day_rate, 2), format('مشيت بدري %s مرة (%s دقيقة) من غير إذن = %s يوم', n_early, early_min, early_days)); end if;
    if unpaid_min > 0 then insert into payslip_lines (payslip_id, kind, code, label, amount, reason) values (v_ps, 'deduct', 'permit', 'أذون من غير أجر', round(unpaid_min / 60.0 * hour_rate, 2), format('%s دقيقة', unpaid_min)); end if;
    if n_absent > 0 and e.pay_type = 'monthly' then insert into payslip_lines (payslip_id, kind, code, label, amount, reason) values (v_ps, 'deduct', 'absent', 'خصم الغياب', round(n_absent * coalesce((cfg->>'absence_days')::numeric, 1) * day_rate, 2), format('%s يوم غياب من غير إذن (كل يوم = %s يوم خصم)', n_absent, coalesce(cfg->>'absence_days', '1'))); end if;
    if n_unpaid > 0 and e.pay_type = 'monthly' then insert into payslip_lines (payslip_id, kind, code, label, amount, reason) values (v_ps, 'deduct', 'unpaid', 'إجازة بدون مرتب', round(n_unpaid * day_rate, 2), format('%s يوم', n_unpaid)); end if;
    if n_sick > 0 and e.pay_type = 'monthly' and coalesce((lv->>'sick_pay_pct')::numeric, 100) < 100 then
      insert into payslip_lines (payslip_id, kind, code, label, amount, reason) values (v_ps, 'deduct', 'sick', 'فرق الإجازة المرضي', round(n_sick * day_rate * (100 - (lv->>'sick_pay_pct')::numeric) / 100, 2), format('%s يوم مرضي بيتدفع %s%%', n_sick, lv->>'sick_pay_pct')); end if;
    if n_prehire > 0 and e.pay_type = 'monthly' then insert into payslip_lines (payslip_id, kind, code, label, amount, reason) values (v_ps, 'deduct', 'prehire', 'أيام قبل التعيين', round(n_prehire * day_rate, 2), format('اتعيّنت يوم %s', e.hire_date)); end if;
    insert into payslip_lines (payslip_id, kind, code, label, amount, reason)
      select v_ps, a.kind, 'adj:' || a.id, a.label, a.amount, a.reason from payroll_adjustments a where a.user_id = e.user_id and a.month = m0 and not a.cancelled;
    insert into payslip_lines (payslip_id, kind, code, label, amount, reason)
      select v_ps, 'deduct', 'adv:' || i.id, 'قسط سلفة', i.amount, format('سلفة %s ج — القسط %s من %s', r.amount,
        (select count(*) from advance_installments i2 where i2.request_id = i.request_id and i2.month <= i.month), r.installments)
      from advance_installments i join leave_requests r on r.id = i.request_id where i.user_id = e.user_id and i.month = m0 and i.payslip_id is null;
    if coalesce((cfg->>'shortage_to_payroll')::boolean, true) then
      insert into payslip_lines (payslip_id, kind, code, label, amount, reason)
        select v_ps, 'deduct', 'short:' || c.id, 'عجز عهدة', c.amount, c.note from custody_moves c where c.user_id = e.user_id and c.kind = 'shortage' and c.status = 'ok' and c.payroll_month is null;
    end if;
    -- مشتريات آجل لحد آخر الشهر
    insert into payslip_lines (payslip_id, kind, code, label, amount, reason)
      select v_ps, 'deduct', 'buy:' || s.id, 'مشتريات آجل', s.paid_staff, format('فاتورة %s — %s — %s', s.no, (select name from locations where id = s.location_id), to_char(s.at at time zone 'Africa/Cairo', 'DD/MM'))
      from sales s where s.staff_id = e.user_id and s.staff_month is null and s.paid_staff > 0 and s.at < (m1 + 1)::timestamp at time zone 'Africa/Cairo';
    v_ins := round(e.insurance_wage * coalesce((cfg->>'ins_pct')::numeric, 11) / 100, 2);
    if v_ins > 0 then insert into payslip_lines (payslip_id, kind, code, label, amount, reason) values (v_ps, 'deduct', 'ins', 'التأمينات (حصة الموظف)', v_ins, format('%s%% من أجر التأمينات %s', cfg->>'ins_pct', e.insurance_wage)); end if;
    select coalesce(sum(amount) filter (where kind = 'earn'), 0) - coalesce(sum(amount) filter (where kind = 'deduct' and code in ('late','early','permit','absent','unpaid','sick','prehire')), 0)
      into v_gross from payslip_lines where payslip_id = v_ps;
    v_tax := round(calc_tax_annual(greatest(0, v_gross - v_ins) * 12, cfg) / 12, 2);
    if v_tax > 0 then insert into payslip_lines (payslip_id, kind, code, label, amount, reason) values (v_ps, 'deduct', 'tax', 'ضريبة كسب العمل', v_tax, 'محسوبة على الصافي بعد التأمينات × 12 شهر بالشرايح'); end if;

    select coalesce(sum(amount) filter (where kind = 'earn'), 0), coalesce(sum(amount) filter (where kind = 'deduct'), 0) into v_gross, v_ded from payslip_lines where payslip_id = v_ps;
    update payslips set gross = v_gross, deductions = v_ded, net = v_gross - v_ded where id = v_ps;
  end loop;
  return run.id;
end $$;

-- الاعتماد: نفس اللي قبل + قفل المشتريات + خصومات الحضور الجديدة في التكلفة
create or replace function public.payroll_approve(p_run bigint) returns void
language plpgsql security definer set search_path = public as $$
declare run payroll_runs%rowtype; s record; v_cat bigint;
begin
  if not is_staff() or not has_perm('hr.pay') then raise exception 'محتاج صلاحية المرتبات'; end if;
  select * into run from payroll_runs where id = p_run for update;
  if run.status <> 'sent' then raise exception 'لازم المرتبات تتبعت للاعتماد الأول'; end if;
  if run.sent_by = auth.uid() and not is_owner() then raise exception 'اللي بعت المرتبات للاعتماد مايعتمدهاش'; end if;
  update payroll_runs set status = 'approved', approved_by = auth.uid(), approved_at = now() where id = p_run;
  update advance_installments i set payslip_id = l.payslip_id from payslip_lines l join payslips p on p.id = l.payslip_id
    where p.run_id = p_run and p.ver = run.ver and l.code = 'adv:' || i.id;
  update custody_moves c set payroll_month = run.month from payslip_lines l join payslips p on p.id = l.payslip_id
    where p.run_id = p_run and p.ver = run.ver and l.code = 'short:' || c.id;
  update payroll_adjustments a set payslip_id = l.payslip_id from payslip_lines l join payslips p on p.id = l.payslip_id
    where p.run_id = p_run and p.ver = run.ver and l.code = 'adj:' || a.id;
  update sales x set staff_month = run.month from payslip_lines l join payslips p on p.id = l.payslip_id
    where p.run_id = p_run and p.ver = run.ver and l.code = 'buy:' || x.id;
  select id into v_cat from expense_categories where name like 'مرتبات%' limit 1;
  for s in select coalesce(location_id, 'main') loc, sum(gross - coalesce((select sum(amount) from payslip_lines l where l.payslip_id = p.id and l.code in ('late','early','permit','absent','unpaid','sick','prehire')), 0)) amt
           from payslips p where run_id = p_run and ver = run.ver group by 1 loop
    if s.amt > 0 then
      insert into expenses (day, location_id, category_id, amount, paid_from, note, status, payroll_run_id)
        values ((run.month + interval '1 month' - interval '1 day')::date, s.loc, v_cat, s.amt, 'bank', 'مرتبات ' || month_name(run.month), 'ok', p_run);
    end if;
  end loop;
  for s in select user_id, net from payslips where run_id = p_run and ver = run.ver loop
    perform staff_note(s.user_id, 'مرتبك نزل 💰', format('مرتب %s اتعتمد — الصافي %s ج. التفاصيل في "مرتبي".', month_name(run.month), round(s.net)));
  end loop;
end $$;

-- أرصدتي: + أيام الشركة من الرصيد + المشتريات + وردية النهارده وبكره + الأذون
create or replace function public.my_balances() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare lv jsonb := (select value from settings where key = 'hr.leave'); y0 date := date_trunc('year', now() at time zone 'Africa/Cairo')::date; y1 date; hd date; ent numeric;
        v_loc text; v_fb numeric; t date := (now() at time zone 'Africa/Cairo')::date;
begin
  y1 := (y0 + interval '1 year' - interval '1 day')::date;
  select hire_date into hd from employee_pay where user_id = auth.uid();
  select home_loc into v_loc from profiles where id = auth.uid();
  ent := case when hd is not null and hd > (now() - interval '1 year')::date then coalesce((lv->>'first_year')::numeric, 15) else coalesce((lv->>'annual')::numeric, 21) end;
  select count(*) into v_fb from company_days c where c.kind = 'from_balance' and not c.cancelled and c.day between y0 and y1
    and (c.scope = 'all' or (c.scope = 'loc' and c.location_id = v_loc) or (c.scope = 'users' and auth.uid() = any(c.users)));
  return jsonb_build_object(
    'annual_total', ent, 'casual_total', coalesce((lv->>'casual')::numeric, 7), 'company_from_balance', v_fb,
    'used', (select coalesce(jsonb_object_agg(kind, n), '{}'::jsonb) from (
       select kind, sum(least(to_date, y1) - greatest(from_date, y0) + 1) n from leave_requests
       where user_id = auth.uid() and status = 'approved' and kind <> 'advance' and to_date >= y0 and from_date <= y1 group by kind) z),
    'advances', (select coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'amount', r.amount, 'installments', r.installments,
        'paid', (select coalesce(sum(i.amount), 0) from advance_installments i where i.request_id = r.id and i.payslip_id is not null),
        'next', (select min(i.month) from advance_installments i where i.request_id = r.id and i.payslip_id is null),
        'monthly', (select max(i.amount) from advance_installments i where i.request_id = r.id)) order by r.id desc), '[]'::jsonb)
       from leave_requests r where r.user_id = auth.uid() and r.kind = 'advance' and r.status = 'approved'
         and exists (select 1 from advance_installments i where i.request_id = r.id and i.payslip_id is null)),
    'custody', custody_balance(auth.uid()),
    'purchases', (select jsonb_build_object('total', coalesce(sum(paid_staff), 0), 'limit', coalesce((select (value->>'limit_month')::numeric from settings where key = 'hr.staff_credit'), 0),
        'list', coalesce(jsonb_agg(jsonb_build_object('no', no, 'at', at, 'amount', paid_staff) order by at desc), '[]'::jsonb))
       from sales where staff_id = auth.uid() and staff_month is null and paid_staff > 0),
    'shifts', (select coalesce(jsonb_agg(jsonb_build_object('day', p.day, 'off', p.off, 'start', p.start_at, 'end', p.end_at, 'loc', l.name) order by p.day), '[]'::jsonb)
       from shift_plans p left join locations l on l.id = p.location_id where p.user_id = auth.uid() and p.day between t and t + 6),
    'days', (select coalesce(jsonb_agg(jsonb_build_object('day', c.day, 'kind', c.kind, 'name', c.name) order by c.day), '[]'::jsonb)
       from company_days c where not c.cancelled and c.day between t and t + 60
         and (c.scope = 'all' or (c.scope = 'loc' and c.location_id = v_loc) or (c.scope = 'users' and auth.uid() = any(c.users)))),
    'permits', (select coalesce(jsonb_agg(jsonb_build_object('id', a.id, 'day', a.day, 'kind', a.kind, 'time', a.at_time, 'paid', a.paid, 'status', a.status, 'reason', a.reason) order by a.id desc), '[]'::jsonb)
       from (select * from attendance_permits where user_id = auth.uid() order by id desc limit 20) a));
end $$;

revoke execute on function public.manages(uuid), public.shift_set(jsonb), public.permit_grant(uuid, date, text, time, boolean, text), public.permit_request(date, text, time, text),
  public.permit_decide(bigint, boolean, boolean), public.staff_credit_check(text) from anon, public;
grant execute on function public.manages(uuid), public.shift_set(jsonb), public.permit_grant(uuid, date, text, time, boolean, text), public.permit_request(date, text, time, text),
  public.permit_decide(bigint, boolean, boolean), public.staff_credit_check(text) to authenticated;
