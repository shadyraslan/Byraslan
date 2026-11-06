import { useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useApp } from "@/lib/store";
import { useQuote } from "@/lib/quote";
import { errMsg, sb } from "@/lib/supabase";
import { BlackHead, BottomBar, Btn, Card, Err, Input, Ln, Radio, T } from "@/lib/ui";
import { C, money } from "@/lib/theme";

const PAY: [string, string, string][] = [["cash", "💵", "كاش عند الاستلام"], ["card", "💳", "بطاقة بنكية عند الاستلام"], ["instapay", "📱", "محفظة إلكترونية / إنستاباي"]];

export default function Checkout() {
  const ins = useSafeAreaInsets();
  const { code } = useLocalSearchParams<{ code?: string }>();
  const { profile, saveProfile, district, menu, cart, clearCart, addToken, config } = useApp();
  const [pay, setPay] = useState("cash");
  const [note, setNote] = useState("");
  const [name, setName] = useState(profile.name);
  const [phone, setPhone] = useState(profile.phone);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const q = useQuote(code ?? "");
  const lines = (menu ?? []).filter((m) => cart[m.item_id]);
  const addr = profile.addresses.find((a) => a.district_id === district?.id && a.is_default) ?? profile.addresses.find((a) => a.district_id === district?.id);

  const place = async () => {
    setErr(null);
    const d = phone.replace(/\D/g, "");
    if (name.trim().length < 2) return setErr("اكتب اسمك");
    if (!/^0?1[0125]\d{8}$/.test(d)) return setErr("اكتب رقم موبايل مصري صحيح");
    if (!addr) return router.push("/address");
    setBusy(true);
    const { data, error } = await sb.rpc("app_order", {
      p_district: addr.district_id, p_phone: d, p_name: name.trim(), p_address: addr.address, p_note: note, p_pay: pay,
      p_lines: lines.map((m) => ({ item_id: m.item_id, qty: cart[m.item_id] })), p_code: code || null,
    });
    setBusy(false);
    if (error) return setErr(errMsg(error));
    const r = data as { no: number; token: string; total: number };
    saveProfile({ name: name.trim(), phone: d });
    addToken(r.token);
    clearCart();
    router.replace({ pathname: "/done/[token]", params: { token: r.token, no: String(r.no), total: String(r.total) } });
  };

  return (
    <View style={{ flex: 1 }}>
      <BlackHead title="تأكيد الطلب" />
      <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: 120 + ins.bottom, gap: 12 }} keyboardShouldPersistTaps="handled">
        <Card title="عنوان التوصيل" icon="📍" right={<T w="b" style={{ color: C.mid, fontSize: 12 }} onPress={() => router.push("/loc")}>تغيير</T>}>
          {addr ? (
            <View style={{ flexDirection: "row", gap: 10, alignItems: "center" }}>
              <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: C.y, alignItems: "center", justifyContent: "center" }}><Ionicons name={addr.label === "الشغل" ? "briefcase" : "home"} size={18} color={C.black} /></View>
              <View style={{ flex: 1 }}><T w="x">{addr.label} — {district?.name}</T><T style={{ color: C.mid, fontSize: 12 }} numberOfLines={2}>{addr.address}</T></View>
            </View>
          ) : (
            <Pressable onPress={() => router.push("/address")} style={{ borderWidth: 1.5, borderStyle: "dashed", borderColor: C.border, borderRadius: 14, padding: 14, alignItems: "center" }}><T w="x">+ ضيف عنوانك في {district?.name ?? "منطقتك"}</T></Pressable>
          )}
        </Card>
        <Card title="بياناتك" icon="👤">
          <Input value={name} onChangeText={setName} placeholder="الاسم" />
          <Input value={phone} onChangeText={setPhone} placeholder="رقم الموبايل 01xxxxxxxxx" keyboardType="phone-pad" style={{ textAlign: "left" }} />
        </Card>
        <Card title="طريقة الدفع" icon="💳">
          {PAY.map(([k, ic, l]) => <Radio key={k} icon={ic} on={pay === k} onPress={() => setPay(k)}><T w="x" style={{ fontSize: 13.5 }}>{l}</T></Radio>)}
        </Card>
        <Card title="ملاحظات للمندوب" icon="📝">
          <Input value={note} onChangeText={setNote} placeholder="أي تعليمات خاصة للتوصيل..." multiline style={{ minHeight: 80, textAlignVertical: "top", paddingTop: 12 }} />
        </Card>
        <Card title="ملخص الطلب" icon="🧾">
          {lines.map((m) => <Ln key={m.item_id} l={`${m.name} × ${cart[m.item_id]}`} v={money(cart[m.item_id] * m.price)} />)}
          <View style={{ height: 1, backgroundColor: C.border }} />
          <Ln l="المجموع" v={money(q?.sub ?? 0)} />
          {!!q?.discount && <Ln l={`الخصم (${code})`} v={`- ${money(q.discount)}`} color={C.green} />}
          <Ln l="التوصيل" v={q ? (q.fee ? money(q.fee) : "مجاني") : "…"} color={q && !q.fee ? C.green : undefined} />
          <Ln l="الإجمالي" v={money(q?.total ?? 0)} big />
          <T style={{ color: C.mid, fontSize: 11 }}>{config?.note || "السعر النهائي بيتحسب بالوزن الفعلي للعلبة"}</T>
        </Card>
        <Err t={err} />
      </ScrollView>
      <BottomBar>
        <Btn y title={`تأكيد الطلب — ${money(q?.total ?? 0)}`} onPress={place} busy={busy} disabled={!lines.length || config?.open === false} style={{ flex: 1 }} />
      </BottomBar>
    </View>
  );
}
