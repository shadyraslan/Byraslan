-- الكاشير بيحدّث نسخة الفرع كل pos.refresh_minutes (افتراضي دقيقة)، ولو الكود مش على الجهاز والنت شغال بيسأل pos_lookup على طول
insert into public.settings (key, value) values ('pos.refresh_minutes', '1') on conflict do nothing;
-- pos_snapshot بقت بترجّع refresh_min (نفس 0028 + السطر ده)
