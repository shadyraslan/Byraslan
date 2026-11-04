-- ============ 0009 قفل الدوال: اللي بتشتغل بصلاحيات عالية محدش من برّه يقدر يناديها ============
revoke execute on function public.audit() from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.log_price() from public, anon, authenticated;
revoke execute on function public.is_owner() from public, anon;
revoke execute on function public.has_perm(text) from public, anon;
revoke execute on function public.can_override(text, numeric) from public, anon;
grant execute on function public.is_owner() to authenticated;
grant execute on function public.has_perm(text) to authenticated;
grant execute on function public.can_override(text, numeric) to authenticated;
