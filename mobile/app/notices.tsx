import { useCallback, useState } from "react";
import { RefreshControl, ScrollView, Text, View } from "react-native";
import { useFocusEffect } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useApp } from "@/lib/store";
import { sb } from "@/lib/supabase";
import { BlackHead, Card, T } from "@/lib/ui";
import { C } from "@/lib/theme";
import type { Notice } from "@/lib/types";

/** صندوق رسايل العميل: كل اللي اتبعت من السيستم للكل أو لمنطقته أو لفرعها أو لرقمه */
export default function Notices() {
  const ins = useSafeAreaInsets();
  const { profile, district, config } = useApp();
  const [list, setList] = useState<Notice[] | null>(null);
  const [seen, setSeen] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const load = useCallback(async () => {
    const { data } = await sb.rpc("app_inbox", { p_phone: profile.phone || null, p_district: district?.id ?? null });
    const L = (data ?? []) as Notice[];
    setList(L);
    const s = Number((await AsyncStorage.getItem("noticeSeen").catch(() => null)) ?? 0);
    setSeen(s);
    if (L[0]) AsyncStorage.setItem("noticeSeen", String(L[0].id)).catch(() => {});
  }, [profile.phone, district?.id]);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  const w = config?.welcome;
  return (
    <View style={{ flex: 1 }}>
      <BlackHead title="الإشعارات" />
      <ScrollView contentContainerStyle={{ padding: 18, gap: 12, paddingBottom: 40 + ins.bottom }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}>
        {(list ?? []).map((n) => (
          <Card key={n.id} style={n.id > seen ? { borderColor: C.y, borderWidth: 2 } : undefined}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <T w="x" style={{ flex: 1 }}>{n.title}</T>
              {n.id > seen && <View style={{ backgroundColor: C.y, borderRadius: 9, paddingHorizontal: 8 }}><T w="x" style={{ fontSize: 10.5 }}>جديد</T></View>}
            </View>
            <T style={{ color: "#555", lineHeight: 22 }}>{n.body}</T>
            <T style={{ color: C.mid, fontSize: 11 }}>{new Date(n.at).toLocaleString("ar-EG", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}</T>
          </Card>
        ))}
        {w?.on && (
          <Card>
            <T w="x">{w.title}</T>
            <T style={{ color: "#555", lineHeight: 22 }}>{w.body}</T>
          </Card>
        )}
        {list && !list.length && !w?.on && (
          <View style={{ alignItems: "center", marginTop: 50, gap: 8 }}><Text style={{ fontSize: 44 }}>🔔</Text><T style={{ color: C.mid }}>مفيش إشعارات لسه</T></View>
        )}
      </ScrollView>
    </View>
  );
}
