-- ============ 0019 الحسابات: مصروفات بحد مبلغ لكل موظف + موافقة، مديونية الموردين ومدفوعاتهم، ملخص يومي ============

insert into public.permissions (id, grp, label) values
  ('acc.approve','الحسابات','الموافقة على مصروف أكبر من حد الموظف (بحد مبلغ)'),
  ('acc.pay','الحسابات','دفع للموردين (بحد مبلغ)')
on conflict do nothing;

-- حد المبلغ للصلاحية: null = مفتوح (المالك أو صلاحية من غير حد)، -1 = مالوش الصلاحية
create or replace function public.perm_limit(p text)
returns numeric language sql stable security definer set search_path = public as $$
  select case when public.is_owner() then null
    else (select case when g.perm is null then -1 else g.max_amount end
          from (select 1) x left join grants g on g.user_id = auth.uid() and g.perm = p and (g.until is null or g.until >= current_date)) end
$$;

create table public.expense_categories (
  id bigint generated always as identity primary key,
  name text not null unique,
  active boolean not null default true
);
insert into public.expense_categories (name) values
  ('إيجار'),('كهرباء'),('مياه'),('غاز'),('مرتبات ويوميات'),('صيانة'),('نقل وبنزين'),('تسويق'),('مستلزمات وأدوات نظافة'),('عمولات توصيل'),('أخرى')
on conflict do nothing;

create table public.expenses (
  id bigint generated always as identity primary key,
  no bigint generated always as identity (start with 5001),
  day date not null default (now() at time zone 'Africa/Cairo')::date,
  location_id text not null references public.locations,
  category_id bigint not null references public.expense_categories,
  amount numeric not null check (amount > 0),
  paid_from text not null default 'cash' check (paid_from in ('cash','bank','shift')),
  shift_id bigint references public.shifts,
  note text,
  photo text,
  status text not null default 'ok' check (status in ('ok','pending','rejected')),
  by uuid not null default auth.uid(),
  at timestamptz not null default now(),
  decided_by uuid,
  decided_at timestamptz,
  decision_note text
);

create or replace function public.add_expense(p_loc text, p_cat bigint, p_amount numeric, p_from text, p_note text, p_photo text, p_day date default null)
returns table (expense_no bigint, exp_status text) language plpgsql security invoker set search_path = public as $$
declare lim numeric := perm_limit('acc.post'); st text := 'ok'; v_no bigint; v_shift bigint;
begin
  if lim = -1 then raise exception 'محتاج صلاحية تسجيل المصروفات'; end if;
  if coalesce(p_amount, 0) <= 0 then raise exception 'اكتب المبلغ'; end if;
  if lim is not null and p_amount > lim then st := 'pending'; end if;
  if p_from = 'shift' then
    select id into v_shift from shifts where cashier = auth.uid() and status = 'open';
    if v_shift is null then raise exception 'مفيش وردية مفتوحة باسمك'; end if;
  end if;
  insert into expenses (day, location_id, category_id, amount, paid_from, shift_id, note, photo, status)
    values (coalesce(p_day, (now() at time zone 'Africa/Cairo')::date), p_loc, p_cat, p_amount, p_from, v_shift, nullif(trim(p_note), ''), p_photo, st)
    returning no into v_no;
  return query select v_no, st;
end $$;

create or replace function public.decide_expense(p_id bigint, p_approve boolean, p_note text)
returns void language plpgsql security invoker set search_path = public as $$
declare e expenses%rowtype; lim numeric := perm_limit('acc.approve');
begin
  select * into e from expenses where id = p_id for update;
  if not found or e.status <> 'pending' then raise exception 'المصروف ده مش مستني موافقة'; end if;
  if lim = -1 then raise exception 'محتاج صلاحية الموافقة على المصروفات'; end if;
  if p_approve and lim is not null and e.amount > lim then raise exception 'المبلغ أكبر من حد موافقتك (% ج)', lim; end if;
  update expenses set status = case when p_approve then 'ok' else 'rejected' end, decided_by = auth.uid(), decided_at = now(), decision_note = p_note where id = p_id;
end $$;

-- مدفوعات الموردين
create table public.supplier_payments (
  id bigint generated always as identity primary key,
  no bigint generated always as identity (start with 7001),
  supplier_id bigint not null references public.suppliers,
  amount numeric not null check (amount > 0),
  method text not null default 'cash' check (method in ('cash','bank','check','instapay')),
  ref text,
  note text,
  by uuid not null default auth.uid(),
  at timestamptz not null default now()
);

