/**
 * نظام Rate Limiting يعتمد على الداتابيز (database-backed).
 * شغال على أي عدد من instances (Vercel, etc.).
 *
 * يستخدم دوال PostgreSQL SECURITY DEFINER:
 * - login_rate_check(): التحقق من حد تسجيل الدخول وزيادة العداد.
 * - login_rate_clear(): مسح العداد بعد نجاح تسجيل الدخول.
 *
 * الحد: 10 محاولات كل 15 دقيقة لكل معرف (email/phone).
 * المفتاح بيتنظم (lowercase + trim) عشان يمنع bypass.
 */

import { createClient } from "@supabase/supabase-js";

/**
 * التحقق من Rate Limit لتسجيل الدخول عبر الداتابيز.
 * @param identifier — الإيميل أو رقم الموبايل
 * @returns { allowed: boolean } — true = مسموح، false = مرفوض
 */
export async function checkLoginRateLimit(identifier: string): Promise<{ allowed: boolean }> {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    const { data, error } = await supabase.rpc("login_rate_check", {
      p_identifier: identifier,
    });

    // لو الداتابيز مش متاحة، نسمح بالدخول (fail-open) لكن نسجّل الخطأ
    if (error) {
      console.error("[rate-limit] login_rate_check RPC error:", error.message);
      // BUG-001: في حالة فشل الداتابيز، نسمح بالدخول عشان نمنع lockout
      // لكن نسجّل الخطأ للمراجعة
      return { allowed: true };
    }

    return { allowed: !!data };
  } catch (err) {
    console.error("[rate-limit] login_rate_check network error:", err);
    // fail-open: السماح بالدخول لو الداتابيز مش متاحة
    return { allowed: true };
  }
}

/**
 * مسح سجل Rate Limit بعد نجاح تسجيل الدخول.
 * @param identifier — الإيميل أو رقم الموبايل
 */
export async function clearLoginRateLimit(identifier: string): Promise<void> {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    await supabase.rpc("login_rate_clear", {
      p_identifier: identifier,
    });
  } catch (err) {
    console.error("[rate-limit] login_rate_clear error:", err);
    // فشل مسح العداد مش حرج — العداد هيتم مسح تلقائياً بعد انتهاء النافذة
  }
}

/**
 * @deprecated تم الاستبدال بـ checkLoginRateLimit (database-backed).
 * محفوظ للخلفيات المتوافقة فقط.
 */
export function recordFailedAttempt(_key: string, _maxAttempts = 5, _windowMs = 15 * 60 * 1000): { locked: boolean; resetIn: number } {
  console.warn("[rate-limit] recordFailedAttempt is deprecated, use checkLoginRateLimit instead");
  return { locked: false, resetIn: 15 * 60 };
}

/**
 * @deprecated تم الاستبدال بـ clearLoginRateLimit (database-backed).
 * محفوظ للخلفيات المتوافقة فقط.
 */
export function clearRateLimit(_key: string): void {
  console.warn("[rate-limit] clearRateLimit is deprecated, use clearLoginRateLimit instead");
}

/**
 * Rate Limiting عام (in-memory fallback للاستخدامات غير تسجيل الدخول).
 * محفوظ للخلفيات المتوافقة مع order/actions.ts.
 *
 * @deprecated للاستخدامات الجديدة، استخدم database-backed rate limiting.
 */
const legacyAttempts = new Map<string, { count: number; resetAt: number }>();

export function checkRateLimit(key: string, maxAttempts = 5, windowMs = 15 * 60 * 1000): { allowed: boolean; remaining: number; resetIn: number } {
  const now = Date.now();
  const existing = legacyAttempts.get(key);

  if (!existing || now > existing.resetAt) {
    legacyAttempts.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: maxAttempts - 1, resetIn: Math.ceil(windowMs / 1000) };
  }

  if (existing.count >= maxAttempts) {
    const resetIn = Math.ceil((existing.resetAt - now) / 1000);
    return { allowed: false, remaining: 0, resetIn };
  }

  existing.count += 1;
  const resetIn = Math.ceil((existing.resetAt - now) / 1000);
  return { allowed: true, remaining: maxAttempts - existing.count, resetIn };
}
