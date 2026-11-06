import { ActivityIndicator, Image, Pressable, Text, TextInput, View, type StyleProp, type TextInputProps, type TextProps, type ViewStyle } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { C, F, BRAND_ICON, famColor, money } from "./theme";
import { useApp } from "./store";
import type { MenuItem } from "./types";

export const T = ({ style, w = "r", ...p }: TextProps & { w?: keyof typeof F }) => (
  <Text {...p} style={[{ fontFamily: F[w], color: C.ink, fontSize: 14, textAlign: "right", writingDirection: "rtl" }, style]} />
);

/** زرار كبير: أسود (bt) أو أصفر (bt.y) */
export function Btn({ title, onPress, y, light, disabled, busy, style }: { title: string; onPress?: () => void; y?: boolean; light?: boolean; disabled?: boolean; busy?: boolean; style?: StyleProp<ViewStyle> }) {
  const bg = y ? C.y : light ? C.panel : C.ink;
  const fg = y || light ? C.ink : "#fff";
  return (
    <Pressable onPress={onPress} disabled={disabled || busy}
      style={({ pressed }) => [{ backgroundColor: bg, borderRadius: 12, paddingVertical: 13, paddingHorizontal: 16, alignItems: "center", justifyContent: "center", borderWidth: light ? 1.5 : 0, borderColor: C.ln, opacity: disabled ? 0.45 : pressed ? 0.85 : 1 }, style]}>
      {busy ? <ActivityIndicator color={fg} /> : <T w="x" style={{ color: fg, fontSize: 14.5, textAlign: "center" }}>{title}</T>}
    </Pressable>
  );
}

export const Input = (p: TextInputProps) => (
  <TextInput placeholderTextColor={C.g} {...p}
    style={[{ backgroundColor: "#FAFAFA", borderWidth: 1.5, borderColor: C.ln, borderRadius: 10, minHeight: 46, paddingHorizontal: 12, fontFamily: F.m, fontSize: 14, color: C.ink, textAlign: "right" }, p.style]} />
);

/** صندوق أبيض (box) */
export const Box = ({ children, title, style }: { children: React.ReactNode; title?: string; style?: StyleProp<ViewStyle> }) => (
  <View style={[{ backgroundColor: C.panel, borderRadius: 16, marginHorizontal: 14, marginTop: 12, padding: 14, gap: 8 }, style]}>
    {title ? <T w="x" style={{ fontSize: 14 }}>{title}</T> : null}
    {children}
  </View>
);
export const Ln = ({ l, v, big, color }: { l: string; v: string; big?: boolean; color?: string }) => (
  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
    <T w={big ? "x" : "m"} style={{ fontSize: big ? 16 : 13, color }}>{l}</T><T w={big ? "x" : "b"} style={{ fontSize: big ? 16 : 13, color }}>{v}</T>
  </View>
);

/** اختيار (opt) */
export function Opt({ on, onPress, children }: { on: boolean; onPress: () => void; children: React.ReactNode }) {
  return (
    <Pressable onPress={onPress} style={{ borderWidth: 1.5, borderColor: on ? C.ink : C.ln, backgroundColor: on ? C.soft : C.panel, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", gap: 10 }}>
      <View style={{ width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: on ? C.ink : C.g, alignItems: "center", justifyContent: "center" }}>{on && <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: C.ink }} />}</View>
      <View style={{ flex: 1 }}>{children}</View>
    </Pressable>
  );
}

export const Err = ({ t }: { t: string | null }) => (t ? <T w="b" style={{ color: C.bad, backgroundColor: "#FDECEC", padding: 10, borderRadius: 12, marginHorizontal: 14, marginTop: 10 }}>{t}</T> : null);

/** شريط الأقسام (pill2) */
export function Pill({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={{ borderWidth: 1.5, borderColor: on ? C.ink : C.ln, backgroundColor: on ? C.ink : C.panel, borderRadius: 20, paddingVertical: 6, paddingHorizontal: 14 }}>
      <T w="b" style={{ fontSize: 12.5, color: on ? "#fff" : "#555" }}>{label}</T>
    </Pressable>
  );
}

/** هيدر أبيض للشاشات الداخلية (wt) */
export function WTop({ title, right }: { title: string; right?: React.ReactNode }) {
  const ins = useSafeAreaInsets();
  return (
    <View style={{ backgroundColor: C.panel, paddingTop: ins.top + 10, paddingBottom: 12, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", gap: 10, borderBottomWidth: 1, borderBottomColor: C.ln }}>
      {router.canGoBack() && (
        <Pressable onPress={() => router.back()} style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: "#F2F2F2", alignItems: "center", justifyContent: "center" }}>
          <Ionicons name="chevron-forward" size={20} color={C.ink} />
        </Pressable>
      )}
      <T w="x" style={{ fontSize: 16, flex: 1 }}>{title}</T>
      {right}
    </View>
  );
}

/** صورة الصنف: صورته، وإلا أيقونة ولون عيلته */
export function ItemArt({ m, h, size }: { m: MenuItem; h: number; size: number }) {
  if (m.photo) return <Image source={{ uri: m.photo }} style={{ width: "100%", height: h }} resizeMode="cover" />;
  return (
    <View style={{ height: h, width: "100%", backgroundColor: famColor(m.family, m.color), alignItems: "center", justifyContent: "center" }}>
      <Text style={{ fontSize: size }}>{m.icon || BRAND_ICON[m.brand] || "🛒"}</Text>
    </View>
  );
}

