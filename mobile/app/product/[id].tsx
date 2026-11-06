import { Pressable, ScrollView, Share, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useApp } from "@/lib/store";
import { Art, BottomBar, Btn, Qty, T, unitOf } from "@/lib/ui";
import { C, isPiece, money } from "@/lib/theme";

export default function Product() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const ins = useSafeAreaInsets();
  const { menu, cart, config, add, favs, toggleFav } = useApp();
  const m = (menu ?? []).find((x) => String(x.item_id) === id);
  if (!m) return <View style={{ flex: 1, paddingTop: ins.top + 60, padding: 20 }}><T style={{ color: C.mid }}>المنتج ده مش متاح في فرعك</T><Btn title="رجوع" onPress={() => router.back()} style={{ marginTop: 16 }} /></View>;
  const q = cart[m.item_id] ?? 0;
  const out = m.available <= 0;
  const similar = (menu ?? []).filter((x) => x.family === m.family && x.item_id !== m.item_id).slice(0, 8);
  const round = (name: keyof typeof Ionicons.glyphMap, onPress: () => void, color = C.black) => (
    <Pressable onPress={onPress} style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: C.white, alignItems: "center", justifyContent: "center", shadowColor: "#000", shadowOpacity: 0.08, shadowRadius: 6, elevation: 2 }}><Ionicons name={name} size={19} color={color} /></Pressable>
  );
  return (
    <View style={{ flex: 1, backgroundColor: C.white }}>
      <ScrollView contentContainerStyle={{ paddingBottom: 110 + ins.bottom }}>
        <View>
          <Art m={m} h={300 + ins.top} size={130} />
          <View style={{ position: "absolute", top: ins.top + 10, left: 18, right: 18, flexDirection: "row", justifyContent: "space-between" }}>
            {round("chevron-forward", () => router.back())}
            {round(favs.includes(m.item_id) ? "heart" : "heart-outline", () => toggleFav(m.item_id), favs.includes(m.item_id) ? C.red : C.black)}
          </View>
          <View style={{ position: "absolute", bottom: 14, left: 18 }}>{round("share-social-outline", () => { Share.share({ message: `${m.name} — ${money(m.price)} من باي رسلان` }).catch(() => {}); })}</View>
        </View>
        <View style={{ padding: 20, gap: 6 }}>
          <T w="b" style={{ color: C.mid, fontSize: 12 }}>{m.family}</T>
          <T w="x" style={{ fontSize: 22 }}>{m.name}</T>
          <T style={{ color: C.mid }}>{unitOf(m)}</T>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 6 }}>
            <View>
              <T w="x" style={{ fontSize: 26 }}>{money(m.price)}</T>
              {m.old_price ? <T style={{ color: C.mid, textDecorationLine: "line-through" }}>{money(m.old_price)}</T> : null}
            </View>
            {m.pct > 0 && <View style={{ backgroundColor: C.y, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 3 }}><T w="x" style={{ fontSize: 12 }}>خصم {Math.round(m.pct)}%</T></View>}
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 12, paddingVertical: 12, borderTopWidth: 1, borderBottomWidth: 1, borderColor: C.border }}>
            <T w="b" style={{ color: C.mid }}>{isPiece(m) ? "الكمية" : "الكمية (كيلو)"}</T>
            {out ? <T w="b" style={{ color: C.red }}>خلص في فرعك</T> : <Qty m={m} big />}
          </View>
          <T w="x" style={{ fontSize: 15, marginTop: 10 }}>عن المنتج</T>
          <T style={{ color: "#666", lineHeight: 24 }}>
            {isPiece(m) ? `${m.name} من رسلان ماركت، بيوصلك من أقرب فرع ليك.` : `${m.name} طازج يومياً من مصنع روستوز. ${config?.note || "السعر النهائي بيتحسب بالوزن الفعلي للعلبة"}، وتقدر تطلب بنص الكيلو.`}
          </T>
          {!!similar.length && (
            <>
              <T w="x" style={{ fontSize: 15, marginTop: 14 }}>منتجات مشابهة</T>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
                {similar.map((x) => (
                  <Pressable key={x.item_id} onPress={() => router.replace(`/product/${x.item_id}`)} style={{ width: 110, borderRadius: 16, borderWidth: 1, borderColor: C.border, overflow: "hidden" }}>
                    <Art m={x} h={80} size={36} />
                    <View style={{ padding: 8 }}><T w="b" style={{ fontSize: 11.5 }} numberOfLines={1}>{x.name}</T><T w="x" style={{ fontSize: 12 }}>{money(x.price)}</T></View>
                  </Pressable>
                ))}
              </ScrollView>
            </>
          )}
        </View>
      </ScrollView>
      <BottomBar>
        <Btn title={q ? `في السلة (${q})` : "إضافة للسلة"} onPress={() => (q ? router.push("/cart") : add(m, 1))} disabled={out && !q} style={{ flex: 1 }} />
        <Btn y title="اشتري دلوقتي" onPress={() => { if (!q) add(m, 1); router.push("/checkout"); }} disabled={out} style={{ flex: 1 }} />
      </BottomBar>
    </View>
  );
}
