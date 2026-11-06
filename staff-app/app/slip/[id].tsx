import { useCallback, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { useFocusEffect, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { errMsg, sb } from "@/lib/supabase";
import { Badge, Btn, Card, Err, Head, Input, Ok, T } from "@/lib/ui";
import { C, money } from "@/lib/theme";

type Line = { id: number; kind: "earn" | "deduct"; label: string; amount: number; reason: string | null };
type Disp = { id: number; line_id: number | null; text: string; status: string; reply: string | null; amount: number | null; at: string };
type Slip = { id: number; name: string; gross: number; deductions: number; net: number; received_at: string | null; summary: Record<string, number | string>; lines: Line[]; disputes: Disp[] };
const DS: Record<string, ["ok" | "wait" | "bad", string]> = { open: ["wait", "مستني رد"], accepted: ["ok", "اتقبل"], rejected: ["bad", "اترفض"] };

/** كشف شهر: كل بند وسببه، اعتراض على أي بند، واستلمت مرتبي */
export default function SlipScreen() {
  const ins = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [s, setS] = useState<Slip | null>(null);
  const [open, setOpen] = useState<number | "all" | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const load = useCallback(async () => {
    const { data, error } = await sb.rpc("my_payslip", { p_id: Number(id) });
    if (error) setErr(errMsg(error)); else setS(data as Slip);
  }, [id]);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  const dispute = async () => {
    if (!text.trim()) return setErr("اكتب اعتراضك");
    setBusy(true); setErr(null);
    const { error } = await sb.rpc("payslip_dispute", { p_id: Number(id), p_line: open === "all" ? null : open, p_text: text });
    setBusy(false);
    if (error) return setErr(errMsg(error));
    setOk("اتبعت اعتراضك — الرد هيوصلك إشعار"); setText(""); setOpen(null); load();
  };
  const received = async () => { await sb.rpc("payslip_received", { p_id: Number(id) }); load(); };
  if (!s) return <View style={{ flex: 1 }}><Head title="كشف المرتب" /><View style={{ padding: 18 }}><Err t={err} /></View></View>;
  const sm = s.summary;
  const row = (l: Line) => {
    const ds = s.disputes.filter((d) => d.line_id === l.id);
    return (
      <View key={l.id} style={{ borderTopWidth: 1, borderColor: C.border, paddingTop: 10, gap: 4 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
          <T b style={{ flex: 1 }}>{l.label}</T>
          <T b style={{ color: l.kind === "earn" ? C.green : C.red }}>{l.kind === "earn" ? "+" : "−"} {money(l.amount)}</T>
        </View>
        {l.reason ? <T style={{ color: C.mid, fontSize: 13 }}>{l.reason}</T> : null}
        {ds.map((d) => <View key={d.id} style={{ backgroundColor: C.off, borderRadius: 10, padding: 8, gap: 2 }}><Badge kind={DS[d.status][0]} t={DS[d.status][1]} /><T style={{ fontSize: 13 }}>«{d.text}»</T>{d.reply && <T b style={{ fontSize: 13 }}>الرد: {d.reply}{d.amount ? ` · هيتصرفلك ${money(d.amount)}` : ""}</T>}</View>)}
        {open === l.id ? null : <T style={{ color: C.mid, fontSize: 13, textDecorationLine: "underline" }} onPress={() => { setOpen(l.id); setOk(null); }}>عندي اعتراض على البند ده</T>}
        {open === l.id && form()}
      </View>
    );
  };
  const form = () => (
    <View style={{ gap: 8, marginTop: 4 }}>
      <Input value={text} onChangeText={setText} placeholder="اكتب اعتراضك وسببه" multiline style={{ minHeight: 80, textAlignVertical: "top", paddingTop: 12 }} />
      <View style={{ flexDirection: "row", gap: 8 }}><Btn y title="ابعت الاعتراض" onPress={dispute} busy={busy} style={{ flex: 1 }} /><Btn outline title="إلغاء" onPress={() => setOpen(null)} /></View>
    </View>
  );
  return (
    <View style={{ flex: 1 }}>
      <Head title={`مرتب ${s.name}`} />
      <ScrollView contentContainerStyle={{ padding: 18, gap: 14, paddingBottom: 40 + ins.bottom }} keyboardShouldPersistTaps="handled">
        <Card style={{ backgroundColor: C.black, borderColor: C.black }}>
          <T style={{ color: "#999" }}>الصافي</T>
          <T b style={{ color: C.y, fontSize: 32 }}>{money(s.net)}</T>
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <T style={{ color: "#7CE3A0" }}>الإضافات {money(s.gross)}</T><T style={{ color: "#FF8A8A" }}>الخصومات {money(s.deductions)}</T>
          </View>
        </Card>
        <Card>
          <T b>الحضور في الشهر</T>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {[["أيام الشغل", sm.work_days], ["حضرت", sm.present], ["غياب", sm.absent], ["إجازات", Number(sm.paid_leave) + Number(sm.sick) + Number(sm.unpaid)], ["تأخير", sm.late ? `${sm.late} مرة` : "0"], ["إضافي", sm.ot_min ? `${Math.floor(Number(sm.ot_min) / 60)} س` : "0"]].map(([k, v]) => (
              <View key={String(k)} style={{ width: "31%", backgroundColor: C.off, borderRadius: 12, padding: 8 }}><T style={{ color: C.mid, fontSize: 12 }}>{k}</T><T b>{String(v)}</T></View>
            ))}
          </View>
        </Card>
        <Card>
          <T b style={{ color: C.green }}>الإضافات</T>
          {s.lines.filter((l) => l.kind === "earn").map(row)}
        </Card>
        <Card>
          <T b style={{ color: C.red }}>الخصومات</T>
          {s.lines.filter((l) => l.kind === "deduct").map(row)}
          {!s.lines.some((l) => l.kind === "deduct") && <T style={{ color: C.mid }}>مفيش خصومات 👏</T>}
        </Card>
        {s.disputes.filter((d) => d.line_id == null).map((d) => <Card key={d.id}><Badge kind={DS[d.status][0]} t={DS[d.status][1]} /><T>«{d.text}»</T>{d.reply && <T b>الرد: {d.reply}</T>}</Card>)}
        {open === "all" ? <Card><T b>اعتراض على المرتب</T>{form()}</Card> : <Pressable onPress={() => { setOpen("all"); setOk(null); }}><T style={{ color: C.mid, textAlign: "center", textDecorationLine: "underline" }}>اعتراض عام على المرتب</T></Pressable>}
        <Err t={err} /><Ok t={ok} />
        {s.received_at ? <Badge kind="ok" t="✓ أكّدت إنك استلمت المرتب" /> : <Btn title="استلمت مرتبي" onPress={received} />}
      </ScrollView>
    </View>
  );
}
