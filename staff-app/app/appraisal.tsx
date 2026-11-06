import { useCallback, useState } from "react";
import { RefreshControl, ScrollView, View } from "react-native";
import { useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { errMsg, sb } from "@/lib/supabase";
import { Badge, Btn, Card, Err, Head, Input, T } from "@/lib/ui";
import { C, money } from "@/lib/theme";

type Item = { name: string; weight: number; target: number; actual: number | null; unit?: string; lower?: boolean; note?: string; pct: number | null };
type A = { id: number; name: string; items: Item[]; score: number; grade: string; bonus: number | null; mgr_comment: string | null; emp_comment: string | null; ack_at: string | null; by: string | null };

/** تقييمي: كل مؤشر بهدفه والمحقق والنسبة، والتقدير والمكافأة، وتعليقي */
export default function Appraisal() {
  const ins = useSafeAreaInsets();
  const [list, setList] = useState<A[] | null>(null);
  const [cm, setCm] = useState<Record<number, string>>({});
  const [err, setErr] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const load = useCallback(async () => {
    const { data, error } = await sb.rpc("my_appraisals");
    if (error) setErr(errMsg(error)); else { setErr(null); setList((data ?? []) as A[]); }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  const ack = async (id: number) => {
    const { error } = await sb.rpc("appraisal_ack", { p_id: id, p_comment: cm[id] ?? "" });
    if (error) return setErr(errMsg(error));
    load();
  };
  return (
    <View style={{ flex: 1 }}>
      <Head title="تقييمي" sub="تقييم الأداء الشهري" />
      <ScrollView contentContainerStyle={{ padding: 18, gap: 14, paddingBottom: 40 + ins.bottom }} keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}>
        <Err t={err} />
        {list?.map((a) => (
          <Card key={a.id}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <T b style={{ fontSize: 17 }}>{a.name}</T>
              <Badge kind={a.score >= 85 ? "ok" : a.score >= 70 ? "y" : "wait"} t={`${a.score}% — ${a.grade}`} />
            </View>
            {a.items.map((i, k) => (
              <View key={k} style={{ borderTopWidth: 1, borderColor: C.border, paddingTop: 8, gap: 4 }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between" }}><T b style={{ flex: 1 }}>{i.name}</T><T b>{i.pct ?? "—"}%</T></View>
                <T style={{ color: C.mid, fontSize: 13 }}>المحقق {i.actual ?? "—"} من هدف {i.target}{i.unit ? ` ${i.unit}` : ""}{i.lower ? " (أقل أحسن)" : ""} · الوزن {i.weight}</T>
                <View style={{ height: 6, backgroundColor: C.off, borderRadius: 3 }}><View style={{ width: `${Math.min(100, i.pct ?? 0)}%`, height: 6, borderRadius: 3, backgroundColor: (i.pct ?? 0) >= 95 ? C.green : C.y }} /></View>
                {i.note ? <T style={{ fontSize: 13 }}>{i.note}</T> : null}
              </View>
            ))}
            {a.mgr_comment && <T>تعليق {a.by ?? "المدير"}: {a.mgr_comment}</T>}
            {!!a.bonus && <T b style={{ color: C.green }}>مكافأة الأداء {money(a.bonus)} مع المرتب</T>}
            {a.ack_at ? <T style={{ color: C.mid }}>✓ شفته{a.emp_comment ? ` · تعليقك: ${a.emp_comment}` : ""}</T> : (
              <>
                <Input value={cm[a.id] ?? ""} onChangeText={(v) => setCm({ ...cm, [a.id]: v })} placeholder="تعليقك (اختياري)" />
                <Btn y title="شفت التقييم" onPress={() => ack(a.id)} />
              </>
            )}
          </Card>
        ))}
        {list && !list.length && <T style={{ color: C.mid }}>لسه مفيش تقييمات معتمدة. أول ما تقييمك يتعتمد هيوصلك إشعار.</T>}
      </ScrollView>
    </View>
  );
}
