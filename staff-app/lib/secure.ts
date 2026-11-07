import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";

/** تخزين الدخول في مكان مشفّر على الموبايل. أندرويد بيحدد كل خانة بحوالي 2 كيلو، فبنقسّم القيمة لأجزاء.
 *  لو فيه دخول قديم متخزّن بالطريقة القديمة بننقله مرة واحدة ونمسحه — فمحدش هيضطر يدخل من الأول. */
const CHUNK = 1800;
const safe = (k: string) => k.replace(/[^A-Za-z0-9._-]/g, "_");
const nKey = (k: string) => `sb.${safe(k)}.n`;
const cKey = (k: string, i: number) => `sb.${safe(k)}.${i}`;

async function readSecure(key: string): Promise<string | null> {
  const n = Number(await SecureStore.getItemAsync(nKey(key)));
  if (!Number.isFinite(n) || n <= 0) return null;
  const parts: string[] = [];
  for (let i = 0; i < n; i++) {
    const p = await SecureStore.getItemAsync(cKey(key, i));
    if (p == null) return null;
    parts.push(p);
  }
  return parts.join("");
}

async function removeSecure(key: string) {
  const n = Number(await SecureStore.getItemAsync(nKey(key))) || 0;
  for (let i = 0; i < n; i++) await SecureStore.deleteItemAsync(cKey(key, i));
  await SecureStore.deleteItemAsync(nKey(key));
}

export const secureStorage = {
  async getItem(key: string): Promise<string | null> {
    try {
      const v = await readSecure(key);
      if (v != null) return v;
      const old = await AsyncStorage.getItem(key);
      if (old != null) { await secureStorage.setItem(key, old); await AsyncStorage.removeItem(key); }
      return old;
    } catch { return AsyncStorage.getItem(key); }
  },
  async setItem(key: string, value: string): Promise<void> {
    try {
      await removeSecure(key);
      const n = Math.max(1, Math.ceil(value.length / CHUNK));
      for (let i = 0; i < n; i++) await SecureStore.setItemAsync(cKey(key, i), value.slice(i * CHUNK, (i + 1) * CHUNK));
      await SecureStore.setItemAsync(nKey(key), String(n));
    } catch { await AsyncStorage.setItem(key, value); }
  },
  async removeItem(key: string): Promise<void> {
    try { await removeSecure(key); } catch {}
    await AsyncStorage.removeItem(key);
  },
};
