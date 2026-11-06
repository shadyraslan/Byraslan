import { useCallback, useState } from "react";
import { Pressable, RefreshControl, ScrollView, View } from "react-native";
import { useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { errMsg, sb } from "@/lib/supabase";
import { Badge, Btn, Card, Err, Head, Ok, T } from "@/lib/ui";
import { SumGrid, type Sum } from "@/lib/sumcard";
import { C, day, shiftLine, t5 } from "@/lib/theme";

type Pend = { id: number; day: string; kind: string; time: string | null; reason: string | null };
type Row = { id: string; name: string; job: string | null; loc: string | null; today: "in" | "out" | "none"; shift: { off: boolean; start: string | null } | null; sum: Sum; pending: Pend[] };
const TD: Record<string, ["ok" | "wait" | "bad" | "y", string]> = { in: ["ok", "جوه"], out: ["y", "مشي"], none: ["bad", "ماجاش"] };

/** فريقي (للمدير): ساعات وأيام كل موظف + الموافقة على الأذون */
export default function Team() {
  const ins = useSafeAreaInsets();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const load = useCallback(async () => {
    const { data, error } = await sb.rpc("team_summary");
    if (error) setErr(errMsg(error)); else { setErr(null); setRows(((data as { team: Row[] }).team ?? []) as Row[]); }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  const decide = async (id: number, okk: boolean, paid: boolean) => {
    setErr(null); setOk(null);
    const { error } = await sb.rpc("permit_decide", { p_id: id, p_ok: okk, p_paid: paid });
    if (error) return setErr(errMsg(error));
    setOk(okk ? "اتوافق ووصل للموظف" : "اترفض"); load();
  };
  const pendingAll = (rows ?? []).reduce((a, r) => a + r.pending.length, 0);
  return (
    <View style={{ flex: 1 }}>
      <Head title="فريقي" sub={rows ? `${rows.length} موظف${pendingAll ? ` · ${pendingAll} إذن مستني` : ""}` : ""} />
      <ScrollView contentContainerStyle={{ padding: 18, gap: 12, paddingBottom: 40 + ins.bottom }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}>
        <Err t={err} /><Ok t={ok} />
        {rows?.map((r) => (
          <Card key={r.id}>
            <Pressable onPress={() => setOpen(open === r.id ? null : r.id)} style={{ gap: 4 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <T b style={{ fontSize: 16 }}>{r.name}</T>
                <View style={{ flexDirection: "row", gap: 6 }}>{!!r.pending.length && <Badge kind="wait" t={`${r.pending.length} إذن`} />}<Badge kind={TD[r.today][0]} t={r.shift?.off ? "راحة" : TD[r.today][1]} /></View>
              </View>
              <T style={{ color: C.mid, fontSize: 12.5 }}>{[r.job, r.loc, r.shift && `النهارده ${shiftLine(r.shift)}`].filter(Boolean).join(" · ")}</T>
              <T style={{ fontSize: 13 }}>اشتغل {r.sum.worked_hours} من {r.sum.due_hours} ساعة · غياب {r.sum.absent} · فاضل {r.sum.left_days} يوم</T>
            </Pressable>
            {open === r.id && <SumGrid s={r.sum} />}
            {r.pending.map((p) => (
              <View key={p.id} style={{ backgroundColor: C.ySoft, borderRadius: 12, padding: 10, gap: 6 }}>
                <T b>{p.kind === "early" ? "عايز ينصرف بدري" : "هيتأخر"} يوم {day(p.day)}{p.time ? ` الساعة ${t5(p.time)}` : ""}</T>
                {p.reason && <T style={{ color: C.mid }}>{p.reason}</T>}
                <View style={{ flexDirection: "row", gap: 6 }}>
                  <Btn y title="وافق مدفوع" onPress={() => decide(p.id, true, true)} style={{ flex: 1, height: 42 }} />
                  <Btn outline title="وافق بخصم" onPress={() => decide(p.id, true, false)} style={{ flex: 1, height: 42 }} />
                  <Btn danger title="ارفض" onPress={() => decide(p.id, false, true)} style={{ height: 42 }} />
                </View>
              </View>
            ))}
          </Card>
        ))}
        {rows && !rows.length && <T style={{ color: C.mid }}>مفيش موظفين تحت إدارتك لسه.</T>}
        <T style={{ color: C.mid, fontSize: 12.5 }}>الورديات وتقييم الأداء من السيستم (الورديات والأذون · تقييم الأداء).</T>
      </ScrollView>
    </View>
  );
}
