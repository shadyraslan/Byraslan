import "react-native-url-polyfill/auto";
import Constants from "expo-constants";
import { createClient } from "@supabase/supabase-js";
import { AppState } from "react-native";
import * as SecureStore from "expo-secure-store";

const extra = (Constants.expoConfig?.extra ?? {}) as { supabaseUrl: string; supabaseAnonKey: string };

// تخزين آمن للـsession: SecureStore عليه حد ~2048 بايت على أندرويد،
// وبيانات الجلسة ممكن تعدّي الحد، فبنقسّم القيمة لـchunks ونحفظ عددها في manifest.
const CHUNK = 1800;
const nKey = (key: string) => `sb.${key}.n`;
const cKey = (key: string, i: number) => `sb.${key}.${i}`;

const secureStorage = {
  async getItem(key: string): Promise<string | null> {
    const n = await SecureStore.getItemAsync(nKey(key));
    if (!n) return null;
    const count = parseInt(n, 10);
    if (!Number.isFinite(count) || count <= 0) return null;
    const parts: string[] = [];
    for (let i = 0; i < count; i++) {
      const part = await SecureStore.getItemAsync(cKey(key, i));
      if (part == null) return null;
      parts.push(part);
    }
    return parts.join("");
  },
  async setItem(key: string, value: string): Promise<void> {
    const chunks = Math.max(1, Math.ceil(value.length / CHUNK));
    for (let i = 0; i < chunks; i++) {
      await SecureStore.setItemAsync(cKey(key, i), value.slice(i * CHUNK, (i + 1) * CHUNK));
    }
    await SecureStore.setItemAsync(nKey(key), String(chunks));
  },
  async removeItem(key: string): Promise<void> {
    const n = await SecureStore.getItemAsync(nKey(key));
    const count = n ? parseInt(n, 10) : 0;
    for (let i = 0; i < count; i++) await SecureStore.deleteItemAsync(cKey(key, i));
    await SecureStore.deleteItemAsync(nKey(key));
  },
};

export const sb = createClient(extra.supabaseUrl, extra.supabaseAnonKey, {
  auth: { storage: secureStorage, autoRefreshToken: true, persistSession: true, detectSessionInUrl: false },
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
