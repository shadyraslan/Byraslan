export const C = { black: "#0D0D0D", white: "#FFFFFF", off: "#F5F5F2", y: "#F5C800", ySoft: "rgba(245,200,0,0.14)", border: "#E8E8E3", mid: "#8C8C86", green: "#16A34A", greenSoft: "#E6F6EC", red: "#DC2626", redSoft: "#FDECEC", amber: "#B7791F", amberSoft: "#FDF3DC" };
export const F = { r: "System", b: "System" };
export const hhmm = (s?: string | null) => (s ? new Date(s).toLocaleTimeString("ar-EG", { hour: "numeric", minute: "2-digit" }) : "—");
export const day = (s?: string | null) => (s ? new Date(s).toLocaleDateString("ar-EG", { weekday: "short", day: "numeric", month: "short" }) : "");
export const money = (n: number | string | null | undefined) => `${Math.round(Number(n ?? 0)).toLocaleString("en")} ج`;
/** "09:30:00" ← "9:30" */
export const t5 = (t?: string | null) => (t ? `${Number(t.slice(0, 2))}:${t.slice(3, 5)}` : "");
export const shiftLine = (s?: { off: boolean; start: string | null } | null) => (!s ? "" : s.off ? "راحة" : `من ${t5(s.start)}`);
