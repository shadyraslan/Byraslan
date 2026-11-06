import "react-native-url-polyfill/auto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import { createClient } from "@supabase/supabase-js";
import { AppState } from "react-native";

const extra = (Constants.expoConfig?.extra ?? {}) as { supabaseUrl: string; supabaseAnonKey: string };
export const sb = createClient(extra.supabaseUrl, extra.supabaseAnonKey, {
  auth: { storage: AsyncStorage, autoRefreshToken: true, persistSession: true, detectSessionInUrl: false },
});
AppState.addEventListener("change", (s) => { if (s === "active") sb.auth.startAutoRefresh(); else sb.auth.stopAutoRefresh(); });

export const errMsg = (e: unknown): string => {
  const m = (e as { message?: string })?.message ?? String(e);
  if (/network|fetch/i.test(m)) return "مفيش نت — جرّب تاني";
  if (/invalid login|credentials/i.test(m)) return "الموبايل أو الرقم السري غلط";
  return m.replace(/^.*?ERROR:\s*/, "");
};
/** نفس دخول السيستم: الموبايل + الرقم السري */
export const staffEmail = (phone: string) => `${phone.replace(/\D/g, "")}@staff.byraslan.app`;
