-- ============ 0003 المخزون: دفتر حركات (مفيش رصيد بيتكتب بإيد)، والعلب بأرقام مسلسلة ============

create sequence public.box_sn start 1201;

-- كل علبة من التغليف ليها رقم مميز واحد
create table public.boxes (
  sn bigint primary key default nextval('public.box_sn'),
  item_id bigint not null references public.items,
  weight numeric not null,
  scale_code text,                 -- باركود الميزان اللي اتمسح
  prod_order text,
  packed_by uuid default auth.uid(),
  packed_at timestamptz not null default now(),
  expires_at timestamptz,
  location_id text not null default 'factory' references public.locations,
  status text not null default 'stock' check (status in ('stock','loaded','sold','waste','donated')),
  crate text                       -- الصندوق البلاستيك اللي اتحمّل فيه
);
create index boxes_loc on public.boxes (location_id, status);

-- دفتر الحركات: كل دخول/خروج سطر. التحويل = سطرين بنفس ref (خروج من هنا ودخول هناك) فمفيش عدّ مرتين
create table public.stock_moves (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  item_id bigint not null references public.items,
  location_id text not null references public.locations,
  qty numeric not null,            -- موجب = دخول، سالب = خروج
  kind text not null check (kind in ('pack','receive','sale','transfer','adjust','waste','donate','count','return','production')),
  reason text,
  ref text,                        -- رقم التحويل/الفاتورة/الأمر
  box_sn bigint references public.boxes,
  unit_cost numeric,
  by uuid default auth.uid()
);
create index moves_item_loc on public.stock_moves (item_id, location_id);
create index moves_ref on public.stock_moves (ref);

create view public.stock_balance with (security_invoker = true) as
  select item_id, location_id, sum(qty) as qty
  from public.stock_moves group by item_id, location_id;

-- تحويل بين موقعين في عملية واحدة
create or replace function public.transfer_stock(p_item bigint, p_from text, p_to text, p_qty numeric, p_reason text default null)
returns text language plpgsql security invoker set search_path = public as $$
declare r text := 'TR-' || to_char(now(), 'YYMMDDHH24MISS') || '-' || floor(random()*1000)::int;
begin
  if p_qty <= 0 then raise exception 'الكمية لازم تبقى أكبر من صفر'; end if;
  -- منتجات روستو بالعلب: ممنوع تتحوّل بكمية — لازم transfer_boxes
  if exists (select 1 from items where id = p_item and arm = 'rostos') then
    raise exception 'الصنف ده بيتحوّل بمسح العلب بس';
  end if;
  insert into stock_moves (item_id, location_id, qty, kind, reason, ref) values
    (p_item, p_from, -p_qty, 'transfer', p_reason, r),
    (p_item, p_to,    p_qty, 'transfer', p_reason, r);
  return r;
end $$;

alter table public.boxes enable row level security;
alter table public.stock_moves enable row level security;

create policy box_read on public.boxes for select to authenticated using (has_perm('stock.view') or has_perm('prod.pack') or has_perm('trips.load'));
create policy box_ins on public.boxes for insert to authenticated with check (has_perm('prod.pack'));
create policy box_upd on public.boxes for update to authenticated using (has_perm('prod.pack') or has_perm('trips.load') or has_perm('stock.edit'));

create policy mv_read on public.stock_moves for select to authenticated using (has_perm('stock.view'));
create policy mv_ins on public.stock_moves for insert to authenticated with check (
  case kind
    when 'adjust' then has_perm('stock.adjust')
    when 'waste' then has_perm('stock.waste')
    when 'donate' then has_perm('stock.donate')
    when 'pack' then has_perm('prod.pack')
    when 'sale' then has_perm('pos.sell')
    else has_perm('stock.edit') end);
-- الحركات مابتتمسحش ولا تتعدل؛ الغلط بيتصلّح بحركة عكسية
