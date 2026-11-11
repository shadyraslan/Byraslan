import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useApp } from "@/lib/store";
import { useQuote } from "@/lib/quote";
import { errMsg, sb } from "@/lib/supabase";
import { BlackHead, BottomBar, Btn, Card, Chip, Err, Input, Ln, Radio, T } from "@/lib/ui";
import { C, money } from "@/lib/theme";
import type { Points } from "@/lib/types";

const PAY: [string, string, string][] = [["cash", "💵", "كاش عند الاستلام"], ["card", "💳", "بطاقة بنكية عند الاستلام"], ["instapay", "📱", "محفظة إلكترونية / إنستاباي"]];

export default function Checkout() {
  const ins = useSafeAreaInsets();
  const { code } = useLocalSearchParams<{ code?: string }>();
  const { profile, saveProfile, saveAddress, district, menu, cart, clearCart, addToken, config, tokens } = useApp();
  const [pts, setPts] = useState<Points | null>(null);
  const [usePts, setUsePts] = useState(false);
  const [subPref, setSubPref] = useState<"replace" | "ask" | "remove">("ask");
  useEffect(() => { if (profile.phone) sb.rpc("app_points", { p_phone: profile.phone, p_tokens: tokens }).then(({ data }) => setPts((data ?? null) as Points | null)); }, [profile.phone, tokens]);
  const canRedeem = !!pts?.known && (pts.balance ?? 0) >= (pts.min_redeem ?? 0) && (pts.balance ?? 0) > 0;
  const [pay, setPay] = useState("cash");
  const [note, setNote] = useState("");
  const [name, setName] = useState(profile.name);
  const [phone, setPhone] = useState(profile.phone);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const q = useQuote(code ?? "", usePts && canRedeem ? pts?.balance ?? 0 : 0);
  // اطلب دلوقتي ولا احجز لميعاد
  const [mode, setMode] = useState<"now" | "book">("now");
  const [bdate, setBdate] = useState("");
  const [bslot, setBslot] = useState("");
  const [slots, setSlots] = useState<{ slot: string; ok: boolean; full: boolean }[] | null>(null);
  const days = useMemo(() => Array.from({ length: 14 }, (_, i) => { const d = new Date(); d.setDate(d.getDate() + i); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; }), []);
  useEffect(() => { if (mode === "book" && bdate && district?.id) { setSlots(null); sb.rpc("booking_slots", { p_district: district.id, p_date: bdate }).then(({ data }) => setSlots((data ?? []) as { slot: string; ok: boolean; full: boolean }[])); } }, [mode, bdate, district?.id]);
  const dn = (s: string) => new Date(`${s}T12:00:00`).toLocaleDateString("ar-EG", { weekday: "short", day: "numeric", month: "short" });
  const lines = (menu ?? []).filter((m) => cart[m.item_id]);
  const addr = profile.addresses.find((a) => a.district_id === district?.id && a.is_default) ?? profile.addresses.find((a) => a.district_id === district?.id);

  const place = async () => {
    setErr(null);
    let d = phone.replace(/\D/g, "");
    let nm = name.trim();
    // وضع التجربة: الاسم والرقم مش إجباريين — بنعمل رقم تجربة ثابت للموبايل ده
    if (config?.test_mode) {
      if (nm.length < 2) nm = "عميل تجربة";
      if (!/^0?1[0125]\d{8}$/.test(d)) {
        d = (await AsyncStorage.getItem("testPhone").catch(() => null)) ?? `0100${Math.floor(1000000 + Math.random() * 8999999)}`;
        AsyncStorage.setItem("testPhone", d).catch(() => {});
      }
    }
    if (nm.length < 2) return setErr("اكتب اسمك");
    if (!/^0?1[0125]\d{8}$/.test(d)) return setErr("اكتب رقم موبايل مصري صحيح");
    let a = addr;
    if (!a && config?.test_mode && district?.branch) {
      a = { id: "test", label: "البيت", district_id: district.id, address: "عنوان تجربة", is_default: true };
      saveAddress({ label: a.label, district_id: a.district_id, address: a.address, is_default: true });
    }
    if (!a) return router.push("/address");
    if (mode === "book" && (!bdate || !bslot)) return setErr("اختار يوم وميعاد الحجز");
    setBusy(true);
    const { data, error } = await sb.rpc("app_order", {
      p_district: a.district_id, p_phone: d, p_name: nm, p_address: a.address, p_note: note, p_pay: pay,
      p_lines: lines.map((m) => ({ item_id: m.item_id, qty: cart[m.item_id] })), p_code: code || null,
      p_points: usePts && canRedeem ? pts?.balance ?? 0 : 0, p_tokens: tokens, p_sub_pref: subPref,
    });
    setBusy(false);
    if (error) return setErr(errMsg(error));
    const r = data as { no: number; token: string; total: number };
    if (a.lat != null && a.lng != null) await sb.rpc("order_set_pin", { p_token: r.token, p_lat: a.lat, p_lng: a.lng });
    if (mode === "book") {
      const { error: be } = await sb.rpc("booking_attach", { p_token: r.token, p_date: bdate, p_slot: bslot });
      if (be) setErr(`الطلب اتسجّل بس الحجز ماتمش: ${errMsg(be)} — كلّم خدمة العملاء`);
    }
    saveProfile({ name: nm, phone: d });
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
        <Card title="بياناتك" icon="👤" right={config?.test_mode ? <T style={{ color: C.mid, fontSize: 11 }}>تجربة: مش إجباري</T> : undefined}>
          <Input value={name} onChangeText={setName} placeholder="الاسم" />
          <Input value={phone} onChangeText={setPhone} placeholder="رقم الموبايل 01xxxxxxxxx" keyboardType="phone-pad" style={{ textAlign: "left" }} />
        </Card>
        <Card title="ميعاد التوصيل" icon="📅">
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Chip label="🚚 دلوقتي" on={mode === "now"} onPress={() => setMode("now")} />
            <Chip label="📅 احجز لميعاد" on={mode === "book"} onPress={() => setMode("book")} />
          </View>
          {mode === "book" && (
            <>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>{days.map((d) => <Chip key={d} label={dn(d)} on={bdate === d} onPress={() => { setBdate(d); setBslot(""); }} />)}</ScrollView>
              {bdate && !slots && <T style={{ color: C.mid }}>بيحمّل…</T>}
              {slots && <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>{slots.filter((x) => x.ok).map((x) => <Chip key={x.slot} label={x.slot} on={bslot === x.slot} onPress={() => setBslot(x.slot)} yellow />)}</View>}
              {slots && !slots.some((x) => x.ok) && <T style={{ color: C.mid, fontSize: 12 }}>مفيش مواعيد متاحة اليوم ده</T>}
            </>
          )}
        </Card>
        <Card title="طريقة الدفع" icon="💳">
          {PAY.map(([k, ic, l]) => <Radio key={k} icon={ic} on={pay === k} onPress={() => setPay(k)}><T w="x" style={{ fontSize: 13.5 }}>{l}</T></Radio>)}
        </Card>
        {pts?.on && pts.known && !pts.no_points && (
          <Card title="نقاطك" icon="⭐">
            <T style={{ fontSize: 13 }}>معاك <T w="x">{pts.balance}</T> نقطة = {money(pts.value ?? 0)}</T>
            {canRedeem ? <Radio icon="⭐" on={usePts} onPress={() => setUsePts(!usePts)}><T w="x" style={{ fontSize: 13.5 }}>استخدم نقاطك في الطلب ده{q?.points_off ? ` — خصم ${money(q.points_off)}` : ""}</T></Radio>
              : <T style={{ color: C.mid, fontSize: 12 }}>تقدر تستبدل من أول {pts.min_redeem} نقطة</T>}
            {!!q?.points_msg && usePts && <T style={{ color: C.mid, fontSize: 12 }}>{q.points_msg}</T>}
            {!!q?.points_earn && <T style={{ color: C.green, fontSize: 12 }}>هتكسب {q.points_earn} نقطة لما الطلب يوصلك</T>}
          </Card>)}
        <Card title="لو صنف من الماركت مش موجود" icon="🔄">
          {([["replace", "بدّله بأقرب بديل على طول"], ["ask", "ابعتلي البديل أوافق عليه"], ["remove", "شيله من الطلب"]] as const).map(([k, l]) => <Radio key={k} on={subPref === k} onPress={() => setSubPref(k)}><T w="x" style={{ fontSize: 13.5 }}>{l}</T></Radio>)}
        </Card>
        <Card title="ملاحظات للمندوب" icon="📝">
          <Input value={note} onChangeText={setNote} placeholder="أي تعليمات خاصة للتوصيل..." multiline style={{ minHeight: 80, textAlignVertical: "top", paddingTop: 12 }} />
        </Card>
        <Card title="ملخص الطلب" icon="🧾">
          {lines.map((m) => <Ln key={m.item_id} l={`${m.name} × ${cart[m.item_id]}`} v={money(cart[m.item_id] * m.price)} />)}
          <View style={{ height: 1, backgroundColor: C.border }} />
          <Ln l="المجموع" v={money(q?.sub ?? 0)} />
          {!!q?.discount && <Ln l={`الخصم (${(q.offers ?? []).map((o) => o.name).join(" + ") || code})`} v={`- ${money(q.discount)}`} color={C.green} />}
          {!!q?.points_off && <Ln l={`خصم النقاط (${q.points_used} نقطة)`} v={`- ${money(q.points_off)}`} color={C.green} />}
          <Ln l="التوصيل" v={q ? (q.fee ? money(q.fee) : "مجاني") : "…"} color={q && !q.fee ? C.green : undefined} />
          <Ln l="الإجمالي" v={money(q?.total ?? 0)} big />
          <T style={{ color: C.mid, fontSize: 11 }}>{config?.note || "السعر النهائي بيتحسب بالوزن الفعلي للعلبة"}</T>
        </Card>
        <Err t={err} />
      </ScrollView>
      <BottomBar>
        <Btn y title={`${mode === "book" ? "تأكيد الحجز" : "تأكيد الطلب"} — ${money(q?.total ?? 0)}`} onPress={place} busy={busy} disabled={!lines.length || config?.open === false} style={{ flex: 1 }} />
      </BottomBar>
    </View>
  );
}
