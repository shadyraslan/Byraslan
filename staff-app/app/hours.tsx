import { useCallback, useState } from "react";
import { RefreshControl, ScrollView, View } from "react-native";
import { useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { errMsg, sb } from "@/lib/supabase";
import { Badge, Card, Err, Head, T } from "@/lib/ui";
import { SumGrid, type Sum } from "@/lib/sumcard";
import { C, day, shiftLine } from "@/lib/theme";

type Bal = { annual_total: number; casual_total: number; company_from_balance: number; used: Record<string, number>;
  shifts: { day: string; off: boolean; start: string | null; loc: string | null }[]; days: { day: string; kind: string; name: string }[] };
const DK: Record<string, string> = { holiday: "إجازة رسمية", gift: "إجازة مدفوعة", from_balance: "من رصيدك", substitute: "يوم بديل" };

/** ساعاتي: الشهر لحد النهارده + اللي فاضل + ورديات الأسبوع + الإجازات الجاية + الرصيد */
export default function Hours() {
  const ins = useSafeAreaInsets();
  const [s, setS] = useState<Sum | null>(null);
  const [b, setB] = useState<Bal | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const load = useCallback(async () => {
    const [a, c] = await Promise.all([sb.rpc("my_hours"), sb.rpc("my_balances")]);
    if (a.error) setErr(errMsg(a.error)); else { setErr(null); setS(a.data as Sum); }
    if (!c.error) setB(c.data as Bal);
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  const used = (k: string) => Number(b?.used?.[k] ?? 0);
  const left = b ? b.annual_total - used("annual") - used("casual") - Number(b.company_from_balance ?? 0) : 0;
  return (
    <View style={{ flex: 1 }}>
      <Head title="ساعاتي وأيامي" sub="الشهر ده" />
      <ScrollView contentContainerStyle={{ padding: 18, gap: 14, paddingBottom: 40 + ins.bottom }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}>
        <Err t={err} />
        {s && <Card><T b>الشهر لحد النهارده</T><SumGrid s={s} /></Card>}
        {b && (
          <Card>
            <T b>رصيد الإجازات</T>
            <T>فاضلك <T b>{left}</T> يوم من {b.annual_total} (منهم عارضة {used("casual")} من {b.casual_total}){b.company_from_balance ? ` — منهم ${b.company_from_balance} يوم الشركة خصمتهم من الرصيد` : ""}</T>
          </Card>
        )}
        {!!b?.shifts?.length && (
          <Card>
            <T b>ورديات الأسبوع</T>
            {b.shifts.map((x) => <View key={x.day} style={{ flexDirection: "row", justifyContent: "space-between" }}><T>{day(x.day)}</T><T b>{shiftLine(x)}{x.loc ? ` · ${x.loc}` : ""}</T></View>)}
          </Card>
        )}
        {!!b?.days?.length && (
          <Card>
            <T b>إجازات جاية</T>
            {b.days.map((x) => <View key={x.day + x.name} style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}><T>{day(x.day)} · {x.name}</T><Badge kind={x.kind === "from_balance" ? "wait" : "ok"} t={DK[x.kind]} /></View>)}
          </Card>
        )}
        <T style={{ color: C.mid, fontSize: 12.5 }}>الأرقام بنفس قواعد المرتب: ميعاد ورديتك، والإجازات المتوافق عليها، والأذون، والإجازات الرسمية.</T>
      </ScrollView>
    </View>
  );
}
