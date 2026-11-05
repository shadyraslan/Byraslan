import "react-native-url-polyfill/auto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import { createClient } from "@supabase/supabase-js";
import { AppState } from "react-native";

const extra = (Constants.expoConfig?.extra ?? {}) as { supabaseUrl: string; supabaseAnonKey: string };

export const sb = createClient(extra.supabaseUrl, extra.supabaseAnonKey, {
  auth: { storage: AsyncStorage, autoRefreshToken: true, persistSession: true, detectSessionInUrl: false },
});

AppState.addEventListener("change", (s) => {
  if (s === "active") sb.auth.startAutoRefresh();
  else sb.auth.stopAutoRefresh();
});

/** رسالة الخطأ من الداتابيز بالعربي من غير الكلام التقني */
export const errMsg = (e: unknown): string => {
  const m = (e as { message?: string })?.message ?? String(e);
  if (/network|fetch/i.test(m)) return "مفيش نت — جرّب تاني";
  if (/invalid.*(otp|token)|expired/i.test(m)) return "الكود غلط أو انتهى — اطلب كود جديد";
  return m.replace(/^.*?ERROR:\s*/, "");
};

/** 01xxxxxxxxx → +201xxxxxxxxx */
export const toE164 = (p: string) => {
  const d = p.replace(/\D/g, "");
  if (d.startsWith("20")) return `+${d}`;
  if (d.startsWith("0")) return `+2${d}`;
  return `+20${d}`;
};
