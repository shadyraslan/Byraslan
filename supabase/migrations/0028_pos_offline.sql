-- ============ 0028 الكاشير من غير نت: نسخة من أصناف وأسعار وعلب الفرع على الجهاز، والفواتير بتترفع لما النت يرجع ============
alter table public.sales add column if not exists client_id uuid unique;
alter table public.sales add column if not exists offline boolean not null default false;
alter table public.sales add column if not exists local_no text;
alter table public.sales add column if not exists conflicts text[] not null default '{}';
alter table public.shifts add column if not exists client_id uuid unique;

-- كل اللي الكاشير محتاجه عشان يبيع من غير نت
create or replace function public.pos_snapshot(p_loc text) returns jsonb
language plpgsql stable security invoker set search_path = public as $$
begin
  if not has_perm('pos.sell') then raise exception 'محتاج صلاحية البيع'; end if;
  return jsonb_build_object(
    'loc', p_loc, 'at', now(),
    'name', (select name from locations where id = p_loc),
    'scale', (select value from settings where key = 'scale_barcode'),
    'items', (select coalesce(jsonb_agg(jsonb_build_object('id', i.id, 'name', i.name, 'unit', i.unit, 'sold_by', i.sold_by, 'arm', i.arm, 'kind', i.kind, 'plu', i.scale_plu, 'price', p.price)), '[]'::jsonb)
              from items i join prices p on p.item_id = i.id and p.location_id = p_loc and p.channel = 'direct' where i.active),
    'barcodes', (select coalesce(jsonb_agg(jsonb_build_object('code', c.code, 'item_id', c.item_id)), '[]'::jsonb) from item_barcodes c),
    'boxes', (select coalesce(jsonb_agg(jsonb_build_object('sn', b.sn, 'item_id', b.item_id, 'weight', b.weight)), '[]'::jsonb)
              from boxes b where b.location_id = p_loc and b.status = 'stock'),
    'can_discount', has_perm('pos.discount'));
end $$;

-- رفع الورديات والفواتير اللي اتعملت على الجهاز. بيتنادى أكتر من مرة عادي: اللي اترفع قبل كده مابيتكررش.
-- الفاتورة اللي اتباعت فعلاً مابتترفضش أبداً؛ لو فيها حاجة غلط (علبة مش متاحة، خصم من غير صلاحية) بتتسجّل وتتعلّم للمراجعة.
create or replace function public.pos_sync(p_loc text, p_shifts jsonb, p_sales jsonb) returns jsonb
language plpgsql security invoker set search_path = public as $$
declare s jsonb; x jsonb; l jsonb; v_shift bigint; v_sale bigint; v_no bigint; i int; flags text[]; b boxes%rowtype; out jsonb := '[]'; sh_out jsonb := '[]';
  sub numeric; tot numeric; v_exp numeric;
begin
  if not has_perm('pos.sell') then raise exception 'محتاج صلاحية البيع'; end if;

  -- الورديات
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

  -- الفواتير
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
    insert into sales (location_id, shift_id, at, subtotal, discount, total, paid_cash, paid_card, change, client_id, offline, local_no)
      values (p_loc, v_shift, coalesce((x->>'at')::timestamptz, now()), 0, coalesce((x->>'discount')::numeric, 0), 0,
              coalesce((x->>'cash')::numeric, 0), coalesce((x->>'card')::numeric, 0), 0, (x->>'client_id')::uuid, coalesce((x->>'offline')::boolean, true), x->>'local_no')
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
    update sales set subtotal = sub, total = tot, change = greatest(paid_cash + paid_card - tot, 0), conflicts = flags where id = v_sale;
    out := out || jsonb_build_object('client_id', x->>'client_id', 'no', v_no, 'conflicts', to_jsonb(flags));
  end loop;

  -- قفل الوردية بعد ما فواتيرها اترفعت
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
end $$;
