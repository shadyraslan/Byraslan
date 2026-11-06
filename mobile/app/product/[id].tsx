import { ScrollView, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useApp } from "@/lib/store";
import { AddCtr, BottomBar, Btn, ItemArt, T, WTop, unitLabel } from "@/lib/ui";
import { C, money } from "@/lib/theme";

export default function Product() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const ins = useSafeAreaInsets();
  const { menu, cart, config, add } = useApp();
  const m = (menu ?? []).find((x) => String(x.item_id) === id);
  if (!m) return <View style={{ flex: 1 }}><WTop title="المنتج" /><T style={{ padding: 20, color: C.g }}>المنتج ده مش متاح في فرعك</T></View>;
  const q = cart[m.item_id] ?? 0;
  const out = m.available <= 0;
  const weighed = !(m.sold_by === "piece" || m.unit === "قطعة");
  return (
    <View style={{ flex: 1 }}>
      <WTop title={m.family ?? "المنتج"} />
      <ScrollView contentContainerStyle={{ paddingBottom: 110 + ins.bottom }}>
        <ItemArt m={m} h={260} size={110} />
        <View style={{ padding: 16, gap: 6, backgroundColor: C.panel }}>
          <T w="b" style={{ color: C.g, fontSize: 12 }}>{config?.brands[m.brand] ?? ""}</T>
          <T w="x" style={{ fontSize: 22 }}>{m.name}</T>
          <View style={{ flexDirection: "row", alignItems: "baseline", gap: 8 }}>
            <T w="x" style={{ fontSize: 22 }}>{money(m.price)}</T>
            <T style={{ color: C.g }}>{unitLabel(m)}</T>
          </View>
          {out ? <T w="b" style={{ color: C.bad }}>خلص في الفرع ده</T> : <T style={{ color: C.good }}>متاح في فرعك</T>}
          {weighed && <T style={{ color: C.muted, fontSize: 12.5 }}>{config?.note || "السعر النهائي بيتحسب بالوزن الفعلي للعلبة"}. تقدر تطلب بنص الكيلو.</T>}
        </View>
      </ScrollView>
      <BottomBar>
        <AddCtr m={m} big />
        <Btn y title={q ? `في السلة · ${money(q * m.price)}` : "أضف للسلة"} onPress={() => (q ? router.push("/cart") : add(m, 1))} disabled={out && !q} style={{ flex: 1 }} />
      </BottomBar>
    </View>
  );
}
