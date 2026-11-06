import { Pressable, ScrollView, Text, View } from "react-native";
import { router } from "expo-router";
import { useApp } from "@/lib/store";
import { T, WTop } from "@/lib/ui";
import { BRAND_ICON, C, famColor } from "@/lib/theme";

export default function Cats() {
  const { menu, config, district } = useApp();
  const brands = [...new Set((menu ?? []).map((m) => m.brand))];
  return (
    <View style={{ flex: 1 }}>
      <WTop title="الأقسام" />
      <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 120, gap: 16 }}>
        {!district?.branch && <T style={{ color: C.g }}>اختار منطقتك الأول من الرئيسية</T>}
        {brands.map((b) => {
          const L = (menu ?? []).filter((m) => m.brand === b);
          const fams = [...new Set(L.map((m) => m.family ?? "أصناف"))];
          return (
            <View key={b} style={{ gap: 10 }}>
              <T w="x" style={{ fontSize: 16 }}>{config?.brands[b] ?? b}</T>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
                {fams.map((f) => {
                  const one = L.find((m) => (m.family ?? "أصناف") === f)!;
                  return (
                    <Pressable key={f} onPress={() => router.push({ pathname: "/cat/[name]", params: { name: f, brand: b } })}
                      style={{ width: "31%", backgroundColor: C.panel, borderWidth: 1, borderColor: C.ln, borderRadius: 16, paddingVertical: 12, paddingHorizontal: 6, alignItems: "center", gap: 4 }}>
                      <View style={{ width: 56, height: 56, borderRadius: 16, backgroundColor: famColor(f, one.color), alignItems: "center", justifyContent: "center" }}>
                        <Text style={{ fontSize: 28 }}>{one.icon || BRAND_ICON[b] || "🛒"}</Text>
                      </View>
                      <T w="x" style={{ fontSize: 12, textAlign: "center" }} numberOfLines={2}>{f}</T>
                      <T style={{ fontSize: 10.5, color: C.g, textAlign: "center" }}>{L.filter((m) => (m.family ?? "أصناف") === f).length} منتج</T>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}
