import { useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useApp } from "@/lib/store";
import { useQuote } from "@/lib/quote";
import { Art, BlackHead, Btn, Card, Input, Ln, Qty, T } from "@/lib/ui";
import { C, money } from "@/lib/theme";

export default function Cart() {
  const ins = useSafeAreaInsets();
  const { menu, cart, setQty, district, config } = useApp();
  const [code, setCode] = useState("");
  const [applied, setApplied] = useState("");
  const q = useQuote(applied);
  const lines = (menu ?? []).filter((m) => cart[m.item_id]);
  const sub = q?.sub ?? lines.reduce((a, m) => a + cart[m.item_id] * m.price, 0);
  const min = config?.min_order ?? 0;
  const outs = lines.filter((m) => m.available <= 0);

  if (!lines.length) return (
    <View style={{ flex: 1 }}>
      <BlackHead title="السلة" back={false} />
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 30 }}>
        <View style={{ width: 96, height: 96, borderRadius: 48, backgroundColor: C.ySoft, alignItems: "center", justifyContent: "center" }}><Ionicons name="cart-outline" size={44} color={C.black} /></View>
        <T w="x" style={{ fontSize: 18 }}>السلة فاضية</T>
        <T style={{ color: C.mid, textAlign: "center" }}>ابدأ ضيف منتجات طازجة من الأقسام</T>
        <Btn y title="ابدأ التسوّق" onPress={() => router.push("/")} style={{ alignSelf: "stretch", marginTop: 8 }} />
      </View>
    </View>
  );
  return (
    <View style={{ flex: 1 }}>
      <BlackHead title="السلة" back={false} sub={`${lines.length} منتجات`} />
      <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: 200 + ins.bottom, gap: 12 }} keyboardShouldPersistTaps="handled">
        {lines.map((m) => (
          <View key={m.item_id} style={{ backgroundColor: C.white, borderRadius: 18, borderWidth: 1, borderColor: C.border, padding: 12, flexDirection: "row", alignItems: "center", gap: 12 }}>
            <View style={{ width: 62, height: 62, borderRadius: 14, overflow: "hidden" }}><Art m={m} h={62} size={30} /></View>
            <View style={{ flex: 1, gap: 4 }}>
              <T w="x" style={{ fontSize: 13.5 }} numberOfLines={1}>{m.name}</T>
              <T style={{ color: C.mid, fontSize: 11.5 }}>{money(m.price)} / {m.unit}</T>
              {m.available <= 0 && <T w="b" style={{ color: C.red, fontSize: 11.5 }}>خلص — شيله عشان تكمّل</T>}
              <View style={{ alignSelf: "flex-start" }}><Qty m={m} /></View>
            </View>
            <View style={{ alignItems: "flex-end", gap: 10 }}>
              <T w="x" style={{ fontSize: 15 }}>{money(cart[m.item_id] * m.price)}</T>
              <Pressable onPress={() => setQty(m.item_id, 0)} style={{ width: 30, height: 30, borderRadius: 9, borderWidth: 1, borderColor: C.border, alignItems: "center", justifyContent: "center" }}><Ionicons name="trash-outline" size={15} color={C.mid} /></Pressable>
            </View>
          </View>
        ))}
        <Card title="كود خصم">
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Pressable onPress={() => { setApplied(code.trim()); AsyncStorage.setItem("code", code.trim()).catch(() => {}); }} style={{ backgroundColor: C.black, borderRadius: 12, paddingHorizontal: 18, justifyContent: "center" }}><T w="x" style={{ color: C.white }}>تفعيل</T></Pressable>
            <Input value={code} onChangeText={setCode} placeholder="أدخل كود الخصم" autoCapitalize="characters" style={{ flex: 1, textAlign: "left" }} />
          </View>
          {q?.code_msg ? <T w="b" style={{ color: q.code_ok ? C.green : C.red, fontSize: 12.5 }}>{q.code_msg}</T> : null}
        </Card>
        <Card>
          <Ln l="المجموع" v={money(sub)} />
          {!!q?.discount && <Ln l="الخصم" v={`- ${money(q.discount)}`} color={C.green} />}
          <Ln l={`التوصيل${district ? ` (${district.name})` : ""}`} v={q ? (q.fee ? money(q.fee) : "مجاني") : money(district?.fee ?? 0)} color={q && !q.fee ? C.green : undefined} />
          <View style={{ height: 1, backgroundColor: C.border }} />
          <Ln l="الإجمالي" v={money(q?.total ?? sub + (district?.fee ?? 0))} big />
          <T style={{ color: C.mid, fontSize: 11 }}>{config?.note || "السعر النهائي بيتحسب بالوزن الفعلي للعلبة"}</T>
        </Card>
        {sub < min && <View style={{ backgroundColor: "#FFF3CD", borderRadius: 14, padding: 12 }}><T w="b" style={{ color: "#7A5B00" }}>أقل طلب {money(min)} — ضيف بـ {money(min - sub)} كمان</T></View>}
      </ScrollView>
      <View style={{ position: "absolute", left: 18, right: 18, bottom: 92 + ins.bottom }}>
        <Btn title="إتمام الطلب" disabled={sub < min || outs.length > 0 || !district?.branch} onPress={() => router.push({ pathname: "/checkout", params: { code: applied } })}
          right={<View style={{ backgroundColor: C.y, borderRadius: 9, paddingHorizontal: 10, paddingVertical: 3 }}><T w="x" style={{ fontSize: 13 }}>{money(q?.total ?? sub)} ←</T></View>} />
      </View>
    </View>
  );
}
