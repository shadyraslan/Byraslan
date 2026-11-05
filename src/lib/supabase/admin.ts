import { createClient } from "@supabase/supabase-js";

/** عميل بصلاحيات كاملة — للسيرفر بس (عمل حسابات الموظفين). المفتاح في Vercel ومش بيوصل للمتصفح أبدًا. */
export function supabaseAdmin() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return null;
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

/** الموظف بيدخل بالموبايل — جوه السيستم بيتحول لإيميل داخلي */
export const staffEmail = (phone: string) => `${phone.replace(/\D/g, "")}@staff.byraslan.app`;
