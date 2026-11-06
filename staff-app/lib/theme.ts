export const C = { black: "#0D0D0D", white: "#FFFFFF", off: "#F5F5F2", y: "#F5C800", ySoft: "rgba(245,200,0,0.14)", border: "#E8E8E3", mid: "#8C8C86", green: "#16A34A", greenSoft: "#E6F6EC", red: "#DC2626", redSoft: "#FDECEC", amber: "#B7791F", amberSoft: "#FDF3DC" };
export const F = { r: "System", b: "System" };
export const hhmm = (s?: string | null) => (s ? new Date(s).toLocaleTimeString("ar-EG", { hour: "numeric", minute: "2-digit" }) : "—");
export const day = (s?: string | null) => (s ? new Date(s).toLocaleDateString("ar-EG", { weekday: "short", day: "numeric", month: "short" }) : "");
