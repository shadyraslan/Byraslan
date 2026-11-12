-- ============ 0058 أصناف الماركت الشريك: تظهر في التطبيق، والسطر يبدأ "لسه ماتجابش"
-- app_catalog2: partner_only بيظهر لو الفرع مربوط بشريك شغال (المتاح 99).
-- online_order_lines.prepared بقت تقبل null + تريجر partner_line_null: سطر صنف الماركت بيبدأ null عشان الديسباتشر يفرق بين "لسه" و"مش موجود" (0).
create or replace function public.partner_line_null() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.sub_of is null and exists (select 1 from items where id = new.item_id and partner_only) then new.prepared := null; end if;
  return new;
end $$;
revoke execute on function public.partner_line_null() from public, anon, authenticated;
create or replace trigger partner_line_null before insert on online_order_lines for each row execute function partner_line_null();
alter table online_order_lines alter column prepared drop not null;
-- ============ داتا التجربة (12 نوفمبر): كل حاجة عليها tag 'demo' أو اسم فيه "تجربة"، والموقع p-demo والشريك "ماركت تجربة" (مربوط بالمعادي).
-- قبل الإطلاق: الأصناف تتقفل (active=false) مش تتمسح، والموردين/العملاء التجربة يتقفلوا، والشريك يتقفل.
