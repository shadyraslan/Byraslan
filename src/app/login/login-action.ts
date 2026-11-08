"use server";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { checkLoginRateLimit, clearLoginRateLimit } from "@/lib/rate-limit";

/**
 * تسجيل دخول محمي بـ Rate Limiting يعتمد على الداتابيز.
 * الحد الأقصى: 10 محاولات فاشلة كل 15 دقيقة.
 * الرسالة لا تكشف إذا الإيميل موجود ولا الرقم السري غلط.
 *
 * BUG-001 FIX: تم الاستبدال بـ database-backed rate limiting.
 * شغال على أي عدد من instances (Vercel, etc.).
 */
export async function loginAction(_: unknown, fd: FormData) {
  const email = String(fd.get("email") || "").trim();
  const password = String(fd.get("password") || "").trim();

  if (!email || !password) {
    return { ok: false, error: "اكتب الموبايل أو الإيميل والرقم السري" };
  }

  // BUG-001 FIX: Rate Limiting عبر الداتابيز
  // المفتاح بيتنظم (lowercase + trim) في الداتابيز عشان يمنع bypass
  const { allowed } = await checkLoginRateLimit(email);
  if (!allowed) {
    return { ok: false, error: "تجارب دخول كثيرة. حاول بعد شوية" };
  }

  // تحويل الموبايل لإيميل داخلي
  const login = /^[+\d\s-]+$/.test(email) ? `${email.replace(/\D/g, "")}@staff.byraslan.app` : email;

  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(list) {
          list.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        },
      },
    }
  );

  const { error } = await supabase.auth.signInWithPassword({ email: login, password });

  if (error) {
    // رسالة عامة — ما نكشفش لو الإيميل موجود ولا الرقم السري غلط
    return { ok: false, error: "الموبايل/الإيميل أو الرقم السري غلط" };
  }

  // نجاح — مسح سجل المحاولات
  await clearLoginRateLimit(email);

  return { ok: true };
}
