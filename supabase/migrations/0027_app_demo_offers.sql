-- ============ 0027 التطبيق: أصناف تجريبية (tag demo — تتمسح بعدين)، العروض والبانرات، أكواد الخصم، أول طلب توصيله مجاني، الطلب كزائر، الشكاوى ============
alter table public.items add column if not exists icon text;
alter table public.online_orders add column if not exists discount numeric not null default 0;
alter table public.online_orders add column if not exists promo_code text;

create table if not exists public.app_offers (
  id bigint generated always as identity primary key,
  kind text not null check (kind in ('banner','item')),
  title text, subtitle text, badge text, cta text, icon text, bg text,
  target_family text,              -- البانر بيفتح القسم ده
  item_id bigint references public.items,
  pct numeric,                     -- خصم الصنف %
  active boolean not null default true,
  sort int not null default 0
);
create table if not exists public.app_codes (
  code text primary key,
  pct numeric not null,
  max_off numeric,
  min_order numeric not null default 0,
  active boolean not null default true
);
create table if not exists public.app_complaints (
  id bigint generated always as identity primary key,
  order_id bigint not null references public.online_orders,
  reason text not null,
  details text,
  status text not null default 'new' check (status in ('new','done')),
  at timestamptz not null default now()
);
alter table public.app_offers enable row level security;
alter table public.app_codes enable row level security;
alter table public.app_complaints enable row level security;
create policy staff_only on public.app_offers as restrictive for all to authenticated using (public.is_staff()) with check (public.is_staff());
create policy staff_only on public.app_codes as restrictive for all to authenticated using (public.is_staff()) with check (public.is_staff());
create policy staff_only on public.app_complaints as restrictive for all to authenticated using (public.is_staff()) with check (public.is_staff());
create policy ao_all on public.app_offers for all to authenticated using (has_perm('prices.edit')) with check (has_perm('prices.edit'));
create policy ao_read on public.app_offers for select to authenticated using (true);
create policy ac_all on public.app_codes for all to authenticated using (has_perm('prices.edit')) with check (has_perm('prices.edit'));
create policy ac_read on public.app_codes for select to authenticated using (true);
create policy acm_read on public.app_complaints for select to authenticated using (has_perm('orders.handle'));
create policy acm_upd on public.app_complaints for update to authenticated using (has_perm('orders.handle'));

insert into public.settings (key, value) values
  ('app.first_free', 'true'),
  ('app.support', '{"whatsapp":"","phone":"","faq":[["ازاي أرجّع منتج؟","من طلباتي ← تفاصيل الطلب ← استرجاع أو شكوى، وخدمة العملاء هتكلمك."],["إيه مواعيد التوصيل؟","كل يوم من 9 الصبح لـ 11 بالليل."],["طرق الدفع المتاحة؟","كاش أو فيزا عند الاستلام، أو إنستاباي ومحفظة إلكترونية."],["فين التوصيل المتاح؟","اختار منطقتك من «التوصيل إلى»، ولو مش متغطية هنبلغك أول ما نوصلها."]]}')
on conflict do nothing;

