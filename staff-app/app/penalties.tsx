import { useCallback, useState } from "react";
import { RefreshControl, ScrollView, View } from "react-native";
import { useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { errMsg, sb } from "@/lib/supabase";
import { Badge, Btn, Card, Err, Head, T } from "@/lib/ui";
import { C, day } from "@/lib/theme";

type P = { id: number; no: number; rule: string; occurrence: number; action: string; days: number; reason: string; day: string; month: string; status: string; acked_at: string | null; cancel_note: string | null; by: string | null };
const A: Record<string, string> = { notice: "لفت نظر", warning: "إنذار كتابي", deduct: "خصم" };

/** جزاءاتي: كل جزاء بسببه والمرة الكام — ولازم أأكّد إني استلمته */
export default function Penalties() {
  const ins = useSafeAreaInsets();
  const [L, setL] = useState<P[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<number | null>(null);
  const load = useCallback(async () => { const { data, error } = await sb.rpc("my_penalties"); if (error) setErr(errMsg(error)); else setL(data as P[]); }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  const ack = async (id: number) => { setBusy(id); const { error } = await sb.rpc("penalty_ack", { p_id: id }); setBusy(null); if (error) setErr(errMsg(error)); else load(); };
  return (
    <View style={{ flex: 1, backgroundColor: C.off }}>
      <Head title="جزاءاتي" sub="حسب اللايحة" />
      <ScrollView contentContainerStyle={{ padding: 18, gap: 12, paddingBottom: 40 + ins.bottom }} refreshControl={<RefreshControl refreshing={false} onRefresh={load} />}>
        <Err t={err} />
        {L && !L.length && <Card><T style={{ color: C.mid, textAlign: "center" }}>مفيش جزاءات — كمّل كده 👏</T></Card>}
        {(L ?? []).map((p) => (
          <Card key={p.id} style={{ opacity: p.status === "cancelled" ? 0.55 : 1 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <T b style={{ flex: 1 }}>{p.rule}</T>
              <Badge kind={p.status === "issued" ? "wait" : p.status === "cancelled" ? "ok" : "bad"} t={p.status === "issued" ? "محتاج تأكيدك" : p.status === "cancelled" ? "اتلغى" : "اتأكّد"} />
            </View>
            <T>{p.reason}</T>
            <T style={{ color: C.mid, fontSize: 13 }}>{day(p.day)} · المرة {p.occurrence} · {A[p.action]}{p.action === "deduct" ? ` ${p.days} يوم` : ""}{p.by ? ` · ${p.by}` : ""}</T>
            {p.cancel_note && <T style={{ color: C.green, fontSize: 13 }}>{p.cancel_note}</T>}
            {p.status === "issued" && <Btn y title="استلمت الجزاء" busy={busy === p.id} onPress={() => ack(p.id)} />}
          </Card>
        ))}
        <T style={{ color: C.mid, fontSize: 12, textAlign: "center" }}>التأكيد معناه إنك استلمت الجزاء بس. لو عندك اعتراض كلّم مديرك أو ابعت من "رسايل الإدارة".</T>
      </ScrollView>
    </View>
  );
}
