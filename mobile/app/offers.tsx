import { ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useApp } from "@/lib/store";
import { BlackHead, Grid, T } from "@/lib/ui";
import { C } from "@/lib/theme";

export default function Offers() {
  const ins = useSafeAreaInsets();
  const { menu, config } = useApp();
  const L = (menu ?? []).filter((m) => m.pct > 0);
  return (
    <View style={{ flex: 1 }}>
      <BlackHead title="العروض" sub={`${L.length} منتج عليه خصم`} />
      <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: 40 + ins.bottom, gap: 14 }}>
        {config?.first_free && (
          <View style={{ backgroundColor: C.black, borderRadius: 18, padding: 16, flexDirection: "row", alignItems: "center", gap: 12 }}>
            <Text style={{ fontSize: 30 }}>⚡</Text>
            <View style={{ flex: 1 }}><T w="x" style={{ color: C.y }}>توصيل مجاني على أول طلب</T><T style={{ color: "#999", fontSize: 12 }}>بيتحسب لوحده في السلة</T></View>
          </View>
        )}
        <View style={{ backgroundColor: C.y, borderRadius: 18, padding: 16, gap: 2 }}>
          <T w="x">🎟️ كود RASLAN10</T>
          <T style={{ fontSize: 12.5 }}>خصم 10% على الطلب فوق 200 ج (لحد 50 ج) — اكتبه في السلة</T>
        </View>
        {L.length ? <Grid items={L} /> : <T style={{ color: C.mid }}>مفيش عروض على أصناف دلوقتي</T>}
      </ScrollView>
    </View>
  );
}
