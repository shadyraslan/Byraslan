-- ============ 0012 عمليات العلب: الناقص (لقيناها/ضاعت)، الهالك والتبرعات بالمسح، وتاريخ كل علبة ============

-- العلبة الناقصة في تحويل: اتلقت ← تدخل المكان اللي كانت رايحاله، ضاعت ← هالك (فقد)
create or replace function public.resolve_missing(p_sn bigint, p_found boolean, p_note text default null)
returns text language plpgsql security invoker set search_path = public as $$
declare tb record; b boxes%rowtype;
begin
  if not has_perm('stock.edit') then raise exception 'محتاج صلاحية المخزون'; end if;
  select t.id, t.no, t.to_loc into tb from transfer_boxes x join transfers t on t.id = x.transfer_id
    where x.box_sn = p_sn and x.state = 'missing' order by t.id desc limit 1;
  if not found then raise exception 'العلبة #% مش متسجّلة ناقصة', p_sn; end if;
  select * into b from boxes where sn = p_sn;
  if p_found then
    update transfer_boxes set state = 'found' where transfer_id = tb.id and box_sn = p_sn;
    update boxes set status = 'stock', location_id = tb.to_loc where sn = p_sn;
    insert into stock_moves (item_id, location_id, qty, kind, reason, ref, box_sn)
      values (b.item_id, tb.to_loc, b.weight, 'transfer', coalesce(p_note, 'اتلقت بعد الاستلام'), 'T' || tb.id, p_sn);
    return 'اتلقت ودخلت المخزون';
  else
    update transfer_boxes set state = 'lost' where transfer_id = tb.id and box_sn = p_sn;
    update boxes set status = 'waste' where sn = p_sn;
    return 'اتسجّلت فقد';
  end if;
end $$;

-- هالك أو تبرعات بالمسح: كل علبة لازم تكون في المكان ده وحالتها مخزون
create or replace function public.dispose_boxes(p_loc text, p_kind text, p_boxes bigint[], p_reason text)
returns int language plpgsql security invoker set search_path = public as $$
declare bad bigint;
begin
  if p_kind not in ('waste', 'donate') then raise exception 'النوع لازم هالك أو تبرعات'; end if;
  if p_kind = 'waste' and not has_perm('stock.waste') then raise exception 'محتاج صلاحية الهالك'; end if;
  if p_kind = 'donate' and not has_perm('stock.donate') then raise exception 'محتاج صلاحية التبرعات'; end if;
  if coalesce(length(trim(p_reason)), 0) < 2 then raise exception 'اكتب السبب'; end if;
  if coalesce(array_length(p_boxes, 1), 0) = 0 then raise exception 'امسح العلب الأول'; end if;
  select x into bad from unnest(p_boxes) x
    where not exists (select 1 from boxes b where b.sn = x and b.location_id = p_loc and b.status = 'stock') limit 1;
  if bad is not null then raise exception 'العلبة #% مش موجودة في المكان ده أو مش متاحة', bad; end if;

  insert into stock_moves (item_id, location_id, qty, kind, reason, ref, box_sn)
    select b.item_id, p_loc, -b.weight, p_kind, p_reason, 'D' || b.sn, b.sn from boxes b where b.sn = any(p_boxes);
  if p_kind = 'waste' then
    update boxes set status = 'waste' where sn = any(p_boxes);
  else
    update boxes set location_id = 'donate' where sn = any(p_boxes);
    insert into stock_moves (item_id, location_id, qty, kind, reason, ref, box_sn)
      select b.item_id, 'donate', b.weight, 'donate', p_reason, 'D' || b.sn, b.sn from boxes b where b.sn = any(p_boxes);
  end if;
  return coalesce(array_length(p_boxes, 1), 0);
end $$;

-- تاريخ العلبة: كل حركة عليها بالترتيب
create or replace view public.box_history with (security_invoker = true) as
  select m.box_sn as sn, m.at, m.kind, m.qty, m.location_id, l.name as location_name, m.reason, m.ref, p.name as by_name
  from stock_moves m join locations l on l.id = m.location_id left join profiles p on p.id = m.by
  where m.box_sn is not null;
