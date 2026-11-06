import { useCallback, useState } from "react";
import { FlatList, Pressable, RefreshControl, Text, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useApp } from "@/lib/store";
import { sb } from "@/lib/supabase";
import { BlackHead, Btn, T } from "@/lib/ui";
import { C, STATUS, money } from "@/lib/theme";
import type { MyOrder } from "@/lib/types";
import { useReorder } from "@/lib/reorder";

const TABS: [string, string, (s: string) => boolean][] = [
  ["all", "الكل", () => true],
  ["active", "نشطة", (s) => !["delivered", "cancelled"].includes(s)],
  ["done", "مكتملة", (s) => s === "delivered"],
  ["cancel", "ملغية", (s) => s === "cancelled"],
];
const badge = (s: string): [string, string] => (s === "delivered" ? [C.greenSoft, "#1A7F37"] : s === "cancelled" ? [C.redSoft, C.red] : [C.y, C.black]);

export default function Orders() {
  const ins = useSafeAreaInsets();
  const { tokens } = useApp();
  const again = useReorder();
  const [list, setList] = useState<MyOrder[] | null>(null);
  const [tab, setTab] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const load = useCallback(async () => { if (!tokens.length) { setList([]); return; } const { data } = await sb.rpc("app_track_many", { p_tokens: tokens }); setList((data ?? []) as MyOrder[]); }, [tokens]);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  const L = (list ?? []).filter((o) => TABS[tab][2](o.status));
  return (
    <View style={{ flex: 1 }}>
      <BlackHead title="طلباتي" back={false} />
      <View style={{ flexDirection: "row", backgroundColor: C.white, borderBottomWidth: 1, borderBottomColor: C.border }}>
        {TABS.map((t, i) => (
          <Pressable key={t[0]} onPress={() => setTab(i)} style={{ flex: 1, alignItems: "center", paddingVertical: 12, borderBottomWidth: 3, borderBottomColor: i === tab ? C.y : "transparent" }}>
            <T w={i === tab ? "x" : "b"} style={{ fontSize: 13, color: i === tab ? C.black : C.mid }}>{t[1]}</T>
          </Pressable>
        ))}
      </View>
      <FlatList data={L} keyExtractor={(o) => o.token} contentContainerStyle={{ padding: 18, gap: 12, paddingBottom: 120 + ins.bottom }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
        ListEmptyComponent={
          <View style={{ alignItems: "center", gap: 12, marginTop: 50 }}>
            <Text style={{ fontSize: 46 }}>📋</Text>
            <T style={{ color: C.mid }}>{list ? "مفيش طلبات هنا" : "بيحمّل…"}</T>
            {list && !tokens.length && <Btn y title="اطلب دلوقتي" onPress={() => router.push("/")} style={{ alignSelf: "stretch" }} />}
          </View>
        }
        renderItem={({ item: o }) => {
          const [bg, fg] = badge(o.status);
          const active = !["delivered", "cancelled"].includes(o.status);
          return (
            <Pressable onPress={() => router.push(`/detail/${o.token}`)} style={{ backgroundColor: C.white, borderRadius: 18, borderWidth: 1, borderColor: C.border, padding: 14, gap: 10 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
                <View><T w="x">#{o.no}</T><T style={{ color: C.mid, fontSize: 11 }}>{new Date(o.created_at).toLocaleString("ar-EG", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}</T></View>
                <View style={{ backgroundColor: bg, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 2 }}><T w="x" style={{ fontSize: 11, color: fg }}>{active && o.status === "out" ? "جاري التوصيل" : STATUS[o.status]}</T></View>
              </View>
              <View style={{ flexDirection: "row", gap: 8 }}>
                {o.lines.slice(0, 3).map((l, i) => <View key={i} style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: C.off, alignItems: "center", justifyContent: "center" }}><Text style={{ fontSize: 22 }}>{l.icon ?? "🛒"}</Text></View>)}
                {o.lines.length > 3 && <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: C.off, alignItems: "center", justifyContent: "center" }}><T w="b" style={{ color: C.mid }}>+{o.lines.length - 3}</T></View>}
              </View>
              <View style={{ height: 1, backgroundColor: C.border }} />
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <View><T w="x" style={{ fontSize: 15 }}>{money(Number(o.total))}</T><T style={{ color: C.mid, fontSize: 11 }}>{o.lines.length} منتجات</T></View>
                <Pressable onPress={() => (active ? router.push(`/order/${o.token}`) : again(o))} style={{ backgroundColor: C.black, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 7 }}>
                  <T w="x" style={{ color: C.white, fontSize: 12 }}>{active ? "تتبع الطلب" : "إعادة الطلب"}</T>
                </Pressable>
              </View>
            </Pressable>
          );
        }} />
    </View>
  );
}
