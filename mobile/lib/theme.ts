// نفس هوية تطبيق رسلان ماركت: أسود + أصفر وخط Cairo
export const C = {
  y: "#F5C800",
  ink: "#0D0D0D",
  bg: "#F7F7F7",
  panel: "#FFFFFF",
  g: "#999999",
  muted: "#777777",
  ln: "#EBEBEB",
  dark2: "#1C1C1C",
  dark3: "#2A2A2A",
  soft: "#FFFBE6",
  good: "#22C55E",
  bad: "#CC0000",
  line: "#EBEBEB",
  black: "#0D0D0D",
  yDark: "#7A6300",
};
export const F = { r: "Cairo_400Regular", m: "Cairo_600SemiBold", b: "Cairo_700Bold", x: "Cairo_800ExtraBold" };
export const money = (n: number) => `${Math.round(n).toLocaleString("en-US")} ج`;
export const STATUS: Record<string, string> = { new: "تم استلام الطلب", accepted: "اتقبل", preparing: "جاري التحضير", ready: "جاهز", out: "خرج للتوصيل", delivered: "تم التوصيل", cancelled: "اتلغى" };
export const BRAND_ICON: Record<string, string> = { rostos: "🥩", market: "🛒", oricci: "🛵" };
export const FAM_COLORS = ["#FFF1E6", "#E8F5EC", "#FFF8D6", "#EAF1FB", "#F7EAF5", "#EFEFEF"];
export const famColor = (name: string | null, c?: string | null) => c || FAM_COLORS[[...(name ?? "")].reduce((a, ch) => a + ch.charCodeAt(0), 0) % FAM_COLORS.length];
