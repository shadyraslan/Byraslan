import { useCallback, useState } from "react";
import { FlatList, Pressable, RefreshControl, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { useApp } from "@/lib/store";
import { sb } from "@/lib/supabase";
import { Btn, T, WTop } from "@/lib/ui";
import { C, STATUS, money } from "@/lib/theme";
import type { MyOrder } from "@/lib/types";

const COLOR: Record<string, string> = { delivered: "#1A7F37", cancelled: "#CC0000" };

export default function Orders() {
  const { session, menu, setQty, clearCart } = useApp();
  const [list, setList] = useState<MyOrder[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const load = useCallback(async () => { if (!session) return; const { data } = await sb.rpc("app_my_orders"); setList((data ?? []) as MyOrder[]); }, [session]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (!session) return (
    <View style={{ flex: 1 }}>
      <WTop title="طلباتي" />
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 24, gap: 12 }}>
        <T w="x" style={{ fontSize: 16 }}>سجّل دخول عشان تشوف طلباتك</T>
        <Btn y title="تسجيل الدخول" onPress={() => router.push("/login")} style={{ alignSelf: "stretch" }} />
      </View>
    </View>
  );

  // إعادة الطلب بالسعر الحالي، واللي مش متاح مابيتضافش
  const again = (o: MyOrder) => {
    clearCart();
    o.lines.forEach((l) => { const m = (menu ?? []).find((x) => x.item_id === l.item_id); if (m && m.available > 0) setQty(l.item_id, Number(l.qty)); });
    router.push("/cart");
  };
  return (
    <View style={{ flex: 1 }}>
      <WTop title="طلباتي" />
      <FlatList data={list ?? []} keyExtractor={(o) => String(o.no)} contentContainerStyle={{ padding: 14, gap: 10, paddingBottom: 120 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
        ListEmptyComponent={<T style={{ color: C.g, textAlign: "center", marginTop: 40 }}>{list ? "لسه ماطلبتش" : "بيحمّل…"}</T>}
        renderItem={({ item: o }) => (
          <Pressable onPress={() => router.push(`/order/${o.token}`)} style={{ backgroundColor: C.panel, borderRadius: 16, padding: 14, gap: 6 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <T w="x">طلب #{o.no}</T>
              <View style={{ backgroundColor: o.status in COLOR ? "#F2F2F2" : C.y, borderRadius: 10, paddingHorizontal: 8 }}>
                <T w="b" style={{ fontSize: 11.5, color: COLOR[o.status] ?? C.ink }}>{STATUS[o.status]}</T>
              </View>
            </View>
            <T style={{ color: C.g, fontSize: 12 }} numberOfLines={2}>{o.lines.map((l) => `${l.name} ${l.qty}`).join(" · ")}</T>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <T style={{ color: C.g, fontSize: 11.5 }}>{new Date(o.created_at).toLocaleDateString("ar-EG")} · فرع {o.branch}</T>
              <T w="x">{money(Number(o.total))}</T>
            </View>
            <Pressable onPress={() => again(o)} style={{ borderWidth: 1.5, borderColor: C.ln, borderRadius: 10, padding: 8, alignItems: "center" }}><T w="x" style={{ fontSize: 12.5 }}>اطلبه تاني</T></Pressable>
          </Pressable>
        )} />
    </View>
  );
}
