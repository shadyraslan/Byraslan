-- ============ 0008 التجاوز (Override): السيستم يرفض ← صاحب صلاحية يتجاوز بسبب مكتوب، والطلبات بتستنى موافقة ============
-- الصلاحية override.<نوع> بتتدّي من شاشة الصلاحيات: دايمة أو لحد تاريخ، وبحد مبلغ (grants.max_amount).

insert into public.permissions (id, grp, label) values
  ('override.recv','التجاوز','تجاوز رفض الاستلام (حرارة، صلاحية، فحص، مستندات، مواصفة مش معتمدة)')
on conflict do nothing;

create table public.override_requests (
  id bigint generated always as identity primary key,
  kind text not null,                 -- recv, ... (أي رفض تاني بيتضاف بنفس الشكل)
  ref text not null,                  -- مثلًا رقم أمر التوريد
  violations jsonb not null,          -- [{"t":"الحرارة 7° والحد 4°"}, ...]
  value numeric not null default 0,
  reason text not null,
  requested_by uuid not null default auth.uid(),
  requested_at timestamptz not null default now(),
  status text not null default 'pending' check (status in ('pending','approved','rejected','used')),
  decided_by uuid,
  decided_at timestamptz,
  decision_note text
);

-- له صلاحية التجاوز للقيمة دي؟ (المالك دايمًا)
create or replace function public.can_override(p_kind text, p_value numeric)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_owner() or exists (
    select 1 from grants g where g.user_id = auth.uid() and g.perm = 'override.' || p_kind
      and (g.until is null or g.until >= current_date)
      and (g.max_amount is null or p_value <= g.max_amount))
$$;

create or replace function public.decide_override(p_id bigint, p_approve boolean, p_note text)
returns void language plpgsql security invoker set search_path = public as $$
declare r override_requests%rowtype;
begin
  select * into r from override_requests where id = p_id for update;
  if r.status <> 'pending' then raise exception 'الطلب ده اترد عليه قبل كده'; end if;
  if coalesce(length(trim(p_note)), 0) < 3 then raise exception 'اكتب ملاحظتك'; end if;
  if p_approve and not can_override(r.kind, r.value) then raise exception 'مش معاك صلاحية التجاوز للقيمة دي'; end if;
  update override_requests set status = case when p_approve then 'approved' else 'rejected' end,
    decided_by = auth.uid(), decided_at = now(), decision_note = p_note where id = p_id;
end $$;

alter table public.override_requests enable row level security;
create policy ovr_read on public.override_requests for select to authenticated using (true);
create policy ovr_ins on public.override_requests for insert to authenticated with check (requested_by = auth.uid());
create policy ovr_upd on public.override_requests for update to authenticated using (can_override(kind, value));
create trigger audit_overrides after insert or update on public.override_requests for each row execute function public.audit();
