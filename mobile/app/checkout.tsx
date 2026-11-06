import { useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useApp } from "@/lib/store";
import { errMsg, sb } from "@/lib/supabase";
import { BottomBar, Box, Btn, Err, Input, Ln, Opt, T, WTop } from "@/lib/ui";
import { C, money } from "@/lib/theme";

const PAY: [string, string, string][] = [["cash", "💵", "كاش عند الاستلام"], ["card", "💳", "فيزا عند الاستلام"], ["instapay", "📱", "إنستاباي / محفظة"]];

export default function Checkout() {
  const ins = useSafeAreaInsets();
  const { session, me, config, district, setDistrict, menu, cart, clearCart, refreshMe } = useApp();
  const [pay, setPay] = useState("cash");
  const [note, setNote] = useState("");
  const [addr, setAddr] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const lines = (menu ?? []).filter((m) => cart[m.item_id]);
  const sub = lines.reduce((a, m) => a + cart[m.item_id] * m.price, 0);
  const addrs = me?.addresses ?? [];
  const chosen = addrs.find((a) => a.id === addr) ?? addrs.find((a) => a.district_id === district?.id && a.is_default) ?? addrs.find((a) => a.district_id === district?.id);
  const d = config?.districts.find((x) => x.id === chosen?.district_id) ?? district;

  const place = async () => {
    setErr(null);
    if (!session) return router.push("/login");
    if (!me?.name) return setErr("اكتب اسمك من صفحة حسابي الأول");
    if (!chosen) return router.push("/address");
    setBusy(true);
    const { data, error } = await sb.rpc("app_place_order", { p_address: chosen.id, p_note: note, p_pay: pay, p_lines: lines.map((m) => ({ item_id: m.item_id, qty: cart[m.item_id] })) });
    setBusy(false);
    if (error) return setErr(errMsg(error));
    const r = (Array.isArray(data) ? data[0] : data) as { token: string; order_no: number; est_total: number };
    clearCart(); setNote(""); refreshMe();
    router.replace({ pathname: "/done/[token]", params: { token: r.token, no: String(r.order_no), total: String(r.est_total) } });
  };

  return (
    <View style={{ flex: 1 }}>
      <WTop title="تأكيد الطلب" />
      <ScrollView contentContainerStyle={{ paddingBottom: 110 + ins.bottom }} keyboardShouldPersistTaps="handled">
        <Box title="التوصيل على">
          {!session ? <Btn y title="سجّل دخول بموبايلك" onPress={() => router.push("/login")} /> : (
            <>
              {addrs.map((a) => (
                <Opt key={a.id} on={chosen?.id === a.id} onPress={() => { setAddr(a.id); if (a.district_id && a.district_id !== district?.id) setDistrict(a.district_id); }}>
                  <T w="x" style={{ fontSize: 13 }}>{a.label} — {a.area}</T>
                  <T style={{ color: C.g, fontSize: 11.5 }} numberOfLines={2}>{a.address}</T>
                </Opt>
              ))}
              <Pressable onPress={() => router.push("/address")}><T w="b" style={{ color: C.yDark }}>+ عنوان جديد</T></Pressable>
              {chosen && chosen.district_id !== district?.id && <T style={{ color: C.bad, fontSize: 12 }}>العنوان ده في منطقة تانية — الأسعار والمتاح هيتحدّثوا</T>}
            </>
          )}
        </Box>
        <Box title="طريقة الدفع">
          {PAY.map(([k, ic, l]) => <Opt key={k} on={pay === k} onPress={() => setPay(k)}><T w="b">{ic}  {l}</T></Opt>)}
          <T style={{ color: C.g, fontSize: 11.5 }}>تقدر تغيّر طريقة الدفع مع الطيار وقت الاستلام.</T>
        </Box>
        <Box title="ملاحظة للفرع">
          <Input value={note} onChangeText={setNote} placeholder="مثلاً: تقطيع معيّن، ميعاد مناسب…" />
        </Box>
        <Box title="الحساب">
          {lines.map((m) => <Ln key={m.item_id} l={`${m.name} × ${cart[m.item_id]}`} v={money(cart[m.item_id] * m.price)} />)}
          <View style={{ height: 1, backgroundColor: C.ln }} />
          <Ln l="المجموع" v={money(sub)} />
          <Ln l="التوصيل" v={money(d?.fee ?? 0)} />
          <Ln l="الإجمالي التقريبي" v={money(sub + (d?.fee ?? 0))} big />
          <T style={{ color: C.g, fontSize: 11.5 }}>{config?.note || "السعر النهائي بيتحسب بالوزن الفعلي للعلبة"}</T>
        </Box>
        <Err t={err} />
      </ScrollView>
      <BottomBar>
        <Btn y title={`تأكيد الطلب · ${money(sub + (d?.fee ?? 0))}`} onPress={place} busy={busy} disabled={!config?.open || !lines.length} style={{ flex: 1 }} />
      </BottomBar>
    </View>
  );
}
