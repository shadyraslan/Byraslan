import { useCallback, useEffect, useState } from "react";
import { View } from "react-native";
import * as Location from "expo-location";
import * as ImagePicker from "expo-image-picker";
import { errMsg, sb } from "@/lib/supabase";
import { Badge, Btn, Card, Err, Input, Ok, T } from "@/lib/ui";
import { C, day, money } from "@/lib/theme";

/** تأكيد التواجد العشوائي: بيظهر على الرئيسية لما يوصل */
export function Presence() {
  const [p, setP] = useState<{ id: number; due_at: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const load = useCallback(async () => { const { data } = await sb.rpc("my_presence"); setP((data as { id: number; due_at: string } | null) ?? null); }, []);
  useEffect(() => { load(); const i = setInterval(load, 60000); return () => clearInterval(i); }, [load]);
  if (!p && !msg) return null;
  const go = async () => {
    if (!p) return;
    setBusy(true); setMsg(null);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") throw new Error("شغّل إذن الموقع");
      const l = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const { data, error } = await sb.rpc("presence_confirm", { p_id: p.id, p_lat: l.coords.latitude, p_lng: l.coords.longitude, p_acc: l.coords.accuracy });
      if (error) throw error;
      const r = data as { ok: boolean };
      setMsg({ ok: r.ok, t: r.ok ? "اتأكّد إنك موجود ✅" : "اتسجّل — بس مكانك بعيد عن موقع الشغل" });
      setP(null);
    } catch (e) { setMsg({ ok: false, t: errMsg(e) }); }
    setBusy(false);
  };
  const left = p ? Math.max(0, Math.round((new Date(p.due_at).getTime() - Date.now()) / 60000)) : 0;
  return (
    <Card style={{ borderWidth: 2, borderColor: p ? C.y : C.border }}>
      {p && <><T b style={{ fontSize: 17 }}>📍 أكّد إنك موجود</T><T style={{ color: C.mid }}>فاضل حوالي {left} دقيقة</T><Btn y title="أنا موجود" busy={busy} onPress={go} /></>}
      {msg && (msg.ok ? <Ok t={msg.t} /> : <Err t={msg.t} />)}
    </Card>
  );
}

/** العهد العينية: يونيفورم/موبايل/مفاتيح — أكّد الاستلام */
type Asset = { id: number; name: string; serial: string | null; value: number; given_at: string; acked_at: string | null; returned_at: string | null; condition: string | null; note: string | null };
export function Assets() {
  const [L, setL] = useState<Asset[]>([]);
  const load = useCallback(async () => { const { data } = await sb.rpc("my_assets"); setL((data ?? []) as Asset[]); }, []);
  useEffect(() => { load(); }, [load]);
  if (!L.length) return null;
  return (
    <Card>
      <T b>العهد العينية</T>
      {L.map((a) => (
        <View key={a.id} style={{ borderTopWidth: 1, borderColor: C.border, paddingTop: 8, gap: 4, opacity: a.returned_at ? 0.55 : 1 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <T b>{a.name}{a.serial ? ` (${a.serial})` : ""}</T>
            <Badge kind={a.returned_at ? "ok" : a.acked_at ? "y" : "wait"} t={a.returned_at ? `رجعت ${day(a.returned_at)}` : a.acked_at ? "معاك" : "أكّد الاستلام"} />
          </View>
          <T style={{ color: C.mid, fontSize: 13 }}>من {day(a.given_at)} · قيمتها {money(a.value)}{a.note ? ` · ${a.note}` : ""}</T>
          {!a.acked_at && !a.returned_at && <Btn title="استلمتها" onPress={async () => { await sb.rpc("asset_ack", { p_id: a.id }); load(); }} />}
        </View>
      ))}
    </Card>
  );
}

/** مستنداتي: الشهادة الصحية والرخصة وغيرها بتاريخ الانتهاء — وأقدر أرفع صورة الجديدة */
type Doc = { type: string; type_name: string; block: boolean; id: number | null; number: string | null; expires: string | null; state: string; days_left: number | null };
export function MyDocs() {
  const [me, setMe] = useState("");
  useEffect(() => { sb.auth.getUser().then(({ data }) => setMe(data.user?.id ?? "")); }, []);
  const [L, setL] = useState<Doc[]>([]);
  const [up, setUp] = useState<string | null>(null);
  const [exp, setExp] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const load = useCallback(async () => { if (!me) return; const { data } = await sb.rpc("docs_status", { p_user: me }); setL((data ?? []) as Doc[]); }, [me]);
  useEffect(() => { load(); }, [load]);
  if (!L.length) return null;
  const send = async (type: string) => {
    setMsg(null);
    try {
      const r = await ImagePicker.launchCameraAsync({ quality: 0.5 });
      if (r.canceled) return;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(exp)) throw new Error("اكتب تاريخ الانتهاء كده: 2027-05-30");
      const path = `${me}/docs/${type}-${Date.now()}.jpg`;
      const bytes = await (await fetch(r.assets[0].uri)).arrayBuffer();
      const { error: ue } = await sb.storage.from("hr").upload(path, bytes, { contentType: "image/jpeg" });
      if (ue) throw ue;
      const { error } = await sb.rpc("staff_doc_save", { p_user: me, p_type: type, p_number: null, p_expires: exp, p_photo: path, p_note: "رفعها الموظف" });
      if (error) throw error;
      setMsg({ ok: true, t: "اترفعت — شئون العاملين هتراجعها" }); setUp(null); setExp(""); load();
    } catch (e) { setMsg({ ok: false, t: errMsg(e) }); }
  };
  const ST: Record<string, ["ok" | "wait" | "bad", string]> = { ok: ["ok", "سارية"], soon: ["wait", "قرّبت تخلص"], expired: ["bad", "خلصت"], missing: ["bad", "مش موجودة"] };
  return (
    <Card>
      <T b>مستنداتي</T>
      {L.map((d) => (
        <View key={d.type} style={{ borderTopWidth: 1, borderColor: C.border, paddingTop: 8, gap: 6 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <T b>{d.type_name}</T><Badge kind={ST[d.state][0]} t={ST[d.state][1]} />
          </View>
          {d.expires && <T style={{ color: C.mid, fontSize: 13 }}>بتخلص {day(d.expires)}{d.block && d.state !== "ok" ? " — لو خلصت مش هتقدر تسجّل حضور" : ""}</T>}
          {d.state !== "ok" && (up === d.type
            ? <View style={{ gap: 6 }}><Input value={exp} onChangeText={setExp} placeholder="تاريخ انتهاء الجديدة 2027-05-30" keyboardType="numbers-and-punctuation" /><Btn y title="صوّر الجديدة وابعت" onPress={() => send(d.type)} /></View>
            : <Btn title="رفع الجديدة" onPress={() => { setUp(d.type); setMsg(null); }} />)}
        </View>
      ))}
      {msg && (msg.ok ? <Ok t={msg.t} /> : <Err t={msg.t} />)}
    </Card>
  );
}
