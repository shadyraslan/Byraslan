import { useState } from "react";
import { Image, Pressable, ScrollView, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as ImagePicker from "expo-image-picker";
import { useApp } from "@/lib/store";
import { errMsg, sb } from "@/lib/supabase";
import { csAdd, TOPICS } from "@/lib/cs";
import { BlackHead, BottomBar, Btn, Card, Chip, Err, Input, T } from "@/lib/ui";
import { C } from "@/lib/theme";

/** تذكرة جديدة: الموضوع، الطلب (لو فيه)، الرسالة، وصورة */
export default function NewTicket() {
  const ins = useSafeAreaInsets();
  const { topic: t0, order: o0 } = useLocalSearchParams<{ topic?: string; order?: string }>();
  const { profile, tokens } = useApp();
  const [topic, setTopic] = useState(t0 ?? "agent");
  const [order, setOrder] = useState<string | null>(o0 ?? null);
  const [name, setName] = useState(profile.name);
  const [phone, setPhone] = useState(profile.phone);
  const [text, setText] = useState("");
  const [photo, setPhoto] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const pick = async () => {
    const r = await ImagePicker.launchImageLibraryAsync({ quality: 0.5, mediaTypes: ["images"] });
    if (!r.canceled) setPhoto(r.assets[0].uri);
  };
  const send = async () => {
    setErr(null);
    if (phone.replace(/\D/g, "").length < 10) return setErr("اكتب رقم موبايلك عشان نوصلّك");
    if (!text.trim() && !photo) return setErr("اكتب رسالتك");
    setBusy(true);
    try {
      let path: string | null = null;
      if (photo) {
        path = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
        const bytes = await (await fetch(photo)).arrayBuffer();
        const { error } = await sb.storage.from("support").upload(path, bytes, { contentType: "image/jpeg" });
        if (error) throw error;
      }
      const { data, error } = await sb.rpc("cs_open", { p_phone: phone, p_name: name, p_topic: topic, p_order_token: order, p_text: text, p_channel: "app", p_photo: path });
      if (error) throw error;
      const tk = (data as { token: string }).token;
      await csAdd(tk);
      router.replace(`/chat/${tk}`);
    } catch (e) { setErr(errMsg(e)); }
    setBusy(false);
  };
  return (
    <View style={{ flex: 1 }}>
      <BlackHead title="كلّمنا" />
      <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: 120 + ins.bottom, gap: 12 }} keyboardShouldPersistTaps="handled">
        <Card title="الموضوع">
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>{TOPICS.map(([k, ic, l]) => <Chip key={k} label={`${ic} ${l}`} on={topic === k} onPress={() => setTopic(k)} />)}</View>
        </Card>
        {!!tokens.length && ["issue", "refund", "track"].includes(topic) && (
          <Card title="أنهي طلب؟">
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>{tokens.slice(0, 8).map((t, i) => <Chip key={t} label={`طلب ${i === 0 ? "آخر" : i + 1}`} on={order === t} onPress={() => setOrder(order === t ? null : t)} />)}</View>
          </Card>
        )}
        <Card title="بياناتك">
          <Input value={name} onChangeText={setName} placeholder="الاسم" />
          <Input value={phone} onChangeText={setPhone} placeholder="رقم الموبايل" keyboardType="phone-pad" style={{ textAlign: "left" }} />
        </Card>
        <Card title="رسالتك">
          <Input value={text} onChangeText={setText} placeholder={topic === "issue" ? "إيه اللي حصل؟" : "اكتب رسالتك"} multiline style={{ minHeight: 100, textAlignVertical: "top", paddingTop: 12 }} />
          {photo ? <Pressable onPress={() => setPhoto(null)}><Image source={{ uri: photo }} style={{ width: "100%", height: 180, borderRadius: 12 }} /><T style={{ color: C.mid, fontSize: 12 }}>دوس على الصورة تشيلها</T></Pressable>
            : <Btn outline title="📷 ضيف صورة" onPress={pick} />}
        </Card>
        <Err t={err} />
      </ScrollView>
      <BottomBar><Btn y title="ابعت" onPress={send} busy={busy} style={{ flex: 1 }} /></BottomBar>
    </View>
  );
}
