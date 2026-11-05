import { useCallback, useEffect, useState } from "react";
import { RefreshControl, ScrollView, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { sb } from "@/lib/supabase";
import { Card, T } from "@/lib/ui";
import { C, STATUS, money } from "@/lib/theme";

type Tr = { no: number; status: string; branch: string; est_total: number; total: number | null; fee: number; cancel_reason: string | null; lines: { name: string; unit: string; qty: number; prepared: number; price: number }[] };
const STEPS = ["new", "accepted", "preparing", "ready", "out", "delivered"];

export default function Track() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const [o, setO] = useState<Tr | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const load = useCallback(async () => { const { data } = await sb.rpc("track_order", { p_token: token }); if (data) setO(data as Tr); }, [token]);
  useEffect(() => {
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, [load]);
  if (!o) return <T style={{ padding: 20, color: C.muted }}>بيحمّل…</T>;
  const idx = STEPS.indexOf(o.status);
  const lt = (l: Tr["lines"][number]) => (l.prepared > 0 ? l.prepared : l.qty) * l.price;
  const sub = o.lines.reduce((a, l) => a + lt(l), 0);
  return (
    <ScrollView contentContainerStyle={{ padding: 12, gap: 12 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}>
      <T w="x" style={{ fontSize: 22 }}>طلب رقم {o.no}</T>
      {o.status === "cancelled" ? <T w="b" style={{ color: C.bad }}>الطلب اتلغى{o.cancel_reason ? ` — ${o.cancel_reason}` : ""}</T> : (
        <Card>
          {STEPS.map((s, i) => (
            <View key={s} style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <View style={{ width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: i <= idx ? C.y : C.bg, borderWidth: 2, borderColor: i <= idx ? C.y : C.line }}>
                <T w="x" style={{ fontSize: 13, textAlign: "center" }}>{i + 1}</T>
              </View>
              <T w={i === idx ? "x" : "m"} style={{ color: i <= idx ? C.ink : C.muted }}>{STATUS[s]}</T>
            </View>
          ))}
        </Card>
      )}
      <Card>
        <T style={{ color: C.muted }}>فرع {o.branch}</T>
        {o.lines.map((l, i) => (
          <View key={i} style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <T>{l.name} · {l.prepared > 0 ? l.prepared : l.qty} {l.unit}</T><T w="b">{money(lt(l))}</T>
          </View>
        ))}
        <View style={{ flexDirection: "row", justifyContent: "space-between" }}><T>التوصيل</T><T w="b">{money(Number(o.fee))}</T></View>
        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
          <T w="x" style={{ fontSize: 18 }}>{o.total != null ? "الإجمالي" : "الإجمالي (تقريبي لحد الوزن)"}</T>
          <T w="x" style={{ fontSize: 18 }}>{money(o.total != null ? Number(o.total) : sub + Number(o.fee))}</T>
        </View>
      </Card>
    </ScrollView>
  );
}
