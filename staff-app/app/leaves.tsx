import { useCallback, useState } from "react";
import { ScrollView, View } from "react-native";
import { useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { errMsg, sb } from "@/lib/supabase";
import { Badge, Btn, Card, Chip, Err, Head, Input, Ok, T } from "@/lib/ui";
import { C, day } from "@/lib/theme";

const KINDS: [string, string][] = [["annual", "إجازة سنوية"], ["casual", "عارضة"], ["sick", "مرضي"], ["unpaid", "بدون مرتب"], ["advance", "سلفة"], ["early", "إذن انصراف بدري"], ["late", "إذن تأخير"]];
type Pm = { id: number; day: string; kind: string; time: string | null; paid: boolean; status: string; reason: string | null };
const ST: Record<string, ["ok" | "wait" | "bad", string]> = { pending: ["wait", "مستني"], approved: ["ok", "اتوافق"], rejected: ["bad", "اترفض"], cancelled: ["bad", "اتلغى"] };
type Req = { id: number; kind: string; from_date: string | null; to_date: string | null; amount: number | null; installments: number; note: string | null; status: string; at: string; decision_note: string | null };
const today = () => new Date().toISOString().slice(0, 10);

export default function Leaves() {
  const ins = useSafeAreaInsets();
  const [list, setList] = useState<Req[]>([]);
  const [kind, setKind] = useState("annual");
  const [from, setFrom] = useState(today());
  const [to, setTo] = useState(today());
  const [amount, setAmount] = useState("");
  const [inst, setInst] = useState("1");
  const [ptime, setPtime] = useState("");
  const [perms, setPerms] = useState<Pm[]>([]);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const load = useCallback(async () => {
    const { data: u } = await sb.auth.getUser();
    const { data } = await sb.from("leave_requests").select("*").eq("user_id", u.user?.id ?? "").order("id", { ascending: false }).limit(30);
    setList((data ?? []) as Req[]);
    const b = await sb.rpc("my_balances");
    setPerms(((b.data as { permits?: Pm[] } | null)?.permits ?? []) as Pm[]);
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  const adv = kind === "advance";
  const pm = kind === "early" || kind === "late";
  const send = async () => {
    setErr(null); setOk(null);
    if (pm) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(from)) return setErr("التاريخ لازم يبقى كده: 2026-11-20");
      if (ptime && !/^\d{1,2}:\d{2}$/.test(ptime)) return setErr("الساعة لازم تبقى كده: 15:00");
      if (!note.trim()) return setErr("اكتب السبب");
      setBusy(true);
      const { error } = await sb.rpc("permit_request", { p_day: from, p_kind: kind, p_time: ptime || null, p_reason: note });
      setBusy(false);
      if (error) return setErr(errMsg(error));
      setOk("اتبعت للمدير — الرد هيوصلك إشعار"); setNote(""); setPtime(""); load();
      return;
    }
    if (adv && !(Number(amount) > 0)) return setErr("اكتب مبلغ السلفة");
    if (!adv && (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || to < from)) return setErr("التاريخ لازم يبقى كده: 2026-11-20، والنهاية بعد البداية");
    setBusy(true);
    const { data: u } = await sb.auth.getUser();
    const { error } = await sb.from("leave_requests").insert({ user_id: u.user?.id, kind, from_date: adv ? null : from, to_date: adv ? null : to, amount: adv ? Number(amount) : null, installments: adv ? Math.max(1, Math.round(Number(inst) || 1)) : 1, note: note.trim() || null });
    setBusy(false);
    if (error) return setErr(errMsg(error));
    setOk("اتبعت الطلب — هيوصلك الرد هنا"); setNote(""); setAmount(""); load();
  };
  const cancel = async (id: number) => { await sb.from("leave_requests").update({ status: "cancelled" }).eq("id", id); load(); };
  return (
    <View style={{ flex: 1 }}>
      <Head title="إجازة أو سلفة أو إذن" />
      <ScrollView contentContainerStyle={{ padding: 18, gap: 14, paddingBottom: 40 + ins.bottom }} keyboardShouldPersistTaps="handled">
        <Card>
          <T b>طلب جديد</T>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>{KINDS.map(([k, l]) => <Chip key={k} label={l} on={kind === k} onPress={() => setKind(k)} />)}</View>
          {adv ? (
            <View style={{ flexDirection: "row", gap: 8 }}>
              <View style={{ flex: 2 }}><T style={{ color: C.mid, fontSize: 12 }}>المبلغ</T><Input value={amount} onChangeText={setAmount} placeholder="جنيه" keyboardType="numeric" style={{ textAlign: "left" }} /></View>
              <View style={{ flex: 1 }}><T style={{ color: C.mid, fontSize: 12 }}>على كام قسط</T><Input value={inst} onChangeText={setInst} keyboardType="numeric" style={{ textAlign: "left" }} /></View>
            </View>
          ) : pm ? (
            <View style={{ flexDirection: "row", gap: 8 }}>
              <View style={{ flex: 1 }}><T style={{ color: C.mid, fontSize: 12 }}>اليوم</T><Input value={from} onChangeText={setFrom} placeholder="2026-11-20" style={{ textAlign: "left" }} /></View>
              <View style={{ flex: 1 }}><T style={{ color: C.mid, fontSize: 12 }}>{kind === "early" ? "هتمشي الساعة" : "هتوصل الساعة"}</T><Input value={ptime} onChangeText={setPtime} placeholder="15:00" style={{ textAlign: "left" }} /></View>
            </View>
          ) : (
            <View style={{ flexDirection: "row", gap: 8 }}>
              <View style={{ flex: 1 }}><T style={{ color: C.mid, fontSize: 12 }}>من</T><Input value={from} onChangeText={setFrom} placeholder="2026-11-20" style={{ textAlign: "left" }} /></View>
              <View style={{ flex: 1 }}><T style={{ color: C.mid, fontSize: 12 }}>لحد</T><Input value={to} onChangeText={setTo} placeholder="2026-11-21" style={{ textAlign: "left" }} /></View>
            </View>
          )}
          <Input value={note} onChangeText={setNote} placeholder="السبب (اختياري)" />
          <Btn y title="ابعت الطلب" onPress={send} busy={busy} />
          <Err t={err} /><Ok t={ok} />
        </Card>
        {!!perms.length && <T b>الأذون</T>}
        {perms.map((p) => (
          <Card key={`p${p.id}`}>
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <T b>{p.kind === "early" ? "انصراف بدري" : "تأخير"} · {day(p.day)}{p.time ? ` · ${p.time.slice(0, 5)}` : ""}</T>
              <Badge kind={p.status === "approved" ? "ok" : p.status === "pending" ? "wait" : "bad"} t={p.status === "approved" ? (p.paid ? "اتوافق من غير خصم" : "اتوافق بخصم") : p.status === "pending" ? "مستني" : "اترفض"} />
            </View>
            {p.reason && <T style={{ color: C.mid }}>{p.reason}</T>}
          </Card>
        ))}
        <T b>طلباتي</T>
        {list.map((r) => (
          <Card key={r.id}>
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <T b>{KINDS.find((k) => k[0] === r.kind)?.[1]}{r.amount ? ` · ${r.amount} ج` : ""}{r.kind === "advance" && r.installments > 1 ? ` على ${r.installments} قسط` : ""}</T>
              <Badge kind={ST[r.status][0]} t={ST[r.status][1]} />
            </View>
            {r.from_date && <T style={{ color: C.mid }}>{day(r.from_date)} ← {day(r.to_date)}</T>}
            {r.note && <T style={{ color: C.mid }}>{r.note}</T>}
            {r.decision_note && <T style={{ color: C.black }}>الرد: {r.decision_note}</T>}
            {r.status === "pending" && <T b style={{ color: C.red }} onPress={() => cancel(r.id)}>إلغاء الطلب</T>}
          </Card>
        ))}
        {!list.length && <T style={{ color: C.mid }}>لسه مفيش طلبات</T>}
      </ScrollView>
    </View>
  );
}
