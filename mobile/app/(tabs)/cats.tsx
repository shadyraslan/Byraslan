import { useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useApp } from "@/lib/store";
import { BlackHead, IconBtn, Input, LocBar, T } from "@/lib/ui";
import { BRAND_ICON, C, tint } from "@/lib/theme";

export default function Cats() {
  const ins = useSafeAreaInsets();
  const { menu, district } = useApp();
  const [q, setQ] = useState("");
  const L = menu ?? [];
  const fams = [...new Set(L.map((m) => m.family ?? "أصناف"))].filter((f) => !q.trim() || f.includes(q.trim()));
  const meta = (f: string) => { const x = L.filter((m) => (m.family ?? "أصناف") === f); return { n: x.length, one: x[0] }; };
  const top = fams.map((f) => ({ f, ...meta(f) })).sort((a, b) => b.n - a.n)[0];
  return (
    <View style={{ flex: 1 }}>
      <BlackHead back={false}>
        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
          <IconBtn name="menu" onPress={() => router.push("/account")} />
          <IconBtn name="notifications-outline" dot onPress={() => router.push("/orders")} />
        </View>
        <LocBar />
        <Input dark value={q} onChangeText={setQ} placeholder="ابحث في الأقسام..." style={{ minHeight: 42 }} />
      </BlackHead>
      <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: 120 + ins.bottom, gap: 16 }}>
        {!district?.branch && <T style={{ color: C.mid }}>اختار منطقتك الأول من «التوصيل إلى»</T>}
        {top && !q && (
          <Pressable onPress={() => router.push({ pathname: "/cat/[name]", params: { name: top.f } })} style={{ backgroundColor: "#2A2000", borderRadius: 20, padding: 18, overflow: "hidden", flexDirection: "row", alignItems: "center" }}>
            <Text style={{ position: "absolute", left: -4, bottom: -10, fontSize: 80, opacity: 0.35 }}>{top.one?.icon}</Text>
            <View style={{ flex: 1, gap: 4 }}>
              <View style={{ alignSelf: "flex-start", backgroundColor: C.y, borderRadius: 10, paddingHorizontal: 8 }}><T w="x" style={{ fontSize: 10.5 }}>⭐ الأكثر طلباً</T></View>
              <T w="x" style={{ color: C.white, fontSize: 19 }}>{top.f}</T>
              <T style={{ color: "#BBB", fontSize: 12 }}>{top.n} منتج طازج يومياً</T>
            </View>
            <View style={{ width: 36, height: 36, borderRadius: 11, backgroundColor: C.y, alignItems: "center", justifyContent: "center" }}><Ionicons name="chevron-back" size={18} color={C.black} /></View>
          </Pressable>
        )}
        <T w="x" style={{ fontSize: 16 }}>كل الأقسام</T>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
          {fams.map((f) => {
            const { n, one } = meta(f);
            return (
              <Pressable key={f} onPress={() => router.push({ pathname: "/cat/[name]", params: { name: f } })} style={{ width: "47.5%", backgroundColor: C.white, borderRadius: 18, borderWidth: 1, borderColor: C.border, overflow: "hidden" }}>
                <View style={{ height: 96, backgroundColor: tint(f, one?.color), alignItems: "center", justifyContent: "center" }}>
                  <Text style={{ fontSize: 50 }}>{one?.icon || BRAND_ICON[one?.brand ?? ""] || "🛒"}</Text>
                  <View style={{ position: "absolute", top: 8, left: 8, backgroundColor: C.y, borderRadius: 9, paddingHorizontal: 7 }}><T w="x" style={{ fontSize: 10.5 }}>{n}</T></View>
                </View>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 10 }}>
                  <T w="x" style={{ fontSize: 13, flex: 1 }} numberOfLines={1}>{f}</T>
                  <View style={{ width: 24, height: 24, borderRadius: 7, backgroundColor: C.black, alignItems: "center", justifyContent: "center" }}><Ionicons name="chevron-back" size={14} color={C.white} /></View>
                </View>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}
