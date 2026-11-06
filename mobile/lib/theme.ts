// نفس هوية تطبيق رسلان ماركت (raslan-market-responsive): أسود + أصفر وخط Cairo
export const C = {
  black: "#0D0D0D", ink: "#0D0D0D", white: "#FFFFFF", off: "#F7F7F7", bg: "#F7F7F7", panel: "#FFFFFF",
  y: "#F5C800", ySoft: "rgba(245,200,0,0.12)", border: "#EBEBEB", ln: "#EBEBEB", mid: "#999999", g: "#999999", muted: "#777777",
  green: "#22C55E", greenSoft: "#E8F8EE", red: "#E53935", redSoft: "#FDECEC", bad: "#E53935", good: "#22C55E",
  hb: "rgba(255,255,255,0.08)", hb2: "rgba(255,255,255,0.06)", soft: "#FFFBE6", yDark: "#8A6D00",
};
export const F = { r: "Cairo_400Regular", m: "Cairo_600SemiBold", b: "Cairo_700Bold", x: "Cairo_800ExtraBold" };
export const money = (n: number) => `${Math.round(n).toLocaleString("en-US")} ج`;
export const STATUS: Record<string, string> = { new: "تم استلام الطلب", accepted: "جاري التحضير", preparing: "جاري التحضير", ready: "جاهز للتوصيل", out: "خرج للتوصيل", delivered: "تم التوصيل", cancelled: "ملغي" };
export const BRAND_ICON: Record<string, string> = { rostos: "🍗", market: "🛒", oricci: "🛵" };
export const TINTS = ["#FFF5F0", "#F0F8FF", "#F0FFF4", "#FFFBF0", "#FFF0F5", "#FDF5E4", "#F0FFF8", "#FDF0FF"];
export const tint = (name: string | null, c?: string | null) => c || TINTS[[...(name ?? "")].reduce((a, ch) => a + ch.charCodeAt(0), 0) % TINTS.length];
export const isPiece = (m: { sold_by: string; unit: string }) => m.sold_by === "piece" || m.unit === "قطعة";