-- ===== أصناف تجريبية بنفس أقسام تطبيق رسلان ماركت =====
do $$
declare f bigint; it bigint; b text; r record;
begin
  if exists (select 1 from items where 'demo' = any(tags)) then return; end if;
  for r in select * from (values
    -- القسم, النشاط, أيقونة القسم, لون, ترتيب, الصنف, الوحدة, بيتباع, أيقونة الصنف, السعر
    ('لحوم ودواجن','rostos','🍗','#FFF5F0',1,'صدور فراخ','كجم','weight','🍗',230),
    ('لحوم ودواجن','rostos','🍗','#FFF5F0',1,'وراك فراخ','كجم','weight','🍗',160),
    ('لحوم ودواجن','rostos','🍗','#FFF5F0',1,'فراخ كاملة','كجم','weight','🐔',140),
    ('لحوم ودواجن','rostos','🍗','#FFF5F0',1,'لحم بقري مفروم','كجم','weight','🥩',420),
    ('لحوم ودواجن','rostos','🍗','#FFF5F0',1,'كفتة بلدي','كجم','weight','🥩',380),
    ('لحوم ودواجن','rostos','🍗','#FFF5F0',1,'شيش طاووق متبّل','كجم','weight','🍢',260),
    ('ألبان وبيض','market','🥛','#F0F8FF',2,'لبن طازج يومي 1 لتر','قطعة','piece','🥛',30),
    ('ألبان وبيض','market','🥛','#F0F8FF',2,'بيض بلدي 30 بيضة','قطعة','piece','🥚',100),
    ('ألبان وبيض','market','🥛','#F0F8FF',2,'زبادي طبيعي','قطعة','piece','🫙',18),
    ('ألبان وبيض','market','🥛','#F0F8FF',2,'قشطة بلدي','قطعة','piece','🧈',35),
    ('فاكهة وخضار','market','🍎','#F0FFF4',3,'طماطم','كجم','weight','🍅',12),
    ('فاكهة وخضار','market','🍎','#F0FFF4',3,'بطاطس','كجم','weight','🥔',10),
    ('فاكهة وخضار','market','🍎','#F0FFF4',3,'موز','كجم','weight','🍌',25),
    ('فاكهة وخضار','market','🍎','#F0FFF4',3,'تفاح','كجم','weight','🍎',60),
    ('الأجبان','market','🧀','#FFFBF0',4,'جبنة رومي 250 جم','قطعة','piece','🧀',45),
    ('الأجبان','market','🧀','#FFFBF0',4,'جبنة بيضاء 500 جم','قطعة','piece','🧀',30),
    ('سناكس وحلويات','market','🍫','#FFF0F5',5,'شيكولاتة باللبن','قطعة','piece','🍫',8),
    ('سناكس وحلويات','market','🍫','#FFF0F5',5,'شيبسي','قطعة','piece','🥨',10),
    ('مشروبات','market','🥤','#F0F8FF',6,'مياه معدنية 1.5 لتر','قطعة','piece','💧',7),
    ('مشروبات','market','🥤','#F0F8FF',6,'عصير برتقال','قطعة','piece','🧃',20),
    ('قهوة وشاي','market','☕','#FDF5E4',7,'شاي 250 جم','قطعة','piece','🍵',35),
    ('قهوة وشاي','market','☕','#FDF5E4',7,'بن محوّج 250 جم','قطعة','piece','☕',95),
    ('مثلجات','market','🧊','#F0F8FF',8,'آيس كريم فانيليا','قطعة','piece','🍦',20),
    ('تنظيف وغسيل','market','🧹','#F0FFF8',9,'سائل أطباق','قطعة','piece','🧽',18),
    ('عناية شخصية','market','🧴','#FDF0FF',10,'شامبو','قطعة','piece','🧴',65),
    ('مواد غذائية','market','🌾','#FFF5F0',11,'أرز مصري 1 كجم','قطعة','piece','🌾',30),
    ('مواد غذائية','market','🌾','#FFF5F0',11,'سكر 1 كجم','قطعة','piece','🍬',32)
  ) v(fam, arm, ficon, fcolor, fsort, name, unit, sold_by, icon, price) loop
    select id into f from families where name = r.fam and parent_id is null and arm = r.arm;
    if f is null then
      insert into families (name, arm, icon, color, sort, tag) values (r.fam, r.arm, r.ficon, r.fcolor, r.fsort, 'demo') returning id into f;
    end if;
    insert into items (name, arm, unit, sold_by, family_id, tags, icon, kind) values (r.name, r.arm, r.unit, r.sold_by, f, '{demo}', r.icon, 'product') returning id into it;
    foreach b in array array['roushdy','agamy','masr-gedida','maadi'] loop
      insert into prices (item_id, location_id, channel, price) values (it, b, 'app', r.price), (it, b, 'direct', r.price) on conflict do nothing;
      insert into stock_moves (item_id, location_id, qty, kind, ref) values (it, b, 100, 'adjust', 'DEMO');
    end loop;
  end loop;
end $$;

