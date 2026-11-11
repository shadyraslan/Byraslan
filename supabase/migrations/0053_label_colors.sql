-- ============ 0053 ألوان ملصقات المهرجانات: صاحب الصلاحية (المالك أو الماركتنج) هو اللي يحدد الألوان ومعناها من الداشبورد
insert into permissions (id, grp, label) values
  ('promo.colors', 'التسعير', 'تحديد ألوان ملصقات المهرجانات ومعنى كل لون')
on conflict (id) do nothing;
insert into settings (key, value) values
  ('campaigns.colors', '[{"c":"#E11D48","t":""},{"c":"#16A34A","t":""},{"c":"#EA580C","t":""},{"c":"#7C3AED","t":""},{"c":"#0D0D0D","t":""}]'::jsonb)
on conflict (key) do nothing;
create or replace function campaign_colors_save(p jsonb) returns void language plpgsql security definer set search_path = public as $$
declare x jsonb; clean jsonb := '[]'::jsonb;
begin
  if not has_perm('promo.colors') then raise exception 'محتاج صلاحية ألوان الملصقات'; end if;
  for x in select * from jsonb_array_elements(coalesce(p, '[]'::jsonb)) loop
    if (x->>'c') ~ '^#[0-9A-Fa-f]{6}$' then
      clean := clean || jsonb_build_array(jsonb_build_object('c', upper(x->>'c'), 't', left(coalesce(x->>'t', ''), 40)));
    end if;
  end loop;
  if jsonb_array_length(clean) = 0 then raise exception 'لازم لون واحد على الأقل'; end if;
  insert into settings (key, value, updated_at) values ('campaigns.colors', clean, now())
  on conflict (key) do update set value = excluded.value, updated_at = now();
end $$;
revoke all on function campaign_colors_save(jsonb) from public, anon;
grant execute on function campaign_colors_save(jsonb) to authenticated;
