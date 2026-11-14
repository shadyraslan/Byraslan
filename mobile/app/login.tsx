import { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  View,
  Image,
  StyleSheet,
  Pressable,
} from "react-native";
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
    setErr(null);
    setBusy(true);
    const { error } = await sb.auth.verifyOtp({
      phone: toE164(phone),
      token: code.trim(),
      type: "sms",
    });
    setBusy(false);
    if (error) return setErr(errMsg(error));
    await refreshMe();
    router.back();
  };

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
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={s.flex}
    >
      <ScrollView
        contentContainerStyle={s.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={s.header}>
          <View style={s.logoWrap}>
            <Image
              source={require("../assets/icon.png")}
              style={s.logo}
              resizeMode="contain"
            />
          </View>
          <T w="x" style={s.brand}>باي رسلان</T>
          <T style={s.tagline}>أسرع توصيل في المنطقة</T>
        </View>

        {/* Card */}
        <View style={s.card}>
          {!sent ? (
            <>
              <View style={s.cardHeader}>
                <T w="b" style={s.cardTitle}>تسجيل الدخول</T>
                <T style={s.cardSub}>هنبعتلك كود تحقق على موبايلك</T>
              </View>

              <View style={s.inputWrap}>
                <T w="m" style={s.label}>رقم الموبايل</T>
                <Input
                  value={phone}
                  onChangeText={setPhone}
                  placeholder="01xxxxxxxxx"
                  keyboardType="phone-pad"
                  textContentType="telephoneNumber"
                  autoFocus
                  style={s.phoneInput}
                />
              </View>

              <Btn title="ابعت الكود" onPress={send} busy={busy} />

              {config?.test_mode && process.env.EXPO_PUBLIC_ALLOW_TEST_LOGIN === "1" && (
                <Btn
                  kind="sec"
                  title="دخول تجريبي بدون كود"
                  onPress={skip}
                  busy={busy}
                />
              )}
            </>
          ) : (
            <>
              <View style={s.cardHeader}>
                <T w="b" style={s.cardTitle}>اكتب الكود</T>
                <T style={s.cardSub}>
                  بعتنالك كود SMS على{"\n"}
                  <T w="b" style={{ color: C.ink }}>{phone}</T>
                </T>
              </View>

              <Input
                value={code}
                onChangeText={(t) => setCode(t.replace(/\D/g, "").slice(0, 6))}
                placeholder="• • • • • •"
                keyboardType="number-pad"
                textContentType="oneTimeCode"
                autoComplete="sms-otp"
                autoFocus
                style={s.otpInput}
              />

              <Btn
                title="تأكيد الدخول"
                onPress={verify}
                busy={busy}
                disabled={code.length < 6}
              />

              <Pressable onPress={() => { setSent(false); setCode(""); }} style={s.changePhone}>
                <T style={s.changePhoneText}>غيّر الرقم أو ابعت تاني</T>
              </Pressable>
            </>
          )}

          <Err t={err} />
        </View>

        {/* Footer */}
        <T style={s.footer}>
          بالدخول أنت موافق على الشروط وسياسة الخصوصية
        </T>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  flex: { flex: 1, backgroundColor: C.bg },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 60,
    paddingBottom: 40,
    gap: 24,
  },

  // Header
  header: { alignItems: "center", gap: 10 },
  logoWrap: {
    width: 80,
    height: 80,
    borderRadius: 24,
    backgroundColor: C.y,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: C.yDark,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 8,
  },
  logo: { width: 52, height: 52 },
  brand: { fontSize: 28, color: C.ink, letterSpacing: 0.5 },
  tagline: { fontSize: 14, color: C.muted },

  // Card
  card: {
    backgroundColor: C.panel,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: C.line,
    padding: 24,
    gap: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 3,
  },
  cardHeader: { gap: 4 },
  cardTitle: { fontSize: 20, color: C.ink, textAlign: "right" },
  cardSub: { fontSize: 14, color: C.muted, textAlign: "right", lineHeight: 22 },

  // Input
  inputWrap: { gap: 8 },
  label: { fontSize: 14, color: C.muted, textAlign: "right" },
  phoneInput: {
    textAlign: "left",
    fontSize: 20,
    letterSpacing: 1.5,
    height: 56,
    paddingHorizontal: 18,
  },

  // OTP
  otpInput: {
    textAlign: "center",
    fontSize: 28,
    letterSpacing: 12,
    height: 64,
    backgroundColor: C.bg,
    borderColor: C.y,
    borderWidth: 2,
  },

  // Change phone
  changePhone: {
    alignItems: "center",
    paddingVertical: 4,
  },
  changePhoneText: {
    fontSize: 14,
    color: C.muted,
    textDecorationLine: "underline",
  },

  // Footer
  footer: {
    textAlign: "center",
    fontSize: 12,
    color: C.muted,
    lineHeight: 20,
  },
});
