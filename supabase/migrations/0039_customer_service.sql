-- ============ 0039 مركز خدمة العملاء (تذاكر + شات من التطبيق والويب) + طلبات الواتساب والتليفون + لينك سلة جاهزة ============
-- مفيش رسايل مدفوعة: العميل بيكلّمنا من التطبيق أو صفحة ويب، والرد بيوصله إشعار. الواتساب العادي بيوزّع على اللينكات.

insert into public.permissions (id, grp, label) values
  ('cs.agent','خدمة العملاء','الرد على تذاكر العملاء وتسجيل طلبات الواتساب والتليفون'),
  ('cs.manage','خدمة العملاء','توزيع التذاكر وإعدادات خدمة العملاء')
on conflict do nothing;
insert into public.settings (key, value) values
  ('cs.sla_minutes', '15'),
  ('cs.canned', '["أهلاً بيك في باي رسلان 👋 إزاي نقدر نساعدك؟","طلبك بيتجهّز دلوقتي وهيوصلك في أقرب وقت 🚚","آسفين جداً على اللي حصل — هنعوّضك فوراً.","تمام، اتسجّلت ملاحظتك ✅","لو محتاج أي حاجة تانية إحنا موجودين."]'),
  ('cs.whatsapp_api', '{"on":false,"monthly_cap":0}')
on conflict do nothing;

create table public.support_tickets (
  id bigint generated always as identity primary key,
  no bigint generated always as identity (start with 6001),
  token text not null unique default md5(random()::text || clock_timestamp()::text),
  customer_id bigint references public.customers,
  phone text not null,
  name text,
  channel text not null default 'web' check (channel in ('app','web','whatsapp','phone')),
  topic text not null default 'other' check (topic in ('track','issue','refund','product','delivery','agent','other')),
  order_id bigint references public.online_orders,
  status text not null default 'new' check (status in ('new','open','waiting','solved','closed')),
  assigned_to uuid references public.profiles,
  created_at timestamptz not null default now(),
  last_msg_at timestamptz not null default now(),
  last_from text not null default 'customer',
  first_reply_at timestamptz,
  solved_at timestamptz,
  rating int check (rating between 1 and 5),
  rating_note text
);
create table public.support_messages (
  id bigint generated always as identity primary key,
  ticket_id bigint not null references public.support_tickets,
  sender text not null check (sender in ('customer','staff','bot','note')),
  staff_id uuid references public.profiles,
  body text,
  photo text,
  at timestamptz not null default now()
);
create index sm_ticket on public.support_messages (ticket_id, id);

-- لينك سلة جاهزة: الموظف بيختار الأصناف ويبعت اللينك، والعميل بيفتحه ويأكّد
create table public.shared_carts (
  id text primary key default substr(md5(random()::text || clock_timestamp()::text), 1, 10),
  district_id bigint,
  items jsonb not null default '[]',
  phone text, name text, address text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);

