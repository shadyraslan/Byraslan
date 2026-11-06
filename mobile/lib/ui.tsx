import { ActivityIndicator, Image, Pressable, Text, TextInput, View, type StyleProp, type TextInputProps, type TextProps, type ViewStyle } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { C, F, BRAND_ICON, tint, money, isPiece } from "./theme";
import { useApp } from "./store";
import type { MenuItem } from "./types";

type IconName = keyof typeof Ionicons.glyphMap;

export const T = ({ style, w = "r", ...p }: TextProps & { w?: keyof typeof F }) => (
  <Text {...p} style={[{ fontFamily: F[w], color: C.ink, fontSize: 14, textAlign: "right", writingDirection: "rtl" }, style]} />
);

export function Btn({ title, onPress, y, outline, disabled, busy, style, right }: { title: string; onPress?: () => void; y?: boolean; outline?: boolean; disabled?: boolean; busy?: boolean; style?: StyleProp<ViewStyle>; right?: React.ReactNode }) {
  const bg = y ? C.y : outline ? C.white : C.black;
  const fg = y || outline ? C.black : C.white;
  return (
    <Pressable onPress={onPress} disabled={disabled || busy}
      style={({ pressed }) => [{ backgroundColor: bg, borderRadius: 14, height: 52, paddingHorizontal: 18, flexDirection: "row", alignItems: "center", justifyContent: right ? "space-between" : "center", borderWidth: outline ? 1.5 : 0, borderColor: C.border, opacity: disabled ? 0.45 : pressed ? 0.88 : 1 }, style]}>
      {busy ? <ActivityIndicator color={fg} /> : <><T w="x" style={{ color: fg, fontSize: 15 }}>{title}</T>{right}</>}
    </Pressable>
  );
}

export const IconBtn = ({ name, onPress, dark = true, dot }: { name: IconName; onPress?: () => void; dark?: boolean; dot?: boolean }) => (
  <Pressable onPress={onPress} hitSlop={6} style={{ width: 38, height: 38, borderRadius: 11, backgroundColor: dark ? C.hb : C.white, alignItems: "center", justifyContent: "center" }}>
    <Ionicons name={name} size={19} color={dark ? C.white : C.black} />
    {dot && <View style={{ position: "absolute", top: 8, right: 8, width: 7, height: 7, borderRadius: 4, backgroundColor: C.y, borderWidth: 1.5, borderColor: C.black }} />}
  </Pressable>
);

/** الهيدر الأسود (black-header) */
export function BlackHead({ title, back = true, right, children, sub }: { title?: string; back?: boolean; right?: React.ReactNode; children?: React.ReactNode; sub?: string }) {
  const ins = useSafeAreaInsets();
  return (
    <View style={{ backgroundColor: C.black, paddingTop: ins.top + 10, paddingHorizontal: 18, paddingBottom: 14, gap: 10 }}>
      {(title || back) && (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          {back && router.canGoBack() ? <IconBtn name="chevron-forward" onPress={() => router.back()} /> : null}
          <View style={{ flex: 1 }}>
            {title ? <T w="x" style={{ color: C.white, fontSize: 17 }}>{title}</T> : null}
            {sub ? <T style={{ color: "rgba(255,255,255,.45)", fontSize: 11.5 }}>{sub}</T> : null}
          </View>
          {right}
        </View>
      )}
      {children}
    </View>
  );
}

/** شريط "التوصيل إلى" */
export function LocBar() {
  const { district, profile } = useApp();
  const a = profile.addresses.find((x) => x.district_id === district?.id && x.is_default) ?? profile.addresses.find((x) => x.district_id === district?.id);
  return (
    <Pressable onPress={() => router.push("/loc")} style={{ flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: C.hb2, borderWidth: 1, borderColor: "rgba(255,255,255,.07)", borderRadius: 11, paddingVertical: 8, paddingHorizontal: 12 }}>
      <Ionicons name="location" size={16} color={C.y} />
      <View style={{ flex: 1 }}>
        <T style={{ color: "rgba(255,255,255,.38)", fontSize: 10 }}>التوصيل إلى</T>
        <T w="b" style={{ color: C.white, fontSize: 12 }} numberOfLines={1}>{district ? `${district.name}${a ? ` — ${a.address}` : ""}` : "اختار منطقتك"}</T>
      </View>
      <T w="b" style={{ color: C.y, fontSize: 10.5 }}>تغيير ▾</T>
    </Pressable>
  );
}

export function SearchBar({ placeholder = "ابحث عن أي منتج...", onPress }: { placeholder?: string; onPress?: () => void }) {
  return (
    <Pressable onPress={onPress ?? (() => router.push("/search"))} style={{ flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: C.hb2, borderWidth: 1, borderColor: "rgba(255,255,255,.07)", borderRadius: 11, paddingVertical: 10, paddingHorizontal: 12 }}>
      <Ionicons name="search" size={15} color="rgba(255,255,255,.4)" />
      <T style={{ color: "rgba(255,255,255,.35)", fontSize: 12.5 }}>{placeholder}</T>
    </Pressable>
  );
}

