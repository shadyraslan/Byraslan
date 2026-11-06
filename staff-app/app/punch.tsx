import { useEffect, useState } from "react";
import { Image, Platform, ScrollView, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Location from "expo-location";
import * as ImagePicker from "expo-image-picker";
import * as Application from "expo-application";
import * as Device from "expo-device";
import { errMsg, sb } from "@/lib/supabase";
import { useHome } from "@/lib/home";
import { Badge, Btn, Card, Err, Head, Input, T } from "@/lib/ui";
import { C } from "@/lib/theme";

async function deviceId() {
  try { return Platform.OS === "android" ? Application.getAndroidId() : (await Application.getIosIdForVendorAsync()) ?? "ios"; } catch { return "unknown"; }
}

export default function Punch() {
  const ins = useSafeAreaInsets();
  const { kind } = useLocalSearchParams<{ kind: "in" | "out" }>();
  const { h } = useHome();
  const [pos, setPos] = useState<Location.LocationObject | null>(null);
  const [locErr, setLocErr] = useState<string | null>(null);
  const [photo, setPhoto] = useState<string | null>(null);
  const [report, setReport] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<{ status: string; flags: string[]; loc: string | null; distance: number | null } | null>(null);

  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") return setLocErr("لازم تسمح للتطبيق بالموقع عشان تسجّل");
      try { setPos(await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High })); } catch { setLocErr("مش قادر يجيب موقعك — شغّل الـ GPS"); }
    })();
  }, []);

  const selfie = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) return setErr("لازم تسمح بالكاميرا عشان السيلفي");
    const r = await ImagePicker.launchCameraAsync({ cameraType: ImagePicker.CameraType.front, quality: 0.35, allowsEditing: false });
    if (!r.canceled) setPhoto(r.assets[0].uri);
  };

  const send = async () => {
    setErr(null);
    if (!pos) return setErr(locErr ?? "لسه بيجيب موقعك…");
    if (h?.selfie && !photo) return setErr("صوّر سيلفي الأول");
    setBusy(true);
    try {
      let path: string | null = null;
      if (photo) {
        const { data: u } = await sb.auth.getUser();
        path = `${u.user?.id}/${new Date().toISOString().slice(0, 10)}-${Date.now()}.jpg`;
        const bytes = await (await fetch(photo)).arrayBuffer();
        const { error: ue } = await sb.storage.from("hr").upload(path, bytes, { contentType: "image/jpeg" });
        if (ue) throw ue;
      }
      const { data, error } = await sb.rpc("staff_punch", {
        p_kind: kind, p_lat: pos.coords.latitude, p_lng: pos.coords.longitude, p_acc: pos.coords.accuracy ?? null,
        p_selfie: path, p_device: await deviceId(), p_model: `${Device.manufacturer ?? ""} ${Device.modelName ?? ""}`.trim(), p_report: report,
      });
      if (error) throw error;
      setDone(data as { status: string; flags: string[]; loc: string | null; distance: number | null });
    } catch (e) { setErr(errMsg(e)); } finally { setBusy(false); }
  };

  const title = kind === "out" ? "تسجيل انصراف" : "تسجيل حضور";
  if (done) return (
    <View style={{ flex: 1 }}>
      <Head title={title} back={false} />
      <View style={{ padding: 22, gap: 14 }}>
        <Card style={{ alignItems: "center", paddingVertical: 28 }}>
          <T style={{ fontSize: 60, textAlign: "center" }}>{done.status === "ok" ? "✅" : "⏳"}</T>
          <T b style={{ fontSize: 20, textAlign: "center" }}>{done.status === "ok" ? (kind === "out" ? "اتسجّل انصرافك" : "اتسجّل حضورك") : "اتسجّل — مستني موافقة المدير"}</T>
          {done.loc && <T style={{ color: C.mid, textAlign: "center" }}>{done.loc}{done.distance != null ? ` · ${done.distance} متر` : ""}</T>}
          {done.flags.map((f) => <Badge key={f} kind="wait" t={f} />)}
        </Card>
        <Btn title="تمام" onPress={() => router.replace("/")} />
      </View>
    </View>
  );
  return (
    <View style={{ flex: 1 }}>
      <Head title={title} />
      <ScrollView contentContainerStyle={{ padding: 18, gap: 14, paddingBottom: 120 + ins.bottom }} keyboardShouldPersistTaps="handled">
        <Card>
          <T b>📍 الموقع</T>
          {pos ? <T style={{ color: C.green }}>اتحدد موقعك (دقة {Math.round(pos.coords.accuracy ?? 0)} متر)</T> : <T style={{ color: locErr ? C.red : C.mid }}>{locErr ?? "بيجيب موقعك…"}</T>}
        </Card>
        {h?.selfie !== false && (
          <Card>
            <T b>🤳 سيلفي</T>
            {photo ? <Image source={{ uri: photo }} style={{ width: "100%", height: 260, borderRadius: 14 }} /> : null}
            <Btn outline title={photo ? "صوّر تاني" : "صوّر سيلفي"} onPress={selfie} />
          </Card>
        )}
        {kind === "out" && (
          <Card>
            <T b>📝 تقرير اليوم (اختياري)</T>
            <Input value={report} onChangeText={setReport} placeholder="عملت إيه النهارده؟" multiline style={{ minHeight: 90, textAlignVertical: "top", paddingTop: 12 }} />
          </Card>
        )}
        <Err t={err} />
      </ScrollView>
      <View style={{ position: "absolute", left: 18, right: 18, bottom: 18 + ins.bottom }}>
        <Btn y title={title} onPress={send} busy={busy} disabled={!pos} />
      </View>
    </View>
  );
}
