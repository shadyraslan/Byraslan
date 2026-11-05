export const C = {
  bg: "#F6F5F0",
  panel: "#FFFFFF",
  ink: "#16150F",
  muted: "#7A776B",
  line: "#E7E4D8",
  y: "#F5C800",
  yDark: "#E2B000",
  black: "#0B0B0B",
  good: "#16A34A",
  bad: "#DC2626",
};
export const F = { r: "Cairo_400Regular", m: "Cairo_600SemiBold", b: "Cairo_700Bold", x: "Cairo_800ExtraBold" };
export const money = (n: number) => `${Math.round(n).toLocaleString("en-US")} ج`;
export const STATUS: Record<string, string> = { new: "وصلنا طلبك", accepted: "اتقبل", preparing: "بيتحضّر", ready: "جاهز", out: "مع الطيار", delivered: "اتسلّم", cancelled: "اتلغى" };
