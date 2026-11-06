import { useState } from "react";
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
        <Err t={err} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
