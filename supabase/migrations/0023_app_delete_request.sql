-- طلب مسح الحساب من جوه التطبيق (شرط أبل)؛ بيظهر للإدارة وبيتنفّذ خلال 48 ساعة
alter table public.customers add column if not exists delete_requested_at timestamptz;
create or replace function public.app_request_delete() returns void
language sql security definer set search_path = public as $$
  update customers set delete_requested_at = now() where id = public.app_customer()
$$;
revoke execute on function public.app_request_delete() from anon, public;
grant execute on function public.app_request_delete() to authenticated;
