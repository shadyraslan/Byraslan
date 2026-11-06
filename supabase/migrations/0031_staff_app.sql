-- ============ 0031 تطبيق الموظف والسواق: حضور بالموقع والسيلفي، موبايل واحد، إجازات وسلف، رسايل الإدارة، اللايحة، رحلات السواق ============
insert into public.permissions (id, grp, label) values
  ('hr.attendance','الموارد البشرية','الموافقة على استثناءات الحضور (برّه النطاق، موبايل جديد)'),
  ('hr.leaves','الموارد البشرية','الموافقة على الإجازات والسلف (السلف بحد مبلغ)'),
  ('hr.messages','الموارد البشرية','بعت رسايل للموظفين')
on conflict do nothing;

alter table public.locations add column if not exists lat double precision;
alter table public.locations add column if not exists lng double precision;
alter table public.locations add column if not exists radius_m int not null default 150;
alter table public.profiles add column if not exists policy_ver int not null default 0;
alter table public.trips add column if not exists driver_id uuid references public.profiles;
alter table public.trips add column if not exists loaded_ok_at timestamptz;

insert into public.settings (key, value) values
  ('hr.policy', '{"ver":1,"text":"لايحة العمل في باي رسلان (مسودة لحد ما تتراجع):\n• الحضور والانصراف من التطبيق في مكان الشغل.\n• التأخير والغياب بيتحسبوا حسب اللايحة.\n• الإجازة والسلفة بتتطلب من التطبيق وبتستنى موافقة المدير.\n• الالتزام بالنضافة وسلامة الغذاء والشهادة الصحية سارية."}'),
  ('hr.selfie_required', 'true'),
  ('hr.one_device', 'true')
on conflict do nothing;

create table public.staff_devices (
  user_id uuid primary key references public.profiles,
  device_id text not null,
  model text,
  at timestamptz not null default now()
);

create table public.attendance (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references public.profiles,
  kind text not null check (kind in ('in','out')),
  at timestamptz not null default now(),
  location_id text references public.locations,
  lat double precision, lng double precision, accuracy double precision, distance_m int,
  selfie text,
  device_id text,
  report text,
  status text not null default 'ok' check (status in ('ok','pending','rejected')),
  flags text[] not null default '{}',
  decided_by uuid, decided_at timestamptz, decision_note text
);
create index att_user_day on public.attendance (user_id, at);

create table public.leave_requests (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references public.profiles,
  kind text not null check (kind in ('annual','casual','sick','unpaid','advance')),
  from_date date, to_date date,
  amount numeric,
  note text,
  status text not null default 'pending' check (status in ('pending','approved','rejected','cancelled')),
  at timestamptz not null default now(),
  decided_by uuid, decided_at timestamptz, decision_note text
);

create table public.staff_messages (
  id bigint generated always as identity primary key,
  title text not null,
  body text not null,
  target text not null default 'all' check (target in ('all','loc','user')),
  location_id text references public.locations,
  user_id uuid references public.profiles,
  needs_ack boolean not null default false,
  by uuid not null default auth.uid(),
  at timestamptz not null default now()
);
create table public.staff_message_reads (
  message_id bigint not null references public.staff_messages,
  user_id uuid not null default auth.uid() references public.profiles,
  read_at timestamptz not null default now(),
  ack_at timestamptz,
  primary key (message_id, user_id)
);

alter table public.staff_devices enable row level security;
alter table public.attendance enable row level security;
alter table public.leave_requests enable row level security;
alter table public.staff_messages enable row level security;
alter table public.staff_message_reads enable row level security;
create policy staff_only on public.staff_devices as restrictive for all to authenticated using (public.is_staff()) with check (public.is_staff());
create policy staff_only on public.attendance as restrictive for all to authenticated using (public.is_staff()) with check (public.is_staff());
create policy staff_only on public.leave_requests as restrictive for all to authenticated using (public.is_staff()) with check (public.is_staff());
create policy staff_only on public.staff_messages as restrictive for all to authenticated using (public.is_staff()) with check (public.is_staff());
create policy staff_only on public.staff_message_reads as restrictive for all to authenticated using (public.is_staff()) with check (public.is_staff());
create policy sd_read on public.staff_devices for select to authenticated using (user_id = auth.uid() or has_perm('hr.attendance'));
create policy sd_reset on public.staff_devices for update to authenticated using (has_perm('hr.attendance'));
create policy at_read on public.attendance for select to authenticated using (user_id = auth.uid() or has_perm('hr.view') or has_perm('hr.attendance'));
create policy at_upd on public.attendance for update to authenticated using (has_perm('hr.attendance'));
create policy lr_read on public.leave_requests for select to authenticated using (user_id = auth.uid() or has_perm('hr.view') or has_perm('hr.leaves'));
create policy lr_ins on public.leave_requests for insert to authenticated with check (user_id = auth.uid());
create policy lr_upd on public.leave_requests for update to authenticated using (has_perm('hr.leaves') or (user_id = auth.uid() and status = 'pending'));
create policy sm_read on public.staff_messages for select to authenticated using (has_perm('hr.messages') or target = 'all'
  or (target = 'user' and user_id = auth.uid()) or (target = 'loc' and location_id = (select home_loc from profiles where id = auth.uid())));
