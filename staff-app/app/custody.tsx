import { useCallback, useState } from "react";
import { Image, RefreshControl, ScrollView, View } from "react-native";
import { useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as ImagePicker from "expo-image-picker";
import { errMsg, sb } from "@/lib/supabase";
import { useHome } from "@/lib/home";
import { Badge, Btn, Card, Chip, Err, Head, Input, Ok, T } from "@/lib/ui";
import { C, day, money } from "@/lib/theme";

type Move = { id: number; no: number; kind: string; amount: number; received: number | null; status: string; cat: string | null; loc: string | null; note: string | null; reply: string | null; at: string; payroll_month: string | null };
type Data = { balance: number; limit: number; moves: Move[] };
const K: Record<string, string> = { give: "استلمت عهدة", spend: "صرفت", return: "سلّمت الباقي", shortage: "عجز" };
const ST: Record<string, ["ok" | "wait" | "bad", string]> = { ok: ["ok", "تمام"], pending: ["wait", "مستني"], rejected: ["bad", "مرفوض"] };
// أنواع المصروفات اللي مينفعش تتصرف من العهدة
const NOT = /مرتبات|إيجار|إهلاك/;

/** عهدتي: معاك كام، صرفت بصورة الفاتورة، سلّمت الباقي */
export default function Custody() {
  const ins = useSafeAreaInsets();
  const { h } = useHome();
  const [d, setD] = useState<Data | null>(null);
  const [cats, setCats] = useState<{ id: number; name: string }[]>([]);
  const [locs, setLocs] = useState<{ id: string; name: string }[]>([]);
  const [mode, setMode] = useState<"spend" | "return" | null>(null);
  const [amount, setAmount] = useState("");
  const [cat, setCat] = useState<number | null>(null);
  const [loc, setLoc] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [photo, setPhoto] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const load = useCallback(async () => {
    const [a, b, c] = await Promise.all([
      sb.rpc("my_custody"),
      sb.from("expense_categories").select("id,name").eq("active", true).order("id"),
      sb.from("locations").select("id,name").eq("active", true).order("sort"),
    ]);
    if (a.error) setErr(errMsg(a.error)); else setD(a.data as Data);
    setCats(((b.data ?? []) as { id: number; name: string }[]).filter((x) => !NOT.test(x.name)));
    setLocs((c.data ?? []) as { id: string; name: string }[]);
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  const reset = () => { setAmount(""); setCat(null); setNote(""); setPhoto(null); setLoc(null); };
  const snap = async () => {
    const p = await ImagePicker.requestCameraPermissionsAsync();
    if (!p.granted) return setErr("محتاجين الكاميرا عشان تصوّر الفاتورة");
    const r = await ImagePicker.launchCameraAsync({ quality: 0.45, allowsEditing: false });
    if (!r.canceled) setPhoto(r.assets[0].uri);
  };
  const submit = async () => {
    setErr(null); setOk(null);
    const a = Number(amount.replace(",", "."));
    if (!(a > 0)) return setErr("اكتب المبلغ");
    setBusy(true);
    try {
      if (mode === "spend") {
        if (!cat) throw new Error("اختار نوع المصروف");
        if (!photo) throw new Error("صوّر الفاتورة أو الإيصال");
        const { data: u } = await sb.auth.getUser();
        const path = `${u.user?.id}/custody/${Date.now()}.jpg`;
        const bytes = await (await fetch(photo)).arrayBuffer();
        const { error: ue } = await sb.storage.from("hr").upload(path, bytes, { contentType: "image/jpeg" });
        if (ue) throw ue;
        const { data, error } = await sb.rpc("custody_spend", { p_amount: a, p_cat: cat, p_loc: loc ?? h?.home ?? null, p_note: note, p_photo: path });
        if (error) throw error;
        const r = data as { status: string };
        setOk(r.status === "ok" ? "اتسجّل واتخصم من عهدتك" : `اتسجّل — فوق ${money(d?.limit)} فمستني موافقة المدير`);
      } else {
        const { error } = await sb.rpc("custody_return", { p_amount: a, p_note: note });
        if (error) throw error;
        setOk("اتسجّل — مستني اللي استلم منك يأكّد المبلغ");
      }
      reset(); setMode(null); load();
    } catch (e) { setErr(errMsg(e)); }
    setBusy(false);
  };
  return (
    <View style={{ flex: 1 }}>
      <Head title="عهدتي" />
      <ScrollView contentContainerStyle={{ padding: 18, gap: 14, paddingBottom: 40 + ins.bottom }} keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}>
        <Card style={{ backgroundColor: C.black, borderColor: C.black, alignItems: "center" }}>
          <T style={{ color: "#999" }}>معاك دلوقتي</T>
          <T b style={{ color: Number(d?.balance) < 0 ? "#FF8A8A" : C.y, fontSize: 34 }}>{money(d?.balance)}</T>
          {Number(d?.balance) < 0 && <T style={{ color: "#ccc", fontSize: 12.5, textAlign: "center" }}>صرفت أكتر من العهدة — الفرق ليك على الشركة</T>}
        </Card>
        {!mode && (
          <View style={{ flexDirection: "row", gap: 10 }}>
            <Btn y title="صرفت من العهدة" onPress={() => { setMode("spend"); setOk(null); }} style={{ flex: 1 }} />
            <Btn outline title="سلّمت الباقي" onPress={() => { setMode("return"); setOk(null); setAmount(String(Math.max(0, Number(d?.balance ?? 0)))); }} style={{ flex: 1 }} />
          </View>
        )}
        {mode && (
          <Card>
            <T b>{mode === "spend" ? "صرفت من العهدة" : "سلّمت باقي العهدة"}</T>
            <Input value={amount} onChangeText={setAmount} placeholder="المبلغ (جنيه)" keyboardType="numeric" style={{ textAlign: "left" }} />
            {mode === "spend" && <>
              <T style={{ color: C.mid, fontSize: 13 }}>صرفت في إيه؟</T>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>{cats.map((c) => <Chip key={c.id} label={c.name} on={cat === c.id} onPress={() => setCat(c.id)} />)}</View>
              <T style={{ color: C.mid, fontSize: 13 }}>على أنهي مكان؟</T>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>{locs.map((l) => <Chip key={l.id} label={l.name} on={(loc ?? h?.home) === l.id} onPress={() => setLoc(l.id)} />)}</View>
              {photo ? <Image source={{ uri: photo }} style={{ width: "100%", height: 220, borderRadius: 12 }} resizeMode="cover" /> : null}
              <Btn outline title={photo ? "صوّر تاني" : "📷 صوّر الفاتورة / الإيصال"} onPress={snap} />
            </>}
            <Input value={note} onChangeText={setNote} placeholder={mode === "spend" ? "التفاصيل (مثلاً: بنزين العربية 3)" : "سلّمت لمين؟"} />
            <View style={{ flexDirection: "row", gap: 8 }}><Btn y title="سجّل" onPress={submit} busy={busy} style={{ flex: 1 }} /><Btn outline title="إلغاء" onPress={() => { setMode(null); reset(); }} /></View>
            {mode === "spend" && <T style={{ color: C.mid, fontSize: 12.5 }}>لحد {money(d?.limit)} بيتخصم على طول، وأكتر من كده بيستنى موافقة.</T>}
          </Card>
        )}
        <Err t={err} /><Ok t={ok} />
        <T b>الحركات</T>
        {d?.moves.map((m) => (
          <Card key={m.id} style={{ gap: 4 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <T b>{K[m.kind]} · {money(m.received ?? m.amount)}</T>
              {m.status !== "ok" ? <Badge kind={ST[m.status][0]} t={ST[m.status][1]} /> : null}
            </View>
            <T style={{ color: C.mid, fontSize: 13 }}>{[day(m.at), m.cat, m.loc, m.note].filter(Boolean).join(" · ")}</T>
            {m.kind === "return" && m.received != null && Number(m.received) !== Number(m.amount) && <T style={{ color: C.red, fontSize: 13 }}>قلت {money(m.amount)} واتستلم {money(m.received)}</T>}
            {m.reply && <T style={{ fontSize: 13 }}>الرد: {m.reply}</T>}
            {m.payroll_month && <T style={{ color: C.mid, fontSize: 12 }}>اتخصم في مرتب {m.payroll_month.slice(0, 7)}</T>}
          </Card>
        ))}
        {d && !d.moves.length && <T style={{ color: C.mid }}>مفيش عهدة متسجّلة عليك</T>}
      </ScrollView>
    </View>
  );
}