do $$ declare t text; begin
  foreach t in array array['support_tickets','support_messages','shared_carts'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy staff_only on public.%I as restrictive for all to authenticated using (public.is_staff()) with check (public.is_staff())', t);
  end loop;
end $$;
create policy st_read on public.support_tickets for select to authenticated using (has_perm('cs.agent') or has_perm('cs.manage'));
create policy sm_read on public.support_messages for select to authenticated using (has_perm('cs.agent') or has_perm('cs.manage'));
create policy sc_read on public.shared_carts for select to authenticated using (has_perm('cs.agent'));

-- صور الشات: العميل بيرفع (مجهول) في فولدر التذكرة، والموظفين بيشوفوا
insert into storage.buckets (id, name, public) values ('support', 'support', false) on conflict do nothing;
create policy support_ins on storage.objects for insert to anon, authenticated with check (bucket_id = 'support');
create policy support_read on storage.objects for select to authenticated using (bucket_id = 'support' and (has_perm('cs.agent') or has_perm('cs.manage')));

-- إشعار للعميل على أجهزته (برقمه) — مجاني
create or replace function public.cs_push_customer(p_phone text, p_title text, p_body text, p_token text) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare toks text[];
begin
  select array_agg(token) into toks from push_devices where app = 'customer' and regexp_replace(coalesce(phone, ''), '\D', '', 'g') = p_phone;
  if toks is not null then perform push_to(toks, p_title, left(p_body, 180), jsonb_build_object('ticket', p_token)); end if;
end $$;
revoke execute on function public.cs_push_customer(text, text, text, text) from anon, public, authenticated;

-- ===== العميل (التطبيق أو الويب): بالتوكن =====
create or replace function public.cs_open(p_phone text, p_name text, p_topic text, p_order_token text, p_text text, p_channel text, p_photo text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_phone text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'); v_cust bigint; v_order bigint; t support_tickets%rowtype;
begin
  if length(v_phone) < 10 then raise exception 'اكتب رقم موبايل صحيح'; end if;
  if coalesce(trim(p_text), '') = '' and p_photo is null then raise exception 'اكتب رسالتك'; end if;
  select id into v_cust from customers where regexp_replace(phone, '\D', '', 'g') = v_phone limit 1;
  if p_order_token is not null and p_order_token <> '' then select id into v_order from online_orders where token = p_order_token; end if;
  insert into support_tickets (customer_id, phone, name, channel, topic, order_id)
    values (v_cust, v_phone, nullif(trim(p_name), ''), case when p_channel in ('app','web') then p_channel else 'web' end,
            case when p_topic in ('track','issue','refund','product','delivery','agent','other') then p_topic else 'other' end, v_order)
    returning * into t;
  insert into support_messages (ticket_id, sender, body, photo) values (t.id, 'customer', nullif(trim(p_text), ''), p_photo);
  insert into support_messages (ticket_id, sender, body) values (t.id, 'bot', format('اتفتحت تذكرة رقم %s ✅ — حد من خدمة العملاء هيرد عليك هنا في أقرب وقت، وهيوصلك إشعار.', t.no));
  return jsonb_build_object('no', t.no, 'token', t.token);
end $$;

create or replace function public.cs_thread(p_token text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('no', t.no, 'status', t.status, 'topic', t.topic, 'rating', t.rating, 'created_at', t.created_at,
    'order', (select jsonb_build_object('no', o.no, 'token', o.token, 'status', o.status) from online_orders o where o.id = t.order_id),
    'messages', (select coalesce(jsonb_agg(jsonb_build_object('id', m.id, 'from', m.sender, 'body', m.body, 'photo', m.photo is not null, 'at', m.at,
                   'who', case when m.sender = 'staff' then split_part((select name from profiles where id = m.staff_id), ' ', 1) end) order by m.id), '[]'::jsonb)
                 from support_messages m where m.ticket_id = t.id and m.sender <> 'note'))
  from support_tickets t where t.token = p_token
$$;

create or replace function public.cs_list(p_tokens text[]) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('no', t.no, 'token', t.token, 'status', t.status, 'topic', t.topic, 'last_msg_at', t.last_msg_at, 'last_from', t.last_from,
    'preview', (select left(body, 80) from support_messages where ticket_id = t.id and sender in ('customer','staff','bot') order by id desc limit 1)) order by t.last_msg_at desc), '[]'::jsonb)
  from support_tickets t where t.token = any(p_tokens)
$$;

create or replace function public.cs_send(p_token text, p_text text, p_photo text default null) returns void
language plpgsql security definer set search_path = public as $$
declare t support_tickets%rowtype;
begin
  select * into t from support_tickets where token = p_token for update;
  if not found then raise exception 'التذكرة مش موجودة'; end if;
  if coalesce(trim(p_text), '') = '' and p_photo is null then raise exception 'اكتب رسالتك'; end if;
  insert into support_messages (ticket_id, sender, body, photo) values (t.id, 'customer', nullif(trim(p_text), ''), p_photo);
  update support_tickets set last_msg_at = now(), last_from = 'customer', status = case when status in ('solved','closed','waiting') then 'open' else status end where id = t.id;
end $$;

create or replace function public.cs_rate(p_token text, p_rating int, p_note text) returns void
language sql security definer set search_path = public as $$
  update support_tickets set rating = greatest(1, least(5, p_rating)), rating_note = nullif(trim(p_note), ''), status = 'closed' where token = p_token and status in ('solved','closed')
$$;

-- ===== الموظفين =====
create or replace function public.cs_reply(p_ticket bigint, p_text text, p_status text, p_note boolean default false) returns void
language plpgsql security definer set search_path = public as $$
declare t support_tickets%rowtype;
begin
  if not is_staff() or not (has_perm('cs.agent') or has_perm('cs.manage')) then raise exception 'محتاج صلاحية خدمة العملاء'; end if;
  select * into t from support_tickets where id = p_ticket for update;
  if not found then raise exception 'التذكرة مش موجودة'; end if;
  if coalesce(trim(p_text), '') <> '' then
    insert into support_messages (ticket_id, sender, staff_id, body) values (t.id, case when p_note then 'note' else 'staff' end, auth.uid(), trim(p_text));
  end if;
  update support_tickets set
    status = coalesce(nullif(p_status, ''), case when p_note then status when status = 'new' then 'open' else status end),
    assigned_to = coalesce(assigned_to, auth.uid()),
    first_reply_at = case when not p_note and coalesce(trim(p_text), '') <> '' then coalesce(first_reply_at, now()) else first_reply_at end,
    solved_at = case when p_status = 'solved' then now() else solved_at end,
    last_msg_at = case when p_note then last_msg_at else now() end,
    last_from = case when p_note or coalesce(trim(p_text), '') = '' then last_from else 'staff' end
    where id = t.id;
  if not p_note and coalesce(trim(p_text), '') <> '' then
    perform cs_push_customer(t.phone, 'رد من خدمة عملاء باي رسلان 💬', trim(p_text), t.token);
  end if;
  if p_status = 'solved' then
    insert into support_messages (ticket_id, sender, body) values (t.id, 'bot', 'اتقفلت التذكرة ✅ — قيّم الخدمة من فضلك، ولو لسه فيه حاجة اكتبلنا هنا وهتتفتح تاني.');
  end if;
end $$;

create or replace function public.cs_assign(p_ticket bigint, p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_staff() or not (has_perm('cs.manage') or (has_perm('cs.agent') and p_user = auth.uid())) then raise exception 'محتاج صلاحية توزيع التذاكر'; end if;
  update support_tickets set assigned_to = p_user where id = p_ticket;
end $$;

-- كارت العميل للموظف: الاسم، العناوين بالحي، آخر الطلبات وأصنافها، الشكاوى، التذاكر
create or replace function public.cs_customer(p_phone text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_phone text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'); c customers%rowtype;
begin
  if not is_staff() or not (has_perm('cs.agent') or has_perm('orders.handle')) then raise exception 'محتاج صلاحية خدمة العملاء'; end if;
  select * into c from customers where regexp_replace(phone, '\D', '', 'g') = v_phone limit 1;
  return jsonb_build_object('found', c.id is not null, 'phone', v_phone, 'name', c.name, 'notes', c.notes,
    'addresses', (select coalesce(jsonb_agg(jsonb_build_object('id', a.id, 'label', a.label, 'address', a.address, 'district_id', a.district_id, 'district', d.name) order by a.is_default desc, a.id desc), '[]'::jsonb)
                  from customer_addresses a left join districts d on d.id = a.district_id where a.customer_id = c.id and a.active),
    'orders', (select coalesce(jsonb_agg(x order by (x->>'at') desc), '[]'::jsonb) from (
       select jsonb_build_object('no', o.no, 'token', o.token, 'status', o.status, 'channel', o.channel, 'at', o.created_at, 'total', coalesce(o.total, o.est_total), 'district_id', o.district_id, 'address', o.address,
         'lines', (select jsonb_agg(jsonb_build_object('item_id', l.item_id, 'name', i.name, 'qty', l.qty) order by l.line) from online_order_lines l join items i on i.id = l.item_id where l.order_id = o.id)) x
       from online_orders o where o.customer_id = c.id order by o.created_at desc limit 8) z),
    'tickets', (select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'no', t.no, 'status', t.status, 'topic', t.topic, 'at', t.created_at) order by t.id desc), '[]'::jsonb)
                from support_tickets t where t.phone = v_phone));
