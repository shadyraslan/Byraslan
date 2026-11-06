import { useCallback, useState } from "react";
import { router, useFocusEffect } from "expo-router";
import { sb } from "@/lib/supabase";
import { csTokens, CS_ST, TOPICS } from "@/lib/cs";
import { Linking, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { NavBar } from "@/lib/nav";
import { Ionicons } from "@expo/vector-icons";
import { useApp } from "@/lib/store";
import { BlackHead, T } from "@/lib/ui";
import { C } from "@/lib/theme";

export default function Support() {
  const ins = useSafeAreaInsets();
  const { config } = useApp();
  const s = config?.support ?? {};
  const [open, setOpen] = useState<number | null>(null);
  const [tix, setTix] = useState<{ no: number; token: string; status: string; last_from: string; preview: string | null }[]>([]);
  const { tokens } = useApp();
  useFocusEffect(useCallback(() => { csTokens().then(async (L) => { if (!L.length) return setTix([]); const { data } = await sb.rpc("cs_list", { p_tokens: L }); setTix((data ?? []) as typeof tix); }); }, []));
  const wa = (s.whatsapp ?? "").replace(/\D/g, "");
  const ph = (s.phone ?? "").replace(/\D/g, "");
  const Row = ({ ic, bg, t, sub, onPress }: { ic: string; bg: string; t: string; sub: string; onPress?: () => void }) => (
    <Pressable onPress={onPress} disabled={!onPress} style={{ flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: C.white, borderWidth: 1, borderColor: C.border, borderRadius: 16, padding: 14, opacity: onPress ? 1 : 0.6 }}>
      <View style={{ width: 44, height: 44, borderRadius: 13, backgroundColor: bg, alignItems: "center", justifyContent: "center" }}><Text style={{ fontSize: 20 }}>{ic}</Text></View>
      <View style={{ flex: 1 }}><T w="x">{t}</T><T style={{ color: C.mid, fontSize: 11.5 }}>{sub}</T></View>
      <Ionicons name="chevron-back" size={16} color={C.mid} />
    </Pressable>
  );
  return (
    <View style={{ flex: 1 }}>
      <BlackHead title="خدمة العملاء" />
      <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: 120 + ins.bottom, gap: 12 }}>
        <View style={{ backgroundColor: C.black, borderRadius: 22, padding: 24, alignItems: "center", gap: 6 }}>
          <Text style={{ fontSize: 44 }}>🎧</Text>
          <T w="x" style={{ color: C.white, fontSize: 19, textAlign: "center" }}>كيف نقدر نساعدك؟</T>
          <T style={{ color: "#999", fontSize: 12, textAlign: "center" }}>فريقنا متاح عشان يخدمك</T>
        </View>
        <T w="x" style={{ fontSize: 15 }}>محتاج إيه؟</T>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
          {TOPICS.map(([k, ic, l]) => (
            <Pressable key={k} onPress={() => { if (k === "track" && tokens[0]) router.push(`/order/${tokens[0]}`); else router.push({ pathname: "/chat/new", params: { topic: k } }); }}
              style={{ width: "31%", flexGrow: 1, backgroundColor: C.white, borderWidth: 1, borderColor: C.border, borderRadius: 16, padding: 12, alignItems: "center", gap: 4 }}>
              <Text style={{ fontSize: 24 }}>{ic}</Text><T w="b" style={{ fontSize: 12, textAlign: "center" }}>{l}</T>
            </Pressable>
          ))}
        </View>
        {!!tix.length && <T w="x" style={{ fontSize: 15, marginTop: 6 }}>رسايلي</T>}
        {tix.map((x) => (
          <Pressable key={x.token} onPress={() => router.push(`/chat/${x.token}`)} style={{ backgroundColor: C.white, borderWidth: 1, borderColor: x.last_from === "staff" ? C.y : C.border, borderRadius: 14, padding: 12, gap: 2 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}><T w="x">تذكرة {x.no}</T><T w="b" style={{ color: x.last_from === "staff" ? C.green : C.mid, fontSize: 12 }}>{x.last_from === "staff" ? "رد جديد" : CS_ST[x.status]}</T></View>
            <T style={{ color: C.mid, fontSize: 12 }} numberOfLines={1}>{x.preview}</T>
          </Pressable>
        ))}
        <T w="x" style={{ fontSize: 15, marginTop: 6 }}>تواصل معنا</T>
        <Row ic="💬" bg={C.greenSoft} t="واتساب" sub={wa ? "رد خلال دقائق" : "الرقم هيتحط قريب"} onPress={wa ? () => Linking.openURL(`https://wa.me/${wa.startsWith("0") ? "2" + wa : wa}`) : undefined} />
        <Row ic="📞" bg="#EEF4FF" t="مكالمة هاتفية" sub={ph ? s.phone! : "الرقم هيتحط قريب"} onPress={ph ? () => Linking.openURL(`tel:${ph}`) : undefined} />
        <T w="x" style={{ fontSize: 15, marginTop: 6 }}>أسئلة شائعة</T>
        {(s.faq ?? []).map(([q, a], i) => (
          <Pressable key={i} onPress={() => setOpen(open === i ? null : i)} style={{ backgroundColor: C.white, borderWidth: 1, borderColor: C.border, borderRadius: 14, padding: 14, gap: 6 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}><T w="x" style={{ flex: 1 }}>{q}</T><Ionicons name={open === i ? "chevron-up" : "chevron-down"} size={16} color={C.mid} /></View>
            {open === i && <T style={{ color: "#666", lineHeight: 22 }}>{a}</T>}
          </Pressable>
        ))}
      </ScrollView>
      <NavBar />
    </View>
  );
}
