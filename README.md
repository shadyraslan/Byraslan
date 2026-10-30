# By Raslan ERP

نظام روستو + رسلان ماركت (أوريتشي في ريبو لوحده).
**Next.js 15 على Vercel + Supabase (Postgres, Auth, RLS) — فرانكفورت.**

## المرحلة 1 — الأساس
- دخول بالإيميل وكلمة السر
- المستخدمين والصلاحيات (أي صلاحية تتدي لأي حد، لمدة أو بحد مبلغ) — بتتطبّق من الداتابيز نفسها (RLS)
- المواقع (المصنع وأقسامه، المخازن، الفروع، مخزن الشريك، التبرعات)
- الأصناف والعائلات والهاشتاجز والباركود والأسعار + سجل الأسعار
- المخزون كدفتر حركات + العلب بأرقام مسلسلة من 1201

## التشغيل لأول مرة
1. **Supabase** ← New project (Region: Frankfurt) ← SQL Editor ← شغّل الملفات في `supabase/migrations` بالترتيب.
2. **Authentication ← Users ← Add user** بإيميلك — أول مستخدم بيبقى المالك تلقائي.
3. **Vercel** ← Add New ← Project ← اختار الريبو ده ← Environment Variables:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   (من Supabase ← Project Settings ← API)
4. Deploy. أي push على `main` بينزل لوحده.

## الملفات
- `docs/prototype.html` — البروتوتايب الكامل (المرجع لكل الشاشات)
- `docs/decisions.md` — سجل القرارات
