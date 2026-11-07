import { useCallback, useState } from "react";
import { Linking, RefreshControl, ScrollView, View } from "react-native";
import { useFocusEffect } from "expo-router";
import { MyDocs } from "@/lib/extra";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { errMsg, sb } from "@/lib/supabase";
import { Badge, Btn, Card, Chip, Err, Head, Input, Ok, T } from "@/lib/ui";
import { C, day } from "@/lib/theme";

const KINDS: [string, string][] = [["salary_cert", "شهادة مرتب"], ["employment_cert", "شهادة إني شغال هنا"], ["salary_details", "مفردات مرتب"], ["insurance", "برنت تأمينات"], ["experience", "شهادة خبرة"], ["other", "ورقة تانية"]];
const ST: Record<string, ["ok" | "wait" | "bad" | "y", string]> = { pending: ["wait", "بتتجهّز"], ready: ["y", "جاهزة"], delivered: ["ok", "استلمتها"], rejected: ["bad", "اترفضت"] };
type Doc = { id: number; no: number; kind: string; to: string | null; purpose: string | null; note: string | null; status: string; reply: string | null; file: string | null; at: string };

/** أوراقي: أطلب أي شهادة أو ورقة لجهة معيّنة وأتابعها */
export default function Docs() {
  const ins = useSafeAreaInsets();
  const [list, setList] = useState<Doc[]>([]);
  const [kind, setKind] = useState("salary_cert");
  const [to, setTo] = useState("");
  const [purpose, setPurpose] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const load = useCallback(async () => {
    const { data, error } = await sb.rpc("my_docs");
    if (error) setErr(errMsg(error)); else setList((data ?? []) as Doc[]);
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  const send = async () => {
    setErr(null); setOk(null);
    if (kind === "other" && !note.trim()) return setErr("اكتب الورقة اللي محتاجها");
    setBusy(true);
    const { error } = await sb.rpc("doc_request", { p_kind: kind, p_to: to, p_purpose: purpose, p_note: note });
    setBusy(false);
    if (error) return setErr(errMsg(error));
    setOk("اتبعت الطلب — هيوصلك إشعار أول ما الورقة تجهز"); setTo(""); setPurpose(""); setNote(""); load();
  };
  const openFile = async (path: string) => {
    const { data, error } = await sb.storage.from("hr").createSignedUrl(path, 600);
    if (error || !data) return setErr("مش عارف أفتح الملف — جرّب تاني");
    Linking.openURL(data.signedUrl);
  };
  return (
    <View style={{ flex: 1 }}>
      <Head title="أوراقي" sub="شهادات وأوراق من الشركة" />
      <ScrollView contentContainerStyle={{ padding: 18, gap: 14, paddingBottom: 40 + ins.bottom }} keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}>
        <MyDocs />
        <Card>
          <T b>اطلب ورقة</T>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>{KINDS.map(([k, l]) => <Chip key={k} label={l} on={kind === k} onPress={() => setKind(k)} />)}</View>
          <Input value={to} onChangeText={setTo} placeholder="موجّهة لمين؟ (مثلاً: بنك مصر، السفارة…)" />
          <Input value={purpose} onChangeText={setPurpose} placeholder="الغرض (مثلاً: قرض، فيزا…)" />
          <Input value={note} onChangeText={setNote} placeholder={kind === "other" ? "اكتب الورقة اللي محتاجها" : "ملاحظة (اختياري)"} />
          <Btn y title="ابعت الطلب" onPress={send} busy={busy} />
          <Err t={err} /><Ok t={ok} />
        </Card>
        <T b>طلباتي</T>
        {list.map((d) => (
          <Card key={d.id} style={{ gap: 4 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <T b>{KINDS.find((k) => k[0] === d.kind)?.[1]}{d.to ? ` — ${d.to}` : ""}</T>
              <Badge kind={ST[d.status][0]} t={ST[d.status][1]} />
            </View>
            <T style={{ color: C.mid, fontSize: 13 }}>رقم {d.no} · {day(d.at)}{d.purpose ? ` · ${d.purpose}` : ""}</T>
            {d.note && <T style={{ color: C.mid, fontSize: 13 }}>{d.note}</T>}
            {d.reply && <T style={{ fontSize: 14 }}>الرد: {d.reply}</T>}
            {d.file && <Btn outline title="📄 افتح النسخة" onPress={() => openFile(d.file!)} />}
          </Card>
        ))}
        {!list.length && <T style={{ color: C.mid }}>لسه مفيش طلبات</T>}
      </ScrollView>
    </View>
  );
}