create or replace function public.pay_supplier(p_sup bigint, p_amount numeric, p_method text, p_ref text, p_note text)
returns bigint language plpgsql security invoker set search_path = public as $$
declare lim numeric := perm_limit('acc.pay'); v_no bigint;
begin
  if lim = -1 then raise exception 'محتاج صلاحية الدفع للموردين'; end if;
  if lim is not null and p_amount > lim then raise exception 'المبلغ أكبر من حدّك في الدفع (% ج)', lim; end if;
  insert into supplier_payments (supplier_id, amount, method, ref, note) values (p_sup, p_amount, p_method, nullif(trim(p_ref), ''), nullif(trim(p_note), '')) returning no into v_no;
  return v_no;
end $$;

-- كشف حساب المورد: كل إذن استلام مدين، كل دفعة دائن
create or replace view public.supplier_ledger with (security_invoker = true) as
  select r.supplier_id, r.at, 'GRN-' || r.no as ref, coalesce(r.invoice_no, '') as note,
         (select coalesce(sum(l.accepted * l.price), 0) from receipt_lines l where l.receipt_id = r.id) as debit, 0::numeric as credit
  from receipts r
  union all
  select p.supplier_id, p.at, 'PAY-' || p.no, p.method || coalesce(' ' || p.ref, ''), 0, p.amount from supplier_payments p;

create or replace view public.supplier_balances with (security_invoker = true) as
  select s.id as supplier_id, s.name, s.phone, s.terms,
         coalesce(sum(l.debit), 0) as purchases, coalesce(sum(l.credit), 0) as paid, coalesce(sum(l.debit - l.credit), 0) as balance,
         max(l.at) filter (where l.credit > 0) as last_pay
  from suppliers s left join supplier_ledger l on l.supplier_id = s.id
  group by s.id;

-- الملخص اليومي لكل موقع
create or replace view public.daily_summary with (security_invoker = true) as
  with s as (select (at at time zone 'Africa/Cairo')::date as day, location_id, sum(total) as sales, sum(paid_cash - change) as cash, sum(paid_card) as card, count(*) as n from sales group by 1, 2),
       e as (select day, location_id, sum(amount) as expenses from expenses where status = 'ok' group by 1, 2),
       p as (select (r.at at time zone 'Africa/Cairo')::date as day, 'main'::text as location_id, sum(l.accepted * l.price) as purchases
             from receipts r join receipt_lines l on l.receipt_id = r.id group by 1)
  select coalesce(s.day, e.day, p.day) as day, coalesce(s.location_id, e.location_id, p.location_id) as location_id,
         coalesce(s.sales, 0) as sales, coalesce(s.cash, 0) as cash, coalesce(s.card, 0) as card, coalesce(s.n, 0) as invoices,
         coalesce(e.expenses, 0) as expenses, coalesce(p.purchases, 0) as purchases
  from s full join e on e.day = s.day and e.location_id = s.location_id
         full join p on p.day = coalesce(s.day, e.day) and p.location_id = coalesce(s.location_id, e.location_id);

alter table public.expense_categories enable row level security;
alter table public.expenses enable row level security;
alter table public.supplier_payments enable row level security;
create policy ec_read on public.expense_categories for select to authenticated using (true);
create policy ec_write on public.expense_categories for all to authenticated using (has_perm('acc.approve')) with check (has_perm('acc.approve'));
create policy ex_read on public.expenses for select to authenticated using (by = auth.uid() or has_perm('acc.view'));
create policy ex_ins on public.expenses for insert to authenticated with check (has_perm('acc.post'));
create policy ex_upd on public.expenses for update to authenticated using (has_perm('acc.approve'));
create policy sp_read on public.supplier_payments for select to authenticated using (has_perm('acc.view') or has_perm('acc.pay'));
create policy sp_ins on public.supplier_payments for insert to authenticated with check (has_perm('acc.pay'));
create trigger audit_expenses after insert or update or delete on public.expenses for each row execute function public.audit();
create trigger audit_supplier_payments after insert or update or delete on public.supplier_payments for each row execute function public.audit();

-- مصروف من درج الوردية بيتخصم من النقدية المتوقعة عند القفل
create or replace function public.pos_close_shift(p_shift bigint, p_counted numeric)
returns numeric language plpgsql security invoker set search_path = public as $$
declare sh shifts%rowtype; v_exp numeric;
begin
  select * into sh from shifts where id = p_shift and status = 'open' and (cashier = auth.uid() or has_perm('pos.shift'));
  if not found then raise exception 'الوردية دي مش مفتوحة'; end if;
  select sh.opening_cash + coalesce((select sum(s.paid_cash - s.change) from sales s where s.shift_id = p_shift), 0)
         - coalesce((select sum(e.amount) from expenses e where e.shift_id = p_shift and e.status <> 'rejected'), 0) into v_exp;
  update shifts set status = 'closed', closed_at = now(), counted_cash = p_counted, expected_cash = v_exp where id = p_shift;
  return coalesce(p_counted, 0) - v_exp;
end $$;
