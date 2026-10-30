-- ============ 0004 التحويلات بالمسح: مفيش كمية بتتكتب باليد ============
-- منتجات روستو: كل علبة برقمها. الاستلام بالمسح، واللي مااتمسحش بيتسجّل ناقص لحد ما يتحقق فيه.

alter table public.boxes drop constraint if exists boxes_status_check;
alter table public.boxes add constraint boxes_status_check
  check (status in ('stock','transit','loaded','sold','waste','donated','missing'));

create table public.transfers (
  id bigint generated always as identity primary key,
  no bigint generated always as identity (start 1001),
  from_loc text not null references public.locations,
  to_loc text not null references public.locations,
  status text not null default 'transit' check (status in ('transit','received')),
  reason text,
  note text,
  sent_by uuid default auth.uid(),
  sent_at timestamptz not null default now(),
  recv_by uuid,
  recv_at timestamptz
);

create table public.transfer_boxes (
  transfer_id bigint not null references public.transfers on delete cascade,
  box_sn bigint not null references public.boxes,
  state text not null default 'sent' check (state in ('sent','received','missing','found','lost')),
  primary key (transfer_id, box_sn)
);

-- يبعت تحويل بالعلب اللي اتمسحت: كل علبة لازم تكون في المكان ده وحالتها "مخزون"
create or replace function public.transfer_boxes(p_from text, p_to text, p_boxes bigint[], p_reason text default null, p_note text default null)
returns bigint language plpgsql security invoker set search_path = public as $$
declare t bigint; bad bigint;
begin
  if p_from = p_to then raise exception 'من وإلى لازم يكونوا مختلفين'; end if;
  if coalesce(array_length(p_boxes, 1), 0) = 0 then raise exception 'امسح العلب الأول'; end if;
  select b into bad from unnest(p_boxes) b
    where not exists (select 1 from boxes x where x.sn = b and x.location_id = p_from and x.status = 'stock') limit 1;
  if bad is not null then raise exception 'العلبة #% مش موجودة في المكان ده أو مش متاحة', bad; end if;

  insert into transfers (from_loc, to_loc, reason, note) values (p_from, p_to, p_reason, p_note) returning id into t;
  insert into transfer_boxes (transfer_id, box_sn) select t, b from unnest(p_boxes) b;
  update boxes set status = 'transit' where sn = any(p_boxes);
  insert into stock_moves (item_id, location_id, qty, kind, reason, ref, box_sn)
    select x.item_id, p_from, -x.weight, 'transfer', p_reason, 'T' || t, x.sn from boxes x where x.sn = any(p_boxes);
  return t;
end $$;

-- الاستلام: العلب اللي اتمسحت بتدخل المكان، والباقي بيتسجّل ناقص
create or replace function public.receive_transfer(p_id bigint, p_scanned bigint[])
returns int language plpgsql security invoker set search_path = public as $$
declare tr transfers%rowtype; missing int;
begin
  select * into tr from transfers where id = p_id for update;
  if tr.status <> 'transit' then raise exception 'التحويل ده اتسلّم قبل كده'; end if;
  if exists (select 1 from unnest(p_scanned) b where not exists (select 1 from transfer_boxes where transfer_id = p_id and box_sn = b)) then
    raise exception 'فيه علبة مش من التحويل ده';
  end if;

  update transfer_boxes set state = case when box_sn = any(p_scanned) then 'received' else 'missing' end where transfer_id = p_id;
  update boxes set status = 'stock', location_id = tr.to_loc where sn = any(p_scanned);
  update boxes set status = 'missing' where sn in (select box_sn from transfer_boxes where transfer_id = p_id and state = 'missing');
  insert into stock_moves (item_id, location_id, qty, kind, ref, box_sn)
    select x.item_id, tr.to_loc, x.weight, 'transfer', 'T' || p_id, x.sn from boxes x where x.sn = any(p_scanned);
  update transfers set status = 'received', recv_by = auth.uid(), recv_at = now() where id = p_id;
  select count(*) into missing from transfer_boxes where transfer_id = p_id and state = 'missing';
  return missing;
end $$;

alter table public.transfers enable row level security;
alter table public.transfer_boxes enable row level security;
create policy tr_read on public.transfers for select to authenticated using (has_perm('stock.view') or has_perm('stock.edit'));
create policy tr_ins on public.transfers for insert to authenticated with check (has_perm('stock.edit'));
create policy tr_upd on public.transfers for update to authenticated using (has_perm('stock.edit'));
create policy tb_read on public.transfer_boxes for select to authenticated using (has_perm('stock.view') or has_perm('stock.edit'));
create policy tb_write on public.transfer_boxes for all to authenticated using (has_perm('stock.edit')) with check (has_perm('stock.edit'));
