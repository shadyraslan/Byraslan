import { useCallback, useState } from "react";
import { FlatList, Pressable, RefreshControl, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { useApp } from "@/lib/store";
import { sb } from "@/lib/supabase";
import { Btn, T } from "@/lib/ui";
import { C, STATUS, money } from "@/lib/theme";
import type { MyOrder } from "@/lib/types";

export default function Orders() {
  const { session, setBranch, setQty, clearCart } = useApp();
  const [list, setList] = useState<MyOrder[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const load = useCallback(async () => { if (!session) return; const { data } = await sb.rpc("app_my_orders"); setList((data ?? []) as MyOrder[]); }, [session]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (!session) return <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 24, gap: 12 }}><T w="b">سجّل دخول عشان تشوف طلباتك</T><Btn title="تسجيل الدخول" onPress={() => router.push("/login")} /></View>;

  const again = (o: MyOrder) => { clearCart(); setBranch(o.location_id); o.lines.forEach((l) => setQty(l.item_id, Number(l.qty))); router.push("/cart"); };
  return (
    <FlatList data={list ?? []} keyExtractor={(o) => String(o.no)} contentContainerStyle={{ padding: 12, gap: 10 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
      ListEmptyComponent={<T style={{ color: C.muted, textAlign: "center", marginTop: 40 }}>{list ? "لسه ماطلبتش" : "بيحمّل…"}</T>}
      renderItem={({ item: o }) => (
        <Pressable onPress={() => router.push(`/order/${o.token}`)} style={{ backgroundColor: C.panel, borderRadius: 16, borderWidth: 1, borderColor: C.line, padding: 12, gap: 4 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <T w="b">طلب {o.no}</T>
            <T w="b" style={{ color: o.status === "cancelled" ? C.bad : o.status === "delivered" ? C.good : C.yDark }}>{STATUS[o.status]}</T>
          </View>
          <T style={{ color: C.muted }} numberOfLines={2}>{o.lines.map((l) => `${l.name} ${l.qty}`).join(" · ")}</T>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <T style={{ color: C.muted }}>{new Date(o.created_at).toLocaleDateString("ar-EG")} · {o.branch} · {money(Number(o.total))}</T>
            <Pressable onPress={() => again(o)} hitSlop={6}><T w="b" style={{ color: C.yDark }}>اطلبه تاني</T></Pressable>
          </View>
        </Pressable>
      )} />
  );
}
