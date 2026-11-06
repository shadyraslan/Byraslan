import { useEffect, useState } from "react";
import Constants from "expo-constants";
import * as Application from "expo-application";
import { KeyboardAvoidingView, Platform, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { errMsg, sb, staffEmail } from "@/lib/supabase";
import { Btn, Err, Input, T } from "@/lib/ui";
import { C } from "@/lib/theme";

export default function Login() {
  const ins = useSafeAreaInsets();
  const [phone, setPhone] = useState("");
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // وضع التجربة: "تخطّي" بيدخلك كـ"موظف تجربة" من غير موبايل ولا رقم سري
  const [test, setTest] = useState(false);
  useEffect(() => { sb.rpc("app_config").then(({ data }) => setTest(!!(data as { test_mode?: boolean } | null)?.test_mode)); }, []);
  const skip = async () => {
    setErr(null); setBusy(true);
    try {
      const url = (Constants.expoConfig?.extra as { erpUrl?: string } | undefined)?.erpUrl ?? "https://byraslan.vercel.app";
      let device = "dev";
      try { device = Platform.OS === "android" ? (Application.getAndroidId() ?? "dev") : ((await Application.getIosIdForVendorAsync()) ?? "dev"); } catch {}
      const r = await fetch(`${url}/api/staff-test-login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ device }) });
      const j = (await r.json()) as { email?: string; password?: string; error?: string };
      if (!r.ok || !j.email || !j.password) throw new Error(j.error ?? "ماقدرش يدخل");
      const { error } = await sb.auth.signInWithPassword({ email: j.email, password: j.password });
      if (error) throw error;
    } catch (e) { setErr(errMsg(e)); } finally { setBusy(false); }
  };
  const go = async () => {
    setErr(null); setBusy(true);
    const { error } = await sb.auth.signInWithPassword({ email: staffEmail(phone), password: pin });
    setBusy(false);
    if (error) setErr(errMsg(error));
  };
  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1, backgroundColor: C.black }}>
      <ScrollView contentContainerStyle={{ paddingTop: ins.top + 50, paddingHorizontal: 24, gap: 14 }} keyboardShouldPersistTaps="handled">
        <View style={{ width: 76, height: 76, borderRadius: 22, backgroundColor: C.y, alignItems: "center", justifyContent: "center" }}><T b style={{ fontSize: 34, textAlign: "center" }}>ر</T></View>
        <T b style={{ color: C.white, fontSize: 26 }}>باي رسلان — الموظفين</T>
        <T style={{ color: "#999" }}>ادخل بموبايلك والرقم السري اللي المدير عملهولك</T>
        <Input value={phone} onChangeText={setPhone} placeholder="رقم الموبايل" keyboardType="phone-pad" style={{ textAlign: "left", backgroundColor: "#1C1C1C", borderColor: "#2A2A2A", color: C.white }} />
        <Input value={pin} onChangeText={setPin} placeholder="الرقم السري" secureTextEntry keyboardType="number-pad" style={{ textAlign: "left", backgroundColor: "#1C1C1C", borderColor: "#2A2A2A", color: C.white }} />
        <Btn y title="دخول" onPress={go} busy={busy} disabled={phone.replace(/\D/g, "").length < 8 || pin.length < 4} />
        {test && <Btn outline title="تخطّي — دخول تجربة" onPress={skip} busy={busy} />}
        <Err t={err} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
