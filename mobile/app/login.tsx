import { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView } from "react-native";
import { router } from "expo-router";
import { errMsg, sb, toE164 } from "@/lib/supabase";
import { useApp } from "@/lib/store";
import { Btn, Err, Input, T } from "@/lib/ui";
import { C } from "@/lib/theme";

export default function Login() {
  const { refreshMe, config } = useApp();
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const send = async () => {
    setErr(null);
    const d = phone.replace(/\D/g, "");
    if (!/^0?1[0125]\d{8}$/.test(d)) return setErr("اكتب رقم موبايل مصري صحيح");
    setBusy(true);
    const { error } = await sb.auth.signInWithOtp({ phone: toE164(d) });
    setBusy(false);
    if (error) return setErr(errMsg(error));
    setSent(true);
  };
  const verify = async () => {
    setErr(null); setBusy(true);
    const { error } = await sb.auth.verifyOtp({ phone: toE164(phone), token: code.trim(), type: "sms" });
    setBusy(false);
    if (error) return setErr(errMsg(error));
    await refreshMe();
    router.back();
  };

  // وضع التجربة: دخول بأي رقم من غير كود (بيتقفل من إعدادات السيستم قبل النزول للناس)
  const skip = async () => {
    setErr(null);
    const d = phone.replace(/\D/g, "");
    if (!/^0?1[0125]\d{8}$/.test(d)) return setErr("اكتب أي رقم موبايل مصري صحيح الأول");
    setBusy(true);
    const { error } = await sb.auth.signInAnonymously();
    if (error) { setBusy(false); return setErr(errMsg(error)); }
    const { error: e2 } = await sb.rpc("app_test_login", { p_phone: d });
    setBusy(false);
    if (e2) return setErr(errMsg(e2));
    await refreshMe();
    router.back();
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ padding: 20, gap: 14 }} keyboardShouldPersistTaps="handled">
        <T w="x" style={{ fontSize: 22 }}>{sent ? "اكتب الكود" : "رقم موبايلك"}</T>
        <T style={{ color: C.muted }}>{sent ? `بعتنالك كود في رسالة على ${phone}` : "هنبعتلك كود في رسالة SMS"}</T>
        {!sent ? (
          <>
            <Input value={phone} onChangeText={setPhone} placeholder="01xxxxxxxxx" keyboardType="phone-pad" textContentType="telephoneNumber" autoFocus style={{ textAlign: "left", fontSize: 20 }} />
            <Btn title="ابعت الكود" onPress={send} busy={busy} />
            {config?.test_mode && <Btn kind="sec" title="تخطّي دلوقتي (تجربة من غير كود)" onPress={skip} busy={busy} />}
          </>
        ) : (
          <>
            <Input value={code} onChangeText={(t) => setCode(t.replace(/\D/g, "").slice(0, 6))} placeholder="------" keyboardType="number-pad" textContentType="oneTimeCode" autoComplete="sms-otp" autoFocus style={{ textAlign: "center", fontSize: 26, letterSpacing: 8 }} />
            <Btn title="ادخل" onPress={verify} busy={busy} disabled={code.length < 6} />
            <Btn kind="sec" title="غيّر الرقم / ابعت تاني" onPress={() => { setSent(false); setCode(""); }} />
          </>
        )}
        <Err t={err} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
