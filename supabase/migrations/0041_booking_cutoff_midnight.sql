-- ============ 0041 آخر تعديل للحجز: قبل 12 منتصف الليل (أول يوم الحجز) — أو بعدد ساعات، من الداشبورد ============
update public.settings set value = value || '{"edit_cutoff_mode":"midnight"}'::jsonb where key = 'booking';

-- آخر لحظة يعدّل فيها العميل: منتصف الليل اللي بيبدأ بيه يوم الحجز، أو الميعاد ناقص الساعات
create or replace function public.booking_cutoff(p_at timestamptz) returns timestamptz
language sql stable security definer set search_path = public as $$
  select case when coalesce(booking_cfg()->>'edit_cutoff_mode', 'midnight') = 'midnight'
              then ((p_at at time zone 'Africa/Cairo')::date)::timestamp at time zone 'Africa/Cairo'
              else p_at - make_interval(hours => coalesce((booking_cfg()->>'edit_cutoff_hours')::int, 24)) end
$$;

do $$ declare src text; begin
  src := pg_get_functiondef('public.booking_edit'::regproc);
  src := replace(src, 'if not staff and now() > o.scheduled_for - make_interval(hours => coalesce((cfg->>''edit_cutoff_hours'')::int, 24)) then
    raise exception ''التعديل متاح لحد % ساعة قبل الميعاد — كلّم خدمة العملاء'', coalesce(cfg->>''edit_cutoff_hours'', ''24''); end if;',
    'if not staff and now() > booking_cutoff(o.scheduled_for) then
    raise exception ''آخر تعديل كان قبل % — كلّم خدمة العملاء'', to_char(booking_cutoff(o.scheduled_for) at time zone ''Africa/Cairo'', ''HH12:MI DD/MM''); end if;');
  if src !~ 'booking_cutoff' then raise exception 'edit patch failed'; end if;
  execute src;
  src := pg_get_functiondef('public.track_order'::regproc);
  src := replace(src, 'now() < o.scheduled_for - make_interval(hours => coalesce((booking_cfg()->>''edit_cutoff_hours'')::int, 24))', 'now() < booking_cutoff(o.scheduled_for), ''edit_until'', case when o.is_booking then booking_cutoff(o.scheduled_for) end');
  if src !~ 'booking_cutoff' then raise exception 'track patch failed'; end if;
  execute src;
end $$;
