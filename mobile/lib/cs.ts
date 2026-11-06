import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";

/** تذاكر خدمة العملاء محفوظة على الموبايل بالتوكن (مفيش رسايل مدفوعة) */
export const csTokens = async (): Promise<string[]> => { try { return JSON.parse((await AsyncStorage.getItem("cs-tickets")) ?? "[]"); } catch { return []; } };
export const csAdd = async (t: string) => { const L = await csTokens(); await AsyncStorage.setItem("cs-tickets", JSON.stringify([t, ...L.filter((x) => x !== t)].slice(0, 40))); };
export const webUrl = ((Constants.expoConfig?.extra ?? {}) as { webUrl?: string }).webUrl ?? "https://byraslan.vercel.app";
export const TOPICS: [string, string, string][] = [
  ["track", "📦", "تتبّع طلبي"], ["issue", "⚠️", "مشكلة في طلب"], ["refund", "↩️", "استرجاع أو تعويض"],
  ["product", "🥩", "سؤال عن صنف أو سعر"], ["delivery", "🚚", "التوصيل والمواعيد"], ["agent", "🙋", "كلّم موظف"],
];
export const CS_ST: Record<string, string> = { new: "اتبعتت", open: "بنتابعها", waiting: "مستنيين ردك", solved: "اتحلّت", closed: "اتقفلت" };