create policy sm_ins on public.staff_messages for insert to authenticated with check (has_perm('hr.messages'));
create policy smr_read on public.staff_message_reads for select to authenticated using (user_id = auth.uid() or has_perm('hr.messages'));
create policy smr_ins on public.staff_message_reads for insert to authenticated with check (user_id = auth.uid());
create policy smr_upd on public.staff_message_reads for update to authenticated using (user_id = auth.uid());

-- صور السيلفي: الموظف بيرفع في فولدره بس، والإدارة بتشوف
insert into storage.buckets (id, name, public) values ('hr', 'hr', false) on conflict do nothing;
create policy hr_ins on storage.objects for insert to authenticated with check (bucket_id = 'hr' and (storage.foldername(name))[1] = auth.uid()::text);
create policy hr_read on storage.objects for select to authenticated using (bucket_id = 'hr' and ((storage.foldername(name))[1] = auth.uid()::text or has_perm('hr.view') or has_perm('hr.attendance')));

-- المسافة بالمتر
create or replace function public.dist_m(a_lat double precision, a_lng double precision, b_lat double precision, b_lng double precision) returns int
language sql immutable as $$
  select round(6371000 * 2 * asin(sqrt(power(sin(radians(b_lat - a_lat) / 2), 2) + cos(radians(a_lat)) * cos(radians(b_lat)) * power(sin(radians(b_lng - a_lng) / 2), 2))))::int
$$;

-- كل اللي الموظف محتاجه في أول شاشة
create or replace function public.staff_home() returns jsonb
language plpgsql stable security invoker set search_path = public as $$
declare p profiles%rowtype; pol jsonb; last attendance%rowtype;
begin
  select * into p from profiles where id = auth.uid();
  if not found or not p.active then raise exception 'الحساب ده مش شغال'; end if;
  pol := (select value from settings where key = 'hr.policy');
  select * into last from attendance where user_id = auth.uid() and status <> 'rejected' order by at desc limit 1;
  return jsonb_build_object(
    'name', p.name, 'job', p.job, 'home', p.home_loc, 'home_name', (select name from locations where id = p.home_loc),
    'policy', pol, 'policy_ok', p.policy_ver >= coalesce((pol->>'ver')::int, 0),
    'selfie', coalesce((select value::text::boolean from settings where key = 'hr.selfie_required'), true),
    'state', case when last.kind = 'in' and last.at > now() - interval '16 hours' then 'in' else 'out' end,
    'last', case when last.id is null then null else jsonb_build_object('kind', last.kind, 'at', last.at, 'status', last.status, 'loc', (select name from locations where id = last.location_id)) end,
    'today', (select coalesce(jsonb_agg(jsonb_build_object('kind', a.kind, 'at', a.at, 'status', a.status, 'flags', a.flags) order by a.at), '[]'::jsonb)
              from attendance a where a.user_id = auth.uid() and a.at >= date_trunc('day', now() at time zone 'Africa/Cairo') at time zone 'Africa/Cairo'),
    'unread', (select count(*) from staff_messages m where (m.target = 'all' or (m.target = 'user' and m.user_id = auth.uid()) or (m.target = 'loc' and m.location_id = p.home_loc))
               and not exists (select 1 from staff_message_reads r where r.message_id = m.id and r.user_id = auth.uid())),
    'is_driver', has_perm('trips.load'));
end $$;

create or replace function public.staff_accept_policy() returns void
language sql security definer set search_path = public as $$
  update profiles set policy_ver = coalesce((select (value->>'ver')::int from settings where key = 'hr.policy'), 0) where id = auth.uid()
$$;