-- عروض وبانرات تجريبية زي تصميم التطبيق
insert into public.app_offers (kind, title, subtitle, badge, cta, icon, bg, target_family, sort)
select * from (values
  ('banner','خصومات حتى 50% على الكل','على منتجات مختارة','🔥 عرض محدود','اطلب دلوقتي','🛒','#1A1A1A',null::text,1),
  ('banner','لحوم ودواجن طازجة يومياً','توصيل مباشر','🍗 جديد','اطلب دلوقتي','🥩','#2A2000','لحوم ودواجن',2),
  ('banner','توصيل خلال 30 دقيقة','على الطلبات فوق 150 ج','⚡ سريع','اعرف أكتر','⚡','#0D0D0D',null,3)
) v(kind,title,subtitle,badge,cta,icon,bg,target_family,sort)
where not exists (select 1 from public.app_offers where kind = 'banner');
insert into public.app_offers (kind, item_id, pct, sort)
select 'item', i.id, v.pct, 10 from (values ('لبن طازج يومي 1 لتر',17),('بيض بلدي 30 بيضة',15),('قشطة بلدي',10),('صدور فراخ',10)) v(n,pct)
join items i on i.name = v.n and 'demo' = any(i.tags)
where not exists (select 1 from public.app_offers where kind = 'item');
insert into public.app_codes (code, pct, max_off, min_order) values ('RASLAN10', 10, 50, 200) on conflict do nothing;

-- ===== الكتالوج بالخصم =====
create or replace function public.item_pct(p_item bigint) returns numeric
language sql stable security definer set search_path = public as $$
  select coalesce(max(pct), 0) from app_offers where kind = 'item' and active and item_id = p_item
$$;

create or replace function public.app_catalog2(p_loc text)
returns table (item_id bigint, name text, unit text, sold_by text, price numeric, old_price numeric, pct numeric, family text, brand text, available numeric, photo text, icon text, color text)
language sql stable security definer set search_path = public as $$
  select i.id, i.name, i.unit, i.sold_by,
         round(p.price * (1 - item_pct(i.id) / 100)), case when item_pct(i.id) > 0 then p.price end, item_pct(i.id),
         f.name, i.arm,
         coalesce((select sum(case when i.sold_by = 'piece' then 1 else b.weight end) from boxes b where b.item_id = i.id and b.location_id = p_loc and b.status = 'stock'), 0)
           + coalesce((select sum(m.qty) from stock_moves m where m.item_id = i.id and m.location_id = p_loc and m.box_sn is null), 0),
         i.photo, coalesce(i.icon, f.icon, pf.icon), coalesce(f.color, pf.color)
  from prices p join items i on i.id = p.item_id left join families f on f.id = i.family_id left join families pf on pf.id = f.parent_id
  where p.location_id = p_loc and p.channel = 'app' and i.active and not i.partner_only
  order by coalesce(f.sort, 999), i.arm, i.name
$$;

