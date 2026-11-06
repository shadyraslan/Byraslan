import { useCallback, useState } from "react";
import { RefreshControl, ScrollView, View } from "react-native";
import { useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { errMsg, sb } from "@/lib/supabase";
import { Badge, Btn, Card, Err, Head, T } from "@/lib/ui";
import { C, hhmm } from "@/lib/theme";

type Trip = { id: number; no: number; truck: string; status: string; left_at: string | null; loaded_ok_at: string | null;
  stops: { loc: string; name: string; crates: number; boxes: number; transfer: { id: number; status: string } | null }[] };
const ST: Record<string, ["ok" | "wait" | "bad" | "y", string]> = { loading: ["y", "بيتحمّل"], out: ["wait", "في الطريق"], done: ["ok", "خلصت"] };

export default function Trips() {
  const ins = useSafeAreaInsets();
  const [list, setList] = useState<Trip[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const load = useCallback(async () => { const { data, error } = await sb.rpc("driver_trips"); if (error) setErr(errMsg(error)); else setList((data ?? []) as Trip[]); }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  const act = async (p: PromiseLike<{ error: unknown }>) => { setErr(null); const { error } = await p; if (error) setErr(errMsg(error)); load(); };
  return (
    <View style={{ flex: 1 }}>
      <Head title="رحلاتي" />
      <ScrollView contentContainerStyle={{ padding: 18, gap: 14, paddingBottom: 40 + ins.bottom }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}>
        <Err t={err} />
        {list.map((t) => (
          <Card key={t.id}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <T b style={{ fontSize: 17 }}>رحلة #{t.no} · {t.truck}</T>
              <Badge kind={ST[t.status][0]} t={ST[t.status][1]} />
            </View>
            {t.left_at && <T style={{ color: C.mid }}>خرجت {hhmm(t.left_at)}</T>}
            {t.stops.map((s) => (
              <View key={s.loc} style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", borderTopWidth: 1, borderTopColor: C.border, paddingTop: 8 }}>
                <View><T b>{s.name}</T><T style={{ color: C.mid, fontSize: 12.5 }}>{s.crates} صندوق · {s.boxes} علبة</T></View>
                {s.transfer ? <Badge kind={s.transfer.status === "received" || s.transfer.status === "done" ? "ok" : "wait"} t={s.transfer.status === "transit" ? "مستني الفرع يستلم" : "الفرع استلم"} /> : null}
              </View>
            ))}
            {t.status === "loading" && !t.loaded_ok_at && <Btn y title="عدّيت الصناديق والتحميل مظبوط" onPress={() => act(sb.rpc("driver_confirm_load", { p_trip: t.id }))} />}
            {t.status === "loading" && t.loaded_ok_at && <Btn title="🚚 خرجت من المصنع" onPress={() => act(sb.rpc("trip_depart", { p_trip: t.id }))} />}
            {t.status === "out" && <T style={{ color: C.mid, fontSize: 12.5 }}>كل فرع بيستلم بمسح الصناديق عنده، وحالته هتتحدّث هنا.</T>}
          </Card>
        ))}
        {!list.length && <T style={{ color: C.mid }}>مفيش رحلات عليك دلوقتي</T>}
      </ScrollView>
    </View>
  );
}
