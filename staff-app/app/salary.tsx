import { useCallback, useState } from "react";
import { Pressable, RefreshControl, ScrollView, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { errMsg, sb } from "@/lib/supabase";
import { Badge, Card, Err, Head, T } from "@/lib/ui";
import { C, money } from "@/lib/theme";

type Slip = { id: number; month: string; name: string; gross: number; deductions: number; net: number; received: boolean; disputes: number };
type Bal = { annual_total: number; casual_total: number; used: Record<string, number>; advances: { id: number; amount: number; installments: number; paid: number; next: string | null; monthly: number }[]; custody: number };

/** مرتبي: كل الشهور + أرصدة الإجازات والسلف */
export default function Salary() {
  const ins = useSafeAreaInsets();
  const [list, setList] = useState<Slip[] | null>(null);
  const [bal, setBal] = useState<Bal | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const load = useCallback(async () => {
    const [a, b] = await Promise.all([sb.rpc("my_payslips"), sb.rpc("my_balances")]);
    if (a.error) setErr(errMsg(a.error)); else { setErr(null); setList((a.data ?? []) as Slip[]); }
    if (!b.error) setBal(b.data as Bal);
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  const used = (k: string) => Number(bal?.used?.[k] ?? 0);
  const annualLeft = bal ? bal.annual_total - used("annual") - used("casual") : 0;
  return (
    <View style={{ flex: 1 }}>
      <Head title="مرتبي" sub="كشف كل شهر بالتفصيل" />
      <ScrollView contentContainerStyle={{ padding: 18, gap: 14, paddingBottom: 40 + ins.bottom }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}>
        <Err t={err} />
        {bal && (
          <Card>
            <T b>أرصدتي</T>
            <View style={{ flexDirection: "row", gap: 10 }}>
              {[["باقي من السنوية", `${annualLeft} يوم`], ["العارضة", `${used("casual")} من ${bal.casual_total}`], ["مرضي السنة دي", `${used("sick")} يوم`]].map(([k, v]) => (
                <View key={k} style={{ flex: 1, backgroundColor: C.off, borderRadius: 12, padding: 10 }}><T style={{ color: C.mid, fontSize: 12 }}>{k}</T><T b style={{ fontSize: 17 }}>{v}</T></View>
              ))}
            </View>
            {bal.advances.map((a) => (
              <View key={a.id} style={{ backgroundColor: C.ySoft, borderRadius: 12, padding: 10 }}>
                <T b>سلفة {money(a.amount)} — اتسدّد {money(a.paid)}</T>
                <T style={{ color: C.mid, fontSize: 13 }}>القسط {money(a.monthly)}{a.next ? ` · الجاي مع مرتب ${a.next.slice(0, 7)}` : ""}</T>
              </View>
            ))}
            {Number(bal.custody) !== 0 && <T style={{ color: C.mid }} onPress={() => router.push("/custody")}>العهدة اللي معاك: <T b>{money(bal.custody)}</T> ←</T>}
          </Card>
        )}
        <T b>الشهور</T>
        {list?.map((s) => (
          <Pressable key={s.id} onPress={() => router.push({ pathname: "/slip/[id]", params: { id: String(s.id) } })}>
            <Card>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <T b style={{ fontSize: 17 }}>{s.name}</T>
                <View style={{ flexDirection: "row", gap: 6, alignItems: "center" }}>
                  {s.disputes > 0 && <Badge kind="wait" t="اعتراض مستني" />}
                  {!s.received && <Badge kind="y" t="جديد" />}
                  <Ionicons name="chevron-back" size={18} color={C.mid} />
                </View>
              </View>
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <T style={{ color: C.green }}>+ {money(s.gross)}</T><T style={{ color: C.red }}>− {money(s.deductions)}</T><T b>الصافي {money(s.net)}</T>
              </View>
            </Card>
          </Pressable>
        ))}
        {list && !list.length && <T style={{ color: C.mid }}>لسه مفيش مرتبات معتمدة. أول ما مرتب الشهر يتعتمد هيوصلك إشعار.</T>}
      </ScrollView>
    </View>
  );
}