end $$;

-- طلب واتساب / تليفون من الموظف (نفس مسار الطلب الأونلاين بالظبط)
create or replace function public.cs_place_order(p_district bigint, p_phone text, p_name text, p_address text, p_note text, p_pay text, p_lines jsonb, p_channel text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r record; v_by uuid := auth.uid();
begin
  if not is_staff() or not (has_perm('cs.agent') or has_perm('orders.handle')) then raise exception 'محتاج صلاحية خدمة العملاء'; end if;
  select * into r from place_order_d(p_district, p_phone, p_name, p_address, p_note, p_pay, p_lines, case when p_channel in ('phone','whatsapp') then p_channel else 'phone' end);
  update online_orders set handled_by = coalesce(handled_by, v_by) where no = r.order_no;
  return jsonb_build_object('no', r.order_no, 'token', r.token, 'total', r.est_total);
end $$;

create or replace function public.cs_make_cart(p_district bigint, p_items jsonb, p_phone text, p_name text, p_address text) returns text
language plpgsql security definer set search_path = public as $$
declare v text;
begin
  if not is_staff() or not (has_perm('cs.agent') or has_perm('orders.handle')) then raise exception 'محتاج صلاحية خدمة العملاء'; end if;
  insert into shared_carts (district_id, items, phone, name, address) values (p_district, coalesce(p_items, '[]'), nullif(p_phone, ''), nullif(p_name, ''), nullif(p_address, '')) returning id into v;
  return v;
end $$;

create or replace function public.public_cart(p_id text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('district_id', district_id, 'items', items, 'phone', phone, 'name', name, 'address', address)
  from shared_carts where id = p_id and created_at > now() - interval '7 days'
$$;

revoke execute on function public.cs_reply(bigint, text, text, boolean), public.cs_assign(bigint, uuid), public.cs_customer(text), public.cs_place_order(bigint, text, text, text, text, text, jsonb, text),
  public.cs_make_cart(bigint, jsonb, text, text, text) from anon, public;
grant execute on function public.cs_reply(bigint, text, text, boolean), public.cs_assign(bigint, uuid), public.cs_customer(text), public.cs_place_order(bigint, text, text, text, text, text, jsonb, text),
  public.cs_make_cart(bigint, jsonb, text, text, text) to authenticated;
grant execute on function public.cs_open(text, text, text, text, text, text, text), public.cs_thread(text), public.cs_list(text[]), public.cs_send(text, text, text),
  public.cs_rate(text, int, text), public.public_cart(text) to anon, authenticated;