export const Input = (p: TextInputProps & { dark?: boolean }) => (
  <TextInput placeholderTextColor={p.dark ? "#666" : C.mid} {...p}
    style={[{ backgroundColor: p.dark ? "#1C1C1C" : "#FAFAFA", borderWidth: 1.5, borderColor: p.dark ? "#2A2A2A" : C.border, borderRadius: 12, minHeight: 48, paddingHorizontal: 14, fontFamily: F.m, fontSize: 14, color: p.dark ? C.white : C.black, textAlign: "right" }, p.style]} />
);

export const Card = ({ children, title, icon, style, right }: { children: React.ReactNode; title?: string; icon?: string; style?: StyleProp<ViewStyle>; right?: React.ReactNode }) => (
  <View style={[{ backgroundColor: C.white, borderRadius: 18, borderWidth: 1, borderColor: C.border, padding: 16, gap: 10 }, style]}>
    {title ? <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}><T w="x" style={{ fontSize: 14 }}>{icon ? `${icon}  ` : ""}{title}</T>{right}</View> : null}
    {children}
  </View>
);

export const Ln = ({ l, v, big, color }: { l: string; v: string; big?: boolean; color?: string }) => (
  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
    <T w={big ? "x" : "r"} style={{ fontSize: big ? 16 : 13, color: big ? C.black : C.mid }}>{l}</T>
    <T w={big ? "x" : "b"} style={{ fontSize: big ? 17 : 13, color: color ?? C.black }}>{v}</T>
  </View>
);

export function Radio({ on, onPress, children, icon }: { on: boolean; onPress: () => void; children: React.ReactNode; icon?: string }) {
  return (
    <Pressable onPress={onPress} style={{ borderWidth: 1.5, borderColor: on ? C.black : C.border, borderRadius: 14, padding: 14, flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: C.white }}>
      {icon ? <View style={{ width: 38, height: 38, borderRadius: 11, backgroundColor: C.off, alignItems: "center", justifyContent: "center" }}><Text style={{ fontSize: 18 }}>{icon}</Text></View> : null}
      <View style={{ flex: 1 }}>{children}</View>
      <View style={{ width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: on ? C.black : "#D0D0D0", alignItems: "center", justifyContent: "center" }}>{on && <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: C.black }} />}</View>
    </Pressable>
  );
}

export function Chip({ label, on, onPress, yellow }: { label: string; on: boolean; onPress: () => void; yellow?: boolean }) {
  return (
    <Pressable onPress={onPress} style={{ height: 34, paddingHorizontal: 16, borderRadius: 17, justifyContent: "center", backgroundColor: on ? C.black : yellow ? C.y : C.white, borderWidth: 1.5, borderColor: on ? C.black : yellow ? C.y : C.border }}>
      <T w="b" style={{ fontSize: 12.5, color: on ? C.white : yellow ? C.black : "#555" }}>{label}</T>
    </Pressable>
  );
}

export const Err = ({ t }: { t: string | null }) => (t ? <T w="b" style={{ color: C.red, backgroundColor: C.redSoft, padding: 12, borderRadius: 12 }}>{t}</T> : null);

export function Art({ m, h, size, radius = 0 }: { m: Pick<MenuItem, "photo" | "icon" | "brand" | "family" | "color">; h: number; size: number; radius?: number }) {
  if (m.photo) return <Image source={{ uri: m.photo }} style={{ width: "100%", height: h, borderRadius: radius }} resizeMode="cover" />;
  return (
    <View style={{ height: h, width: "100%", borderRadius: radius, backgroundColor: tint(m.family, m.color), alignItems: "center", justifyContent: "center" }}>
      <Text style={{ fontSize: size }}>{m.icon || BRAND_ICON[m.brand] || "🛒"}</Text>
    </View>
  );
}

export const unitOf = (m: MenuItem) => (isPiece(m) ? "للقطعة" : "للكيلو · بالوزن الفعلي");