export const unitLabel = (m: MenuItem) => (m.sold_by === "piece" || m.unit === "قطعة" ? `للـ${m.unit}` : `للكيلو · بالوزن الفعلي`);

/** عدّاد أصفر (ctr) أو زرار + أسود (add) */
export function AddCtr({ m, big }: { m: MenuItem; big?: boolean }) {
  const { cart, add } = useApp();
  const q = cart[m.item_id] ?? 0;
  const out = m.available <= 0;
  const s = big ? 40 : 28;
  if (!q) return (
    <Pressable disabled={out} onPress={() => add(m, 1)} hitSlop={6} style={{ width: s, height: s, borderRadius: 8, backgroundColor: C.ink, alignItems: "center", justifyContent: "center", opacity: out ? 0.3 : 1 }}>
      <Ionicons name="add" size={big ? 24 : 18} color="#fff" />
    </Pressable>
  );
  return (
    <View style={{ flexDirection: "row", alignItems: "center", backgroundColor: C.y, borderRadius: 8 }}>
      <Pressable onPress={() => add(m, 1)} disabled={out} hitSlop={4} style={{ width: s - 2, height: s, alignItems: "center", justifyContent: "center" }}><T w="x" style={{ fontSize: big ? 20 : 15, textAlign: "center" }}>+</T></Pressable>
      <T w="x" style={{ fontSize: big ? 15 : 11.5, minWidth: big ? 40 : 24, textAlign: "center" }}>{q}</T>
      <Pressable onPress={() => add(m, -1)} hitSlop={4} style={{ width: s - 2, height: s, alignItems: "center", justifyContent: "center" }}><T w="x" style={{ fontSize: big ? 20 : 15, textAlign: "center" }}>−</T></Pressable>
    </View>
  );
}

/** كارت المنتج (pc) */
export function ProductCard({ m, width }: { m: MenuItem; width?: number }) {
  const { config } = useApp();
  const out = m.available <= 0;
  return (
    <Pressable onPress={() => router.push(`/product/${m.item_id}`)} style={{ width, flex: width ? undefined : 1, backgroundColor: C.panel, borderWidth: 1, borderColor: C.ln, borderRadius: 16, overflow: "hidden", opacity: out ? 0.55 : 1 }}>
      <View>
        <ItemArt m={m} h={110} size={46} />
        {out && <View style={{ position: "absolute", bottom: 8, right: 8, backgroundColor: "#fff", borderRadius: 6, paddingHorizontal: 6 }}><T w="x" style={{ color: C.bad, fontSize: 10 }}>خلص</T></View>}
      </View>
      <View style={{ paddingHorizontal: 10, paddingTop: 8, paddingBottom: 10, gap: 2 }}>
        <T w="b" style={{ fontSize: 10, color: C.g }}>{m.family ?? config?.brands[m.brand] ?? ""}</T>
        <T w="x" style={{ fontSize: 13, lineHeight: 18 }} numberOfLines={2}>{m.name}</T>
        <T style={{ fontSize: 10.5, color: C.g }}>{unitLabel(m)}</T>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 4 }}>
          <T w="x" style={{ fontSize: 14 }}>{money(m.price)}</T>
          <AddCtr m={m} />
        </View>
      </View>
    </Pressable>
  );
}

/** شبكة عمودين (grid) */
export function Grid({ items }: { items: MenuItem[] }) {
  const rows: MenuItem[][] = [];
  for (let i = 0; i < items.length; i += 2) rows.push(items.slice(i, i + 2));
  return (
    <View style={{ gap: 10 }}>
      {rows.map((r, i) => (
        <View key={i} style={{ flexDirection: "row", gap: 10 }}>
          {r.map((m) => <ProductCard key={m.item_id} m={m} />)}
          {r.length === 1 && <View style={{ flex: 1 }} />}
        </View>
      ))}
    </View>
  );
}

/** شريط السلة الأسود فوق البار (bar) */
export function CartBar({ bottom = 88 }: { bottom?: number }) {
  const { menu, cart } = useApp();
  const lines = (menu ?? []).filter((m) => cart[m.item_id]);
  if (!lines.length) return null;
  const sub = lines.reduce((a, m) => a + cart[m.item_id] * m.price, 0);
  return (
    <Pressable onPress={() => router.push("/cart")} style={{ position: "absolute", left: 12, right: 12, bottom, backgroundColor: C.ink, borderRadius: 14, paddingVertical: 10, paddingHorizontal: 14, flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
      <T w="b" style={{ color: "#fff", fontSize: 12.5 }}>{lines.length} صنف في السلة</T>
      <T w="x" style={{ color: C.y, fontSize: 13 }}>{money(sub)} · عرض السلة</T>
    </Pressable>
  );
}

/** شريط الزرار اللي تحت (bb) */
export function BottomBar({ children }: { children: React.ReactNode }) {
  const ins = useSafeAreaInsets();
  return <View style={{ position: "absolute", left: 0, right: 0, bottom: 0, backgroundColor: C.panel, paddingTop: 12, paddingHorizontal: 14, paddingBottom: 16 + ins.bottom, flexDirection: "row", gap: 10, borderTopWidth: 1, borderTopColor: C.ln }}>{children}</View>;
}
