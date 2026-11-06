import { ScrollView, View } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useApp } from "@/lib/store";
import { AddCtr, Box, Btn, ItemArt, Ln, T, WTop } from "@/lib/ui";
import { C, money } from "@/lib/theme";

export default function Cart() {
  const ins = useSafeAreaInsets();
  const { menu, cart, district, config, clearCart } = useApp();
  const lines = (menu ?? []).filter((m) => cart[m.item_id]);
  const sub = lines.reduce((a, m) => a + cart[m.item_id] * m.price, 0);
  const fee = district?.fee ?? 0;
  const min = config?.min_order ?? 0;
  const outs = lines.filter((m) => m.available <= 0);

  if (!lines.length) return (
    <View style={{ flex: 1 }}>
      <WTop title="السلة" />
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 24 }}>
        <T style={{ fontSize: 48 }}>🛒</T>
        <T w="x" style={{ fontSize: 17 }}>السلة فاضية</T>
        <Btn y title="ابدأ التسوّق" onPress={() => router.push("/")} style={{ alignSelf: "stretch" }} />
      </View>
    </View>
  );
  return (
    <View style={{ flex: 1 }}>
      <WTop title="السلة" right={<T w="b" style={{ color: C.bad, fontSize: 12.5 }} onPress={clearCart}>فضّي السلة</T>} />
      <ScrollView contentContainerStyle={{ paddingBottom: 190 + ins.bottom }}>
        <Box>
          {lines.map((m) => (
            <View key={m.item_id} style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: C.ln }}>
              <View style={{ width: 54, height: 54, borderRadius: 12, overflow: "hidden" }}><ItemArt m={m} h={54} size={26} /></View>
              <View style={{ flex: 1 }}>
                <T w="x" style={{ fontSize: 13 }} numberOfLines={2}>{m.name}</T>
                <T style={{ color: C.g, fontSize: 11.5 }}>{money(m.price)} / {m.unit}</T>
                {m.available <= 0 && <T w="b" style={{ color: C.bad, fontSize: 11.5 }}>خلص — شيله عشان تكمّل</T>}
                <T w="x" style={{ fontSize: 13 }}>{money(cart[m.item_id] * m.price)}</T>
              </View>
              <AddCtr m={m} />
            </View>
          ))}
        </Box>
        <Box>
          <Ln l="المجموع (تقريبي)" v={money(sub)} />
          <Ln l={`التوصيل${district ? ` — ${district.name}` : ""}`} v={money(fee)} />
          <View style={{ height: 1, backgroundColor: C.ln }} />
          <Ln l="الإجمالي" v={money(sub + fee)} big />
          <T style={{ color: C.g, fontSize: 11.5 }}>{config?.note || "السعر النهائي بيتحسب بالوزن الفعلي للعلبة"}</T>
        </Box>
        {sub < min && <View style={{ marginHorizontal: 14, marginTop: 12, backgroundColor: "#FFF3CD", borderRadius: 12, padding: 10 }}><T w="b" style={{ color: "#7A5B00" }}>أقل طلب {money(min)} — ضيف بـ {money(min - sub)} كمان</T></View>}
      </ScrollView>
      <View style={{ position: "absolute", left: 14, right: 14, bottom: 90 + ins.bottom }}>
        <Btn title="إتمام الطلب" onPress={() => router.push("/checkout")} disabled={sub < min || outs.length > 0 || !district?.branch} />
      </View>
    </View>
  );
}