-- حساب السلة: الخصم بالكود + أول طلب توصيله مجاني
create or replace function public.app_quote(p_district bigint, p_phone text, p_lines jsonb, p_code text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_loc text := district_branch(p_district); sub numeric := 0; l jsonb; pr numeric; fee numeric; disc numeric := 0; c app_codes%rowtype; msg text; first boolean := false;
  v_phone text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
begin
  if v_loc is null then return jsonb_build_object('error', 'المنطقة دي لسه مش متغطية'); end if;
  for l in select * from jsonb_array_elements(coalesce(p_lines, '[]')) loop
    select round(p.price * (1 - item_pct(p.item_id) / 100)) into pr from prices p where p.item_id = (l->>'item_id')::bigint and p.location_id = v_loc and p.channel = 'app';
    sub := sub + coalesce(pr, 0) * coalesce((l->>'qty')::numeric, 0);
  end loop;
  fee := coalesce((select d.fee from districts d where d.id = p_district), 0);
  if coalesce((select value::text::boolean from settings where key = 'app.first_free'), false)
     and (v_phone = '' or not exists (select 1 from online_orders o join customers cu on cu.id = o.customer_id where cu.phone = v_phone and o.status <> 'cancelled')) then
    fee := 0; first := true;
  end if;
  if coalesce(trim(p_code), '') <> '' then
    select * into c from app_codes where code = upper(trim(p_code)) and active;
    if not found then msg := 'الكود ده مش شغال';
    elsif sub < c.min_order then msg := format('الكود محتاج طلب %s ج على الأقل', c.min_order);
    else disc := round(least(sub * c.pct / 100, coalesce(c.max_off, sub))); msg := format('اتفعّل: خصم %s%%', c.pct);
    end if;
  end if;
  return jsonb_build_object('sub', sub, 'fee', fee, 'discount', disc, 'total', sub + fee - disc, 'code_ok', disc > 0, 'code_msg', msg, 'first_free', first,
    'min_order', coalesce((select value::text::numeric from settings where key = 'online.min_order'), 0));
end $$;

-- الطلب من التطبيق (زائر أو مسجّل): بالحي والاسم والموبايل
create or replace function public.app_order(p_district bigint, p_phone text, p_name text, p_address text, p_note text, p_pay text, p_lines jsonb, p_code text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r record; q jsonb; o online_orders%rowtype; est numeric;
begin
  q := app_quote(p_district, p_phone, p_lines, p_code);   -- قبل الطلب (عشان "أول طلب" يتحسب صح)
  if q ? 'error' then raise exception '%', q->>'error'; end if;
  select * into r from place_order_d(p_district, p_phone, p_name, p_address, p_note, p_pay, p_lines, 'web');
  select * into o from online_orders where no = r.order_no;
  update online_order_lines l set unit_price = round(l.unit_price * (1 - item_pct(l.item_id) / 100)) where l.order_id = o.id;
  select coalesce(sum(round(qty * unit_price, 2)), 0) into est from online_order_lines where order_id = o.id;
  update online_orders set from_app = true, est_total = est, delivery_fee = (q->>'fee')::numeric, discount = (q->>'discount')::numeric,
         promo_code = case when (q->>'discount')::numeric > 0 then upper(trim(p_code)) end where id = o.id;
  return jsonb_build_object('no', o.no, 'token', o.token, 'total', est + (q->>'fee')::numeric - (q->>'discount')::numeric);
end $$;

create or replace function public.app_track_many(p_tokens text[]) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('no', o.no, 'token', o.token, 'status', o.status, 'created_at', o.created_at, 'branch', l.name, 'district_id', o.district_id,
           'total', coalesce(o.total, o.est_total + o.delivery_fee - o.discount),
           'lines', (select jsonb_agg(jsonb_build_object('item_id', x.item_id, 'name', i.name, 'qty', x.qty, 'unit', i.unit, 'icon', coalesce(i.icon, f.icon)) order by x.line)
                     from online_order_lines x join items i on i.id = x.item_id left join families f on f.id = i.family_id where x.order_id = o.id))
         order by o.id desc), '[]'::jsonb)
  from online_orders o join locations l on l.id = o.location_id where o.token = any(p_tokens[1:50])
$$;

create or replace function public.track_order(p_token text)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('no', o.no, 'status', o.status, 'branch', l.name, 'est_total', o.est_total, 'total', o.total, 'fee', o.delivery_fee, 'discount', o.discount,
    'created_at', o.created_at, 'accepted_at', o.accepted_at, 'ready_at', o.ready_at, 'out_at', o.out_at, 'delivered_at', o.delivered_at,
    'driver', o.driver, 'address', o.address, 'pay', o.pay_method, 'cancel_reason', o.cancel_reason,
    'lines', (select jsonb_agg(jsonb_build_object('item_id', x.item_id, 'name', i.name, 'unit', i.unit, 'qty', x.qty, 'prepared', x.prepared, 'price', x.unit_price, 'icon', coalesce(i.icon, f.icon)) order by x.line)
              from online_order_lines x join items i on i.id = x.item_id left join families f on f.id = i.family_id where x.order_id = o.id))
  from online_orders o join locations l on l.id = o.location_id where o.token = p_token
$$;

