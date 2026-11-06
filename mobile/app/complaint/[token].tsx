import { useState } from "react";
import { ScrollView, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { errMsg, sb } from "@/lib/supabase";
import { BlackHead, BottomBar, Btn, Card, Err, Input, Radio, T } from "@/lib/ui";
import { C } from "@/lib/theme";

const REASONS: [string, string][] = [["🛍", "منتج تالف أو مكسور"], ["❌", "منتج غلط وصلني"], ["⚖️", "الوزن أو الكمية غلط"], ["🕐", "تأخير في التوصيل"], ["💰", "مشكلة في الدفع"], ["📝", "سبب آخر"]];

export default function Complaint() {
  const { token, kind } = useLocalSearchParams<{ token: string; kind?: string }>();
  const ins = useSafeAreaInsets();
  const [reason, setReason] = useState(REASONS[0][1]);
  const [details, setDetails] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const send = async () => {
    setErr(null); setBusy(true);
    const { error } = await sb.rpc("app_complaint", { p_token: token, p_reason: (kind === "return" ? "استرجاع/تبديل: " : "") + reason, p_details: details });
    setBusy(false);
    if (error) return setErr(errMsg(error));
    setSent(true);
  };
  if (sent) return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 30, gap: 14, backgroundColor: C.white }}>
      <T style={{ fontSize: 50 }}>✅</T>
      <T w="x" style={{ fontSize: 19, textAlign: "center" }}>وصلتنا رسالتك</T>
      <T style={{ color: C.mid, textAlign: "center" }}>خدمة العملاء هتراجعها وهتكلمك في أقرب وقت.</T>
      <Btn title="رجوع" onPress={() => router.back()} style={{ alignSelf: "stretch" }} />
    </View>
  );
  return (
    <View style={{ flex: 1 }}>
      <BlackHead title={kind === "return" ? "استرجاع / تبديل" : "استرجاع / شكوى"} />
      <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: 120 + ins.bottom, gap: 12 }} keyboardShouldPersistTaps="handled">
        <Card title="سبب الطلب">
          {REASONS.map(([ic, l]) => <Radio key={l} on={reason === l} onPress={() => setReason(l)}><T w="b">{ic}  {l}</T></Radio>)}
        </Card>
        <Card title="تفاصيل إضافية">
          <Input value={details} onChangeText={setDetails} placeholder="اشرح المشكلة بالتفصيل..." multiline style={{ minHeight: 110, textAlignVertical: "top", paddingTop: 12 }} />
          <T style={{ color: C.mid, fontSize: 11.5 }}>📷 إضافة صورة هتبقى متاحة قريب — ممكن تبعتها لخدمة العملاء على واتساب.</T>
        </Card>
        <Err t={err} />
      </ScrollView>
      <BottomBar><Btn title="إرسال الطلب" onPress={send} busy={busy} style={{ flex: 1 }} /></BottomBar>
    </View>
  );
}