export function Qty({ m, big }: { m: MenuItem; big?: boolean }) {
  const { cart, add } = useApp();
  const q = cart[m.item_id] ?? 0;
  const out = m.available <= 0;
  const s = big ? 44 : 30;
  if (!q) return (
    <Pressable disabled={out} onPress={() => add(m, 1)} hitSlop={6} style={{ width: s, height: s, borderRadius: big ? 12 : 9, backgroundColor: C.black, alignItems: "center", justifyContent: "center", opacity: out ? 0.3 : 1 }}>
      <Ionicons name="add" size={big ? 24 : 18} color={C.white} />
    </Pressable>
  );
  return (
    <View style={{ flexDirection: "row", alignItems: "center", backgroundColor: C.y, borderRadius: big ? 12 : 9, height: s }}>
      <Pressable onPress={() => add(m, 1)} disabled={out} hitSlop={4} style={{ width: s - 2, height: s, alignItems: "center", justifyContent: "center" }}><T w="x" style={{ fontSize: big ? 20 : 15, textAlign: "center" }}>+</T></Pressable>
      <T w="x" style={{ fontSize: big ? 15 : 12, minWidth: big ? 36 : 22, textAlign: "center" }}>{q}</T>
      <Pressable onPress={() => add(m, -1)} hitSlop={4} style={{ width: s - 2, height: s, alignItems: "center", justifyContent: "center" }}><T w="x" style={{ fontSize: big ? 20 : 15, textAlign: "center" }}>−</T></Pressable>
    </View>
  );
}

export function Fav({ id, size = 28 }: { id: number; size?: number }) {
  const { favs, toggleFav } = useApp();
  const on = favs.includes(id);
  return (
    <Pressable onPress={() => toggleFav(id)} hitSlop={6} style={{ position: "absolute", top: 8, left: 8, width: size, height: size, borderRadius: size / 2, backgroundColor: C.white, alignItems: "center", justifyContent: "center" }}>
      <Ionicons name={on ? "heart" : "heart-outline"} size={size * 0.5} color={on ? C.red : C.mid} />
    </Pressable>
  );
}

/** كارت المنتج */
export function ProductCard({ m, width }: { m: MenuItem; width?: number }) {
  const out = m.available <= 0;
  return (
    <Pressable onPress={() => router.push(`/product/${m.item_id}`)} style={{ width, flex: width ? undefined : 1, backgroundColor: C.white, borderWidth: 1, borderColor: C.border, borderRadius: 18, overflow: "hidden", opacity: out ? 0.55 : 1 }}>
      <View>
        <Art m={m} h={width ? 112 : 120} size={50} />
        <Fav id={m.item_id} />
        {m.pct > 0 && <View style={{ position: "absolute", top: 8, right: 8, backgroundColor: C.y, borderRadius: 7, paddingHorizontal: 7 }}><T w="x" style={{ fontSize: 10.5 }}>-{Math.round(m.pct)}%</T></View>}
        {out && <View style={{ position: "absolute", bottom: 8, right: 8, backgroundColor: C.white, borderRadius: 6, paddingHorizontal: 6 }}><T w="x" style={{ color: C.red, fontSize: 10 }}>خلص</T></View>}
      </View>
      <View style={{ paddingHorizontal: 11, paddingTop: 8, paddingBottom: 11, gap: 1 }}>
        <T w="b" style={{ fontSize: 10, color: C.mid }}>{m.family ?? ""}</T>
        <T w="x" style={{ fontSize: 13, lineHeight: 19 }} numberOfLines={1}>{m.name}</T>
        <T style={{ fontSize: 10.5, color: C.mid }}>{unitOf(m)}</T>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 6 }}>
          <View>
            <T w="x" style={{ fontSize: 15 }}>{money(m.price)}</T>
            {m.old_price ? <T style={{ fontSize: 10.5, color: C.mid, textDecorationLine: "line-through" }}>{money(m.old_price)}</T> : null}
          </View>
          <Qty m={m} />
        </View>
      </View>
    </Pressable>
  );
}

export function Grid({ items }: { items: MenuItem[] }) {
  const rows: MenuItem[][] = [];
  for (let i = 0; i < items.length; i += 2) rows.push(items.slice(i, i + 2));
  return (
    <View style={{ gap: 12 }}>
      {rows.map((r, i) => (
        <View key={i} style={{ flexDirection: "row", gap: 12 }}>
          {r.map((m) => <ProductCard key={m.item_id} m={m} />)}
          {r.length === 1 && <View style={{ flex: 1 }} />}
        </View>
      ))}
    </View>
  );
}

export function SecHead({ title, more, onMore }: { title: string; more?: string; onMore?: () => void }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
      <T w="x" style={{ fontSize: 17 }}>{title}</T>
      {more ? <T w="b" style={{ fontSize: 12, color: C.mid }} onPress={onMore}>{more}</T> : null}
    </View>
  );
}

export function BottomBar({ children }: { children: React.ReactNode }) {
  const ins = useSafeAreaInsets();
  return <View style={{ position: "absolute", left: 0, right: 0, bottom: 0, backgroundColor: C.white, paddingTop: 12, paddingHorizontal: 18, paddingBottom: 14 + ins.bottom, flexDirection: "row", gap: 10, borderTopWidth: 1, borderTopColor: C.border }}>{children}</View>;
}