create or replace function public.app_complaint(p_token text, p_reason text, p_details text) returns bigint
language plpgsql security definer set search_path = public as $$
declare o bigint; v bigint;
begin
  select id into o from online_orders where token = p_token;
  if o is null then raise exception 'الطلب مش موجود'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'اختار السبب'; end if;
  if (select count(*) from app_complaints where order_id = o) >= 5 then raise exception 'اتبعت كذا شكوى على الطلب ده — خدمة العملاء هتكلمك'; end if;
  insert into app_complaints (order_id, reason, details) values (o, p_reason, nullif(trim(p_details), '')) returning id into v;
  return v;
end $$;

-- التسليم: الإجمالي = الوزن الفعلي + التوصيل − الخصم
create or replace function public.order_deliver(p_id bigint)
returns numeric language plpgsql security invoker set search_path = public as $$
declare o online_orders%rowtype; sub numeric; x record;
begin
  if not has_perm('orders.handle') then raise exception 'محتاج صلاحية الطلبات'; end if;
  select * into o from online_orders where id = p_id for update;
  if not found or o.status <> 'out' then raise exception 'الطلب لازم يكون خرج مع الطيار'; end if;
  for x in select b.box_sn from online_order_boxes b where b.order_id = p_id and not b.removed loop
    update boxes set status = 'sold' where sn = x.box_sn and status = 'stock';
    if not found then raise exception 'العلبة #% مش متاحة', x.box_sn; end if;
    insert into stock_moves (item_id, location_id, qty, kind, ref, box_sn)
      select bx.item_id, o.location_id, -bx.weight, 'sale', 'W' || o.no, bx.sn from boxes bx where bx.sn = x.box_sn;
  end loop;
  insert into stock_moves (item_id, location_id, qty, kind, ref)
    select l.item_id, o.location_id, -(l.prepared - coalesce((select sum(b.qty) from online_order_boxes b where b.order_id = p_id and b.line = l.line and not b.removed), 0)), 'sale', 'W' || o.no
    from online_order_lines l where l.order_id = p_id
      and l.prepared > coalesce((select sum(b.qty) from online_order_boxes b where b.order_id = p_id and b.line = l.line and not b.removed), 0);
  select coalesce(sum(round(prepared * unit_price, 2)), 0) into sub from online_order_lines where order_id = p_id;
  update online_orders set status = 'delivered', delivered_at = now(), subtotal = sub, total = greatest(sub + delivery_fee - discount, 0), paid = true where id = p_id;
  return greatest(sub + o.delivery_fee - o.discount, 0);
end $$;

create or replace function public.app_config() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'brands', coalesce((select value from settings where key = 'app.brands'), '{}'::jsonb),
    'note', (select value from settings where key = 'online.weight_note'),
    'test_mode', coalesce((select value::text::boolean from settings where key = 'app.test_mode'), false),
    'open', coalesce((select value::text::boolean from settings where key = 'online.open'), true),
    'min_order', coalesce((select value::text::numeric from settings where key = 'online.min_order'), 0),
    'first_free', coalesce((select value::text::boolean from settings where key = 'app.first_free'), false),
    'support', coalesce((select value from settings where key = 'app.support'), '{}'::jsonb),
    'banners', (select coalesce(jsonb_agg(jsonb_build_object('title', title, 'subtitle', subtitle, 'badge', badge, 'cta', cta, 'icon', icon, 'bg', bg, 'family', target_family) order by sort), '[]'::jsonb) from app_offers where kind = 'banner' and active),
    'districts', (select coalesce(jsonb_agg(to_jsonb(d)), '[]'::jsonb) from public_districts() d),
    'branches', (select coalesce(jsonb_agg(to_jsonb(b)), '[]'::jsonb) from public_branches() b))
$$;

grant execute on function public.app_catalog2(text) to anon, authenticated;
grant execute on function public.app_quote(bigint, text, jsonb, text) to anon, authenticated;
grant execute on function public.app_order(bigint, text, text, text, text, text, jsonb, text) to anon, authenticated;
grant execute on function public.app_track_many(text[]) to anon, authenticated;
grant execute on function public.app_complaint(text, text, text) to anon, authenticated;