-- تسجيل الحضور/الانصراف: أقرب موقع شغل، والنطاق، والموبايل
create or replace function public.staff_punch(p_kind text, p_lat double precision, p_lng double precision, p_acc double precision, p_selfie text, p_device text, p_model text, p_report text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare p profiles%rowtype; flags text[] := '{}'; best record; dev staff_devices%rowtype; st text := 'ok'; v_id bigint;
begin
  select * into p from profiles where id = auth.uid() and active;
  if not found then raise exception 'الحساب ده مش شغال'; end if;
  if p_kind not in ('in','out') then raise exception 'نوع غلط'; end if;
  if p_lat is null or p_lng is null then raise exception 'شغّل الموقع (GPS) الأول'; end if;
  if coalesce((select value::text::boolean from settings where key = 'hr.selfie_required'), true) and coalesce(p_selfie, '') = '' then raise exception 'صوّر سيلفي الأول'; end if;
  -- أقرب موقع ليه إحداثيات
  select l.id, l.name, l.radius_m, dist_m(p_lat, p_lng, l.lat, l.lng) d into best
    from locations l where l.active and l.lat is not null order by dist_m(p_lat, p_lng, l.lat, l.lng) limit 1;
  if best.id is null then flags := flags || 'مفيش مواقع متحدد لها إحداثيات'::text;
  elsif best.d > best.radius_m + least(coalesce(p_acc, 0), 100) then flags := flags || format('برّه النطاق (%s متر من %s)', best.d, best.name);
  end if;
  if p.home_loc is not null and best.id is not null and best.id <> p.home_loc and best.d <= best.radius_m + 100 then flags := flags || format('سجّل في %s مش مكانه', best.name); end if;
  -- موبايل واحد
  if coalesce((select value::text::boolean from settings where key = 'hr.one_device'), true) then
    select * into dev from staff_devices where user_id = auth.uid();
    if not found then insert into staff_devices (user_id, device_id, model) values (auth.uid(), coalesce(p_device, ''), p_model);
    elsif dev.device_id = '*' then update staff_devices set device_id = coalesce(p_device, ''), model = p_model, at = now() where user_id = auth.uid();  -- اتعمله "موبايل جديد" من السيستم
    elsif dev.device_id <> coalesce(p_device, '') then flags := flags || 'موبايل جديد'::text;
    end if;
  end if;
  if exists (select 1 from unnest(flags) f where f like 'برّه النطاق%' or f = 'موبايل جديد') then st := 'pending'; end if;
  insert into attendance (user_id, kind, location_id, lat, lng, accuracy, distance_m, selfie, device_id, report, status, flags)
    values (auth.uid(), p_kind, best.id, p_lat, p_lng, p_acc, best.d, p_selfie, p_device, nullif(trim(p_report), ''), st, flags) returning id into v_id;
  return jsonb_build_object('id', v_id, 'status', st, 'flags', to_jsonb(flags), 'loc', best.name, 'distance', best.d);
end $$;

create or replace function public.decide_attendance(p_id bigint, p_ok boolean, p_note text) returns void
language plpgsql security invoker set search_path = public as $$
begin
  if not has_perm('hr.attendance') then raise exception 'محتاج صلاحية الحضور'; end if;
  update attendance set status = case when p_ok then 'ok' else 'rejected' end, decided_by = auth.uid(), decided_at = now(), decision_note = p_note where id = p_id and status = 'pending';
  -- الموافقة على "موبايل جديد" بتسجّله كموبايل الموظف
  if p_ok then
    update staff_devices d set device_id = a.device_id, at = now() from attendance a where a.id = p_id and d.user_id = a.user_id and 'موبايل جديد' = any(a.flags);
  end if;
end $$;

create or replace function public.decide_leave(p_id bigint, p_ok boolean, p_note text) returns void
language plpgsql security invoker set search_path = public as $$
declare r leave_requests%rowtype; lim numeric := perm_limit('hr.leaves');
begin
  select * into r from leave_requests where id = p_id and status = 'pending';
  if not found then raise exception 'الطلب ده مش مستني'; end if;
  if lim = -1 then raise exception 'محتاج صلاحية الإجازات والسلف'; end if;
  if p_ok and r.kind = 'advance' and lim is not null and r.amount > lim then raise exception 'السلفة أكبر من حدّك (% ج)', lim; end if;
  update leave_requests set status = case when p_ok then 'approved' else 'rejected' end, decided_by = auth.uid(), decided_at = now(), decision_note = p_note where id = p_id;
end $$;

-- رحلات السواق
create or replace function public.driver_trips() returns jsonb
language sql stable security invoker set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'no', t.no, 'truck', t.truck, 'status', t.status, 'left_at', t.left_at, 'loaded_ok_at', t.loaded_ok_at,
    'stops', (select coalesce(jsonb_agg(jsonb_build_object('loc', tc.to_loc, 'name', l.name, 'crates', tc.n, 'boxes', tc.b,
                 'transfer', (select jsonb_build_object('id', x.id, 'status', x.status) from transfers x where x.trip_id = t.id and x.to_loc = tc.to_loc limit 1)) order by l.sort), '[]'::jsonb)
              from (select c.to_loc, count(distinct c.crate_id) n, count(b.box_sn) b from trip_crates c left join trip_boxes b on b.trip_id = c.trip_id and b.crate_id = c.crate_id and not b.removed
                    where c.trip_id = t.id group by c.to_loc) tc join locations l on l.id = tc.to_loc)) order by t.id desc), '[]'::jsonb)
  from trips t where t.driver_id = auth.uid() and (t.status <> 'done' or t.created_at > now() - interval '2 days')
$$;

create or replace function public.driver_confirm_load(p_trip bigint) returns void
language sql security definer set search_path = public as $$
  update trips set loaded_ok_at = now() where id = p_trip and driver_id = auth.uid()
$$;

revoke execute on function public.staff_punch(text, double precision, double precision, double precision, text, text, text, text), public.staff_accept_policy(), public.driver_confirm_load(bigint) from anon, public;
grant execute on function public.staff_punch(text, double precision, double precision, double precision, text, text, text, text), public.staff_accept_policy(), public.driver_confirm_load(bigint) to authenticated;
