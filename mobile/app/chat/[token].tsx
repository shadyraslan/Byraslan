import { useCallback, useEffect, useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { errMsg, sb } from "@/lib/supabase";
import { csAdd, CS_ST } from "@/lib/cs";
import { BlackHead, Err, Input, T } from "@/lib/ui";
import { C } from "@/lib/theme";

type Msg = { id: number; from: "customer" | "staff" | "bot"; body: string | null; photo: boolean; at: string; who: string | null };
type Th = { no: number; status: string; rating: number | null; order: { no: number; token: string } | null; messages: Msg[] };

/** شات التذكرة: الرد بيوصل إشعار، وبعد الحل العميل بيقيّم */
export default function Chat() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const ins = useSafeAreaInsets();
  const [th, setTh] = useState<Th | null>(null);
  const [text, setText] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const sv = useRef<ScrollView>(null);
  const load = useCallback(async () => { const { data } = await sb.rpc("cs_thread", { p_token: token }); if (data) setTh(data as Th); }, [token]);
  useEffect(() => { csAdd(token); load(); const i = setInterval(load, 6000); return () => clearInterval(i); }, [load, token]);
  const send = async () => {
    if (!text.trim()) return;
    setErr(null);
    const { error } = await sb.rpc("cs_send", { p_token: token, p_text: text, p_photo: null });
    if (error) return setErr(errMsg(error));
    setText(""); load();
  };
  const rate = async (n: number) => { await sb.rpc("cs_rate", { p_token: token, p_rating: n, p_note: "" }); load(); };
  const t = (s: string) => new Date(s).toLocaleTimeString("ar-EG", { hour: "numeric", minute: "2-digit" });
  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <BlackHead title={th ? `تذكرة ${th.no}` : "خدمة العملاء"} sub={th ? CS_ST[th.status] : undefined} />
      <ScrollView ref={sv} onContentSizeChange={() => sv.current?.scrollToEnd({ animated: true })} contentContainerStyle={{ padding: 14, gap: 8 }}>
        {th?.order && <Pressable onPress={() => router.push(`/order/${th.order!.token}`)} style={{ backgroundColor: C.ySoft, borderRadius: 12, padding: 10 }}><T w="b">طلب رقم {th.order.no} — تابعه ←</T></Pressable>}
        {th?.messages.map((m) => (
          <View key={m.id} style={{ alignSelf: m.from === "customer" ? "flex-start" : "flex-end", maxWidth: "85%", backgroundColor: m.from === "customer" ? C.ySoft : m.from === "bot" ? C.off : C.white, borderWidth: 1, borderColor: C.border, borderRadius: 14, padding: 10 }}>
            {m.from === "staff" && <T w="b" style={{ color: C.mid, fontSize: 11 }}>{m.who ?? "خدمة العملاء"}</T>}
            {m.body ? <T>{m.body}</T> : null}
            {m.photo && <T style={{ color: C.mid, fontSize: 12 }}>📷 صورة</T>}
            <T style={{ color: C.mid, fontSize: 10.5 }}>{t(m.at)}</T>
          </View>
        ))}
        {th && (th.status === "solved" || th.status === "closed") && !th.rating && (
          <View style={{ backgroundColor: C.white, borderRadius: 14, padding: 14, alignItems: "center", gap: 6 }}>
            <T w="x">قيّم الخدمة</T>
            <View style={{ flexDirection: "row", gap: 8 }}>{[1, 2, 3, 4, 5].map((n) => <Pressable key={n} onPress={() => rate(n)}><Text style={{ fontSize: 30 }}>☆</Text></Pressable>)}</View>
          </View>
        )}
        {th?.rating ? <T style={{ color: C.mid, textAlign: "center" }}>شكراً على تقييمك {"★".repeat(th.rating)}</T> : null}
        <Err t={err} />
      </ScrollView>
      <View style={{ flexDirection: "row", gap: 8, padding: 10, paddingBottom: 10 + ins.bottom, backgroundColor: C.white, borderTopWidth: 1, borderColor: C.border, alignItems: "center" }}>
        <Input value={text} onChangeText={setText} placeholder="اكتب رسالتك…" style={{ flex: 1 }} onSubmitEditing={send} />
        <Pressable onPress={send} style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: C.y, alignItems: "center", justifyContent: "center" }}><Ionicons name="send" size={20} color={C.black} style={{ transform: [{ scaleX: -1 }] }} /></Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}
