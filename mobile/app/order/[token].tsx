import { useCallback, useEffect, useState } from "react";
import { RefreshControl, ScrollView, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { sb } from "@/lib/supabase";
import { Box, Ln, T, WTop } from "@/lib/ui";
import { C, STATUS, money } from "@/lib/theme";

type Tr = { no: number; status: string; branch: string; est_total: number; total: number | null; fee: number; cancel_reason: string | null; lines: { name: string; unit: string; qty: number; prepared: number; price: number }[] };
const STEPS = ["new", "preparing", "ready", "out", "delivered"];
const at = (s: string) => (s === "accepted" ? 1 : STEPS.indexOf(s));

export default function Track() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const [o, setO] = useState<Tr | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const load = useCallback(async () => { const { data } = await sb.rpc("track_order", { p_token: token }); if (data) setO(data as Tr); }, [token]);
  useEffect(() => { load(); const t = setInterval(load, 15000); return () => clearInterval(t); }, [load]);
  if (!o) return <View style={{ flex: 1 }}><WTop title="تتبّع الطلب" /><T style={{ padding: 20, color: C.g }}>بيحمّل…</T></View>;
  const idx = at(o.status);
  const lt = (l: Tr["lines"][number]) => (l.prepared > 0 ? l.prepared : l.qty) * l.price;
  const sub = o.lines.reduce((a, l) => a + lt(l), 0);
  return (
    <View style={{ flex: 1 }}>
      <WTop title={`طلب #${o.no}`} />
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}>
        {o.status === "cancelled" ? (
          <View style={{ margin: 14, backgroundColor: "#FDECEC", borderRadius: 12, padding: 12 }}><T w="b" style={{ color: C.bad }}>الطلب اتلغى{o.cancel_reason ? ` — ${o.cancel_reason}` : ""}</T></View>
        ) : (
          <Box title={`فرع ${o.branch}`}>
            {STEPS.map((s, i) => (
              <View key={s} style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                <View style={{ width: 26, height: 26, borderRadius: 13, alignItems: "center", justifyContent: "center", backgroundColor: i < idx || o.status === "delivered" ? C.good : i === idx ? C.y : "#EEEEEE" }}>
                  <T w="x" style={{ fontSize: 12, textAlign: "center", color: i < idx || o.status === "delivered" ? "#fff" : C.ink }}>{i < idx || o.status === "delivered" ? "✓" : i + 1}</T>
                </View>
                <T w={i === idx ? "x" : "m"} style={{ color: i <= idx ? C.ink : C.g, fontSize: 13 }}>{STATUS[s]}</T>
              </View>
            ))}
          </Box>
        )}
        <Box title="تفاصيل الطلب">
          {o.lines.map((l, i) => <Ln key={i} l={`${l.name} · ${l.prepared > 0 ? l.prepared : l.qty} ${l.unit}`} v={money(lt(l))} />)}
          <View style={{ height: 1, backgroundColor: C.ln }} />
          <Ln l="التوصيل" v={money(Number(o.fee))} />
          <Ln l={o.total != null ? "الإجمالي" : "الإجمالي (تقريبي لحد الوزن)"} v={money(o.total != null ? Number(o.total) : sub + Number(o.fee))} big />
        </Box>
      </ScrollView>
    </View>
  );
}
